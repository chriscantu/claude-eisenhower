# Mac Email Integration — Feature Spec
**Plugin**: claude-eisenhower
**Version**: 0.1.0 (planned)
**Status**: Draft
**Last updated**: 2026-02-18

---

## Problem Statement

Procore/Inbox emails arrive with unclear asks and blend into general email noise. As a result, high-consequence items — especially required training and certifications — get missed. The manual effort to read, parse, and translate emails into actionable tasks is slow and error-prone. The result is dropped tasks, manager escalations, and compliance risk.

---

## Goals

- Automatically scan Procore/Inbox for emails that require action
- Extract a clear, structured task from each actionable email
- Classify each task into the Eisenhower matrix using source type, deadline, and calendar availability
- Write intake records directly to TASKS.md — same format as `/intake`
- **Never** affect email read/unread status
- **Never** touch any mailbox other than Procore/Inbox

---

## Out of Scope (v1)

- Replying to, archiving, or moving emails
- Scanning any mailbox other than Procore/Inbox
- Auto-running on a schedule (manual trigger only in v1)
- Integration with non-Mac mail clients

---

## New Command: `/scan-email`

### Trigger
Manual only. User runs `/scan-email` from Cowork.

### Behavior — Step by Step

**Step 1: Connect to Apple Mail via osascript**
Read emails from the Procore/Inbox mailbox only. Fetch subject, sender, date received, and body preview (first 500 characters). Do not open, mark, move, or modify any email in any way.

**Step 2: Filter for actionable emails**
Apply the three-category filter (see Classification Rules below). Skip emails that don't match any category. Skip emails already captured in TASKS.md (match on subject + date).

**Step 3: Extract structured task record**
For each matched email, extract:
- **Title** — action-oriented summary (verb + object, max 10 words)
- **Description** — what is being asked and why it matters
- **Source** — `Email (Procore)`
- **Requester** — sender name and role if detectable
- **Urgency signal** — any deadline language found in the body
- **Raw due date** — explicit date if found; otherwise `Not specified`
- **Category** — Admin/Compliance, VP Escalation, or Company Survey

**Step 4: Determine Eisenhower quadrant**
Apply classification rules (see below). For training/cert emails with a due date, cross-reference Mac Calendar availability before assigning quadrant.

**Step 5: Present confirmation table**
Show all extracted tasks before writing anything:

```
| # | Email Subject | Category | Quadrant | Due Date | Recommended Action |
|---|--------------|----------|----------|----------|--------------------|
| 1 | ...          | Admin    | Q2       | Mar 5    | Schedule focus block |
| 2 | ...          | Admin    | Q1       | Feb 20   | Do today — deadline in 2 available days |
| 3 | ...          | VP       | Q1       | ASAP     | Align and execute |
```

Ask: "Does this look right? I'll add these to your task board once you confirm — or tell me if any need reclassifying."

**Step 6: Write confirmed tasks to TASKS.md**
Append each confirmed task to the correct quadrant section in TASKS.md. Format matches standard intake records. Flag source as `Email (Procore)`.

---

## Email Classification Rules

### Category 1 — Admin / Compliance
**What it is**: HR, Legal, or Procurement emails requesting approvals, required training completion, certification renewals, or compliance actions.

**Detection signals**:
- Sender domain or name matches: HR, Legal, Procurement, Compliance, People Ops
- Subject contains: "required", "action required", "complete by", "certification", "training", "approval needed", "compliance", "deadline"
- Body contains deadline language: "must complete by", "due by", "overdue"

**Default quadrant**: Q2 (important, not immediately urgent)

**Escalation to Q1**: When the deadline falls within 3 *available* business days.
Available days = business days minus any full-day PTO or days where calendar free time < 2 hours (checked via Mac Calendar).

**Compliance override**: If the email contains language suggesting legal or HR consequence (e.g., "compliance breach", "mandatory", "policy violation", "your manager has been notified"), classify as Q1 regardless of deadline distance.

---

### Category 2 — VP / Director Escalations
**What it is**: Emails from VPs or Directors requiring alignment on an initiative, a decision, or execution of something strategic.

**Detection signals**:
- Sender title contains: VP, Director, SVP, EVP, C-suite
- Subject or body contains: "align", "initiative", "priority", "decision needed", "your input", "leadership", "strategic"
- Tone signals urgency or cross-functional coordination

**Default quadrant**: Q1 if action is needed this week; Q2 if it's a heads-up or future planning item
**Escalation signal**: "ASAP", "before [date]", "blocking", "need your response"

---

### Category 3 — Company Surveys / Feedback Requests
**What it is**: Organization-wide requests for input, pulse surveys, or feedback before large meetings or planning cycles.

**Detection signals**:
- Subject contains: "survey", "feedback", "your input", "pulse", "all-hands", "planning", "please respond"
- Sender is typically an internal communications team or executive assistant

**Default quadrant**: Q3 (respond when time allows; important to participate but rarely blocking)
**Escalation to Q2**: If tied to a named leadership meeting or planning cycle with a close deadline

---

## Calendar Availability Logic

Used when a training/certification email has a detected due date.

1. Read the due date from the email
2. Count business days between today and the due date (exclude weekends)
3. For each business day in that window, check Mac Calendar:
   - Is it marked as Out of Office / PTO? → subtract from available days
   - Does the day have < 2 hours of unblocked time? → flag as "busy day", subtract from available days
4. If available days ≤ 3 → escalate to Q1
5. If available days > 3 → keep as Q2, note scheduled date as due date minus 3 available days

---

## TASKS.md Record Format

Each email-sourced task uses the standard intake format with the email category appended:

```
---
[ INTAKE — {scan date} ]
Title:       {extracted title}
Description: {extracted description}
Source:      Email (Procore)
Requester:   {sender name + role}
Urgency:     {deadline language from email body}
Due date:    {extracted due date or "Not specified"}
Category:    {Admin/Compliance | VP Escalation | Company Survey}
Status:      {Q1 | Q2 | Q3}
---
```

---

## Implementation Notes

### Apple Mail access via osascript
All email reading uses AppleScript (osascript) to access Apple Mail locally. No network calls, no third-party API. Read-only access only — no `set read status`, no `move`, no `delete`.

Example AppleScript pattern (read-only):
```applescript
tell application "Mail"
  set targetMailbox to mailbox "Inbox" of account "Procore"
  set recentMessages to messages 1 through 50 of targetMailbox
  repeat with msg in recentMessages
    set msgSubject to subject of msg
    set msgSender to sender of msg
    set msgDate to date received of msg
    -- read only, no modifications
  end repeat
end tell
```

### Deduplication
Before adding a task to TASKS.md, check if an existing task record has matching subject + received date. If yes, skip silently.

### Mac Calendar access via osascript
Uses the existing calendar integration already referenced in `commands/schedule.md`. Read-only — checks event titles and free/busy status only.

---

## Files to Create

| File | Purpose |
|------|---------|
| `commands/scan-email.md` | New `/scan-email` command definition |
| `skills/claude-eisenhower/references/email-patterns.md` | Sender/subject pattern library for the three categories |
| Updates to `CONNECTORS.md` | Mark Apple Mail as Active |
| Updates to `README.md` | Document the new command |

---

## Open Questions

1. How many emails should the scanner look back? (e.g., last 7 days, last 50 unread, or all unread)
2. Should the scanner surface emails it couldn't confidently categorize as "uncategorized / review manually"?
3. Should surveys default to Q3 always, or should there be a way to mark certain recurring surveys as Q4 (noise)?
