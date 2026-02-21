---
description: Scan a configured Apple Mail inbox for actionable emails and add them to your task board
argument-hint: [optional: category to scan — admin, escalations, surveys, or all]
allowed-tools: Read, Write, Edit, mcp__Control_your_Mac__osascript
---

You are running the SCAN EMAIL phase of the Engineering Task Flow.

This command reads emails from a configured Apple Mail account and inbox using the Mac osascript MCP tool. It is strictly read-only — it never marks emails as read, moves them, or modifies them in any way.

## Config check

Check that `integrations/config/email-config.md` exists before proceeding.

If it does not exist → stop and say:
> "I need to configure your email account before scanning. Let me run setup first."
Then run the `/setup` command (email step only), and resume `/scan-email` when complete.

**Before doing anything else**, read `integrations/config/email-config.md` to get:
- `account_name` — the mail account to scan
- `inbox_name` — the inbox within that account

Use these values everywhere below in place of hardcoded account or mailbox names.

## Key constraints for osascript calls
- **Never loop over more than 10 messages in a single osascript call** — larger loops time out
- **Fetch subjects/senders/dates first** — fetch body previews only for matched emails
- **One targeted call per email body** — never batch body fetches
- **Calendar checks must be a single scoped call** — never loop over multiple days in one call

---

## Step 1: Read existing tasks for deduplication

Read TASKS.md from the root of the user's mounted workspace folder. Extract any tasks with `Source: Email ({account_name})` and store their subject + received date pairs to avoid adding duplicates.

If TASKS.md does not exist, proceed — it will be created when tasks are saved.

## Step 2: Verify the configured account and mailbox name

Using the `account_name` from `integrations/config/email-config.md`, confirm the account exists and get the exact mailbox name:

```applescript
tell application "Mail"
  set matchingAccounts to {}
  repeat with acct in accounts
    if name of acct contains "{account_name}" then
      set end of matchingAccounts to name of acct
    end if
  end repeat
  return matchingAccounts
end tell
```

Then list mailboxes to confirm the exact inbox name (it may differ from `inbox_name` in the config — use whatever the account actually has):

```applescript
tell application "Mail"
  set targetAccount to first account whose name contains "{account_name}"
  set boxNames to {}
  repeat with mb in mailboxes of targetAccount
    set end of boxNames to name of mb
  end repeat
  return boxNames
end tell
```

If no matching account is found, inform the user: "I couldn't find an account matching '{account_name}' in Apple Mail. Update `integrations/config/email-config.md` with the correct account name, or check that Apple Mail is open and the account is configured."

## Step 3: Scan for subjects, senders, and dates — 10 messages at a time

Fetch in batches of 10. Use the exact mailbox name found in Step 2 (e.g., "INBOX"). For each batch, extract subject, sender, and date only — no body content yet.

```applescript
tell application "Mail"
  set targetAccount to first account whose name contains "{account_name}"
  set targetMailbox to mailbox "{inbox_name}" of targetAccount
  set results to {}
  repeat with i from {START} to {END}
    set msg to message i of targetMailbox
    set msgSubject to subject of msg
    set msgSender to sender of msg
    set msgDate to (date received of msg) as string
    set end of results to msgSubject & "|||" & msgSender & "|||" & msgDate
  end repeat
  return results
end tell
```

Scan batches 1–10, 11–20, 21–30, 41–50 sequentially. After each batch, apply the category filter from Step 4 before fetching the next batch. Stop scanning when you have enough matched candidates or have scanned 50 messages.

## Step 4: Filter for actionable emails

Determine scope from $ARGUMENTS:
- "admin" → Admin/Compliance category only
- "escalations" → VP/Director Escalations only
- "surveys" → Company Surveys only
- no argument or "all" → all three categories

Apply detection rules from `skills/claude-eisenhower/references/email-patterns.md`. Match on subject and sender alone first — body fetch happens only for confirmed candidates. Skip any email matching an existing TASKS.md entry (same subject + received date).

## Step 5: Fetch body preview for matched emails only

For each matched email, fetch the body in a single targeted call using its message index:

```applescript
tell application "Mail"
  set targetAccount to first account whose name contains "{account_name}"
  set targetMailbox to mailbox "{inbox_name}" of targetAccount
  set msg to message {INDEX} of targetMailbox
  set preview to ""
  try
    set c to content of msg
    set charLimit to 500
    if length of c < charLimit then set charLimit to length of c
    -- Strip non-printable and non-ASCII characters (including U+FFFC object replacement char
    -- from embedded images) to prevent JSON serialization errors in the tool response pipeline
    set safeText to ""
    repeat with i from 1 to charLimit
      set ch to character i of c
      set cp to id of ch
      if cp >= 32 and cp <= 126 then
        set safeText to safeText & ch
      end if
    end repeat
    set preview to safeText
  end try
  return preview
end tell
```

One call per matched email. Extract: any deadline language, due dates, urgency signals, and compliance escalation signals.

## Step 6: Check Mac Calendar for Admin/Compliance emails with due dates

For each Admin/Compliance match that has a detectable due date, run a fast calendar query using the EventKit-based Swift script. This avoids AppleScript's slow `whose` clause which times out on large calendars (7000+ events).

Calculate the number of days from today to the due date, then run:

```applescript
do shell script "swift ~/repos/claude-eisenhower/scripts/cal_query.swift '{calendar_name}' {DAYS_AHEAD} summary 2>&1"
```

Where `{calendar_name}` is read from `integrations/config/calendar-config.md`.

Where `{DAYS_AHEAD}` is the integer number of days from today to the due date.

The script returns a structured summary:
```
DAY_SUMMARY:
2026-02-19|9.0h_busy|-1.0h_free|available
2026-02-20|7.5h_busy|0.5h_free|PTO
...
BUSINESS_DAYS: 5
PTO_DAYS: 1
AVAILABLE_DAYS: 2
```

Use the `AVAILABLE_DAYS` value for escalation logic:
- If available days ≤ 3 → Q1
- If available days > 3 → Q2

A day is "available" if it is a business day (not weekend), not PTO/OOO, has < 7h of meetings, and has ≥ 2h free.

If the script returns an error (e.g., "Calendar access not granted"), fall back to raw business day count from today to the due date and note: "Calendar check unavailable — escalation based on date only."

If no due date found → assign Q2 and note: "No deadline found — defaulting to Q2. Confirm or adjust."

## Step 7: Assign quadrant for each matched email

Apply classification rules from `skills/claude-eisenhower/references/intake-sources.md`:
- Admin/Compliance → Q2 by default; Q1 if calendar check triggers escalation OR compliance consequence language found in body
- VP/Director Escalation → Q1 if urgency signal present; Q2 if future/planning tone
- Company Survey → Q3 by default; Q2 if tied to a named upcoming meeting with close deadline

## Step 8: Present confirmation table

Show all matched tasks before writing anything:

```
| # | Subject (truncated)        | Category | Quadrant | Due Date | Recommended Action       |
|---|---------------------------|----------|----------|----------|--------------------------|
| 1 | Complete Safety Training  | Admin    | Q2       | Mar 5    | Schedule focus block     |
| 2 | RE: Q1 Initiative Align   | VP Esc.  | Q1       | ASAP     | Act today                |
| 3 | Q1 Pulse Survey           | Survey   | Q3       | Feb 28   | Respond when time allows |
```

If no actionable emails were found: "No new actionable emails found in {account_name}/{inbox_name}. Your task board is up to date."

If any emails could not be confidently categorized, list them separately: "These emails didn't match a clear category — review manually if needed:" followed by subject and sender.

Ask: "Does this look right? I'll add these to your task board once you confirm — or let me know if any need reclassifying."

## Step 9: Write confirmed tasks to TASKS.md

After the user confirms:
- Create TASKS.md if it does not exist using the standard task board structure
- Append each confirmed task to the correct quadrant section
- Preserve all original task fields
- Add quadrant label and recommended action

Standard intake record format:
```
---
[ INTAKE — {today's date} | Email scan ]
Title:       {title}
Description: {description}
Source:      Email ({account_name})
Requester:   {sender name + role}
Urgency:     {deadline language or "Not specified"}
Due date:    {due date or "Not specified"}
Category:    {Admin/Compliance | VP Escalation | Company Survey}
Status:      {Q1 | Q2 | Q3}
---
```

Confirm: "Added [N] tasks to your board. Run /prioritize to review or /schedule to assign dates."
