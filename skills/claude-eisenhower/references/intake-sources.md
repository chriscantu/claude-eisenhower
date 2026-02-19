# Intake Source Handling

How to handle tasks arriving from different sources. The goal is consistent capture regardless of origin.

## Source Types and Extraction Rules

### Email — Apple Mail (Procore/Inbox)
**Integration**: Active via Apple Mail using osascript. Scanned with `/scan-email`. Read-only — never affects read status or moves messages.
**Mailbox**: Procore/Inbox only. No other mailboxes are read.

Extract:
- Sender name and role (from signature or context)
- Subject line as default task title
- Any explicit deadlines ("by EOD Friday", "before the board meeting")
- Action requested (reply, review, approve, attend, complete, certify)

**Procore Action Categories** — three patterns that require Cantu's action:

**1. Admin / Compliance**
Sender signals: HR, Legal, Procurement, Compliance, People Ops
Subject/body signals: "required", "action required", "complete by", "certification", "training", "approval needed", "compliance", "deadline", "must complete by", "due by", "overdue", "mandatory", "policy violation"
Default quadrant: Q2
Escalate to Q1 if: deadline is within 3 available business days (see Calendar availability logic below), OR body contains compliance consequence language ("your manager has been notified", "compliance breach", "mandatory")

**2. VP / Director Escalations**
Sender signals: title contains VP, Director, SVP, EVP, or C-suite role
Subject/body signals: "align", "initiative", "priority", "decision needed", "your input", "strategic", "blocking", "ASAP", "before [date]", "need your response"
Default quadrant: Q1 if action needed this week; Q2 if future planning
Escalate to Q1 if: any urgency signal present

**3. Company Surveys / Feedback Requests**
Sender signals: internal comms team, executive assistant, HR
Subject/body signals: "survey", "feedback", "your input", "pulse", "all-hands", "planning", "please respond"
Default quadrant: Q3
Escalate to Q2 if: tied to a named leadership meeting or planning cycle with a close deadline

**Calendar Availability Logic** (used for Admin/Compliance due date escalation):
1. Read the due date from the email
2. Count business days between today and the due date (exclude weekends)
3. For each business day in that window, check Mac Calendar:
   - Full-day PTO or Out of Office → subtract from available days
   - Day has less than 2 hours of unblocked time → flag as busy, subtract from available days
4. If available days ≤ 3 → escalate to Q1
5. If available days > 3 → keep as Q2, note target completion date as due date minus 3 available days

### Slack / Chat
Extract:
- Channel context (ops, engineering, leadership — signals urgency)
- Who messaged (DM vs. channel mention)
- Whether it was a direct request or ambient mention
- Any reactions suggesting urgency (🔴, 🚨, 👀)

Future integration: ~~chat (e.g., Slack, Microsoft Teams)

### Meeting / Conversation
Extract:
- Who was in the room / on the call
- What was said verbatim if possible
- Whether it was a formal commitment ("I'll do X by Y") or a loose idea
- Who else might have heard the commitment (accountability context)

Use the /intake command immediately after a meeting to capture while fresh.

### ~~Project Tracker (Jira, Asana, Linear, etc.)
Extract:
- Ticket ID and title
- Priority as set by the requester (treat as urgency signal, not final priority)
- Assigned due date
- Reporter and assignee

Future integration: ~~project tracker

### Mac Calendar
**Integration**: Active via osascript (macOS Calendar app). Read-only — used for availability checks during `/schedule` and `/scan-email`. Never creates, modifies, or deletes calendar events.

Extract:
- Meeting title and attendees (who to follow up with)
- Prep work implied by the meeting
- Post-meeting action items
- Free/busy status per day (used for Q2→Q1 escalation logic in email scanning)
- Full-day PTO or Out of Office events (subtract from available day count)

### Internal Thought / Self-Generated
Flag as: Source: self
- No requester urgency pressure
- Apply Eisenhower based purely on strategic importance
- These tend to be Q2 (important, not urgent) — protect them from being displaced by Q3

## Parsing Urgency Language

| Language used | Urgency signal |
|--------------|----------------|
| "ASAP", "urgent", "today" | High — Q1 candidate |
| "by end of week", "this sprint" | Medium — Q1 or Q2 |
| "when you get a chance" | Low — Q3 or Q4 |
| "just FYI", "no rush" | Low — Q4 or skip intake |
| No timeline given | Ask at intake or default to Q2 |

## When Source is Unknown

If the user doesn't specify source, ask one clarifying question: "Where did this come from?" Use the answer to set Source field and adjust urgency interpretation.
