# Adapter: Markdown File (v1)

**System**: Plain markdown file on the local filesystem
**Access method**: Node fs (read / write)
**Auth required**: None
**Direction**: Eisenhower → Markdown file (append on push; flip checkbox on complete)
**Status**: Active
**Platform**: Cross-platform (no macOS-specific dependencies)

---

## Why this adapter exists

The Mac Reminders adapter only works on macOS. The markdown-file adapter is
the second concrete implementation of the task-output contract. It exists
to (1) prove the swap mechanic and (2) give cross-platform users a no-deps
output target without standing up Jira / Asana / Linear.

---

## How It Works

**Push (append)** — Called by `/schedule` (and `/delegate`). Appends a
GitHub-flavored checkbox line to the target markdown file:

```
- [ ] {title} [{quadrant}] (due: {due_date or "no due date"})
```

Before appending, the adapter scans existing checkbox lines and skips when
a line with the same title (case-insensitive, whitespace-trimmed) already
exists. Returns `skipped: Already exists`.

**Complete** — Called by `/complete-task`. Finds the line containing the title
and flips `- [ ]` → `- [x]`. Idempotent: re-completing an already-checked
line returns `success: Already completed`. Title not found → `skipped:
Not found`. Missing file → `skipped: File not found`.

---

## Configuration (in `task-output-config.md`)

```
### markdown-file
file: ./external-todo.md
```

`file` — path to the markdown file the adapter writes to. Resolved relative
to the directory containing `task-output-config.md` when not absolute.
Defaults to `./external-todo.md` in the current working directory when the
config block is absent.

The file (and any missing parent directories) is created on first push.

---

## Field Mapping

| `task_output_record` field | Rendered as | Notes |
|---------------------------|-------------|-------|
| `title`                   | Line body   | Used as-is; Q3 already prefixed by /schedule |
| `description`             | (ignored)   | Not rendered — keep the line scannable. Description stays in TASKS.md |
| `due_date`                | `(due: ...)` | `null` renders as `(due: no due date)` |
| `quadrant`                | `[Q1\|Q2\|Q3]` | Tag rendered after title in brackets |
| `priority`                | (ignored)   | Implicit from quadrant; markdown has no priority field |
| `source`                  | (ignored)   | Belongs in TASKS.md, not the external view |
| `requester`               | (ignored)   | Same |
| `list_name`               | (ignored)   | This adapter does not partition output by list |

Fields the adapter ignores are **silently dropped**, not errored — per the
adapter contract, "if a field doesn't apply, the adapter ignores not
throws."

---

## Deduplication Logic

Before appending:

1. Read every line of the file.
2. For every line matching the GFM checkbox pattern (`- [ ]` or `- [x]`),
   extract the title (everything between the marker and the first ` [`).
3. Compare the incoming `title` against extracted titles (case-insensitive,
   trimmed).
4. Match found → return `{ status: skipped, reason: "Already exists", id: "" }`
5. No match → append and return `{ status: success, reason: "Created", id: "{file}:{title}" }`

---

## Push Result Mapping

| Outcome | `status` | `reason` | `id` |
|---------|----------|----------|------|
| Line appended | `success` | `"Created"` | `"{file}:{title}"` |
| Title already present | `skipped` | `"Already exists"` | `""` |

The adapter does not currently surface filesystem errors as `error` results
— a failed write throws. The dispatcher's command-level error handling
catches and renders the error.

## Complete Result Mapping

| Outcome | `status` | `reason` |
|---------|----------|----------|
| Open checkbox flipped to `[x]` | `success` | `"Completed"` |
| Already-checked line found | `success` | `"Already completed"` |
| File missing | `skipped` | `"File not found"` |
| Title not found in file | `skipped` | `"Not found"` |

---

## Swapping This Adapter

To replace the markdown-file adapter with a different system:

1. Create `adapters/[system].md` following this file's structure.
2. Add `scripts/adapters/[system].ts` implementing the `TaskOutputAdapter`
   interface from `scripts/adapter-types.ts`.
3. Register it in `scripts/task-output.ts` `bootstrapBuiltInAdapters`.
4. In `config/task-output-config.md`, change `## Active Adapter` to the new
   name.
5. No changes to `commands/schedule.md`, `commands/complete-task.md`, or
   `commands/delegate.md` required — they call the dispatcher, not adapters
   directly.
