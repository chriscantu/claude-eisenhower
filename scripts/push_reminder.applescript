-- push_reminder.applescript
-- Creates a single reminder in a named Mac Reminders list.
-- Called by the claude-eisenhower task output adapter (reminders.md).
--
-- Arguments (positional, space-separated, each quoted):
--   1. title       — reminder name
--   2. description — reminder body / notes
--   3. due_date    — ISO date string "YYYY-MM-DD" or "none"
--   4. priority    — integer: 1 (High), 5 (Medium), 9 (Low)
--   5. list_name   — target Reminders list name
--
-- Returns (stdout, single-line JSON):
--   {"status":"success","title":"...","id":"x-coredata://..."}
--   {"status":"skipped","title":"...","reason":"already_exists","id":"x-coredata://..."}
--   {"status":"error","title":"...","reason":"..."}
--
-- Usage:
--   osascript push_reminder.applescript "Title" "Description" "2026-02-25" "5" "Eisenhower List"

on run argv
    set taskTitle to item 1 of argv
    set taskDescription to item 2 of argv
    set dueDateStr to item 3 of argv
    set priorityVal to (item 4 of argv) as integer
    set listName to item 5 of argv

    tell application "Reminders"

        -- Step 1: Ensure target list exists; create if missing
        set targetList to missing value
        repeat with l in lists
            if name of l is listName then
                set targetList to l
                exit repeat
            end if
        end repeat

        if targetList is missing value then
            try
                set targetList to make new list with properties {name: listName}
            on error errMsg
                return my jsonError(taskTitle, "list_create_failed: " & errMsg)
            end try
        end if

        -- Step 2: Deduplication check (case-insensitive, trimmed)
        set existingReminders to every reminder of targetList
        repeat with r in existingReminders
            if (my lowerTrim(name of r)) is (my lowerTrim(taskTitle)) then
                return my jsonSkipped(taskTitle, "already_exists", id of r as string)
            end if
        end repeat

        -- Step 3: Create the reminder
        try
            set newReminder to make new reminder at end of targetList
            set name of newReminder to taskTitle
            set body of newReminder to taskDescription
            set priority of newReminder to priorityVal

            -- Set due date if provided (not "none")
            if dueDateStr is not "none" then
                set yr to (text 1 thru 4 of dueDateStr) as integer
                set mo to (text 6 thru 7 of dueDateStr) as integer
                set dy to (text 9 thru 10 of dueDateStr) as integer

                set dueDate to current date
                set year of dueDate to yr
                set month of dueDate to mo
                set day of dueDate to dy
                set hours of dueDate to 0
                set minutes of dueDate to 0
                set seconds of dueDate to 0

                set due date of newReminder to dueDate
            end if

            set newId to id of newReminder as string
            return my jsonSuccess(taskTitle, newId)

        on error errMsg
            return my jsonError(taskTitle, errMsg)
        end try

    end tell
end run

-- JSON emitters. Single-line output. Strings are escaped via jsonEscape.
on jsonSuccess(t, idStr)
    return "{\"status\":\"success\",\"title\":\"" & my jsonEscape(t) & "\",\"id\":\"" & my jsonEscape(idStr) & "\"}"
end jsonSuccess

on jsonSkipped(t, reasonCode, idStr)
    return "{\"status\":\"skipped\",\"title\":\"" & my jsonEscape(t) & "\",\"reason\":\"" & my jsonEscape(reasonCode) & "\",\"id\":\"" & my jsonEscape(idStr) & "\"}"
end jsonSkipped

on jsonError(t, msg)
    return "{\"status\":\"error\",\"title\":\"" & my jsonEscape(t) & "\",\"reason\":\"" & my jsonEscape(msg) & "\"}"
end jsonError

on jsonEscape(str)
    set out to ""
    repeat with c in every character of str
        set ch to contents of c
        if ch is "\"" then
            set out to out & "\\\""
        else if ch is "\\" then
            set out to out & "\\\\"
        else if ch is (ASCII character 10) then
            set out to out & "\\n"
        else if ch is (ASCII character 13) then
            set out to out & "\\r"
        else if ch is (ASCII character 9) then
            set out to out & "\\t"
        else
            set out to out & ch
        end if
    end repeat
    return out
end jsonEscape

-- Helper: lowercase and trim whitespace from a string
on lowerTrim(str)
    set str to my lower(str)
    repeat while str begins with " "
        set str to text 2 thru -1 of str
    end repeat
    repeat while str ends with " "
        set str to text 1 thru -2 of str
    end repeat
    return str
end lowerTrim

on lower(str)
    set upperChars to "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    set lowerChars to "abcdefghijklmnopqrstuvwxyz"
    set result to ""
    repeat with c in every character of str
        set charOffset to offset of c in upperChars
        if charOffset > 0 then
            set result to result & character charOffset of lowerChars
        else
            set result to result & c
        end if
    end repeat
    return result
end lower
