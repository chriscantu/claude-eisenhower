# Intake Source Handling

How to handle tasks arriving from different sources. The goal is consistent capture regardless of origin.

## Source Types and Extraction Rules

### Email
Extract:
- Sender name and role (from signature or context)
- Subject line as default task title
- Any explicit deadlines ("by EOD Friday", "before the board meeting")
- Action requested (reply, review, approve, attend, etc.)

Future integration: ~~email (e.g., Gmail, Outlook)

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
Extract:
- Meeting title and attendees (who to follow up with)
- Prep work implied by the meeting
- Post-meeting action items

Future integration: Mac Calendar (macOS Calendar app via AppleScript)

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
