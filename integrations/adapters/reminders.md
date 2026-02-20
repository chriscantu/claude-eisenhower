# Adapter: Mac Reminders (v1)

**System**: Apple Reminders (macOS)
**Access method**: AppleScript via osascript
**Auth required**: None — local app, no network
**Direction**: Write-only (Eisenhower → Reminders)
**Status**: Active

---

## How It Works

When `/schedule` confirms tasks, this adapter creates a new reminder in the
configured list for each Q1, Q2, and Q3 task. It checks for an existing reminder
with the same title (case-insensitive) before writing to prevent duplicates.

Calls `scripts/push_reminder.applescript` to perform the actual write. The
adapter handles field mapping, priority translation, and result interpretation.

---

## Configuration (from `task-output-config.md`)

```
### reminders
list_name: Eisenhower List
```

`list_name` — the target Reminders list. Created automatically if it does not exist.

---

## Field Mapping

| `task_output_record` field | Reminders field | Notes |
|---------------------------|-----------------|-------|
| `title`                   | `name`          | Used as-is. For Q3, already prefixed "Check in: [delegate] re: [task]" by /schedule |
| `description`             | `body`          | Full description including source and requester if known |
| `due_date`                | `due date`      | Date only — no specific alarm time set |
| `priority: high`          | `priority: 1`   | Reminders High priority |
| `priority: medium`        | `priority: 5`   | Reminders Medium priority |

---

## Priority Mapping

| Quadrant | `priority` field | Reminders value |
|----------|-----------------|-----------------|
| Q1       | high            | 1 (High)        |
| Q2       | medium          | 5 (Medium)      |
| Q3       | medium          | 5 (Medium)      |

---

## Deduplication Logic

Before creating a reminder:

1. Check if the target list exists. If not, create it.
2. Fetch `name` of every reminder in that list.
3. Compare the incoming `title` against existing names (case-insensitive, whitespace-trimmed).
4. If a match is found → return `push_result: { status: skipped, reason: "Already exists", id: "" }`
5. If no match → proceed to create.

---

## AppleScript Execution

The adapter calls `scripts/push_reminder.applescript` via osascript, passing
arguments for title, body, due_date, priority, and list_name.

```applescript
do shell script "osascript ~/repos/claude-eisenhower/scripts/push_reminder.applescript " & ¬
    quoted form of title & " " & ¬
    quoted form of description & " " & ¬
    quoted form of due_date & " " & ¬
    quoted form of (priority as string) & " " & ¬
    quoted form of list_name
```

---

## Push Result Mapping

| Outcome | `status` | `reason` | `id` |
|---------|----------|----------|------|
| Reminder created successfully | `success` | `"Created"` | AppleScript-returned reminder name |
| Title already exists in list | `skipped` | `"Already exists"` | `""` |
| List not found and creation failed | `error` | `"List not found"` | `""` |
| Reminders app not responding | `error` | `"App unavailable"` | `""` |
| Any other osascript error | `error` | Error message from osascript stderr | `""` |

---

## Error Handling Notes

- Errors are **non-blocking** — `/schedule` collects all errors and surfaces them
  together at the end of the push summary, after TASKS.md is already saved.
- A failed push logs `Synced: failed — [reason]` in the TASKS.md task record.
- A skipped push logs `Synced: skipped (already exists)`.
- A successful push logs `Synced: Reminders (Eisenhower List) — [date]`.

---

## Swapping This Adapter

To replace Mac Reminders with a different system:

1. Create `integrations/adapters/[system].md` following this file's structure
2. In `integrations/config/task-output-config.md`, change `Active Adapter` to the new name
3. Fill in the new adapter's settings block
4. No changes to `commands/schedule.md` or any skill files required
