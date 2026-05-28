-- complete_reminder.applescript
-- Marks an existing reminder as complete in a named Mac Reminders list.
-- Called by the claude-eisenhower execute command when a task is marked done.
-- Completed reminders stay in Reminders history (completed = true, not deleted).
--
-- Arguments (positional, space-separated, each quoted):
--   1. title      — reminder name to find (case-insensitive match)
--   2. list_name  — target Reminders list name
--
-- Returns (stdout, single-line JSON):
--   {"status":"success","title":"...","id":"x-coredata://..."}
--   {"status":"success","title":"...","id":"x-coredata://...","note":"already_completed"}
--   {"status":"skipped","title":"...","reason":"not_found"}
--   {"status":"error","title":"...","reason":"..."}
--
-- Usage:
--   osascript complete_reminder.applescript "Fix deploy pipeline issue" "Eisenhower List"

on run argv
    set taskTitle to item 1 of argv
    set listName to item 2 of argv

    tell application "Reminders"

        -- Step 1: Find the target list
        set targetList to missing value
        repeat with l in lists
            if name of l is listName then
                set targetList to l
                exit repeat
            end if
        end repeat

        if targetList is missing value then
            return my jsonError(taskTitle, "list_not_found: " & listName)
        end if

        -- Step 2: Find reminder by title (case-insensitive, trimmed)
        set matchedReminder to missing value
        set existingReminders to every reminder of targetList
        repeat with r in existingReminders
            if (my lowerTrim(name of r)) is (my lowerTrim(taskTitle)) then
                set matchedReminder to r
                exit repeat
            end if
        end repeat

        -- Step 3: If not found in active reminders, check completed reminders
        if matchedReminder is missing value then
            set completedReminders to every reminder of targetList whose completed is true
            repeat with r in completedReminders
                if (my lowerTrim(name of r)) is (my lowerTrim(taskTitle)) then
                    return my jsonSuccessNote(taskTitle, id of r as string, "already_completed")
                end if
            end repeat
            return my jsonSkipped(taskTitle, "not_found")
        end if

        -- Step 4: Mark as complete (stays in history, not deleted)
        try
            set completed of matchedReminder to true
            return my jsonSuccess(taskTitle, id of matchedReminder as string)
        on error errMsg
            return my jsonError(taskTitle, errMsg)
        end try

    end tell
end run

-- JSON emitters. Single-line output. Strings are escaped via jsonEscape.
on jsonSuccess(t, idStr)
    return "{\"status\":\"success\",\"title\":\"" & my jsonEscape(t) & "\",\"id\":\"" & my jsonEscape(idStr) & "\"}"
end jsonSuccess

on jsonSuccessNote(t, idStr, noteCode)
    return "{\"status\":\"success\",\"title\":\"" & my jsonEscape(t) & "\",\"id\":\"" & my jsonEscape(idStr) & "\",\"note\":\"" & my jsonEscape(noteCode) & "\"}"
end jsonSuccessNote

on jsonSkipped(t, reasonCode)
    return "{\"status\":\"skipped\",\"title\":\"" & my jsonEscape(t) & "\",\"reason\":\"" & my jsonEscape(reasonCode) & "\"}"
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

-- Helper: lowercase and trim whitespace — handles full Unicode via shell tr
on lowerTrim(str)
    repeat while str begins with " "
        set str to text 2 thru -1 of str
    end repeat
    repeat while str ends with " "
        set str to text 1 thru -2 of str
    end repeat
    return do shell script "printf '%s' " & quoted form of str & " | tr '[:upper:]' '[:lower:]'"
end lowerTrim
