# claude-eisenhower

A 4-phase task management workflow for Directors of Engineering. Captures tasks from any source, prioritizes them using the Eisenhower matrix, schedules them against your calendar, and tracks execution with stakeholder follow-up.

---

## The Workflow

```
INTAKE → PRIORITIZE → SCHEDULE → EXECUTE
```

| Phase | Command | What it does |
|-------|---------|-------------|
| 1. Intake | `/intake` | Capture any task in natural language, regardless of source |
| 2. Prioritize | `/prioritize` | Classify tasks into Q1–Q4 using the Eisenhower matrix |
| 3. Schedule | `/schedule` | Assign dates and actions by quadrant |
| 4. Execute | `/execute` | Mark done, log progress, delegate, or create follow-ups |

---

## Components

### Commands (4)

- **`/intake [describe task]`** — Capture a new task in free-form natural language. Extracts title, source, requester, and urgency automatically. Appends to TASKS.md.
- **`/prioritize [optional: task or all]`** — Runs Eisenhower matrix on unprocessed tasks. Shows reasoning before saving. Reclassify Q1–Q4 if needed.
- **`/schedule [optional: quadrant or task]`** — Assigns dates by quadrant rules. Q1 = today, Q2 = specific future date with focus block, Q3 = delegate + check-in, Q4 = defer or eliminate.
- **`/execute [task + action]`** — Mark done, log progress, create follow-ups, or delegate. Prompts stakeholder logging when relevant.

### Skill (1)

- **`task-flow`** — Core domain knowledge: Eisenhower matrix rules, intake source handling, scheduling logic, delegation framework, and stakeholder memory patterns. Includes three reference files:
  - `references/eisenhower.md` — detailed quadrant rules with edge cases
  - `references/intake-sources.md` — source-specific extraction rules
  - `references/delegation-guide.md` — when and how to delegate

### Agent (1)

- **`task-prioritizer`** — Autonomous batch triage agent. Use it when you have many tasks to sort at once, or want a fast weekly priority sweep. Analyzes the full board and presents a ranked view for confirmation.

### Hooks (1)

- **`SessionStart`** — Automatically reads TASKS.md at session start and shows a brief summary: how many tasks are in each quadrant. Keeps you oriented without asking.

---

## Setup

No external configuration required. The plugin works out of the box using your workspace folder.

**Task board location**: `TASKS.md` in your selected workspace folder (created automatically on first `/intake`).

**Stakeholder memory**: This plugin integrates with the `productivity:memory-management` plugin (install separately if not already active). Used by `/schedule` and `/execute` to track delegation and follow-up commitments.

---

## Usage Examples

```
# Log a task from Slack
/intake Product manager just DMed me asking for a feature timeline by Thursday

# Log a meeting action item
/intake Post-mortem report for the deploy incident — CEO wants it before next board meeting

# Triage your backlog
/prioritize

# Schedule Q2 work for the week
/schedule Q2

# Mark a task done
/execute done Feature timeline sent to product

# Delegate and log the stakeholder
/execute delegate Incident post-mortem to Sarah (Eng Lead)

# Batch triage when overwhelmed
[type naturally: "I have 6 things piling up, help me triage"]
→ task-prioritizer agent activates automatically
```

---

## Future Integrations

This plugin is designed to grow. See `CONNECTORS.md` for planned integrations:
- **Email** (Gmail, Outlook) — auto-intake from inbox
- **Slack** — capture tasks from DMs and channel mentions
- **Jira / Asana / Linear** — sync tickets as intake sources
- **Mac Calendar** — schedule directly to calendar blocks

Use the `cowork-plugin-customizer` skill to activate connectors when they're available.

---

## Eisenhower Matrix Quick Reference

|  | Urgent | Not Urgent |
|--|--------|-----------|
| **Important** | Q1: Do now | Q2: Schedule |
| **Not Important** | Q3: Delegate | Q4: Eliminate |
