# Task Output Integration — Feature Spec
**Plugin**: claude-eisenhower
**Version**: 0.3.0 (planned)
**Status**: Decisions Locked — Ready for Implementation
**Last updated**: 2026-02-19

---

## Problem Statement

The `/schedule` command assigns dates and actions to tasks inside TASKS.md, but those scheduled tasks live only in a flat file. There is no push to an external system where the user actually manages their work day-to-day. As a result, the scheduled output from Eisenhower is siloed — the user must manually re-enter tasks into their task manager, which creates duplication, friction, and drift between what's "scheduled" in TASKS.md and what's actually tracked in their working tools.

---

## User Stories (Gherkin)

### Scenario 1: Task scheduled and pushed to Reminders
```gherkin
Feature: Push scheduled tasks to Mac Reminders

  Scenario: Q1 task is scheduled and synced
    Given I have a Q1 task "Fix deploy pipeline issue" in TASKS.md
    And Mac Reminders is configured as my active task output adapter
    And the target list is "Eisenhower List"
    When I run /schedule
    And I confirm the schedule table
    Then the task should be saved to TASKS.md with Scheduled: today
    And a new reminder "Fix deploy pipeline issue" should appear in "Eisenhower List"
    And the reminder priority should be High
    And the reminder due date should be today with no specific alarm time
    And TASKS.md should show: Synced: Reminders (Eisenhower List) — [today's date]

  Scenario: Q2 task is scheduled with a specific focus block date
    Given I have a Q2 task "Draft Q1 roadmap" in TASKS.md
    And Mac Reminders is configured as my active task output adapter
    When I run /schedule
    And I confirm "Feb 25" as the focus block date
    Then a new reminder "Draft Q1 roadmap" should appear in "Eisenhower List"
    And the reminder priority should be Medium
    And the reminder due date should be Feb 25 with no specific alarm time

  Scenario: Q3 task is pushed as a delegate check-in reminder
    Given I have a Q3 task "Review onboarding PR" delegated to Sarah
    And Mac Reminders is configured as my active task output adapter
    When I run /schedule
    And I confirm the schedule table
    Then a reminder "Check in: Sarah re: Review onboarding PR" should appear in "Eisenhower List"
    And the reminder due date should be 3 to 5 business days from today
    And the reminder priority should be Medium

  Scenario: Q4 task is eliminated and not pushed
    Given I have a Q4 task "Update old wiki page" in TASKS.md
    When I run /schedule
    And I confirm the schedule table
    Then no reminder should be created for "Update old wiki page"
    And the task should be moved to Completed in TASKS.md with note: Eliminated — Q4 cut [date]
```

### Scenario 2: Deduplication prevents double-entry
```gherkin
  Scenario: Running /schedule twice does not create duplicate reminders
    Given "Fix deploy pipeline issue" already exists in the "Eisenhower List" Reminders list
    When I run /schedule again for the same task
    Then no new reminder should be created
    And TASKS.md should show: Synced: skipped (already exists)
    And the schedule summary should complete without error
```

### Scenario 3: Adapter not configured — graceful fallback
```gherkin
  Scenario: No task output adapter is configured
    Given the active adapter in task-output-config.md is still set to ~~task_output
    When I run /schedule
    And I confirm the schedule table
    Then TASKS.md should be updated normally
    And no external push should be attempted
    And the confirmation message should not mention Reminders or any external system
```

### Scenario 4: Push fails — non-blocking, reported at end
```gherkin
  Scenario: Target Reminders list does not exist and cannot be created
    Given the configured list "Eisenhower List" does not exist in Reminders
    And Reminders cannot create a new list due to a permissions error
    When I run /schedule
    And I confirm the schedule table
    Then TASKS.md should still be saved successfully
    And the schedule confirmation should complete normally
    And a warning summary should appear after all tasks are processed: "⚠ Could not push to Reminders — list not found. Check task-output-config.md."
    And TASKS.md should show: Synced: failed — list not found
```

### Scenario 5: Swapping from Reminders to Asana (future)
```gherkin
  Scenario: User switches active adapter from Reminders to Asana
    Given the Asana MCP connector is installed
    And I update task-output-config.md: active adapter = asana
    And I fill in asana workspace_id and project_id
    When I run /schedule
    And I confirm the schedule table
    Then tasks should be pushed to the configured Asana project
    And no reminders should be created in Mac Reminders
    And TASKS.md should show: Synced: Asana ([project name]) — [date]
```

---

## Goals

- After `/schedule` confirms a task, automatically push that task to an external task manager
- Support Mac Reminders as the v1 target (native, no auth required, AppleScript accessible)
- Design the integration layer as a **swappable connector** — the same interface should work with Asana, Jira, Linear, or any future system by replacing the adapter, not the command logic
- Never duplicate tasks (deduplicate before writing)
- Never modify or delete existing reminders/tasks in the external system
- Keep the scheduled record in TASKS.md as the source of truth — the external push is a convenience sync, not a replacement

---

## Out of Scope (v1)

- Reading back from Reminders (sync is one-way: Eisenhower → Reminders)
- Completing or deleting reminders from Claude
- Multi-list routing (all tasks go to one configured list in v1)
- Recurring tasks
- Attachment or subtask support
- Non-Mac task managers (Asana, Jira, Linear are v2+ via MCP or connector swap)

---

## Architecture: The `~~task_output` Connector Pattern

### Why a connector pattern?

The existing plugin already uses `~~category` placeholders in `CONNECTORS.md` and `references/intake-sources.md` for future swappable integrations. This spec follows that exact convention and formalizes it for output (push) integrations.

The key design principle: **command files describe what to push; adapters describe how to push it.**

```
/schedule (command)
    └── decides what gets pushed (fields, timing, quadrant rules)
    └── calls ~~task_output
              └── adapter: Mac Reminders (v1)
              └── adapter: Asana (future)
              └── adapter: Jira (future)
              └── adapter: Linear (future)
```

This means:
- Changing the target system = swap one adapter file, touch nothing else
- Command logic, scheduling rules, and TASKS.md format stay stable across integrations

---

## Connector Interface: `~~task_output`

Every adapter (Reminders, Asana, Jira, etc.) must accept the same input schema and produce the same output confirmation. This is the contract between `/schedule` and the adapter.

### Input Schema (from `/schedule` → adapter)

```
task_output_record:
  title:        string         # Short action-oriented label (max 10 words)
  description:  string         # Full task description including context
  due_date:     date | null    # ISO date (YYYY-MM-DD) or null if not set
  quadrant:     Q1 | Q2 | Q3  # Eisenhower quadrant
  priority:     high | medium  # Q1 = high, Q2/Q3 = medium
  source:       string         # Where this task originated (e.g., "Email (Procore)")
  requester:    string | null  # Person who requested the task, if known
  list_name:    string         # Target list/project name in the external system
```

### Output (adapter → `/schedule`)

```
push_result:
  status:   success | skipped | error
  reason:   string   # e.g., "Created", "Already exists", "Permission denied"
  id:       string   # External system ID (Reminder ID, Jira ticket, etc.)
```

---

## v1 Adapter: Mac Reminders via AppleScript

### How it works

Mac Reminders is accessible via AppleScript (osascript) — no auth, no network, local only. The adapter creates a new reminder in a named list with the task title, notes, and due date. It checks for an existing reminder with the same title before creating (deduplication).

### Target list configuration

A single list name is configured in a new file: `integrations/config/task-output-config.md`

Default: `"Eisenhower List"` (created automatically if it doesn't exist).

The user can change this to match an existing Reminders list (e.g., "Work", "Eisenhower", "Action Items").

### AppleScript pattern (write-only, no reads of existing data beyond dedup check)

```applescript
-- Step 1: Check for duplicate
tell application "Reminders"
  set targetList to list "Eisenhower List"
  set existingNames to name of every reminder of targetList
  if {title} is in existingNames then
    return "skipped: already exists"
  end if
end tell

-- Step 2: Create reminder
tell application "Reminders"
  set targetList to list "Eisenhower List"
  set newReminder to make new reminder at end of targetList
  set name of newReminder to {title}
  set body of newReminder to {description}
  if {due_date} is not null then
    set due date of newReminder to {due_date} as date
  end if
  set priority of newReminder to {priority}  -- 1=high, 5=medium, 9=low
end tell
```

### Priority mapping (Reminders uses 1/5/9)

| Quadrant | Eisenhower Priority | Reminders Priority |
|----------|--------------------|--------------------|
| Q1       | high               | 1 (High)           |
| Q2       | medium             | 5 (Medium)         |
| Q3       | medium             | 5 (Medium)         |

---

## Updated `/schedule` Command Flow

The existing `/schedule` command has 6 steps. This spec adds **Step 6b** (push to task output) after the current Step 5 (save to TASKS.md). Step 6 (log Q3 stakeholders) becomes Step 7.

### New Step 6b: Push to `~~task_output`

After the user confirms the schedule table and TASKS.md is saved:

1. For each confirmed task (Q1, Q2, Q3 — skip Q4 cuts), call the `~~task_output` adapter
2. Pass the `task_output_record` with fields populated from the task record
3. Collect push results
4. Show a brief push summary after all tasks are processed:

```
Task output: 3 pushed to Reminders (Eisenhower List)
  ✓ Fix deploy pipeline issue          → Q1, Due: today
  ✓ Draft Q1 roadmap                   → Q2, Due: Feb 25
  ✓ Check in: Sarah re: Review onboarding PR → Q3, Due: Feb 26
```

5. If any push fails, collect all errors and surface them together at the end — after the full summary — without blocking TASKS.md save or interrupting the schedule flow:
   - "⚠ 1 task could not be pushed: 'Fix deploy pipeline issue' — list not found. Check task-output-config.md."

### When task output is not configured

If `~~task_output` is still a placeholder (no adapter installed), skip Step 6b silently. The schedule still saves to TASKS.md as before. This preserves full backward compatibility.

---

## New Files

| File | Purpose |
|------|---------|
| `integrations/specs/reminders-integration-spec.md` | This spec |
| `integrations/config/task-output-config.md` | User-editable config for target list name and active adapter |
| `integrations/adapters/reminders.md` | v1 adapter: AppleScript logic for Mac Reminders |
| `integrations/adapters/README.md` | Adapter interface contract + swap instructions |
| `scripts/push_reminder.applescript` | Reusable AppleScript for creating a reminder (called from adapter) |

### Files to Update

| File | Change |
|------|--------|
| `commands/schedule.md` | Add Step 6b (task output push) after Step 5 |
| `CONNECTORS.md` | Add `~~task_output` row; mark Mac Reminders as Active (v1) |
| `README.md` | Document new capability under Active Integrations |
| `skills/claude-eisenhower/references/intake-sources.md` | Update `~~Project Tracker` section to reference adapter pattern |

---

## `task-output-config.md` Format

```markdown
# Task Output Configuration

## Active Adapter
reminders

## Adapter Settings

### reminders
list_name: Eisenhower List

### asana (future)
workspace_id: ~~asana_workspace
project_id:   ~~asana_project

### jira (future)
base_url:   ~~jira_url
project_key: ~~jira_project
```

---

## Swapping Adapters (v2+)

When a future connector (e.g., Asana MCP, Jira MCP) becomes available:

1. Install the MCP connector via Cowork plugin settings
2. Create `integrations/adapters/asana.md` following the same interface contract as `reminders.md`
3. In `task-output-config.md`, change `active adapter:` from `reminders` to `asana`
4. Fill in the Asana-specific settings under `### asana`
5. No changes needed to `commands/schedule.md` or any skill files

The `cowork-plugin-customizer` skill can automate steps 2–4 once the MCP connector is confirmed available.

---

## Deduplication Logic

Before creating any reminder, the adapter checks:

1. Does the target list exist? If not, create it.
2. Does a reminder with the exact same `title` already exist in that list? If yes → return `skipped`.
3. Title comparison is case-insensitive and trims whitespace.

This prevents duplicates when `/schedule` is run multiple times against the same task board.

---

## TASKS.md Record Update

When a task is successfully pushed to the external system, add a `Synced:` field to the task record:

```markdown
---
[ INTAKE — 2026-02-19 ]
Title:       Fix deploy pipeline issue
...
Status:      Q1
Scheduled:   2026-02-19
Action:      [CRITICAL] Start today
Synced:      Reminders (Eisenhower List) — 2026-02-19
---
```

If the push was skipped (duplicate), log: `Synced: skipped (already exists)`
If the push failed, log: `Synced: failed — [reason]`

---

## Quadrant Behavior at Push Time

| Quadrant | Push to Reminders? | Due date set? | Alarm? | Notes |
|----------|--------------------|---------------|--------|-------|
| Q1       | ✅ Yes              | Today         | No specific time — due date only | Priority = High |
| Q2       | ✅ Yes              | Scheduled focus block date | No specific time — due date only | Priority = Medium |
| Q3       | ✅ Yes (as check-in reminder) | 3–5 business days from today | No specific time — due date only | Title prefixed: "Check in: [delegate] re: [task]"; Priority = Medium |
| Q4       | ❌ No               | —             | — | Q4 cuts are never pushed |

---

## Decisions Log

Decisions were made on 2026-02-19 and are now locked into this spec.

| # | Question | Decision |
|---|----------|----------|
| 1 | Default list name | `"Eisenhower List"` — dedicated list, auto-created if it doesn't exist |
| 2 | Q3 reminder format | Push as check-in reminder: "Check in: [delegate] re: [task]" with due date 3–5 business days out |
| 3 | Q1 alarm time | Due date only — no specific alarm time |
| 4 | Failed push behavior | Non-blocking — collect all errors and report them together at the end of the schedule summary |
| 5 | Version | Ship as standalone v0.3.0 |
