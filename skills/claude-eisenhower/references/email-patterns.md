# Email Patterns — Apple Mail (Procore/Inbox)

Pattern library for `/scan-email`. Used to detect and classify actionable emails from Procore/Inbox into the three action categories. All matching is case-insensitive.

---

## Category 1 — Admin / Compliance

### Sender signals
Match if sender name or email domain suggests:
- HR, Human Resources, People Ops, People Team
- Legal, Counsel, Compliance
- Procurement, Finance, Accounting
- Training, Learning & Development, L&D
- Benefits, Payroll, IT Security

### Subject signals (any match = candidate)
- "required"
- "action required"
- "complete by"
- "certification"
- "training"
- "approval needed" / "needs your approval"
- "compliance"
- "deadline"
- "reminder"
- "overdue"
- "past due"
- "mandatory"
- "please complete"
- "annual"

### Body signals (any match = candidate)
- "must complete by"
- "due by" / "due date"
- "overdue"
- "your completion is required"
- "failure to complete"
- "policy requires"
- "assigned to you"
- "please acknowledge"

### Compliance escalation signals (any match = auto Q1 regardless of deadline)
- "your manager has been notified"
- "compliance breach"
- "mandatory — no exceptions"
- "legal requirement"
- "HR will follow up"
- "policy violation"
- "regulatory requirement"

### Default quadrant: Q2
### Escalate to Q1 if: available calendar days ≤ 3 OR any compliance escalation signal present

---

## Category 2 — VP / Director Escalations

### Sender signals
Match if sender title (from signature or name) contains:
- VP, Vice President
- Director
- SVP, Senior Vice President
- EVP, Executive Vice President
- Chief (CEO, CTO, CFO, COO, CPO, CHRO, etc.)
- President

### Subject signals (any match = candidate)
- "align" / "alignment"
- "initiative"
- "priority" / "prioritize"
- "decision needed" / "your decision"
- "your input needed" / "need your input"
- "strategic"
- "escalation" / "escalating"
- "leadership"
- "action needed"
- "time sensitive"

### Body signals (any match = candidate)
- "need your response"
- "blocking"
- "before [date]"
- "ASAP"
- "by end of day" / "by EOD"
- "by end of week" / "by EOW"
- "urgent"
- "let's align"
- "executive decision"

### Default quadrant: Q1 if urgency signal present; Q2 if future/planning tone
### Urgency signals that trigger Q1: "ASAP", "blocking", "urgent", "by EOD", "before [date within 5 days]"

---

## Category 3 — Company Surveys / Feedback Requests

### Sender signals
Match if sender name or role suggests:
- Internal Communications / Corp Comms
- Executive Assistant (EA) or Chief of Staff
- HR / People Ops (when subject is survey-related)
- Named leadership initiative team

### Subject signals (any match = candidate)
- "survey"
- "feedback"
- "your input"
- "pulse"
- "all-hands" / "all hands"
- "town hall"
- "please respond"
- "we want to hear from you"
- "share your thoughts"
- "vote"

### Body signals (any match = candidate)
- "please take a moment"
- "takes only [N] minutes"
- "anonymous survey"
- "your participation"
- "before the meeting"
- "before [event name]"

### Escalation to Q2 signals (any match = promote from Q3 to Q2)
- Named upcoming event: "before the all-hands", "before the board meeting", "before Q[N] planning"
- Hard deadline language: "responses needed by [date]", "closes [date]"
- Sent directly by an executive (VP or above sender + survey content)

### Default quadrant: Q3
### Escalate to Q2 if: escalation signal present

---

## Skipping Emails — Do Not Intake

Skip an email if it matches any of the following (these are noise, not action items):
- Auto-generated notification with no ask: "Your document was shared", "New comment on..."
- Calendar invite acceptances / declines
- Out of office auto-replies
- Newsletter or digest formats (no direct ask, bulk sender)
- Already captured in TASKS.md (same subject + received date)

---

## Urgency Language Reference

Used across all categories to tune Eisenhower assignment:

| Language found | Urgency interpretation |
|---------------|----------------------|
| "ASAP", "urgent", "immediately" | High — Q1 |
| "by EOD", "by end of day" | High — Q1 |
| "by end of week", "by Friday" | Medium — Q1 or Q2 |
| "by [date within 3 available days]" | High — Q1 (after calendar check) |
| "by [date beyond 3 available days]" | Medium — Q2 |
| "when you get a chance", "no rush" | Low — Q3 |
| "just FYI", "for your awareness" | Low — skip or Q4 |
| No deadline stated | Default to Q2; note "No deadline found" |
