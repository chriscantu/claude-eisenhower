# Feature Spec: Four-State Task Model
**Version**: v0.9.0
**Status**: Draft — pending implementation
**Author**: Cantu
**Date**: 2026-02-22

---

## Problem Statement

The existing TASKS.md uses the Eisenhower quadrant model (Q1/Q2/Q3/Q4) as the primary status classification. This works well for prioritization but creates cognitive overhead for a Platform team leader interfacing with 60+ internal teams. The quadrant label conflates two concerns: priority and action state.

The leader's core workflow decision for every inbound item is: **"Should we own this, who owns it, and when?"** The current model does not cleanly represent the lifecycle of a task after prioritization.

Additionally, a "Blocked" state was considered and deliberately rejected as an anti-pattern — it creates a holding area with no forcing function, analogous to a Jira Blocked column that becomes a graveyard.

---

## Goals

- Replace Q1/Q2/Q3/Q4 status labels with four action-oriented states
- Preserve the Eisenhower matrix as the **prioritization input**, not the ongoing status
- Enforce a check-by date on all Delegated tasks
- Remove any pathway to park a task without a forcing function
- Keep schema consistent so Markdown → YAML upgrade is non-breaking

---

## Four-State Model

```
Inbox → Active → Delegated → Done
```

| State | Definition | Required fields |
|-------|-----------|-----------------|
| **Inbox** | Raw, unprocessed — not yet a commitment | None beyond base schema |
| **Active** | Committed, doing it personally | Due date recommended |
| **Delegated** | You own the outcome, someone else owns execution | Check-by date required |
| **Done** | Terminal, closed | Done date |

### Design Rules
1. **Delegated ≠ Done** — the leader retains accountability for outcome. Check-by date is mandatory.
2. **No Blocked state** — if a task cannot move forward, the action is to escalate, re-delegate, or drop it. Blockers are noted as a field on Active or Delegated tasks. The check-by date is the forcing function.
3. **Eisenhower quadrant is preserved** as a metadata field (`Priority:`) for context, but is no longer the status driver.

---

## Task Schema (Minimum Viable Fields)

```
---
[ INTAKE — {date} ]
Title:        {title}
Description:  {description}
Source:       {email / meeting / slack / direct request / self}
Requester:    {team name or person alias}
Owner:        {me / delegate alias}
Priority:     {Q1 / Q2 / Q3 / Q4}
State:        {Inbox / Active / Delegated / Done}
Check-by:     {date — required if State = Delegated}
Due date:     {external deadline if applicable}
Note:         {optional — blocker context, escalation notes}
---
```

---

## Gherkin Scenarios

### FOUR-STATE-001: Intake creates Inbox state

```gherkin
Given a user runs /intake with a natural language task description
When the task record is written to TASKS.md
Then the task State is "Inbox"
And the task appears in the ## Inbox section
And no Priority or Owner is assigned yet
```

### FOUR-STATE-002: Prioritize moves task from Inbox to Active

```gherkin
Given a task in State: Inbox
When the user runs /prioritize and confirms Q1 or Q2 classification
Then the task State is updated to "Active"
And the task Priority is set to Q1 or Q2
And Owner is set to "me"
And the task is moved to the ## Active section
```

### FOUR-STATE-003: Prioritize moves task from Inbox to Delegated

```gherkin
Given a task in State: Inbox
When the user runs /prioritize and confirms Q3 classification with a delegate
Then the task State is updated to "Delegated"
And the task Priority is set to Q3
And Owner is set to the confirmed delegate alias
And a Check-by date is required before saving
And the task is moved to the ## Delegated section
```

### FOUR-STATE-004: Delegated task requires check-by date

```gherkin
Given a task being classified as Delegated
When Claude attempts to write the task record
Then Claude must prompt for a Check-by date if one is not already set
And Claude must not write the record with a missing Check-by date
```

### FOUR-STATE-005: Q4 task maps to Done (dropped)

```gherkin
Given a task in State: Inbox
When the user confirms Q4 classification (defer / eliminate)
Then the task State is set to "Done"
And a Note is added: "Eliminated — Q4 cut {date}"
And the task is moved to the ## Done section
```

### FOUR-STATE-006: Execute marks Active task as Done

```gherkin
Given a task in State: Active
When the user runs /execute and marks it complete
Then the task State is updated to "Done"
And a Done date is recorded
And the task is moved to the ## Done section
```

### FOUR-STATE-007: Execute marks Delegated task as Done

```gherkin
Given a task in State: Delegated
When the user runs /execute and confirms the delegate completed the work
Then the task State is updated to "Done"
And a Done date is recorded
And the task is moved to the ## Done section
```

### FOUR-STATE-008: Overdue Delegated tasks surfaced at schedule time

```gherkin
Given one or more tasks in State: Delegated
And their Check-by date is on or before today
When the user runs /schedule
Then Claude surfaces each overdue Delegated task before scheduling new work
And prompts: escalate, re-delegate, or drop — not "mark blocked"
```

### FOUR-STATE-009: Blocker note on Active task — no state change

```gherkin
Given a task in State: Active
And the user reports a blocker
When Claude logs the blocker
Then the task State remains "Active"
And a Note field is added with the blocker context
And a Check-by date is suggested if not already present
And Claude does not move the task to any "Blocked" state
```

### FOUR-STATE-010: TASKS.md section structure matches four states

```gherkin
Given a new or existing TASKS.md
Then it contains the following sections in order:
  ## Inbox
  ## Active
  ## Delegated
  ## Done
And does not contain Q1 / Q2 / Q3 / Q4 as section headers
And does not contain a ## Blocked section
```

---

## Migration: Existing TASKS.md

Existing tasks in Q1/Q2/Q3/Q4 sections map as follows:

| Old section | New State | Notes |
|-------------|-----------|-------|
| Q1 — Urgent + Important | Active | Owner: me |
| Q2 — Important, Not Urgent | Active | Owner: me |
| Q3 — Urgent, Not Important | Delegated | Requires Check-by date |
| Q4 — Defer / Eliminate | Done | Note: "Eliminated — Q4 cut" |
| Unprocessed | Inbox | No change |
| Completed | Done | No change |

---

## Files to Update

| File | Change |
|------|--------|
| `commands/intake.md` | Update TASKS.md section structure; Status field → State: Inbox |
| `commands/prioritize.md` | Replace Q1–Q4 sections with Active/Delegated/Done; add Check-by enforcement |
| `commands/schedule.md` | Update overdue scan to target State: Delegated + Check-by |
| `commands/execute.md` | Update Done close-out to write State: Done |
| `commands/delegate.md` | Update to write State: Delegated with mandatory Check-by |
| `skills/claude-eisenhower/references/eisenhower.md` | Clarify Eisenhower as Priority field, not state |
| `TASKS.md` | Migrate existing tasks to new sections (runtime file — not committed) |
| `ROADMAP.md` | Add v0.9.0 entry |

---

## Decisions Log

1. **Blocked state rejected** — anti-pattern. Forces false stasis. Every stuck task needs an action decision (escalate / re-delegate / drop), not a label.
2. **Eisenhower preserved as Priority field** — the matrix is still valuable for classification. It becomes metadata, not status.
3. **Start with Markdown** — schema stays consistent. YAML upgrade is a later phase triggered by measurable pain (inability to filter by owner/date).
4. **Check-by date enforcement on Delegated** — non-negotiable. Without it, Delegated becomes a graveyard.

---

*Spec complete. No implementation changes should be made without reference to this document.*
