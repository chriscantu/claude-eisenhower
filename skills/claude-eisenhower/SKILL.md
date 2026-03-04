---
name: claude-eisenhower
description: >
  This skill should be used when the user asks to "add a task", "log a request",
  "prioritize my tasks", "schedule my work", "mark something done", "what should I
  work on", "triage my backlog", "Eisenhower matrix", "Q1 Q2 Q3 Q4 tasks",
  "follow up with someone", "delegate a task", or any request related to
  the Intake → Prioritize → Schedule → Execute workflow.
  "scan my inbox", "scan my email", "check my email for tasks",
  "delegate this task", "delegate this to someone", "who should own this",
  "set up the plugin", "configure claude-eisenhower", "setup", or any request
  related to email triage, stakeholder delegation, or first-run configuration.
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

Store new tasks in the TASKS.md file. Append to the "## Inbox" section.

### Phase 2: PRIORITIZE
Classify each task using the Eisenhower Matrix. See `references/eisenhower.md` for full rules.

| Quadrant | Label | Criteria | Default Action |
|----------|-------|----------|----------------|
| Q1 | Urgent + Important | Crisis, hard deadlines, high stakes | Do it now |
| Q2 | Not Urgent + Important | Strategic work, growth, relationships | Schedule it |
| Q3 | Urgent + Not Important | Interruptions, others' priorities | Delegate if possible |
| Q4 | Not Urgent + Not Important | Busywork, time-wasters | Eliminate or defer |

> For edge cases, reclassification signals, and Director-specific examples, see
> `references/eisenhower.md` — that file is the authority. The table above is a
> quick reference only.

After classifying, present the quadrant assignment and reasoning to the user for confirmation before saving.

### Phase 3: SCHEDULE
Assign timing based on quadrant:
- **Q1** → Assign today or the earliest available slot. Flag as critical.
- **Q2** → Assign a specific future date. Block time for deep work.
- **Q3** → Assign a date only if delegated; otherwise mark "async/when possible."
- **Q4** → Eliminate. Move to the `## Done` section with a `Note: Eliminated — Q4 cut {YYYY-MM-DD}` and `Done: {date}`. Do not leave in Inbox — elimination is an active decision, not a deferral.

If Mac Calendar integration is configured, use it to check availability before assigning dates.

### Phase 4: EXECUTE
When a task is in progress or completed:
- **Mark done** → Move task to `## Done` section with `Done: {YYYY-MM-DD}`
- **Partial progress** → Add a progress note to the task
- **Follow-up needed** → Create a new intake task linked to the original
- **Stakeholder update needed** → Record the stakeholder in memory for follow-up tracking

## Task File Format

Tasks are stored in TASKS.md (in the outputs folder or workspace). Use this structure:

```markdown
# Task Board

## Inbox

## Active

## Delegated

## Done
```

Each task is a fenced record delimited by `---` with colon-separated key-value fields.
Key fields: `Title`, `Description`, `Source`, `Requester`, `Urgency`, `Due date`,
`Priority` (Q1/Q2/Q3/Q4), `State` (Inbox/Active/Delegated/Done), `Owner`,
`Check-by` (required when State: Delegated), `Scheduled`, `Action`, `Done`.

See `integrations/specs/tasks-schema-spec.md` for the complete field reference.

## Stakeholder Memory

Use the productivity:memory-management skill to track stakeholders who need follow-up.

If the productivity:memory-management skill is not available, log the follow-up
locally instead: append a line to `memory/stakeholders-log.md` (create the file if
it doesn't exist) in this format:
`[YYYY-MM-DD] [alias] | [task title] | check-in: [date] | status: pending`
This is a best-effort fallback — the full memory skill provides richer tracking.

When a task involves a stakeholder commitment (you owe them an update, they owe you something, or you delegated to them), record:
- Stakeholder name + role
- What was agreed
- When follow-up is due

Retrieve stakeholder context at the start of any scheduling or execution session.

## Additional References

- **`references/eisenhower.md`** — detailed quadrant rules with edge cases and examples
- **`references/intake-sources.md`** — how to handle tasks from different sources (Slack, email, meetings, Jira, etc.)
- **`references/delegation-guide.md`** — framework for deciding what to delegate and to whom
