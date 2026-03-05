# Memory Operations Reference

Supporting detail for `skills/memory-manager/SKILL.md`.
Covers local file formats, return shapes, and field semantics.

---

## Local File: `memory/stakeholders-log.md`

Single-file fallback for all delegation memory when `productivity:memory-management`
is unavailable. One line per delegation event.

### Line Format

```
[YYYY-MM-DD] [alias] | [task title] | check-in: [YYYY-MM-DD] | status: pending|resolved
```

### Examples

```
[2026-02-19] Alex R. | Review onboarding PR for new hire | check-in: 2026-02-24 | status: pending
[2026-02-20] Alex R. | Update monitoring dashboards | check-in: 2026-02-19 | status: resolved
[2026-02-25] Jordan M. | Audit CI/CD pipeline | check-in: 2026-03-01 | status: pending
```

### Field Semantics

| Field | Description |
|-------|-------------|
| `[YYYY-MM-DD]` (first) | Date the delegation was logged |
| `[alias]` | Delegate's display alias — must match stakeholders.yaml |
| `[task title]` | Exact task title from TASKS.md |
| `check-in: [YYYY-MM-DD]` | Date the caller intends to follow up |
| `status: pending\|resolved` | Current state of the delegation |

### In-place Update Rules

For `resolve-delegation` and `update-checkin` operations on the local fallback:

1. Read all lines from `memory/stakeholders-log.md`
2. Find the first line matching: alias = `[alias]` AND task title = `[task_title]` AND status = `pending`
3. Replace that line with the updated version (status changed or check-in date changed)
4. Write all lines back to the file
5. If no matching line is found: log internally "No matching pending entry found for [alias] / [task_title]" and continue (non-blocking)

Matching is case-insensitive on alias and task title.

---

## Return Shape: `query-pending`

Unified object returned for each entry regardless of which backend was used:

```
{
  alias:          string   // e.g., "Alex R."
  task:           string   // e.g., "Review onboarding PR"
  check_in_date:  string   // YYYY-MM-DD
  status:         "pending" | "resolved"
  logged_date:    string   // YYYY-MM-DD — date entry was created
}
```

Returns an empty list `[]` if both backends are unavailable or produce no results.

---

## Deduplication for `query-pending`

The caller (`/review-week`) is responsible for deduplication before display.

Rule: If the same `alias` + `task` pair appears in both the memory result list AND
TASKS.md Delegated records, suppress the memory-only entry. TASKS.md is authoritative.

The memory-manager returns all matching entries; the caller filters.

---

## Analytics Log: `memory/review-log.md`

**Not managed by this skill.** Written directly by `/review-week` Step 6.

Format (one line per run, no PII):
```
[YYYY-MM-DD] day:{full-day-name} inbox:{N} active:{N} delegated:{N} overdue:{N} calendar:{grade}
```

This file is write-only from the plugin's perspective — no operation in this skill
reads or writes `review-log.md`.
