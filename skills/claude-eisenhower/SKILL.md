---
name: claude-eisenhower
description: >
  This skill should be used when the user asks to "add a task", "log a request",
  "prioritize my tasks", "schedule my work", "mark something done", "what should I
  work on", "triage my backlog", "Eisenhower matrix", "Q1 Q2 Q3 Q4 tasks",
  "follow up with someone", "delegate a task", or any request related to
  the Intake → Prioritize → Schedule → Execute workflow.
version: 0.1.0
---

# Engineering Task Flow

A 4-phase workflow for Directors of Engineering to manage tasks from any source with clarity and control.

## The Four Phases

### Phase 1: INTAKE
Capture any task regardless of source (email, Slack, meeting, conversation, thought).

When intaking a task, extract and record:
- **Title** — short, action-oriented label
- **Description** — what needs to happen and why
- **Source** — where this came from (email, Slack, meeting, conversation, etc.)
- **Requester** — who asked (name + role if known)
- **Raw urgency signal** — what the requester said about timing
- **Initial due date** — if stated

Do NOT prioritize during intake. Capture first, judge later.

Store new tasks in the TASKS.md file. Append to the "## Unprocessed" section.

### Phase 2: PRIORITIZE
Classify each task using the Eisenhower Matrix. See `references/eisenhower.md` for full rules.

| Quadrant | Label | Criteria | Default Action |
|----------|-------|----------|----------------|
| Q1 | Urgent + Important | Crisis, hard deadlines, high stakes | Do it now |
| Q2 | Not Urgent + Important | Strategic work, growth, relationships | Schedule it |
| Q3 | Urgent + Not Important | Interruptions, others' priorities | Delegate if possible |
| Q4 | Not Urgent + Not Important | Busywork, time-wasters | Eliminate or defer |

After classifying, present the quadrant assignment and reasoning to the user for confirmation before saving.

### Phase 3: SCHEDULE
Assign timing based on quadrant:
- **Q1** → Assign today or the earliest available slot. Flag as critical.
- **Q2** → Assign a specific future date. Block time for deep work.
- **Q3** → Assign a date only if delegated; otherwise mark "async/when possible."
- **Q4** → Stage in the `## Q4 — Defer / Eliminate` section first. Record the cut date and reasoning. Only move to `## Completed` at the weekly review if the task is confirmed eliminated — not immediately.

If Mac Calendar integration is configured, use it to check availability before assigning dates.

### Phase 4: EXECUTE
When a task is in progress or completed:
- **Mark done** → Move task to `## Completed` section with completion date
- **Partial progress** → Add a progress note to the task
- **Follow-up needed** → Create a new intake task linked to the original
- **Stakeholder update needed** → Record the stakeholder in memory for follow-up tracking

## Task File Format

Tasks are stored in TASKS.md (in the outputs folder or workspace). Use this structure:

```markdown
## Unprocessed
- [ ] [INTAKE DATE] Task title | Source: X | Requester: Y

## Q1 — Urgent + Important
- [ ] [DUE: DATE] Task title | Source: X | Requester: Y

## Q2 — Important, Not Urgent
- [ ] [SCHEDULED: DATE] Task title | Source: X | Requester: Y

## Q3 — Urgent, Not Important
- [ ] [ASYNC] Task title | Delegate to: X | Source: Y

## Q4 — Defer / Eliminate
- [ ] Task title | Deferred | Review on: DATE

## Completed
- [x] [DONE: DATE] Task title
```

## Stakeholder Memory

Use the productivity:memory-management skill to track stakeholders who need follow-up.

When a task involves a stakeholder commitment (you owe them an update, they owe you something, or you delegated to them), record:
- Stakeholder name + role
- What was agreed
- When follow-up is due

Retrieve stakeholder context at the start of any scheduling or execution session.

## Additional References

- **`references/eisenhower.md`** — detailed quadrant rules with edge cases and examples
- **`references/intake-sources.md`** — how to handle tasks from different sources (Slack, email, meetings, Jira, etc.)
- **`references/delegation-guide.md`** — framework for deciding what to delegate and to whom
