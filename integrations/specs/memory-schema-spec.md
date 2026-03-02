# Spec: Memory Schema
**Version**: v1.0.0 (planned)
**Status**: Draft
**Author**: Cantu
**Date**: 2026-03-02

---

## Problem Statement

The plugin writes structured data to two local memory files: `memory/glossary.md`
(a global Stakeholder Follow-ups table) and `memory/people/{alias-filename}.md`
(per-delegate delegation logs). The format of both files is described inline in
`commands/execute.md` and `commands/schedule.md` — not in a single canonical source.

As commands evolve, the inline descriptions can drift from each other or from the
actual files on disk. A developer editing `execute.md` has no way to know whether
their change is consistent with the format `schedule.md` produces. There is also no
spec to validate against, no definition of what a well-formed memory file looks like,
and no guidance on how to derive a people file path from an alias.

This spec is the single source of truth for both memory file schemas. Commands that
read or write memory files must reference this spec, not describe the format inline.

---

## Goals

1. Define the canonical structure of `memory/glossary.md`
2. Define the canonical structure of `memory/people/{alias-filename}.md`
3. Specify who writes to each file and when
4. Define how alias filenames are derived from display aliases
5. Ensure the format is readable without tooling — plain Markdown, no YAML required

---

## File: `memory/glossary.md`

### Purpose

A global follow-up table tracking all active and resolved delegations. The single
place to see all open delegate commitments at a glance.

### Structure

```markdown
# Stakeholder Memory

## Stakeholder Follow-ups

| Alias | Task | Delegated on | Check-by | Status |
|-------|------|-------------|----------|--------|
| Jordan V. | Review API contract | 2026-03-02 | 2026-03-05 | Pending |
| Alex E. | Fix CI flakiness | 2026-02-28 | 2026-03-04 | Resolved — 2026-03-03 |
```

### Column definitions

| Column | Type | Notes |
|--------|------|-------|
| `Alias` | string | Display alias from stakeholder graph |
| `Task` | string | Task title as written in TASKS.md |
| `Delegated on` | date (YYYY-MM-DD) | Date the delegation was logged |
| `Check-by` | date (YYYY-MM-DD) | The date to follow up |
| `Status` | string | `Pending` or `Resolved — {YYYY-MM-DD}` |

### Write rules

- **`/schedule` writes** a new `Pending` row when a Q3 task is confirmed and
  `Synced:` is not already present on the task record (dedup guard).
- **`/delegate` writes** a new `Pending` row when a direct delegation is confirmed.
- **`/execute` updates** the row to `Resolved — {date}` when a delegated task is
  marked done. It does NOT delete the row — history is preserved.
- **`/execute` updates** the `Check-by` date when a delegation is extended after a
  missed check-in (the "still in progress" flow).

---

## File: `memory/people/{alias-filename}.md`

### Purpose

A per-delegate log of all delegations, progress notes, and resolutions. Provides
full history for a single stakeholder without scanning the global table.

### Filename derivation

The filename is derived from the display alias (first item in the stakeholder's
`alias` array):

1. Take the display alias (e.g., `"Jordan V."`)
2. Lowercase it: `"jordan v."`
3. Replace spaces with hyphens: `"jordan-v."`
4. Remove periods: `"jordan-v"`
5. Append `.md`: `"jordan-v.md"`

Examples:
| Display alias | Filename |
|---------------|----------|
| `Jordan V.` | `jordan-v.md` |
| `Alex E.` | `alex-e.md` |
| `Morgan P.` | `morgan-p.md` |
| `Vendor A` | `vendor-a.md` |

### Structure

```markdown
# {Display Alias} — Delegation Log

**Role**: {role from stakeholders.yaml}
**Relationship**: {direct_report | peer | vendor | partner}

## Delegations

| Task | Delegated on | Check-by | Status | Notes |
|------|-------------|----------|--------|-------|
| Review API contract | 2026-03-02 | 2026-03-05 | Pending | — |
| Fix CI flakiness | 2026-02-28 | 2026-03-04 | Resolved — 2026-03-03 | Merged PR #1042 |
```

### Column definitions

| Column | Type | Notes |
|--------|------|-------|
| `Task` | string | Task title as written in TASKS.md |
| `Delegated on` | date (YYYY-MM-DD) | Date the delegation was logged |
| `Check-by` | date (YYYY-MM-DD) | The date to follow up |
| `Status` | string | `Pending` or `Resolved — {YYYY-MM-DD}` |
| `Notes` | string | Progress notes, context, or `—` if none |

### Write rules

- **`/schedule` creates** the file if it does not exist (using the header + empty
  Delegations table) and appends a new `Pending` row.
- **`/delegate` creates or appends** identically to `/schedule`.
- **`/execute` appends** a progress note to the `Notes` column for the matching row
  on a "still in progress" log.
- **`/execute` updates** `Status` to `Resolved — {date}` when the task is marked done.
- The file is **never deleted** — it accumulates the full history of work delegated
  to this person.

---

## Gherkin Scenarios

### MEMORY-001: glossary.md contains required columns

```gherkin
Given memory/glossary.md exists
Then it contains a "## Stakeholder Follow-ups" section
And that section contains a table with columns: Alias, Task, Delegated on, Check-by, Status
And all date values are in YYYY-MM-DD format
```

### MEMORY-002: New delegation writes a Pending row to glossary.md

```gherkin
Given /schedule or /delegate confirms a new delegation to "Jordan V."
And the task does not already have a Synced: field (dedup guard)
When the memory step executes
Then a new row is appended to the Stakeholder Follow-ups table in glossary.md
And the Status column is "Pending"
And the Check-by column contains the confirmed check-in date
```

### MEMORY-003: Completing a delegated task resolves the glossary row

```gherkin
Given a delegation to "Jordan V." for task "Review API contract" has Status: Pending
When the user runs /execute and marks the task done
Then the matching row in glossary.md is updated
And the Status column is "Resolved — {today's date}"
And the row is not deleted
```

### MEMORY-004: People file is named from alias using kebab-case rule

```gherkin
Given a stakeholder with display alias "Jordan V."
When a delegation file is created for them
Then the file is at memory/people/jordan-v.md
And the filename is derived by: lowercasing, replacing spaces with hyphens, removing periods
```

### MEMORY-005: People file header contains role and relationship

```gherkin
Given memory/people/jordan-v.md is created for the first time
Then the file begins with: # Jordan V. — Delegation Log
And it contains Role: and Relationship: fields from stakeholders.yaml
And it contains a ## Delegations section with the required table columns
```

### MEMORY-006: Missed check-in updates Check-by date in both files

```gherkin
Given a delegation to "Jordan V." is open and overdue
When the user logs "still in progress" via /execute
Then the Check-by date in the glossary.md row is updated to {today + 2 business days}
And the Check-by date in the people file row is updated to match
And a note is appended to the Notes column in the people file
And a follow-up intake record is created in TASKS.md ## Inbox
```

---

## Decisions Log

1. **Two-file structure (global + per-person)** — The global `glossary.md` table
   gives a fast overview of all open commitments. The per-person file gives full
   history for stakeholder conversations. Both are necessary; neither replaces the
   other.

2. **Rows are never deleted, only resolved** — Deleting a row loses history. Status
   `Resolved — {date}` is the terminal state. This enables auditing when a stakeholder
   asks "what have we worked on together."

3. **Dedup guard is the `Synced:` field on the TASKS.md record** — `/schedule` checks
   for `Synced:` before writing a memory row. This prevents duplicate rows when
   `/schedule` is run twice on the same task. The memory files are not the dedup
   source of truth — TASKS.md is.

4. **Filename derivation is deterministic** — The alias-to-filename rule (lowercase,
   hyphens, no periods) is defined once here. All commands that create or open a
   people file must use this rule. No ambiguity about whether `"Jordan V."` maps to
   `jordan-v.md` or `jordan_v.md` or `jordanv.md`.

5. **Memory files are gitignored** — They contain operational data about real people
   and live delegations. They are personal context for the user, not project artifacts.
   Already covered by `memory/` entry in `.gitignore`.
