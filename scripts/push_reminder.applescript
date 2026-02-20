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
-- Returns (stdout):
--   "success: [title]"   — reminder created
--   "skipped: [title]"   — reminder already exists (dedup)
--   "error: [message]"   — something went wrong
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
                return "error: Could not create list '" & listName & "' — " & errMsg
            end try
        end if

        -- Step 2: Deduplication check (case-insensitive, trimmed)
        set existingReminders to every reminder of targetList
        repeat with r in existingReminders
            if (my lowerTrim(name of r)) is (my lowerTrim(taskTitle)) then
                return "skipped: " & taskTitle
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
                -- Parse ISO date "YYYY-MM-DD" into AppleScript date
                set yr to (text 1 thru 4 of dueDateStr) as integer
                set mo to (text 6 thru 7 of dueDateStr) as integer
                set dy to (text 9 thru 10 of dueDateStr) as integer

                set dueDate to current date
                set year of dueDate to yr
                set month of dueDate to mo
                set day of dueDate to dy
                -- Set time to midnight (no specific alarm time per spec decision #3)
                set hours of dueDate to 0
                set minutes of dueDate to 0
                set seconds of dueDate to 0

                set due date of newReminder to dueDate
            end if

            return "success: " & taskTitle

        on error errMsg
            return "error: " & errMsg
        end try

    end tell
end run

-- Helper: lowercase and trim whitespace from a string
on lowerTrim(str)
    set str to my lower(str)
    -- Trim leading spaces
    repeat while str begins with " "
        set str to text 2 thru -1 of str
    end repeat
    -- Trim trailing spaces
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
