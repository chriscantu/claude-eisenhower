# `/plan-week` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `/plan-week` slash command that proposes weekly commitments based on carryover, priorities, calendar capacity, and delegation follow-ups.

**Architecture:** Pure markdown command file (`commands/plan-week.md`) following the same step-by-step pattern as `commands/review-week.md` and `commands/today.md`. No TypeScript, no new scripts. Minor update to `commands/schedule.md` to handle `Scheduled: week of ...` refinement. Update `docs/STRUCTURE.md` to register the new command.

**Tech Stack:** Markdown command prompts, existing `cal_query.swift` for calendar queries, existing TASKS.md schema.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `commands/plan-week.md` | Create | New `/plan-week` command — all 8 steps of the weekly planning flow |
| `commands/schedule.md` | Modify (lines 65-69) | Add awareness of `Scheduled: week of ...` prefix in Step 2 scope determination |
| `docs/STRUCTURE.md` | Modify (lines 57-69) | Add `plan-week.md` to the commands list |
| `docs/PRINCIPLES.md` | Modify (line 30) | Update command count from 10 to 11, add plan-week to list |
| `tests/agent-contracts.test.ts` | No change needed | Existing prompt-contracts tests auto-discover new command files |

---

### Task 1: Create `commands/plan-week.md`

This is the core deliverable — the full command prompt file.

**Files:**
- Create: `commands/plan-week.md`
- Reference (read only, do not modify): `commands/review-week.md`, `commands/today.md`, `docs/specs/plan-week-spec.md`

**Context:** Follow the exact structural pattern of `commands/review-week.md`: YAML frontmatter → intro paragraph → Step 1 (config check) → Step 2 (load task board) → Step 3 (calendar) → etc. The spec at `docs/specs/plan-week-spec.md` is the source of truth for all behavior. Every requirement (1-11) must be covered in the command steps.

- [ ] **Step 1: Read the spec and reference commands**

Read these files to understand the full behavioral spec and the command pattern to follow:
- `docs/specs/plan-week-spec.md` — the source of truth for all `/plan-week` behavior
- `commands/review-week.md` — structural pattern to follow (frontmatter, step layout, config check, calendar query, analytics log)
- `commands/today.md` — secondary pattern reference (simpler variant of the same structure)

Note the key patterns:
- YAML frontmatter: `description`, `argument-hint`, `allowed-tools`
- Intro paragraph explaining the command's purpose and read/write boundary
- Step-by-step numbered sections with `---` separators
- Config check pattern: read `task-output-config.md` (required), `calendar-config.md` (optional graceful fallback)
- Calendar query pattern: resolve `plugin_root`, run `cal_query.swift` with specific args
- Analytics log pattern: append one line, silent, no PII, create file/dir if absent
- Done step: command complete, do not prompt beyond closing line

- [ ] **Step 2: Create the command file with frontmatter and intro**

Create `commands/plan-week.md` with this exact content:

```markdown
---
description: Weekly planning — propose commitments based on priorities, capacity, and carryover
argument-hint: (no arguments)
allowed-tools: Read, Write, Edit
---

You are running the PLAN WEEK phase of the Engineering Task Flow.

This command is designed for Monday morning use but works any day of the week.
It proposes a concrete commitment list based on carryover, fresh priorities,
delegation follow-ups, and calendar capacity. The user approves or adjusts the
plan, then runs /schedule to assign specific dates and push to Reminders.

Write is used for two purposes: updating `Scheduled:` fields in TASKS.md after
user confirmation, and appending to the silent analytics log.

---
```

- [ ] **Step 3: Add Step 1 — Config check**

Append to `commands/plan-week.md`:

```markdown
## Step 1: Config check

Read `config/task-output-config.md`.
If missing → note it. Plugin root will use default with warning. Continue.

Read `config/calendar-config.md`.
If missing → note it. Calendar section will show a graceful fallback. Continue.

Resolve `plugin_root` following `skills/core/references/plugin-root-resolution.md`.
Read `calendar_name` from calendar-config.md (if available).

---
```

- [ ] **Step 4: Add Step 2 — Determine planning window**

Append to `commands/plan-week.md`:

```markdown
## Step 2: Determine planning window

Compute the planning window based on today's day of the week:

- **Monday**: Planning window = Monday through Friday of this week.
  Carryover label = "open from last week".
  Calendar header = "Calendar Load".
- **Tuesday–Friday**: Planning window = today through Friday of this week.
  Carryover label = "open from earlier this week".
  Calendar header = "Calendar Load ({today's day name}–Fri)".
- **Saturday/Sunday**: Planning window = Monday through Friday of next week.
  Carryover label = "open from last week".
  Calendar header = "Calendar Load".

Compute `current_monday`: the Monday of the current week (or next week if today is
Saturday/Sunday). This value is used for the `Scheduled: week of YYYY-MM-DD` write.

---
```

- [ ] **Step 5: Add Step 3 — Load the task board**

Append to `commands/plan-week.md`:

```markdown
## Step 3: Load the task board

Read TASKS.md from the root of the workspace.
If TASKS.md does not exist: show "No task board found. Run /intake to get started." and stop.

Extract the following data from TASKS.md:

**A — Open commitments (carryover)**
All tasks with `State: Active` where `Scheduled:` contains a past date or a
`week of YYYY-MM-DD` value where that Monday is before `current_monday`, and no
`Done:` date is set. Exclude tasks in the `## Done` section.
Sort: Q1 first, then Q2.

**B — Unscheduled Active tasks**
All tasks with `State: Active` that have no `Scheduled:` field.
Exclude tasks in the `## Done` section.
Sort: Q1 first, then Q2. Within same priority, tasks with `Due date:` before tasks
without. Among tasks with due dates, sort ascending by date.

**C — Already scheduled this week**
All tasks with `State: Active` where `Scheduled:` contains `week of {current_monday}`
(already committed for this week by a prior `/plan-week` run). These are not proposed
again — they are noted in the output as already committed.

**D — Delegation check-ins**
All tasks with `State: Delegated` (not in `## Done`) where `Check-by:` date falls
within the planning window (today through Friday, inclusive).
Include overdue delegations (Check-by before today) — flag with "⚠️ {N} days overdue"
using business day count (skip Saturday and Sunday).
Sort: Check-by date ascending (soonest first, overdue first).

**E — Inbox count**
Count all tasks with `State: Inbox`.
If count > 0, find the newest intake date among them (from `[ INTAKE — {date} ]` header).

**F — Recently completed**
Read `memory/plan-log.md` for the most recent entry date. If it exists, collect tasks
in `## Done` with `Done:` date after that entry date. If `plan-log.md` does not exist
or has no entries, use a 5 business day lookback from today.
Maximum 5 items. If more exist, note the overflow count.

---
```

- [ ] **Step 6: Add Step 4 — Review log bridge and calendar**

Append to `commands/plan-week.md`:

```markdown
## Step 4: Review log bridge and calendar

### Part A — Review log bridge

Read `memory/review-log.md`. If the file does not exist, skip to Part B.

Find the most recent entry line. Parse its date and fields:
```
[YYYY-MM-DD] day:{day} inbox:{N} active:{N} delegated:{N} overdue:{N} calendar:{grade}
```

If the entry date is within 7 days of today, compute deltas:
- Overdue delta: current overdue count (from Step 3 bucket D, overdue items only) minus logged `overdue` value
- Inbox delta: current inbox count (from Step 3 bucket E) minus logged `inbox` value

Store these for output assembly. If the entry is older than 7 days, skip the bridge.

### Part B — Calendar query

Read `calendar_name` (from Step 1). If unavailable, skip to Step 5 with
calendar = unavailable.

Run:
```applescript
do shell script "swift {plugin_root}/scripts/cal_query.swift '{calendar_name}' 7 summary 2>&1"
```

From the output, extract availability for each day in the planning window
(today through Friday, or Mon through Fri if running on Monday).

Classify each day as:
- `busy` — mostly committed, limited capacity
- `moderate` — some meetings, room for focused work
- `light` — open, strong focus window candidate
- `free` — clear

Count focus days: days rated `light` or `free`.

Do NOT use AppleScript `whose` clause. Always use cal_query.swift.

---
```

- [ ] **Step 7: Add Step 5 — Build the proposal**

Append to `commands/plan-week.md`:

```markdown
## Step 5: Build the proposal

Assemble the sectioned proposal. Omit any section where there is nothing to show
(do not render empty sections or "nothing here" placeholders).

Use this exact section order:

---

### Header

```
## 📋 Week Plan — {full day name}, {full date, e.g. Monday, March 30}
```

---

### Section 1 — 🔗 Since Friday's Review

Render only if the review log bridge from Step 4 Part A produced data (entry within 7 days).

```
─── 🔗 Since Friday's Review ──────────────────────────────
  Last review ({date}): {overdue} overdue, {inbox} inbox items, {calendar} calendar.
  Since then: {delta summary}.
```

Delta summary examples:
- "overdue resolved, 3 new inbox items arrived"
- "1 new overdue, inbox unchanged"
- "no significant changes"

Compute deltas from the values parsed in Step 4 Part A.

---

### Section 2 — 📬 Inbox Alert

Render only if Inbox count > 0 (bucket E from Step 3).

```
─── 📬 Inbox Alert ─────────────────────────────────────────
  {N} unprocessed items in Inbox (newest: {relative day name or date}).
  Run /prioritize first, or plan with what's already classified?
```

**This is a blocking prompt.** Wait for the user to respond:
- If user says to prioritize (or equivalent): stop and say "Run /prioritize to triage your inbox, then re-run /plan-week." Do not continue.
- If user says to continue (or equivalent): proceed to the next section.

---

### Section 3 — 📆 Calendar Load

Render always (use fallback text if calendar unavailable).

**If available (Monday run):**
```
─── 📆 Calendar Load ──────────────────────────────────────
  Mon: {grade}  |  Tue: {grade}  |  Wed: {grade}  |  Thu: {grade}  |  Fri: {grade}
  Focus windows: {list of light/free day names, or "None — heavy week ahead"}
```

**If available (mid-week run, e.g. Wednesday):**
```
─── 📆 Calendar Load (Wed–Fri) ─────────────────────────────
  Wed: {grade}  |  Thu: {grade}  |  Fri: {grade}
  Focus windows: {list of light/free day names, or "None — heavy week ahead"}
```

**If unavailable:**
```
─── 📆 Calendar Load ──────────────────────────────────────
  Calendar unavailable — run /setup to configure.
```

---

### Section 4 — ✅ Completed Since Last Plan

Render only if bucket F from Step 3 has results.

```
─── ✅ Completed Since Last Plan ({N} items) ───────────────
  • "{task title}" — Done: {date}
  • "{task title}" — Done: {date}
```

If more than 5: `  ... and {N} more`

---

### Section 5 — ⭐ Proposed Plan

Always render — this is the core of the command. Two sub-sections.

**Sub-section: Personal commitments**

List open commitments (bucket A) first, then unscheduled candidates (bucket B).

```
─── ⭐ Proposed Plan ───────────────────────────────────────

  Personal commitments ({total count}):
    1. [{priority}] "{task title}" ← {carryover label}
    2. [{priority}] "{task title}" ← {carryover label}
    3. [{priority}] "{task title}" — Due: {date}
    4. [{priority}] "{task title}"
```

Rules:
- Open commitments appear first, each with carryover label:
  `← open from last week` (Monday) or `← open from earlier this week` (Tue–Fri)
- Fresh candidates appear after, sorted Q1→Q2, due-dated before undated
- Show `— Due: {date}` only if `Due date:` field is set on the task
- Number items sequentially (1, 2, 3...) for easy reference during adjustment

If bucket C (already scheduled this week) has items, note them:
```
  Already committed this week: {N} task(s) from a prior /plan-week run.
```

If no personal commitments exist (buckets A and B both empty):
```
  Personal commitments: none. All Active tasks are already scheduled.
  Consider running /intake or /prioritize to surface new work.
```

**Sub-section: Delegation check-ins**

```
  Delegation check-ins ({count}):
    • {alias} — "{task title}" — Check-by: {relative label}
    • {alias} — "{task title}" — ⚠️ {N} day(s) overdue
```

Rules:
- Overdue items first, flagged with ⚠️ and business days overdue
- Non-overdue items show relative labels: "today", "tomorrow", or day name (e.g., "Wed")
- If no check-ins exist in the planning window, omit this sub-section entirely

**Capacity note** (always render after the two sub-sections):

```
  ⚖️ {N} tasks + {M} check-ins against ~{X} focus days ({day names}).
  {Actionable guidance.}
```

Guidance logic:
- Total items (personal commitments + check-ins) <= focus days → "Looks manageable."
- Total items > focus days but within 1.5x → "Consider deferring 1 Q2 item if meetings expand."
- Total items > 1.5x focus days → "Heavy week — consider deferring Q2 items to next week."
- If calendar is unavailable → "{N} tasks + {M} check-ins this week. Calendar unavailable for capacity check."

---

### Section 6 — 💡 Recommended

Always render. Generate 2–4 action items based on what was surfaced:

- If open commitments (carryover) contain Q1 items → "Handle {task title} first — open commitment from last week."
- If open commitments contain only Q2 items → "Prioritize carried-over Q2 work before taking on new items."
- If light/free calendar days exist → "Block {day name} for Q2 deep work (lightest calendar day)."
- If overdue delegation check-ins exist → "Chase {alias} — check-in {N} days overdue."
- If check-in due tomorrow or today → "Follow up with {alias} — check-in due {today/tomorrow}."
- If inbox count > 3 → "Run /prioritize — {N} inbox items waiting."
- If no carryover, no overdue, and light calendar → "Clean slate — good week to tackle Q2 strategic work."

```
─── 💡 Recommended ─────────────────────────────────────────
  1. {action}
  2. {action}
  ...
```

**Closing prompt:**

```
Adjust the plan (add, remove, defer items) or confirm as-is.
Then run /schedule to assign dates and push to Reminders.
```

---

- [ ] **Step 8: Add Step 6 — Interactive adjustment**

Append to `commands/plan-week.md`:

```markdown
## Step 6: Interactive adjustment

After presenting the proposal, wait for the user's response. Accept conversational
adjustments:

**Remove**: User says "drop item 3" or "remove the retro template" → exclude that item
from the plan. Do not write anything for it.

**Defer**: User says "defer item 4" or "push the SLA review to next week" → exclude that
item. No write. It will reappear as an unscheduled candidate in the next `/plan-week` run.
Increment the deferred count for analytics.

**Add**: User says "add the SLA review" or "include the infra audit too" → look up the
task in TASKS.md. It must be `State: Active` and not already in the proposal. If found,
add it to the commitment list. If the task is `State: Inbox`, say: "That task is still in
Inbox. Run /prioritize first to classify it."

**Confirm**: User says "looks good", "confirm", "yes", or equivalent → proceed to Step 7.

Do NOT write to TASKS.md until the user explicitly confirms. If the user makes multiple
adjustments, re-display the updated plan after each round of changes and ask again:
"Updated. Confirm this plan, or make more changes?"

---
```

- [ ] **Step 9: Add Step 7 — Write to TASKS.md**

Append to `commands/plan-week.md`:

```markdown
## Step 7: Write to TASKS.md

After user confirms the plan:

For each confirmed personal commitment (from the final adjusted list):
- If the task already has a `Scheduled:` field: overwrite it with `Scheduled: week of {current_monday}`
  (where `{current_monday}` is the YYYY-MM-DD date computed in Step 2)
- If the task has no `Scheduled:` field: add `Scheduled: week of {current_monday}`

For delegation check-ins: **do not modify**. They are already tracked via `Check-by:` dates.

For removed or deferred items: **do not write anything**. The absence of a `Scheduled:` field
is the signal that the task was not committed this week.

Show a confirmation:
```
Plan saved — {N} tasks committed for the week of {current_monday formatted as Mon DD}.
Run /schedule to assign specific dates and push to Reminders.
```

---
```

- [ ] **Step 10: Add Step 8 — Analytics log**

Append to `commands/plan-week.md`:

```markdown
## Step 8: Write analytics log

After saving to TASKS.md, append one line to `memory/plan-log.md`.
Create the file if it does not exist. Create the `memory/` directory if it does not exist.

Format:
```
[YYYY-MM-DD] day:{full-day-name} committed:{N} carryover:{N} checkins:{N} inbox:{N} deferred:{N}
```

Fields:
- `committed` — total personal tasks the user confirmed
- `carryover` — how many of those were open commitments from a prior week (bucket A count in the final confirmed list)
- `checkins` — delegation check-ins surfaced in the planning window (awareness count, not committed)
- `inbox` — Inbox count at time of planning (bucket E from Step 3)
- `deferred` — items the user explicitly deferred during adjustment

Example:
```
[2026-03-30] day:Monday committed:4 carryover:2 checkins:3 inbox:3 deferred:1
```

Rules:
- One line per run — append unconditionally
- No PII — no alias names, task titles, or email addresses
- Write is silent — do not mention it in the output to the user
- If the write fails → log the error internally and continue. Do not surface to user.

---
```

- [ ] **Step 11: Add Step 9 — Done**

Append to `commands/plan-week.md`:

```markdown
## Step 9: Done

The command is complete. Do not prompt for further action beyond the closing line
in Step 7. The user drives any follow-on commands (/schedule, /prioritize, etc.).
```

- [ ] **Step 12: Verify the command file is complete**

Read `commands/plan-week.md` end to end. Verify:
1. YAML frontmatter is present with `description`, `argument-hint`, `allowed-tools`
2. Steps 1-9 are all present with `---` separators
3. No references to `productivity:memory-management` (which would require a guard line per `tests/prompt-contracts.test.ts`)
4. No bare `## Q1`/`## Q2`/`## Q3`/`## Q4` headers (prohibited by prompt-contracts tests)
5. No hardcoded `plugin_root` default path (prohibited by agent-contracts tests)
6. Calendar query uses `cal_query.swift`, never AppleScript `whose`

- [ ] **Step 13: Run the test suite to verify no regressions**

Run: `cd /Users/chris.cantu/repos/claude-eisenhower/scripts && npm test`
Expected: All existing tests pass. The new `commands/plan-week.md` file is auto-discovered by `prompt-contracts.test.ts` and `agent-contracts.test.ts` — verify no new violations are reported.

- [ ] **Step 14: Commit**

```
git add commands/plan-week.md
git commit -m "feat(plan-week): add /plan-week command

Weekly planning command that proposes commitments based on carryover,
priorities, calendar capacity, and delegation follow-ups. Bridges
/review-week (retrospective) and /schedule (execution).

Spec: docs/specs/plan-week-spec.md"
```

---

### Task 2: Update `commands/schedule.md` for `week of` awareness

`/schedule` needs to recognize tasks with `Scheduled: week of YYYY-MM-DD` and refine them to specific dates, rather than treating them as "already scheduled."

**Files:**
- Modify: `commands/schedule.md` (Step 2, around line 66-69)
- Reference (read only): `docs/specs/plan-week-spec.md` (Requirement 8, Schema Impact section, PW-016)

**Context:** Currently, `/schedule` Step 2 says: "If no argument, schedule all prioritized tasks that don't yet have a date assigned." A task with `Scheduled: week of 2026-03-30` has a `Scheduled:` field, so `/schedule` would skip it. We need `/schedule` to treat `Scheduled: week of ...` as "planned but not yet date-assigned" — eligible for scheduling.

- [ ] **Step 1: Read the current schedule.md Step 2**

Read `commands/schedule.md` and find the Step 2 section (Determine scope). It currently reads:

```markdown
## Step 2: Determine scope

If $ARGUMENTS specifies a quadrant (Q1, Q2, Q3, Q4), schedule only tasks in that quadrant.
If $ARGUMENTS specifies a task title, schedule only that task.
If no argument, schedule all prioritized tasks that don't yet have a date assigned.
```

- [ ] **Step 2: Update Step 2 to handle `week of` prefix**

Edit `commands/schedule.md` Step 2. Replace the existing content with:

```markdown
## Step 2: Determine scope

If $ARGUMENTS specifies a quadrant (Q1, Q2, Q3, Q4), schedule only tasks in that quadrant.
If $ARGUMENTS specifies a task title, schedule only that task.
If no argument, schedule all prioritized tasks that either:
- Have no `Scheduled:` field at all, OR
- Have a `Scheduled:` field starting with `week of` (planned by `/plan-week` but not yet assigned a specific date)

When scheduling a task with `Scheduled: week of YYYY-MM-DD`, overwrite the field with the
specific date (e.g., `Scheduled: 2026-03-31`). The `week of` prefix is a planning marker,
not a final schedule.
```

- [ ] **Step 3: Verify the edit is clean**

Read `commands/schedule.md` Step 2 again to confirm:
1. The three scope conditions are present (quadrant, title, no-arg)
2. The `week of` handling is documented
3. No existing behavior is broken (tasks with no `Scheduled:` are still included)

- [ ] **Step 4: Run the test suite**

Run: `cd /Users/chris.cantu/repos/claude-eisenhower/scripts && npm test`
Expected: All tests pass. The `schedule.md` edit is prompt text only — no TypeScript logic changed.

- [ ] **Step 5: Commit**

```
git add commands/schedule.md
git commit -m "feat(schedule): handle 'week of' prefix from /plan-week

/schedule now treats tasks with 'Scheduled: week of YYYY-MM-DD' as
eligible for specific date assignment, overwriting the week-level
marker with a concrete date."
```

---

### Task 3: Update `docs/STRUCTURE.md` and `docs/PRINCIPLES.md`

Register the new command in the canonical structure doc and update the command count.

**Files:**
- Modify: `docs/STRUCTURE.md` (commands list, around lines 57-69)
- Modify: `docs/PRINCIPLES.md` (command count, line 30)
- Reference (read only): `docs/specs/plan-week-spec.md` (Files to Create or Update)

- [ ] **Step 1: Read the current commands list in STRUCTURE.md**

Read `docs/STRUCTURE.md` and find the `commands/` section. It currently lists:

```
commands/
  intake.md
  prioritize.md
  schedule.md
  execute.md
  delegate.md
  scan-email.md
  review-week.md
  setup.md
  status.md
  today.md
```

- [ ] **Step 2: Add plan-week.md to the commands list**

Edit `docs/STRUCTURE.md` to add `plan-week.md` to the commands list. Insert it in alphabetical position (after `intake.md`, before `prioritize.md`):

```
commands/
  intake.md
  plan-week.md
  prioritize.md
  schedule.md
  execute.md
  delegate.md
  scan-email.md
  review-week.md
  setup.md
  status.md
  today.md
```

- [ ] **Step 3: Read the current PRINCIPLES.md commands line**

Read `docs/PRINCIPLES.md` line 30. It currently reads:

```
- `commands/` holds 10 slash commands (intake, prioritize, schedule, execute, delegate, scan-email, review-week, setup, status, today)
```

- [ ] **Step 4: Update the command count and list in PRINCIPLES.md**

Edit `docs/PRINCIPLES.md` line 30 to read:

```
- `commands/` holds 11 slash commands (intake, plan-week, prioritize, schedule, execute, delegate, scan-email, review-week, setup, status, today)
```

- [ ] **Step 5: Add plan-week-spec.md to the specs listing in STRUCTURE.md**

Read the `docs/specs/` listing in `docs/STRUCTURE.md`. Add `plan-week-spec.md` in alphabetical position:

```
    plan-week-spec.md                    -- /plan-week PRD: weekly planning command
```

- [ ] **Step 6: Add the plan file to the superpowers/plans listing in STRUCTURE.md**

Read the `docs/superpowers/plans/` listing in `docs/STRUCTURE.md`. Add the plan file:

```
    2026-03-27-plan-week-command.md
```

- [ ] **Step 7: Verify edits are clean**

Read `docs/STRUCTURE.md` and `docs/PRINCIPLES.md` to confirm:
1. `plan-week.md` appears in the commands list
2. Command count is 11
3. `plan-week` is in the PRINCIPLES.md list (alphabetical)
4. `plan-week-spec.md` appears in the specs listing
5. Plan file appears in the superpowers/plans listing

- [ ] **Step 8: Run the test suite**

Run: `cd /Users/chris.cantu/repos/claude-eisenhower/scripts && npm test`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```
git add docs/STRUCTURE.md docs/PRINCIPLES.md
git commit -m "docs: register /plan-week in STRUCTURE.md and PRINCIPLES.md

Add plan-week.md to commands list, update command count to 11,
add plan-week-spec.md to specs listing, add implementation plan
to superpowers/plans listing."
```

---

### Task 4: Manual verification

End-to-end manual verification that the command file is spec-compliant and the test suite passes.

**Files:**
- Read only: `commands/plan-week.md`, `commands/schedule.md`, `docs/STRUCTURE.md`, `docs/PRINCIPLES.md`, `docs/specs/plan-week-spec.md`

- [ ] **Step 1: Run the full test suite**

Run: `cd /Users/chris.cantu/repos/claude-eisenhower/scripts && npm test`
Expected: All tests pass with zero failures.

- [ ] **Step 2: Verify spec coverage — Requirements 1-11**

Read `docs/specs/plan-week-spec.md` Requirements section and cross-reference against `commands/plan-week.md`:

| Spec Requirement | Covered in Command Step |
|-----------------|------------------------|
| 1. Open commitment detection (carryover) | Step 3 bucket A |
| 2. Unscheduled Active task candidates | Step 3 bucket B |
| 3. Delegation check-ins due this week | Step 3 bucket D |
| 4. Calendar load for planning window | Step 4 Part B |
| 5. Inbox alert | Step 5 Section 2 |
| 6. Proposal assembly and presentation | Step 5 Sections 1-6 |
| 7. Interactive adjustment | Step 6 |
| 8. Write to TASKS.md | Step 7 |
| 9. Analytics log | Step 8 |
| 10. Review log bridge | Step 4 Part A + Step 5 Section 1 |
| 11. Completed since last plan | Step 3 bucket F + Step 5 Section 4 |

Verify each row: read the command step and confirm it implements what the spec requirement says. Flag any gaps.

- [ ] **Step 3: Verify Gherkin scenario coverage**

Read the Gherkin scenarios in `docs/specs/plan-week-spec.md` (PW-001 through PW-016). For each, confirm the behavior is implemented in the command:

- PW-001 (carryover surfaced): Step 3A + Step 5 Section 5
- PW-002 (unscheduled proposed): Step 3B + Step 5 Section 5
- PW-003 (delegation check-ins): Step 3D + Step 5 Section 5
- PW-004 (inbox alert shown): Step 5 Section 2
- PW-005 (inbox alert omitted): Step 5 Section 2 (omit rule)
- PW-006 (mid-week calendar scoping): Step 2 + Step 4B + Step 5 Section 3
- PW-007 (week-level Scheduled write): Step 7
- PW-008 (mid-week uses current Monday): Step 2 + Step 7
- PW-009 (defer = no write): Step 6 + Step 7
- PW-010 (review log bridge shown): Step 4A + Step 5 Section 1
- PW-011 (review log bridge omitted): Step 4A (skip rule)
- PW-012 (analytics log written): Step 8
- PW-013 (completed since last plan): Step 3F + Step 5 Section 4
- PW-014 (mid-week carryover label): Step 2 + Step 5 Section 5
- PW-015 (missing calendar fallback): Step 4B + Step 5 Section 3
- PW-016 (schedule refines week of): Task 2 (schedule.md update)

- [ ] **Step 4: Verify Platform Architecture compliance**

Confirm that `commands/plan-week.md`:
1. Does not introduce any new platform dependencies (macOS-only features)
2. Calendar is optional — graceful fallback when config is missing
3. Core planning logic works with TASKS.md only (platform-agnostic)

Per `docs/PRINCIPLES.md` Platform Architecture section: `/plan-week` should be listed as core (platform-agnostic) since it only requires TASKS.md. Calendar is an optional enhancement.

- [ ] **Step 5: Verify prompt contract compliance**

Confirm the command file does NOT contain:
1. Bare `## Q1`, `## Q2`, `## Q3`, `## Q4` headers (as section headers, not inline references like `[Q1]`)
2. `## Unprocessed` or `## Backlog` headers
3. References to `productivity:memory-management` without the guard line
4. Hardcoded `plugin_root` default paths like `~/repos/claude-eisenhower`

These are enforced by `tests/prompt-contracts.test.ts` and `tests/agent-contracts.test.ts`.
