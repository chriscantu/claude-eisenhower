---
description: [Capture] Scan a configured email inbox for actionable emails and add them to your task board
argument-hint: [optional: category to scan — admin, escalations, surveys, or all]
allowed-tools: Read, Write, Edit
---

You are running the SCAN EMAIL phase of the Engineering Task Flow.

This command reads emails from a configured email account and inbox via the
`email-scan.ts` dispatcher (`scripts/email-scan.ts`), which routes through the
provider named in `config/email-config.md` (default: `apple-mail`). It is
strictly read-only — it never marks emails as read, moves them, or modifies
them in any way.

## Config check

Check that `config/email-config.md` exists before proceeding.

If it does not exist → stop and say:
> "I need to configure your email account before scanning. Let me run setup first."
Then run the `/setup` command (email step only), and resume `/scan-email` when complete.

**Before doing anything else**, read `config/email-config.md` to get:
- `account_name` — the email account to scan
- `inbox_name` — the inbox / label within that account

Use these values everywhere below in place of hardcoded account or mailbox names.

Resolve `plugin_root` following `skills/core/references/plugin-root-resolution.md`.

## Why the dispatcher

`email-scan.ts` owns the provider seam — Apple Mail today, Gmail (#65) when
the user configures `provider: google`. This command does NOT spawn provider
clients directly. All email I/O routes through:

- `npx ts-node ${plugin_root}/scripts/email-scan.ts list-mailboxes <account>` —
  enumerate mailbox / label names under the account
- `npx ts-node ${plugin_root}/scripts/email-scan.ts scan <account> <inbox> <since> <unread_only> <max_messages>` —
  fetch matching messages with subject + body in one call

Each invocation prints a single line of JSON to stdout:
`{ok: true, result: <provider result>}` on success or
`{ok: false, error: "..."}` on dispatcher-level failure. Parse with normal
JSON handling — do NOT regex the raw stdout.

The dispatcher honors a 30s per-call timeout in the underlying adapter, so
the previous "10 messages at a time" workaround is no longer needed: a
single `scan` call returns up to `max_messages` records.

---

## Step 1: Read existing tasks for deduplication

Read TASKS.md from the root of the user's mounted workspace folder. Extract any tasks with `Source: Email ({account_name})` and store their subject + received date pairs to avoid adding duplicates.

If TASKS.md does not exist, proceed — it will be created when tasks are saved.

## Step 2: Verify the configured account and mailbox name

Using the `account_name` from `config/email-config.md`, list the mailboxes
the dispatcher exposes for that account:

```bash
npx ts-node ${plugin_root}/scripts/email-scan.ts list-mailboxes "{account_name}"
```

Parse the JSON output. On `ok: true`, `result.mailboxes` is an array of
mailbox / label names visible to the configured provider. Use the first name
that matches `inbox_name` from `config/email-config.md`, or fall back to the
first name in the array if `inbox_name` is not present.

If `ok: false`, OR if `result.status` is `"error"`, surface the reason to the
user verbatim and stop. Common reasons: "Account not found" (the configured
account could not be matched), `"binary not found"` (running from a
non-mac host with provider `apple-mail`), or a provider-specific permission
error. Suggest the user check `config/email-config.md` and that the email
application is open / authenticated.

## Step 3: Scan the inbox in a single call

Fetch matching messages — subject, sender, date, and body all in one pass:

```bash
npx ts-node ${plugin_root}/scripts/email-scan.ts scan "{account_name}" "{inbox_name}" "{since_date}" "{unread_only}" {max_messages}
```

Where:
- `{since_date}` = ISO date (YYYY-MM-DD); `today - 14 days` is a reasonable default
- `{unread_only}` = `true` to limit to unread messages, `false` for all
- `{max_messages}` = `50` is a reasonable default

Parse the JSON. On `ok: true`, `result.messages` is an array of
`EmailMessage` records (see `scripts/adapter-types.ts` for the contract):
`{id, from, subject, received_at, snippet, body_text, thread_id}`. `body_text`
contains the full plain-text body — no separate fetch is needed.

If `ok: false` or `result.status === "error"`, surface the reason verbatim
and stop.

## Step 4: Filter for actionable emails

Determine scope from $ARGUMENTS:
- "admin" → Admin/Compliance category only
- "escalations" → VP/Director Escalations only
- "surveys" → Company Surveys only
- no argument or "all" → all three categories

Apply detection rules from `skills/core/references/email-patterns.md`. Match
first on subject + sender; consult `body_text` / `snippet` only for borderline
candidates. Skip any email matching an existing TASKS.md entry (same
subject + received date).

## Step 5: Extract due-date signals from body_text for matched emails

For each matched candidate, scan `body_text` for deadline language, due
dates, urgency signals, and compliance escalation signals. The body is
already in hand from Step 3 — no extra call is needed.

If `body_text` is empty for a particular message (provider could not deliver
it), note it in the confirmation table (Step 8) as
"body unavailable — classified on subject only". Still log the task to
TASKS.md (non-blocking).

## Step 6: Check Mac Calendar for Admin/Compliance emails with due dates

For each Admin/Compliance match that has a detectable due date, run a fast
calendar query via the calendar-query dispatcher. This avoids AppleScript's
slow `whose` clause which times out on large calendars (7000+ events).

Calculate the number of days from today to the due date, then run:

```bash
npx ts-node ${plugin_root}/scripts/calendar-query.ts query "{calendarName}" {daysAhead} summary
```

Where `calendarName` is read from `config/calendar-config.md`.

Where `daysAhead` is the integer number of days from today to the due date.

The command returns JSON. Parse the `reason` field (a block of bullet text
summarising business day availability). Extract the `AVAILABLE_DAYS` count
from the `reason` text.

Use the `AVAILABLE_DAYS` value for escalation logic:
- If available days ≤ 3 → Q1
- If available days > 3 → Q2

A day is "available" if it is a business day (not weekend), not PTO/OOO, has
< 7h of meetings, and has ≥ 2h free.

If the dispatcher returns an error (e.g., "Calendar access not granted"),
fall back to raw business day count from today to the due date and note:
"Calendar check unavailable — escalation based on date only."

If no due date found → assign Q2 and note: "No deadline found — defaulting to Q2. Confirm or adjust."

## Step 7: Assign quadrant for each matched email

Apply classification rules from `skills/core/references/intake-sources.md`:
- Admin/Compliance → Q2 by default; Q1 if calendar check triggers escalation OR compliance consequence language found in body
- VP/Director Escalation → Q1 if urgency signal present; Q2 if future/planning tone
- Company Survey → Q3 by default; Q2 if tied to a named upcoming meeting with close deadline

## Step 8: Present confirmation table

Show all matched tasks before writing anything:

```
| # | Subject (truncated)        | Category | Quadrant       | Due Date | Recommended Action       |
|---|---------------------------|----------|----------------|----------|--------------------------|
| 1 | Complete Safety Training  | Admin    | Q2 · Schedule  | Mar 5    | Schedule focus block     |
| 2 | RE: Q1 Initiative Align   | VP Esc.  | Q1 · Do        | ASAP     | Act today                |
| 3 | Q1 Pulse Survey           | Survey   | Q3 · Delegate  | Feb 28   | Respond when time allows |
```

Render quadrants in the user-facing table as `Q1 · Do`, `Q2 · Schedule`,
`Q3 · Delegate`, `Q4 · Cut` — verb label makes the action obvious at a glance.

If no actionable emails were found, distinguish the two failure shapes so a first-run user does NOT conclude the plugin is broken (issue #41):

- **Inbox was empty** (0 messages reached the categorization step): "No emails found in {account_name}/{inbox_name} over the scan window. Your inbox is empty."
- **Inbox had messages, none matched** (N messages scanned, 0 categorized as Admin/Compliance, VP Escalation, Survey, or other actionable categories): "Scanned {N} email(s) in {account_name}/{inbox_name}; 0 matched the actionable patterns (Admin/Compliance, VP Escalation, Survey, or other category triggers). Your task board is up to date — this is a normal result on a clean week."

The explicit `{N}` count confirms the scan ran. Without it, a new user with a normal inbox that simply contains no compliance/escalation/survey emails concludes the plugin is broken.

If any emails could not be confidently categorized, list them separately: "These emails didn't match a clear category — review manually if needed:" followed by subject and sender.

Ask: "Does this look right? I'll add these to your task board once you confirm — or let me know if any need reclassifying."

## Step 9: Write confirmed tasks to TASKS.md

After the user confirms:
- Create TASKS.md if it does not exist with these section headers: `# Task Board`, `## Inbox`, `## Active`, `## Delegated`, `## Done`
- Append each confirmed task to the `## Inbox` section
- Preserve all original task fields

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
Priority:    {Q1 | Q2 | Q3}
State:       Inbox
---
```

Confirm: "Added [N] tasks to your board. Run /prioritize to review or /schedule to assign dates."
