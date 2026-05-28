# AppleScript Manual Test Protocol

Covers `complete_reminder.applescript` and `push_reminder.applescript`.
Run each test case from a terminal using `osascript`. All paths use the
canonical repo location at `~/repos/claude-eisenhower/scripts/`.

Both scripts emit single-line JSON on stdout. The `id` field carries the
macOS Reminders x-coredata URI for the affected reminder.

---

## `complete_reminder.applescript`

Script arguments (positional):
1. `title` — reminder name to find (case-insensitive)
2. `list_name` — target Reminders list name

Return values (single-line JSON on stdout):
- `{"status":"success","title":"...","id":"x-coredata://..."}` — found and marked complete
- `{"status":"success","title":"...","id":"x-coredata://...","note":"already_completed"}` — was already complete (idempotent)
- `{"status":"skipped","title":"...","reason":"not_found"}` — not found anywhere in the list
- `{"status":"error","title":"...","reason":"list_not_found: [list]"}` — list does not exist

---

### TC-CR-01: ASCII title — existing active reminder

**Setup**: In the Mac Reminders app, ensure a reminder named exactly
`"Fix deploy pipeline issue"` exists and is **not** yet completed in the list
`"Eisenhower List"`.

**Command**:
```
osascript ~/repos/claude-eisenhower/scripts/complete_reminder.applescript \
  "Fix deploy pipeline issue" \
  "Eisenhower List"
```

**Expected stdout** (JSON; `id` value will vary):
```
{"status":"success","title":"Fix deploy pipeline issue","id":"x-coredata://..."}
```

**Teardown**: In Reminders, uncheck or delete the reminder if you want to
reuse it in a future test run.

---

### TC-CR-02: ASCII title — already completed reminder

**Setup**: In the Mac Reminders app, ensure a reminder named
`"Fix deploy pipeline issue"` exists in `"Eisenhower List"` and is already
marked **completed** (the checkbox is checked).

**Command**:
```
osascript ~/repos/claude-eisenhower/scripts/complete_reminder.applescript \
  "Fix deploy pipeline issue" \
  "Eisenhower List"
```

**Expected stdout**:
```
{"status":"success","title":"Fix deploy pipeline issue","id":"x-coredata://...","note":"already_completed"}
```

**Teardown**: None required. The reminder stays in Reminders history.

---

### TC-CR-03: ASCII title — reminder not found

**Setup**: Confirm that no reminder named `"Nonexistent task title"` exists
(active or completed) in `"Eisenhower List"`. The list itself must exist.

**Command**:
```
osascript ~/repos/claude-eisenhower/scripts/complete_reminder.applescript \
  "Nonexistent task title" \
  "Eisenhower List"
```

**Expected stdout**:
```
{"status":"skipped","title":"Nonexistent task title","reason":"not_found"}
```

**Teardown**: None required.

---

### TC-CR-04: Non-ASCII title — existing active reminder

**Setup**: In the Mac Reminders app, create an active (uncompleted) reminder
named exactly `"Check in: André re: API review"` in `"Eisenhower List"`.

**Command**:
```
osascript ~/repos/claude-eisenhower/scripts/complete_reminder.applescript \
  "Check in: André re: API review" \
  "Eisenhower List"
```

**Expected stdout**:
```
{"status":"success","title":"Check in: André re: API review","id":"x-coredata://..."}
```

**Teardown**: In Reminders, delete or uncheck the reminder if reuse is needed.

---

### TC-CR-05: Wrong list name — list does not exist

**Setup**: Confirm that no Reminders list named `"Does Not Exist List"` exists
on this machine.

**Command**:
```
osascript ~/repos/claude-eisenhower/scripts/complete_reminder.applescript \
  "Any task title" \
  "Does Not Exist List"
```

**Expected stdout**:
```
{"status":"error","title":"Any task title","reason":"list_not_found: Does Not Exist List"}
```

**Teardown**: None required.

---

## `push_reminder.applescript`

Script arguments (positional):
1. `title` — reminder name
2. `description` — reminder body / notes
3. `due_date` — ISO date string `"YYYY-MM-DD"` or `"none"`
4. `priority` — integer: `1` (High), `5` (Medium), `9` (Low)
5. `list_name` — target Reminders list name

Return values (single-line JSON on stdout):
- `{"status":"success","title":"...","id":"x-coredata://..."}` — reminder created
- `{"status":"skipped","title":"...","reason":"already_exists","id":"x-coredata://..."}` — duplicate
- `{"status":"error","title":"...","reason":"..."}` — something went wrong

---

### TC-PR-01: New reminder — created successfully

**Setup**: Confirm that no reminder named `"Review Q1 budget proposal"` exists
in `"Eisenhower List"` (active or completed).

**Command**:
```
osascript ~/repos/claude-eisenhower/scripts/push_reminder.applescript \
  "Review Q1 budget proposal" \
  "Quarterly budget review requested by finance team" \
  "2026-03-15" \
  "1" \
  "Eisenhower List"
```

**Expected stdout**:
```
{"status":"success","title":"Review Q1 budget proposal","id":"x-coredata://..."}
```

**Teardown**: In Reminders, delete `"Review Q1 budget proposal"` from
`"Eisenhower List"` after the test.

---

### TC-PR-02: Duplicate title — reminder already exists (dedup)

**Setup**: Ensure a reminder named `"Review Q1 budget proposal"` already exists
in `"Eisenhower List"` (it may be active or completed — the dedup check covers
all reminders in the list). Run TC-PR-01 first if needed to create it.

**Command**:
```
osascript ~/repos/claude-eisenhower/scripts/push_reminder.applescript \
  "Review Q1 budget proposal" \
  "Duplicate attempt — should be skipped" \
  "none" \
  "5" \
  "Eisenhower List"
```

**Expected stdout**:
```
{"status":"skipped","title":"Review Q1 budget proposal","reason":"already_exists","id":"x-coredata://..."}
```

**Teardown**: Delete `"Review Q1 budget proposal"` from `"Eisenhower List"` in
Reminders after the test.

---

### TC-PR-03: Non-existent list — auto-create behavior

**Setup**: Confirm that no Reminders list named `"Eisenhower Test Scratch"`
exists on this machine.

**Command**:
```
osascript ~/repos/claude-eisenhower/scripts/push_reminder.applescript \
  "Auto-create list test task" \
  "This reminder tests that a missing list is created automatically" \
  "none" \
  "9" \
  "Eisenhower Test Scratch"
```

**Expected stdout**:
```
{"status":"success","title":"Auto-create list test task","id":"x-coredata://..."}
```

**Verification**: Open the Mac Reminders app and confirm that a new list named
`"Eisenhower Test Scratch"` was created and contains the reminder
`"Auto-create list test task"`.

**Teardown**: In Reminders, delete the entire `"Eisenhower Test Scratch"` list
(right-click → Delete List) to keep your Reminders app clean.

---

## Notes

- All tests must be run from a macOS terminal with access to the Mac Reminders
  app. The app does not need to be open — `osascript` will launch it.
- Stdout is single-line JSON. `id` values are macOS Reminders x-coredata URIs
  and will differ between machines and reminder instances.
- The adapter (`scripts/adapters/reminders.ts`) runs `osascript` with a 10s
  timeout. On timeout the adapter returns `status: "error"` with reason
  `"osascript timed out after 10000ms"` — handy when Reminders.app hangs.
- The `complete_reminder.applescript` match is case-insensitive and
  whitespace-trimmed but the return value uses the original title string passed
  as argument 1, not the stored reminder name.
- The `push_reminder.applescript` dedup check is case-insensitive for ASCII
  characters only. Non-ASCII characters (e.g., accented letters) are not
  lowercased by that script's `lower()` helper — they are passed through as-is.
- Priority integers map as follows: `1` = High, `5` = Medium, `9` = Low.
- Passing `"none"` for `due_date` creates a reminder with no due date.
