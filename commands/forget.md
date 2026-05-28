---
description: Clean correction loop — clear memory entries for an alias, task, or all
argument-hint: <alias|task|all>
allowed-tools: Read, Write, Edit
---

You are running the FORGET command of the Engineering Task Flow.

This command is the user-facing correction surface for `memory/`. Issue #42:
without an explicit correction loop, when memory drifts from reality (skill
fallback failed, user re-categorized a task) the user has no clean way to
fix it. They are forced to hand-edit markdown files.

This command DELETES memory rows or files. Every form requires explicit user
confirmation before any write happens.

---

## Step 1: Parse argument

Forms supported:

- `/forget <alias>` — clear all entries for that delegate
- `/forget task <task title>` — clear a single delegation by task title
- `/forget all` — wipe all memory state (reset)

If no argument: render `Usage: /forget <alias|task <title>|all>` and stop.

---

## Step 2A: Forget alias

Resolve the alias case-insensitively against:

1. `memory/people/*.md` filenames (basename without `.md`)
2. Alias values in `memory/glossary.md` `## Stakeholder Follow-ups` rows

If no match: `No memory entries for "{arg}".` and stop.

On match, preview the impact:

```
This will delete:
  - memory/people/{alias-filename}.md ({N} delegations, {N} pending)
  - {N} row(s) in memory/glossary.md ## Stakeholder Follow-ups for this alias

This is irreversible. Type the alias name exactly to confirm, or press Enter
to cancel:
```

Wait for user response. If response does NOT match the alias name exactly
(case-sensitive), render `Cancelled.` and stop. If it matches, execute in
THIS exact order (glossary first, then unlink) so partial-state biases to
the discoverable failure mode:

1. Remove every row in `memory/glossary.md` `## Stakeholder Follow-ups`
   table where the alias column matches. If this write fails, surface
   the error verbatim and STOP — the per-person file still exists, so
   the next `/memory show {alias}` will surface the unchanged state for
   the user to retry.
2. Delete `memory/people/{alias-filename}.md`. If this delete fails
   after step 1 succeeded, surface the error AND render: `Partial state:
   glossary rows for "{alias}" were cleared, but
   memory/people/{alias-filename}.md remains. Re-run /forget {alias} or
   delete the file manually.` The orphan file is visible to
   `/memory show {alias}` (Step 2B detects the absence-of-glossary-row
   case), so the user can recover.
3. Render: `Cleared {N} memory entries for "{alias}". TASKS.md was not
   touched — Delegated tasks still appear on the task board.`

---

## Step 2B: Forget task

Argument shape: `/forget task <task title>`.

Find rows in `memory/glossary.md` `## Stakeholder Follow-ups` matching the
task title (case-insensitive substring match). If 0 matches: `No memory
entries match "{title}".` If >1 matches: render the candidates with their
alias + check-by date and ask the user to pick the row number; cancel if
they don't pick.

Preview the single row to delete and ask:

```
This will delete this row:
  | {alias} | {task title} | {date} | {check-by} | {status} |

Also from memory/people/{alias-filename}.md.

Type the task title exactly to confirm, or press Enter to cancel:
```

The confirmation token is the verbatim task title (case-sensitive) — NOT
`yes`. A bare "yes" is the most likely conversational affirmative to
appear by accident in a multi-turn loop or after an unrelated clarifying
question, so it would create a destructive misfire path. Echoing the
title forces an intentional action.

If the response does NOT match the task title exactly, render `Cancelled.`
and stop. If it matches, execute in this order (glossary first):

1. Remove the row from `memory/glossary.md`. On failure: surface error,
   stop.
2. Remove the matching row from `memory/people/{alias-filename}.md`. On
   failure after step 1: surface error AND render: `Partial state: the
   glossary row was cleared, but the matching row in
   memory/people/{alias-filename}.md remains. Re-run /forget task
   "{title}" or remove the row manually.`
3. Render: `Cleared the memory entry for "{task title}". TASKS.md was not
   touched.`

---

## Step 2C: Forget all

The wipe-everything case. Preview the impact:

```
This will delete:
  - memory/glossary.md
  - All files under memory/people/
  - memory/today-log.md, plan-log.md, review-log.md (analytics)

TASKS.md will NOT be touched.

This is irreversible. Type 'forget all' exactly to confirm, or press Enter
to cancel:
```

If response is not literally `forget all`, cancel. Otherwise, execute in
this order. Each step is independent — on any failure, surface the error
verbatim and continue to the remaining steps (best-effort wipe; partial
state is recoverable because the user can re-run `/forget all`):

1. Delete `memory/glossary.md`.
2. Delete every file under `memory/people/`.
3. Delete `memory/today-log.md`, `memory/plan-log.md`, `memory/review-log.md`
   (skip silently if any is already absent).
4. Render: `Memory cleared. TASKS.md was not touched.` If any step
   reported an error, append the list of paths that could not be
   deleted so the user can clean up manually.

Note: historical resolved delegation entries are lost permanently —
glossary and per-person files can be partially reconstructed from
TASKS.md `## Delegated` (current state) but historical resolved entries
exist nowhere else.

---

## Step 3: Done

The command is complete. The user may want to run `/memory show` to verify
the new state.

---

## Rules

- TASKS.md is never modified by /forget. The task board is the authoritative
  surface for in-flight work; memory is the supplementary trace. Forgetting
  a memory row does NOT delete the corresponding Delegated task — that
  belongs to `/execute`.
- Every form requires an explicit confirmation token. No single-press
  destructive paths.
- The confirmation token is the alias name (Step 2A), the literal string
  `yes` (Step 2B), or the literal string `forget all` (Step 2C). Anything
  else cancels.
- Writes are silent on success — render the "cleared" line, nothing more.
- On any file-system error (permission denied, file in use), surface the
  error verbatim and abort the operation. Do NOT leave partial state.
