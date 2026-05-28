-- complete_reminder.applescript
-- Marks an existing reminder as complete in a named Mac Reminders list.
-- Called by the claude-eisenhower execute command when a task is marked done.
-- Completed reminders stay in Reminders history (completed = true, not deleted).
--
-- Arguments (positional, space-separated, each quoted):
--   1. title         — reminder name (used for fallback / response payload)
--   2. list_name     — target Reminders list name
--   3. reminder_id   — (optional) x-coredata URI returned by push_reminder.
--                      When non-empty, the script looks the reminder up by id
--                      first. This is the stable path; re-delegation and
--                      user-driven title changes no longer orphan the
--                      Reminder. Pass "" to force title-only match.
--
-- Returns (stdout, single-line JSON):
--   {"status":"success","title":"...","id":"x-coredata://...","matched_by":"id"|"title"}
--   {"status":"success","title":"...","id":"x-coredata://...","matched_by":"id"|"title","note":"already_completed"}
--   {"status":"skipped","title":"...","reason":"not_found"}
--   {"status":"error","title":"...","reason":"..."}
--
-- Usage:
--   osascript complete_reminder.applescript "Fix deploy pipeline issue" "Eisenhower List"
--   osascript complete_reminder.applescript "Fix deploy pipeline issue" "Eisenhower List" "x-coredata://..."

on run argv
    set taskTitle to item 1 of argv
    set listName to item 2 of argv
    set reminderId to ""
    if (count of argv) ≥ 3 then
        set reminderId to item 3 of argv
    end if

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

        set matchedReminder to missing value
        set matchedBy to ""

        -- Step 2a: id lookup first when caller supplied one
        if reminderId is not "" then
            set existingReminders to every reminder of targetList
            repeat with r in existingReminders
                if (id of r as string) is reminderId then
                    set matchedReminder to r
                    set matchedBy to "id"
                    exit repeat
                end if
            end repeat
            if matchedReminder is missing value then
                set completedReminders to every reminder of targetList whose completed is true
                repeat with r in completedReminders
                    if (id of r as string) is reminderId then
                        return my jsonSuccessNote(taskTitle, id of r as string, "id", "already_completed")
                    end if
                end repeat
            end if
        end if

        -- Step 2b: Title fallback when no id match (or no id supplied)
        if matchedReminder is missing value then
            set existingReminders to every reminder of targetList
            repeat with r in existingReminders
                if (my lowerTrim(name of r)) is (my lowerTrim(taskTitle)) then
                    set matchedReminder to r
                    set matchedBy to "title"
                    exit repeat
                end if
            end repeat
        end if

        -- Step 3: If still not found, check completed reminders by title
        if matchedReminder is missing value then
            set completedReminders to every reminder of targetList whose completed is true
            repeat with r in completedReminders
                if (my lowerTrim(name of r)) is (my lowerTrim(taskTitle)) then
                    return my jsonSuccessNote(taskTitle, id of r as string, "title", "already_completed")
                end if
            end repeat
            return my jsonSkipped(taskTitle, "not_found")
        end if

        -- Step 4: Mark as complete (stays in history, not deleted)
        try
            set completed of matchedReminder to true
            return my jsonSuccess(taskTitle, id of matchedReminder as string, matchedBy)
        on error errMsg
            return my jsonError(taskTitle, errMsg)
        end try

    end tell
end run

-- JSON emitters. Single-line output. Strings are escaped via jsonEscape.
on jsonSuccess(t, idStr, matchedBy)
    return "{\"status\":\"success\",\"title\":\"" & my jsonEscape(t) & "\",\"id\":\"" & my jsonEscape(idStr) & "\",\"matched_by\":\"" & my jsonEscape(matchedBy) & "\"}"
end jsonSuccess

on jsonSuccessNote(t, idStr, matchedBy, noteCode)
    return "{\"status\":\"success\",\"title\":\"" & my jsonEscape(t) & "\",\"id\":\"" & my jsonEscape(idStr) & "\",\"matched_by\":\"" & my jsonEscape(matchedBy) & "\",\"note\":\"" & my jsonEscape(noteCode) & "\"}"
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
