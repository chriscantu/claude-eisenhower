# Spec: TASKS.md Schema
**Version**: v1.0.0 (planned)
**Status**: Draft
**Author**: Cantu
**Date**: 2026-03-02

---

## Problem Statement

No canonical specification exists for the TASKS.md record format. Each command file
that writes to TASKS.md describes the format inline and independently. This caused
the v0.9.x consistency drift where four command files continued writing Q1/Q2/Q3/Q4
vocabulary after the four-state model shipped in v0.9.0.

This spec is the single source of truth for every field, valid value, required vs.
optional rule, and section structure in TASKS.md. All current and future commands
that read or write TASKS.md must reference this spec rather than documenting the
format inline.

---

## Goals

1. Define every field in a task record with its type and valid values
2. Establish which fields are required vs. optional per state
3. Define the canonical TASKS.md section structure
4. Serve as the acceptance test target for the four-state test suite (`tests/four-state.test.ts`)
5. Prevent format drift — commands cite this spec, not each other

---

## Task Record Schema

A task record is a fenced block delimited by `---` lines. Fields are colon-separated
key-value pairs. Multi-word values do not require quoting.

### Header line

```
[ INTAKE — {YYYY-MM-DD} ]
```

The header line identifies the record and its intake date. For email and Slack scans,
it may include a source qualifier: `[ INTAKE — {YYYY-MM-DD} | Email scan ]`.

### Fields

| Field | Type | Required | Valid values / notes |
|-------|------|----------|----------------------|
| `Title` | string | Always | Short, action-oriented. Max 10 words. |
| `Description` | string | Always | What needs to happen and why. 1–3 sentences. |
| `Source` | string | Always | Email, Slack, Meeting, Conversation, Calendar, Jira, Asana, Linear, GitHub, Self, Other. For scanned sources: `Email ({account})`, `Slack ({workspace})`. |
| `Requester` | string | Always | Alias from stakeholder graph, or verbatim if unresolved. `Self` if self-generated. |
| `Urgency` | string | Always | Urgency language quoted or paraphrased from source. `Not specified` if absent. |
| `Due date` | string | Always | Raw date if stated. `Not specified` if absent. |
| `Priority` | enum | After `/prioritize` | `Q1`, `Q2`, `Q3`, `Q4` |
| `State` | enum | Always | `Inbox`, `Active`, `Delegated`, `Done` |
| `Owner` | string | After `/prioritize` | `me` for Active tasks; delegate alias for Delegated tasks |
| `Check-by` | date (YYYY-MM-DD) | Required if `State: Delegated` | The date to follow up on the delegation. No exceptions. |
| `Scheduled` | date (YYYY-MM-DD) | After `/schedule` | The date the task was scheduled |
| `Action` | string | After `/schedule` | The specific action assigned (e.g., `[CRITICAL] Start today`, `90-min focus block`, `Delegated — check in {date}`) |
| `Note` | string | Optional | Blocker context, escalation notes, or elimination record. Format: `Eliminated — Q4 cut {YYYY-MM-DD}` for dropped tasks. |
| `Done` | date (YYYY-MM-DD) | Required if `State: Done` | The date the task was completed or eliminated |
| `Synced` | string | After adapter push | Result of the adapter push. See values below. |

### Synced field values

| Value | Meaning |
|-------|---------|
| `Reminders ({list}) — {YYYY-MM-DD}` | Successfully pushed to the named Reminders list |
| `skipped (already exists)` | Title already existed in the adapter — no duplicate created |
| `failed — {reason}` | Push attempted but failed; reason included |
| `Reminders completed — {YYYY-MM-DD}` | Completion synced to adapter via `/execute` |
| `Reminders already complete — {YYYY-MM-DD}` | Completion sync called but reminder was already complete |
| `skipped — not found in Reminders` | Task not found in adapter at completion time |

---

## TASKS.md Section Structure

TASKS.md must contain exactly these sections in this order:

```markdown
# Task Board

## Inbox

## Active

## Delegated

## Done
```

**Rules**:
- No other top-level sections. No `## Q1`, `## Q2`, `## Q3`, `## Q4`, `## Unprocessed`, `## Completed`, or `## Blocked`.
- `## Done` accumulates all completed and eliminated tasks. It is not periodically cleared.
- Task records are appended within the appropriate section. The most recent appears last.

---

## State Rules

| State | Meaning | Required additional fields | Owner value |
|-------|---------|--------------------------|-------------|
| `Inbox` | Captured, not yet classified | None | None |
| `Active` | Committed, owner is doing it | `Priority`, `Owner: me` | `me` |
| `Delegated` | Outcome owned by user, execution owned by delegate | `Priority`, `Owner: {alias}`, `Check-by: {date}` | delegate alias |
| `Done` | Terminal — completed, eliminated, or closed | `Done: {date}`, `Note` if eliminated | Unchanged from previous state |

### State transitions

```
Inbox → Active      (/prioritize confirms Q1 or Q2)
Inbox → Delegated   (/prioritize confirms Q3 with delegate + check-by date)
Inbox → Done        (/prioritize confirms Q4 elimination)
Active → Done       (/execute marks complete)
Active → Delegated  (/execute delegates mid-stream)
Delegated → Done    (/execute confirms delegate completed)
Delegated → Active  (/execute re-claims ownership after failed delegation)
```

---

## Gherkin Scenarios

### SCHEMA-001: Intake creates a minimal valid record

```gherkin
Given a user runs /intake with a natural language task description
When the task record is written to TASKS.md
Then the record contains: Title, Description, Source, Requester, Urgency, Due date
And State is "Inbox"
And no Priority, Owner, Check-by, Scheduled, or Done fields are present
And the record appears in the ## Inbox section
```

### SCHEMA-002: State field uses four-state vocabulary only

```gherkin
Given any command writes a task record to TASKS.md
Then the State field value is one of: Inbox, Active, Delegated, Done
And the State field is never: Q1, Q2, Q3, Q4, Unprocessed, Completed, Blocked
```

### SCHEMA-003: Priority field uses Eisenhower vocabulary only

```gherkin
Given /prioritize has classified a task
When the task record is updated
Then the Priority field value is one of: Q1, Q2, Q3, Q4
And the Priority field is never used as a section header
And the State field reflects the action-oriented state, not the Priority
```

### SCHEMA-004: Delegated state requires Check-by field

```gherkin
Given a task is being written with State: Delegated
When the record is saved to TASKS.md
Then a Check-by field must be present with a valid YYYY-MM-DD date
And no Delegated task record may be saved without a Check-by date
```

### SCHEMA-005: Active state requires Owner: me

```gherkin
Given a task is being written with State: Active
When the record is saved to TASKS.md
Then the Owner field is "me"
And no other alias may appear as Owner for an Active task
```

### SCHEMA-006: Done state requires Done date

```gherkin
Given a task is being moved to State: Done
When the record is saved to TASKS.md
Then a Done field must be present with a valid YYYY-MM-DD date
And for eliminated tasks a Note field must be present containing "Eliminated — Q4 cut"
```

### SCHEMA-007: TASKS.md section headers are fixed

```gherkin
Given TASKS.md is created or already exists
Then it contains exactly these section headers: ## Inbox, ## Active, ## Delegated, ## Done
And it does not contain: ## Q1, ## Q2, ## Q3, ## Q4, ## Unprocessed, ## Completed, ## Blocked
```

### SCHEMA-008: Synced field is written after adapter push

```gherkin
Given /schedule has pushed a task to the configured adapter
When the push completes (success, skipped, or error)
Then the task record in TASKS.md contains a Synced field
And the Synced field value matches the push result format defined in this spec
```

### SCHEMA-009: Scan-sourced records use State: Inbox

```gherkin
Given /scan-email or /scan-slack writes a task to TASKS.md
When the record is created
Then the State field is "Inbox"
And no Priority, Owner, or Check-by fields are present at intake time
And the record appears in the ## Inbox section
```

---

## Decisions Log

1. **`State:` not `Status:`** — The field was named `Status:` in early versions of
   the email scan output. Standardized to `State:` to match the four-state model spec
   (v0.9.0) and `commands/intake.md`. All commands must use `State:`.

2. **Section structure is fixed** — No optional or user-defined sections. This
   prevents creative naming like `## Q3 — Delegate` vs. `## Delegated` from
   re-emerging.

3. **Check-by is mandatory on Delegated, no exceptions** — A Delegated task without
   a Check-by date is indistinguishable from a dropped task. The date is the forcing
   function. See `docs/specs/four-state-task-model-spec.md` Decision 4.

4. **Done accumulates; nothing is deleted** — Moving to `## Done` is the terminal
   state. Historical tasks stay visible as a record of work completed and work dropped.
