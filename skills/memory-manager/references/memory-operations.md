# Memory Operations Reference

Supporting detail for `skills/memory-manager/SKILL.md`.
Covers local file formats, return shapes, and field semantics.

---

## Local Files: Two-File Fallback System

Two-file fallback for all delegation memory when `productivity:memory-management`
is unavailable. Column definitions are canonical — see `integrations/specs/memory-schema-spec.md`.

### `memory/glossary.md` — Global Follow-up Table

Section: `## Stakeholder Follow-ups`
Columns: `Alias | Task | Delegated on | Check-by | Status`

One row per delegation entry:

```
| Alex R. | Review onboarding PR for new hire | 2026-02-19 | 2026-02-24 | Pending |
| Alex R. | Update monitoring dashboards | 2026-02-20 | 2026-02-19 | Resolved — 2026-02-20 |
| Jordan M. | Audit CI/CD pipeline | 2026-02-25 | 2026-03-01 | Pending |
```

### `memory/people/[alias-filename].md` — Per-Delegate Log

Filename derived from display alias per spec (e.g., "Alex R." → `alex-r.md`).
Section: `## Delegations`
Columns: `Task | Delegated on | Check-by | Status | Notes`

```
| Review onboarding PR for new hire | 2026-02-19 | 2026-02-24 | Pending | — |
```

### In-place Update Rules

For `resolve-delegation` and `update-checkin` operations on the local fallback:

1. Find the row in `memory/glossary.md` matching: Alias = `[alias]` AND Task = `[task_title]` AND Status = `Pending`
2. Update the Status cell (resolve) or Check-by cell (update-checkin) in that row
3. Apply the same update to the matching row in `memory/people/[alias-filename].md`
4. If no matching row found: log internally "No matching pending entry for [alias] / [task_title]" and continue (non-blocking)

Matching is case-insensitive on Alias and Task.

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
