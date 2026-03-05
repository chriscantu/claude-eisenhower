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

2. If the skill is unavailable, fall back to local file:
   - Notify the caller: "Note: memory-management skill not found. Logging locally."
   - Ensure `memory/` directory exists (create if absent).
   - Append to `memory/stakeholders-log.md`:
     `[YYYY-MM-DD] [alias] | [task_title] | check-in: [check_in_date] | status: pending`
   - If the write fails: "Could not record this follow-up ([reason]). Track it manually."

Do NOT write to memory/stakeholders-log.md if productivity:memory-management succeeded.

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

2. If the skill is unavailable, fall back to local file:
   - Find the matching line in `memory/stakeholders-log.md`:
     `[*] [alias] | [task_title] | check-in: [*] | status: pending`
   - Update that line's status field to: `status: resolved`
   - If no matching line found: log warning internally, continue (non-blocking).

Do NOT write to memory/stakeholders-log.md if productivity:memory-management succeeded.

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

2. If the skill is unavailable, fall back to local file:
   - Find the matching line in `memory/stakeholders-log.md`
   - Update that line's `check-in:` field to `new_check_in_date`
   - If no matching line found: log warning internally, continue (non-blocking).

Do NOT write to memory/stakeholders-log.md if productivity:memory-management succeeded.

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

2. If the skill is unavailable, fall back to local file:
   - Read `memory/stakeholders-log.md`
   - Parse lines matching format: `[YYYY-MM-DD] [alias] | [task title] | check-in: [YYYY-MM-DD] | status: pending`
   - Filter for: status = pending AND check-in date within `within_business_days` business days

3. Return a unified list regardless of which backend was used. The caller does not
   branch on which backend was active.

Do NOT write to memory/stakeholders-log.md if productivity:memory-management succeeded.

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
| Skill unavailable, local file missing | Create `memory/` dir; write/read new file |
| Skill unavailable, local file unreadable | Empty result (non-blocking for query-pending) |
| Skill returns error | Fall through to local file |
| Both backends fail | Surface non-blocking warning; instruct manual tracking |
| Entry not found on resolve/update | Non-blocking; log warning internally |
