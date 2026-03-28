# claude-eisenhower

**Stop losing track of what matters.** claude-eisenhower is a task management plugin for engineering leaders that captures work from anywhere, cuts through the noise using the Eisenhower matrix, and helps you delegate intelligently — without leaving your flow.

---

## What it does

Most task systems make you do the organizing. This one does it for you.

You describe what landed in your lap — a Slack message, an email, a meeting action item — and claude-eisenhower captures it, classifies it into one of four quadrants (do now, schedule, delegate, or cut), schedules it against your real calendar, and tracks it to completion. When you're ready to delegate, a weighted scoring engine finds the right person from your team based on domain expertise, capacity, and relationship.

Everything stays local. Your task board, stakeholder graph, and calendar data never leave your machine.

---

## The workflow

```
                        ┌─────────────────┐
            ┌──────────▶│     INTAKE      │◀─────────────┐
            │           │    /intake      │              │
            │           └────────┬────────┘              │
            │                    │                       │
    follow-ups &           classify tasks          new work
    check-ins              Q1 / Q2 / Q3 / Q4      from email
            │                    │                       │
            │           ┌────────▼────────┐        ┌─────┴──────┐
            │           │   PRIORITIZE    │        │ SCAN EMAIL │
            │           │  /prioritize    │        │ /scan-email│
            │           └────────┬────────┘        └────────────┘
            │                    │
            │          ┌─────────┴──────────┐
            │          │                    │
            │   ┌──────▼──────┐    ┌────────▼───────┐
            │   │  SCHEDULE   │    │    DELEGATE     │
            │   │  /schedule  │    │   /delegate     │
            │   │  Q1 & Q2    │    │      Q3         │
            │   └──────┬──────┘    └────────┬────────┘
            │          │                    │
            │          └─────────┬──────────┘
            │                    │
            │           ┌────────▼────────┐
            └───────────│     EXECUTE     │
                        │    /execute     │
                        │  done · progress│
                        │  delegate · follow-up
                        └─────────────────┘
```

| Phase | Command | What happens |
|-------|---------|-------------|
| **Capture** | `/intake` | Describe any task in natural language — Claude extracts the title, source, requester, and urgency automatically |
| **Classify** | `/prioritize` | Each task gets sorted into Q1–Q4 with reasoning shown before anything is saved |
| **Schedule** | `/schedule` | Dates and actions assigned by quadrant: Q1 lands today, Q2 gets a focus block, Q3 goes to your best delegate, Q4 gets cut |
| **Close out** | `/execute` | Mark done, log progress, delegate, or spin up a follow-up — delegation history tracked automatically |
| **Delegate** | `/delegate` | Ad-hoc: score and confirm a delegate for any task on demand — writes a full Q3 entry, pushes a Reminder, and logs memory in one step |
| **Email feed** | `/scan-email` | Scans Apple Mail and surfaces actionable emails as intake candidates — read-only |

---

## Planning & visibility

Once the workflow is running, these commands help you stay on top of it.

```
  Monday            Daily              Friday
┌──────────┐    ┌──────────┐    ┌──────────────┐
│/plan-week│───▶│  /today  │───▶│ /review-week │
│ commit   │    │ briefing │    │  retrospect  │
└──────────┘    └──────────┘    └──────────────┘
                 /status (any time)
```

| Command | What it does |
|---------|-------------|
| `/plan-week` | Propose commitments for the week based on carryover, priorities, and calendar capacity |
| `/today` | Daily briefing — what's on your plate, what's overdue, delegation check-ins due |
| `/review-week` | Friday retrospective — what shipped, what slipped, throughput trends |
| `/status` | Org-wide status by project — health signals, risks, delegation state |

The plugin also works in the background: every session starts with a structured briefing that surfaces overdue tasks and delegation check-ins automatically — no command needed.

---

## Delegation that actually works

When a task needs to go to someone else, claude-eisenhower scores your entire stakeholder graph and surfaces the best match — not just who's available, but who's right for the work.

**Scoring factors:**
- **Domain match** — does this person's area of expertise overlap with the task? (+3 per match)
- **Relationship** — direct reports score higher than peers; vendors score neutral
- **Capacity** — people you've marked as overloaded get a penalty; high-capacity teammates get a boost

The top candidate is shown with reasoning. If someone else is close, they're surfaced too. Low-capacity delegates get a warning. Tasks that require your sign-off get flagged before delegation is suggested.

Your stakeholder graph lives in `config/stakeholders.yaml` — a local, gitignored file you fill in once and update as your team changes.

**Alias resolution** — you can reference teammates the way you actually talk about them. If your team calls someone by their last name, initials, or a nickname, add those as lookup terms in their alias list. `/intake` will automatically normalize requester names before writing to your task board.

---

## Getting started

> **Where do the slash commands work?**
> All commands (`/intake`, `/scan-email`, `/schedule`, etc.) are **Claude Code** slash commands. They appear in Claude Code's `/` command menu after the plugin is installed there. They are not available as Cowork slash commands — Cowork uses a separate skill system.

### 1. Install the plugin in Claude Code

Download the latest `.plugin` file from [GitHub Releases](https://github.com/chriscantu/claude-eisenhower/releases).

Install it in **Claude Code**: open your Claude Code settings, go to **Plugins**, and add the `.plugin` file. Once installed, all commands will appear when you type `/` in any Claude Code session.

### 2. Run setup

```
/setup
```

A 2-minute conversational flow walks you through connecting your Mac Calendar, Apple Mail account, and Reminders list. No manual file editing required.

### 3. Start capturing

```
/intake Product manager needs a feature timeline by Thursday
```

Your task board (`TASKS.md`) is created automatically on first use. From there, the workflow guides itself.

> **Want to configure manually?** Config templates are in `config/*.example`. Copy each one, remove the `.example` suffix, and fill in your values. Run `/setup` at any time to reconfigure conversationally.

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

# Monday morning — plan the week
/plan-week

# Quick pulse — what needs attention right now?
/today

# Friday — what shipped, what slipped?
/review-week

# Org status for your supervisor
/status
```

---

## Integrations

| Integration | What it does | Config file |
|-------------|-------------|-------------|
| **Mac Calendar** | Checks real availability before scheduling; calculates working days for escalation | `calendar-config.md` |
| **Apple Mail** | `/scan-email` reads your inbox and classifies emails into Q1–Q3. Read-only — never marks messages read or moves them | `email-config.md` |
| **Mac Reminders** | After `/schedule` confirms a plan, tasks are pushed to Reminders automatically. Q3 tasks appear as check-in reminders with a delegate and due date | `task-output-config.md` |

The Reminders integration uses a swappable adapter — when you're ready to move to Jira, Asana, or Linear, the adapter handles the switch without changing how the rest of the plugin works. See `adapters/`.

---

## What's coming

- **Slack / Chat capture** — pull tasks directly from DMs and channel mentions instead of copy-pasting
- **Jira / Asana / Linear** — replace Mac Reminders with your team's tracker
- **GitHub integration** — capture PR review requests and assigned issues with full context

See `ROADMAP.md` for the full plan.

---

## Eisenhower matrix

|  | Urgent | Not Urgent |
|--|--------|-----------|
| **Important** | **Q1** — Do it now | **Q2** — Schedule a focused block |
| **Not Important** | **Q3** — Delegate it | **Q4** — Cut it |

The matrix sounds simple. The hard part is applying it consistently under pressure, when everything feels urgent and important. That's what this plugin is for.
