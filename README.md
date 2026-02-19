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

### Commands (5)

- **`/intake [describe task]`** — Capture a new task in free-form natural language. Extracts title, source, requester, and urgency automatically. Appends to TASKS.md.
- **`/prioritize [optional: task or all]`** — Runs Eisenhower matrix on unprocessed tasks. Shows reasoning before saving. Reclassify Q1–Q4 if needed.
- **`/schedule [optional: quadrant or task]`** — Assigns dates by quadrant rules. Q1 = today, Q2 = specific future date with focus block, Q3 = delegate + check-in, Q4 = defer or eliminate.
- **`/execute [task + action]`** — Mark done, log progress, create follow-ups, or delegate. Prompts stakeholder logging when relevant.
- **`/scan-email [optional: admin | escalations | surveys | all]`** — Reads Apple Mail (Procore/Inbox only) for actionable emails. Read-only — never affects read status or moves messages. Classifies into Q1–Q3 using your Eisenhower rules and Mac Calendar availability. Presents a confirmation table before writing anything to TASKS.md.

### Skill (1)

- **`claude-eisenhower`** — Core domain knowledge: Eisenhower matrix rules, intake source handling, scheduling logic, delegation framework, and stakeholder memory patterns. Includes four reference files:
  - `references/eisenhower.md` — detailed quadrant rules with edge cases
  - `references/intake-sources.md` — source-specific extraction rules including Apple Mail (Procore/Inbox)
  - `references/delegation-guide.md` — when and how to delegate
  - `references/email-patterns.md` — sender/subject/body pattern library for the three Procore action categories

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

# Scan Procore inbox for actionable emails
/scan-email

# Scan only compliance/training emails
/scan-email admin
```

---

## Active Integrations

- **Apple Mail (Procore/Inbox)** — `/scan-email` reads your Procore inbox and auto-classifies actionable emails into Q1–Q3. Read-only.
- **Mac Calendar** — used by `/schedule` and `/scan-email` to check availability and calculate real working days for Q2→Q1 escalation.

## Future Integrations

This plugin is designed to grow. See `CONNECTORS.md` for planned integrations:
- **Slack / Chat** — capture tasks from DMs and channel mentions
- **Jira / Asana / Linear** — sync tickets as intake sources
- **Source Control** (GitHub / GitLab) — capture PR review requests and issues

Use the `cowork-plugin-customizer` skill to activate connectors when they're available.

---

## Eisenhower Matrix Quick Reference

|  | Urgent | Not Urgent |
|--|--------|-----------|
| **Important** | Q1: Do now | Q2: Schedule |
| **Not Important** | Q3: Delegate | Q4: Eliminate |
