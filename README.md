# claude-eisenhower

**Stop losing track of what matters.** claude-eisenhower is a task management plugin for engineering leaders that captures work from anywhere, cuts through the noise using the Eisenhower matrix, and helps you delegate intelligently — without leaving your flow.

---

## What it does

Most task systems make you do the organizing. This one does it for you.

You describe what landed in your lap — a Slack message, an email, a meeting action item — and claude-eisenhower captures it, classifies it into one of four quadrants (do now, schedule, delegate, or cut), schedules it against your real calendar, and tracks it to completion. When you're ready to delegate, a weighted scoring engine finds the right person from your team based on domain expertise, capacity, and relationship.

Everything stays local. Your task board, stakeholder graph, and calendar data never leave your machine.

---

## The four phases

```
INTAKE → PRIORITIZE → SCHEDULE → EXECUTE
```

| Phase | Command | What happens |
|-------|---------|-------------|
| **Capture** | `/intake` | Describe any task in natural language — Claude extracts the title, source, requester, and urgency automatically |
| **Classify** | `/prioritize` | Each task gets sorted into Q1–Q4 with reasoning shown before anything is saved |
| **Schedule** | `/schedule` | Dates and actions assigned by quadrant: Q1 lands today, Q2 gets a focus block, Q3 goes to your best delegate, Q4 gets cut |
| **Close out** | `/execute` | Mark done, log progress, delegate, or spin up a follow-up — delegation history tracked automatically |

Plus `/scan-email` to pull actionable items directly from Apple Mail, and `/delegate` to find the right person for any task on demand.

---

## Delegation that actually works

When a task needs to go to someone else, claude-eisenhower scores your entire stakeholder graph and surfaces the best match — not just who's available, but who's right for the work.

**Scoring factors:**
- **Domain match** — does this person's area of expertise overlap with the task? (+3 per match)
- **Relationship** — direct reports score higher than peers; vendors score neutral
- **Capacity** — people you've marked as overloaded get a penalty; high-capacity teammates get a boost

The top candidate is shown with reasoning. If someone else is close, they're surfaced too. Low-capacity delegates get a warning. Tasks that require your sign-off get flagged before delegation is suggested.

Your stakeholder graph lives in `integrations/config/stakeholders.yaml` — a local, gitignored file you fill in once and update as your team changes.

**Alias resolution** — you can reference teammates the way you actually talk about them. If your team calls someone by their last name, initials, or a nickname, add those as lookup terms in their alias list. `/intake` will automatically normalize requester names before writing to your task board.

---

## Getting started

### 1. Copy the config templates

```bash
cd integrations/config/

cp calendar-config.md.example    calendar-config.md
cp email-config.md.example       email-config.md
cp task-output-config.md.example task-output-config.md
cp stakeholders.yaml.example     stakeholders.yaml
```

### 2. Fill in your values

| File | What to set |
|------|-------------|
| `calendar-config.md` | The exact name of your Mac Calendar |
| `email-config.md` | Your mail account name and inbox folder |
| `task-output-config.md` | Your Mac Reminders list name |
| `stakeholders.yaml` | Your team — names, roles, domains, capacity |

These files are gitignored and never committed. They stay on your machine.

### 3. Start capturing

Your task board (`TASKS.md`) is created automatically the first time you run `/intake`. From there, the workflow guides itself.

---

## Day-to-day usage

```
# Something just came in from Slack
/intake Product manager needs a feature timeline by Thursday

# Post-mortem from this morning's incident
/intake CEO wants a deploy post-mortem before the board meeting

# Triage everything that's piled up
/prioritize

# Schedule this week's Q2 work
/schedule Q2

# Mark something done
/execute done Feature timeline sent to product

# Hand off a task and log it
/execute delegate Incident post-mortem to Jordan (Eng Lead)

# Find the best person for a specific task
/delegate Review API contract for new vendor integration

# Overwhelmed? Let the agent triage for you
"I have 6 things piling up, help me sort them out"
→ task-prioritizer agent runs automatically

# Check your inbox for actionable emails
/scan-email

# Only pull compliance and training emails
/scan-email admin
```

---

## Integrations

| Integration | What it does | Config file |
|-------------|-------------|-------------|
| **Mac Calendar** | Checks real availability before scheduling; calculates working days for escalation | `calendar-config.md` |
| **Apple Mail** | `/scan-email` reads your inbox and classifies emails into Q1–Q3. Read-only — never marks messages read or moves them | `email-config.md` |
| **Mac Reminders** | After `/schedule` confirms a plan, tasks are pushed to Reminders automatically. Q3 tasks appear as check-in reminders with a delegate and due date | `task-output-config.md` |

The Reminders integration uses a swappable adapter — when you're ready to move to Jira, Asana, or Linear, the adapter handles the switch without changing how the rest of the plugin works. See `integrations/adapters/`.

---

## What's coming

- **Slack / Chat capture** — pull tasks directly from DMs and channel mentions instead of copy-pasting
- **Jira / Asana / Linear** — replace Mac Reminders with your team's tracker
- **GitHub integration** — capture PR review requests and assigned issues with full context
- **Weekly review** — one command to start the week: overdue delegations, calendar load, unprocessed tasks, and upcoming check-ins in a single view

See `ROADMAP.md` for the full plan.

---

## Eisenhower matrix

|  | Urgent | Not Urgent |
|--|--------|-----------|
| **Important** | **Q1** — Do it now | **Q2** — Schedule a focused block |
| **Not Important** | **Q3** — Delegate it | **Q4** — Cut it |

The matrix sounds simple. The hard part is applying it consistently under pressure, when everything feels urgent and important. That's what this plugin is for.
