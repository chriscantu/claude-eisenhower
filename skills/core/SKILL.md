---
name: claude-eisenhower
description: >
  Use when the user asks to "add a task", "log a request", "prioritize my tasks",
  "schedule my work", "mark something done", "what should I work on", "triage my
  backlog", "Eisenhower matrix", "Q1 Q2 Q3 Q4 tasks", "follow up with someone",
  "delegate a task", "delegate this to someone", "who should own this", "scan my
  inbox", "scan my email", "check my email for tasks", "set up the plugin",
  "configure claude-eisenhower", or "setup" — any request related to the
  Intake → Prioritize → Schedule → Execute workflow, email triage, stakeholder
  delegation, or first-run configuration. This skill carries workflow context and
  routing; the /intake, /prioritize, /schedule, /complete-task, /delegate, /scan-email,
  and /setup slash commands are the execution entry points.
version: 0.1.0
---

# Engineering Task Flow

A 4-phase workflow for Directors of Engineering to manage tasks from any source with clarity and control.

## Gotchas

High-signal failure modes. Read before touching calendar, memory, or task files.

- **Calendar queries — NEVER use AppleScript's `whose` clause.** It is O(n) on total
  event count and times out on large calendars. Route ALL calendar lookups through
  `scripts/calendar-query.ts` (the provider dispatcher), never `cal_query.swift`
  directly. Output is JSON `{status, reason, events[]}` — parse it, do not regex
  stdout. Applies to `/schedule`, `/scan-email`, `/today`, and any ad-hoc lookup.
- **PII files are gitignored — never commit them, never echo their raw contents.**
  Off-limits include `config/stakeholders.yaml` (real names, roles, contact info),
  `config/*-config.md`, `config/.setup.partial`, `memory/`, `TASKS.md`, and
  `TASKS-archive.md` — the PII section of `.gitignore` is the authoritative list.
  Only `config/*.example` files are tracked.
- **TASKS.md is additive by convention.** Append tasks under the right heading
  (`## Inbox`, `## Active`, `## Delegated`, `## Done`) and move whole records between
  sections as state changes — don't rewrite the file. Each record is a `---`-delimited
  colon-separated key-value block.
- **Memory has a single writer.** CREATE/UPDATE delegation memory goes through the
  `memory-manager` skill only. DELETE is owned by `/forget`. Do not write
  `memory/glossary.md` or `memory/people/*.md` inline from a command.
- **Missing config = skip the data source, not an error.** No calendar/email config →
  degrade gracefully and continue; never hard-fail a core (markdown-only) flow on a
  missing platform integration.

## The Four Phases

This skill is the **orchestrator** — it carries workflow context, Gotchas, and
routing. Each phase has a slash command that owns the **detailed execution logic**
(field parsing, date rules, confirmation prompts). When a phase is triggered, route
to its command rather than executing the summary below inline — the command is the
authority; the phase text here is the map, not the procedure.

| Phase | Command(s) | Owns |
|-------|-----------|------|
| Intake | `/intake`, `/quick` | Field extraction, due-date parsing, alias resolution |
| Prioritize | `/prioritize` | Eisenhower classification + confirmation |
| Schedule | `/schedule` | Date assignment, calendar availability |
| Close-out | `/complete-task` | Mark done, progress notes, follow-ups |
| Delegate | `/delegate` | Candidate scoring, check-in tracking |
| Email triage | `/scan-email` | Inbox scan → task records |
| Setup | `/setup` | First-run config |

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
- **Q4** → Stage for review. Move to `## Q4 — Defer / Eliminate` with
  `Deferred: {today's date} | Review on: {date 2 weeks out}`. At the weekly review,
  if the task still has no value, move to `## Done` with
  `Note: Eliminated — Q4 cut {date}`. Do not eliminate immediately unless the user explicitly confirms. If the user
  explicitly confirms "eliminate it now", move the task directly to `## Done` with
  `Note: Eliminated — Q4 cut {date}`. Staging keeps the decision visible and
  reversible for all other cases.

If Mac Calendar integration is configured, use it to check availability before assigning dates.

### Phase 4: CLOSE-OUT
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

See `docs/specs/tasks-schema-spec.md` for the complete field reference.

## Stakeholder Memory

Use the `memory-manager` skill (`skills/memory-manager/SKILL.md`) for all stakeholder
memory operations (log-delegation, resolve-delegation, update-checkin, query-pending).
The memory-manager handles all backend logic — do not implement the try/fallback pattern
inline in commands or this skill.

When a task involves a stakeholder commitment (you owe them an update, they owe you something, or you delegated to them), record:
- Stakeholder name + role
- What was agreed
- When follow-up is due

Retrieve stakeholder context at the start of any scheduling or execution session.

## Additional References

- **`references/eisenhower.md`** — detailed quadrant rules with edge cases and examples
- **`references/intake-sources.md`** — how to handle tasks from different sources (Slack, email, meetings, Jira, etc.)
- **`references/delegation-guide.md`** — framework for deciding what to delegate and to whom
