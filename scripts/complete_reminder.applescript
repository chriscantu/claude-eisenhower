-- complete_reminder.applescript
-- Marks an existing reminder as complete in a named Mac Reminders list.
-- Called by the claude-eisenhower execute command when a task is marked done.
-- Completed reminders stay in Reminders history (completed = true, not deleted).
--
-- Arguments (positional, space-separated, each quoted):
--   1. title      — reminder name to find (case-insensitive match)
--   2. list_name  — target Reminders list name
--
-- Returns (stdout):
--   "success: [title]"    — reminder found and marked complete
--   "skipped: [title]"    — reminder not found in list (may have been deleted or never pushed)
--   "error: [message]"    — something went wrong
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
            return "error: List '" & listName & "' not found in Reminders"
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
                    -- Already completed — treat as success (idempotent)
                    return "success: " & taskTitle & " (already completed)"
                end if
            end repeat
            -- Not found anywhere
            return "skipped: " & taskTitle & " — not found in '" & listName & "'"
        end if

        -- Step 4: Mark as complete (stays in history, not deleted)
        try
            set completed of matchedReminder to true
            return "success: " & taskTitle
        on error errMsg
            return "error: " & errMsg
        end try

    end tell
end run

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
