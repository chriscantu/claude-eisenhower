---
name: memory-manager
description: >
  Internal plugin skill. Use this skill when a plugin command directs you to
  perform a memory operation: log-delegation, resolve-delegation, update-checkin,
  or query-pending. Called by /schedule, /execute, /delegate, and /review-week.
  Do NOT invoke this skill based on user phrases — it is a plugin-internal service.
version: 1.0.0
---

# Memory Manager

Single interface for all delegation memory operations in the claude-eisenhower plugin.

Abstracts the backend (`productivity:memory-management` skill vs local files) from
callers. Commands invoke operations by intent; this skill handles all backend logic.

See `references/memory-operations.md` for local file formats, return shapes, and
failure mode details.

---

## Operations

### log-delegation

**Purpose:** Create a new pending delegation entry when a task is delegated.

**Inputs:**
- `alias` — delegate's display alias (e.g., "Alex R.")
- `task_title` — title of the delegated task
- `check_in_date` — YYYY-MM-DD date for follow-up

**Execution:**

1. Attempt to log via `productivity:memory-management`:
   - Stakeholder: `alias`
   - What was delegated: `task_title`
   - Expected by: `check_in_date`
   - Status: pending

2. If the skill is unavailable, fall back to local files:
   - Notify the caller: "Note: memory-management skill not found. Logging locally."
   - Ensure `memory/people/` directory exists (create if absent).
   - Write using the canonical schema in `docs/specs/memory-schema-spec.md`:
     - Append a new row to the `## Stakeholder Follow-ups` table in `memory/glossary.md`:
       `| [alias] | [task_title] | [YYYY-MM-DD] | [check_in_date] | Pending |`
     - Create or append to `memory/people/[alias-filename].md` (filename derived per spec):
       `| [task_title] | [YYYY-MM-DD] | [check_in_date] | Pending | — |`
   - If the write fails: "Could not record this follow-up ([reason]). Track it manually."

Do NOT write to local memory files if productivity:memory-management succeeded.

**Returns:** success | fallback-success | failed

---

### resolve-delegation

**Purpose:** Mark a pending delegation as resolved when the delegated task is complete.

**Inputs:**
- `alias` — delegate's display alias
- `task_title` — title of the delegated task
- `resolved_date` — YYYY-MM-DD date of resolution (today)

**Execution:**

1. Attempt to update via `productivity:memory-management`:
   - Find entry matching `alias` + `task_title`
   - Set status to: `Resolved — [resolved_date]`

2. If the skill is unavailable, fall back to local files:
   - Find the row matching `alias` + `task_title` in the `## Stakeholder Follow-ups` table of `memory/glossary.md`
   - Update its Status cell to: `Resolved — [resolved_date]`
   - Apply the same status update to the matching row in `memory/people/[alias-filename].md`
   - If no matching row found: log warning internally, continue (non-blocking).

Do NOT write to local memory files if productivity:memory-management succeeded.

**Returns:** success | fallback-success | not-found (non-blocking)

---

### update-checkin

**Purpose:** Extend a delegation's check-in date when a task is still in progress.

**Inputs:**
- `alias` — delegate's display alias
- `task_title` — title of the delegated task
- `new_check_in_date` — YYYY-MM-DD new check-in date

**Execution:**

1. Attempt to update via `productivity:memory-management`:
   - Find entry matching `alias` + `task_title`
   - Update `check-in` date to `new_check_in_date`

2. If the skill is unavailable, fall back to local files:
   - Find the row matching `alias` + `task_title` in the `## Stakeholder Follow-ups` table of `memory/glossary.md`
   - Update its Check-by cell to `new_check_in_date`
   - Apply the same check-in update to the matching row in `memory/people/[alias-filename].md`
   - If no matching row found: log warning internally, continue (non-blocking).

Do NOT write to local memory files if productivity:memory-management succeeded.

**Returns:** success | fallback-success | not-found (non-blocking)

---

### query-pending

**Purpose:** Retrieve pending delegation entries with check-in dates within a given range.

**Inputs:**
- `within_business_days` — number of business days from today to search (e.g., 5)

**Execution:**

1. Attempt to query via `productivity:memory-management`:
   - Filter for: status = pending AND check-in date within `within_business_days` business days
   - If results are returned, use them.

2. If the skill is unavailable, fall back to local files:
   - Read the `## Stakeholder Follow-ups` table in `memory/glossary.md`
   - Parse rows with Status = `Pending` (case-insensitive)
   - Filter for: Check-by date within `within_business_days` business days from today

3. Return a unified list regardless of which backend was used. The caller does not
   branch on which backend was active.

Do NOT write to local memory files if productivity:memory-management succeeded.

**Deduplication (caller's responsibility):**
Cross-reference results against TASKS.md Delegated records before displaying.
If the same alias + task_title appears in both, suppress the memory-only entry —
TASKS.md is the authoritative source for that record.

**Returns:** list of entries (see `references/memory-operations.md` for return shape).
Empty list if both backends fail (non-blocking).

---

## Failure Modes

| Scenario | Behavior |
|----------|----------|
| Skill unavailable, local files missing | Create `memory/people/` dir; write/read new files |
| Skill unavailable, local files unreadable | Empty result (non-blocking for query-pending) |
| Skill returns error | Fall through to local files |
| Both backends fail | Surface non-blocking warning; instruct manual tracking |
| Entry not found on resolve/update | Non-blocking; log warning internally |
