---
name: memory-manager
description: >
  Internal plugin skill. Use this skill when a plugin command directs you to
  perform a memory operation: log-delegation, resolve-delegation, update-checkin,
  or query-pending. Called by /schedule, /execute, /delegate, /review-week, /today, /status, and sync-prep.
  Do NOT invoke this skill based on user phrases — it is a plugin-internal service.
version: 2.0.0
---

# Memory Manager

Single interface for all delegation memory operations in the claude-eisenhower plugin.

The backend is local markdown files only — there is no external skill fallback or
primary store. See `docs/adrs/single-backend-memory.md` for the architectural decision
that retired the prior dual-backend abstraction.

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

1. Ensure `memory/people/` directory exists (create if absent).
2. Write using the canonical schema in `docs/specs/memory-schema-spec.md`:
   - Append a new row to the `## Stakeholder Follow-ups` table in `memory/glossary.md`:
     `| [alias] | [task_title] | [YYYY-MM-DD] | [check_in_date] | Pending |`
   - Create or append to `memory/people/[alias-filename].md` (filename derived per spec):
     `| [task_title] | [YYYY-MM-DD] | [check_in_date] | Pending | — |`
3. If the write fails: "Could not record this follow-up ([reason]). Track it manually."

**Returns:** success | failed

---

### resolve-delegation

**Purpose:** Mark a pending delegation as resolved when the delegated task is complete.

**Inputs:**
- `alias` — delegate's display alias
- `task_title` — title of the delegated task
- `resolved_date` — YYYY-MM-DD date of resolution (today)

**Execution:**

1. Find the row matching `alias` + `task_title` in the `## Stakeholder Follow-ups` table of `memory/glossary.md`
2. Update its Status cell to: `Resolved — [resolved_date]`
3. Apply the same status update to the matching row in `memory/people/[alias-filename].md`
4. If no matching row found: log warning internally, continue (non-blocking).

**Returns:** success | not-found (non-blocking)

---

### update-checkin

**Purpose:** Extend a delegation's check-in date when a task is still in progress.

**Inputs:**
- `alias` — delegate's display alias
- `task_title` — title of the delegated task
- `new_check_in_date` — YYYY-MM-DD new check-in date

**Execution:**

1. Find the row matching `alias` + `task_title` in the `## Stakeholder Follow-ups` table of `memory/glossary.md`
2. Update its Check-by cell to `new_check_in_date`
3. Apply the same check-in update to the matching row in `memory/people/[alias-filename].md`
4. If no matching row found: log warning internally, continue (non-blocking).

**Returns:** success | not-found (non-blocking)

---

### query-pending

**Purpose:** Retrieve pending delegation entries with check-in dates within a given range.

**Inputs:**
- `within_business_days` — number of business days from today to search (e.g., 5)

**Execution:**

1. Read the `## Stakeholder Follow-ups` table in `memory/glossary.md`.
   If the file is missing or unreadable, return `[]` (non-blocking).
2. Parse rows with Status = `Pending` (case-insensitive).
3. Filter for: Check-by date within `within_business_days` business days from today.

**Deduplication (caller's responsibility):**
Cross-reference results against TASKS.md Delegated records before displaying.
If the same alias + task_title appears in both, suppress the memory-only entry —
TASKS.md is the authoritative source for that record.

**Returns:** list of entries (see `references/memory-operations.md` for return shape).
Empty list if `memory/glossary.md` is missing or unreadable (non-blocking).

---

## Failure Modes

| Scenario | Behavior |
|----------|----------|
| `memory/people/` missing | Create the directory; write new files |
| `memory/glossary.md` missing on read | Return empty result (non-blocking for query-pending) |
| Write fails (permissions, disk) | Surface non-blocking warning; instruct manual tracking |
| Entry not found on resolve/update | Non-blocking; log warning internally |
