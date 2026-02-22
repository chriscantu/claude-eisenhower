# Adapter: Mac Reminders (v1)

**System**: Apple Reminders (macOS)
**Access method**: AppleScript via osascript
**Auth required**: None — local app, no network
**Direction**: Eisenhower → Reminders (push on schedule; complete on execute)
**Status**: Active

---

## How It Works

This adapter supports two operations:

**Push (create)** — Called by `/schedule` when a task is confirmed. Creates a new
reminder in the configured list for each Q1, Q2, and Q3 task. Checks for an
existing reminder with the same title (case-insensitive) before writing to prevent
duplicates. Calls `scripts/push_reminder.applescript`.

**Complete** — Called by `/execute` when a task is marked done. Finds the reminder
by title (case-insensitive) and sets `completed = true`. The reminder stays in
Reminders history — it is not deleted. Calls `scripts/complete_reminder.applescript`.

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

**Push (create)** — called by `/schedule`:

```applescript
do shell script "osascript ~/repos/claude-eisenhower/scripts/push_reminder.applescript " & ¬
    quoted form of title & " " & ¬
    quoted form of description & " " & ¬
    quoted form of due_date & " " & ¬
    quoted form of (priority as string) & " " & ¬
    quoted form of list_name
```

**Complete** — called by `/execute` when marking a task done:

```applescript
do shell script "osascript ~/repos/claude-eisenhower/scripts/complete_reminder.applescript " & ¬
    quoted form of title & " " & ¬
    quoted form of list_name
```

Note: For Q3 tasks, the title used for lookup must be the prefixed form:
`"Check in: [delegate] re: [original title]"` — matching exactly what was pushed.

---

## Push Result Mapping

| Outcome | `status` | `reason` | `id` |
|---------|----------|----------|------|
| Reminder created successfully | `success` | `"Created"` | AppleScript-returned reminder name |
| Title already exists in list | `skipped` | `"Already exists"` | `""` |
| List not found and creation failed | `error` | `"List not found"` | `""` |
| Reminders app not responding | `error` | `"App unavailable"` | `""` |
| Any other osascript error | `error` | Error message from osascript stderr | `""` |

## Complete Result Mapping

| Outcome | AppleScript return | TASKS.md entry |
|---------|--------------------|----------------|
| Reminder found and marked complete | `success: [title]` | `Synced: Reminders completed — [date]` |
| Reminder was already complete | `success: [title] (already completed)` | `Synced: Reminders already complete — [date]` |
| Reminder not found in list | `skipped: [title] — not found in '[list]'` | `Synced: skipped — not found in Reminders` |
| List not found | `error: List '[name]' not found` | `Synced: failed — [error message]` + ⚠ warning |
| Any other osascript error | `error: [message]` | `Synced: failed — [error message]` + ⚠ warning |

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
