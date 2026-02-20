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
| — | `/delegate [task]` | Suggest the best delegate from your stakeholder graph using weighted matching |

---

## Components

### Commands (5)

- **`/intake [describe task]`** — Capture a new task in free-form natural language. Extracts title, source, requester, and urgency automatically. Appends to TASKS.md.
- **`/prioritize [optional: task or all]`** — Runs Eisenhower matrix on unprocessed tasks. Shows reasoning before saving. Reclassify Q1–Q4 if needed.
- **`/schedule [optional: quadrant or task]`** — Assigns dates by quadrant rules. Q1 = today, Q2 = specific future date with focus block, Q3 = delegate + check-in, Q4 = defer or eliminate.
- **`/execute [task + action]`** — Mark done, log progress, create follow-ups, or delegate. Prompts stakeholder logging when relevant.
- **`/scan-email [optional: admin | escalations | surveys | all]`** — Reads Apple Mail (configured account/inbox) for actionable emails. Read-only — never affects read status or moves messages. Classifies into Q1–Q3 using your Eisenhower rules and Mac Calendar availability. Presents a confirmation table before writing anything to TASKS.md.

### Skill (1)

- **`claude-eisenhower`** — Core domain knowledge: Eisenhower matrix rules, intake source handling, scheduling logic, delegation framework, and stakeholder memory patterns. Includes four reference files:
  - `references/eisenhower.md` — detailed quadrant rules with edge cases
  - `references/intake-sources.md` — source-specific extraction rules including Apple Mail (configured account)
  - `references/delegation-guide.md` — when and how to delegate
  - `references/email-patterns.md` — sender/subject/body pattern library for the three email action categories

### Agent (1)

- **`task-prioritizer`** — Autonomous batch triage agent. Use it when you have many tasks to sort at once, or want a fast weekly priority sweep. Analyzes the full board and presents a ranked view for confirmation.

### Hooks (1)

- **`SessionStart`** — Automatically reads TASKS.md at session start and shows a brief summary: how many tasks are in each quadrant. Keeps you oriented without asking.

### Delegation Engine

When you run `/execute delegate [task]` or ask Claude to suggest a delegate, the plugin:

1. Reads your local `integrations/config/stakeholders.yaml` (gitignored — never committed)
2. Scores each stakeholder using a weighted algorithm:
   - **Domain match** — +3 per overlapping domain keyword
   - **Relationship** — direct_report +2, peer +1, vendor/partner ±0
   - **Capacity** — high +2, medium +1, low −1
3. Returns the top candidate (and any runner-up within 2 points of the top score)
4. Flags low-capacity delegates with a warning
5. Detects authority language in task descriptions and adds a flag

Your stakeholder graph lives in `integrations/config/stakeholders.yaml`. Copy `stakeholders.yaml.example` to get started — it uses `FIRST_LAST` placeholders so no real data is ever committed.

**Run regression tests**: `cd scripts && npm test` — 24 tests covering all delegation scenarios.

---

## Setup

### 1. Configure your integrations

Config files live in `integrations/config/`. Each integration has a tracked
`.example` template and a gitignored actual file you create locally.

```bash
cd integrations/config/

cp calendar-config.md.example   calendar-config.md
cp email-config.md.example      email-config.md
cp task-output-config.md.example task-output-config.md
cp stakeholders.yaml.example      stakeholders.yaml
```

Then edit each file:

| File | What to set |
|------|-------------|
| `calendar-config.md` | `calendar_name` — exact name of your Mac Calendar |
| `email-config.md` | `account_name` — your mail account; `inbox_name` — usually `INBOX` |
| `task-output-config.md` | `list_name` — your Reminders list name (created automatically if missing) |
| `stakeholders.yaml` | Your team — alias, role, domains, relationship, capacity_signal |

These files are gitignored and never committed — they stay local to your machine.

### 2. Task board

**Location**: `TASKS.md` in your selected workspace folder (created automatically on first `/intake`). Also gitignored.

### 3. Stakeholder memory

This plugin integrates with the `productivity:memory-management` plugin (install separately if not already active). Used by `/schedule` and `/execute` to track delegation and follow-up commitments.

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

# Scan configured inbox for actionable emails
/scan-email

# Scan only compliance/training emails
/scan-email admin
```

---

## Active Integrations

- **Apple Mail** — `/scan-email` reads your configured inbox and auto-classifies actionable emails into Q1–Q3. Read-only. Configure account and inbox in `integrations/config/email-config.md`.
- **Mac Calendar** — used by `/schedule` and `/scan-email` to check availability and calculate real working days for Q2→Q1 escalation. Configure calendar name in `integrations/config/calendar-config.md`.
- **Mac Reminders** — `/schedule` automatically pushes confirmed Q1, Q2, and Q3 tasks to Mac Reminders after saving to TASKS.md. Q3 tasks are pushed as check-in reminders ("Check in: [delegate] re: [task]") with a due date 3–5 business days out. Write-only, non-blocking. Powered by a swappable adapter — see `integrations/adapters/` to switch to Asana, Jira, or Linear when ready. Configure list name in `integrations/config/task-output-config.md`.

## Future Integrations

This plugin is designed to grow. See `CONNECTORS.md` for planned integrations:
- **Slack / Chat** — capture tasks from DMs and channel mentions
- **Jira / Asana / Linear** — replace the Mac Reminders adapter in `integrations/adapters/` to push tasks directly to your team's tracker
- **Source Control** (GitHub / GitLab) — capture PR review requests and issues

Use the `cowork-plugin-customizer` skill to activate connectors when they're available.

---

## Eisenhower Matrix Quick Reference

|  | Urgent | Not Urgent |
|--|--------|-----------|
| **Important** | Q1: Do now | Q2: Schedule |
| **Not Important** | Q3: Delegate | Q4: Eliminate |
