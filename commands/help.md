---
description: First-run walkthrough and command index
argument-hint: (no arguments)
allowed-tools: Read
---

You are running the HELP command of the Engineering Task Flow.

This command gives a new user the full loop on synthetic data before they have to
trust the plugin with live work. It also serves as the canonical command index
for returning users. Issue #41 motivates it: without `/help`, first-run users hit
empty states across 11 commands with no map of where to start.

---

## Step 1: Detect first-run vs returning user

Check the workspace state:

- **First-run signal:** `TASKS.md` does not exist OR exists but contains zero
  task records across all four sections.
- **Returning signal:** `TASKS.md` exists with ≥1 task record.

Branch the response accordingly. Do not write anything to disk.

---

## Step 2A (first-run): The walkthrough

Render the following walkthrough verbatim. Do not auto-execute the commands —
the user runs them themselves so they see the real output and form a mental
model.

```
## Welcome to the Engineering Task Flow

You have an empty task board. Run this 4-command sequence on a synthetic task
to see the full loop end-to-end. Each step takes seconds.

─── 1. Capture ───────────────────────────────────────────
  /intake "Try out the task flow with a synthetic task"

  This creates a record in ## Inbox. Captures Title, Description, Source.

─── 2. Classify ──────────────────────────────────────────
  /prioritize

  Walks every Inbox task through the Eisenhower 2x2.
  Mark this one as Q2 (Important, Not Urgent) → it becomes Active.

─── 3. Plan ──────────────────────────────────────────────
  /schedule

  Picks a date for each Active task and assigns a concrete action.
  For the synthetic task, accept any date.

─── 4. Close the loop ────────────────────────────────────
  /execute done "Try out the task flow with a synthetic task"

  Marks the task complete and moves it to ## Done.

That's the whole loop. Capture → Classify → Plan → Execute.

When you're ready for real work:
  - /intake to capture, or /scan-email to import from your inbox
  - /today for a daily briefing
  - /plan-week (Monday) and /review-week (Friday) for the weekly rhythm
  - /trends for a 4-week behavioral retro
  - /help any time
```

Then proceed to Step 3 (command index).

---

## Step 2B (returning): Skip the walkthrough

Render a one-line acknowledgement and skip directly to the index:

```
You have an active task board. Skipping the synthetic-task walkthrough.
Run /help anytime for this index, or /today for a current snapshot.
```

Then proceed to Step 3 (command index).

---

## Step 3: Command index

Render the full command index, grouped by lifecycle phase. Use the exact phrasing
below — these mirror the `description:` field of each command file:

```
## Command index

─── Capture ──────────────────────────────────────────────
  /intake        Capture a new task from natural language
  /scan-email    Import actionable tasks from Apple Mail
  /quick         One-shot capture + classify + schedule

─── Classify ─────────────────────────────────────────────
  /prioritize    Run Inbox tasks through Eisenhower 2x2
  /delegate      Mark a task delegated with check-by date

─── Plan ─────────────────────────────────────────────────
  /schedule      Pick a date + action for each Active task
  /plan-week     Monday weekly planning rhythm

─── Act ──────────────────────────────────────────────────
  /today         Daily briefing — what needs attention now
  /execute       Mark a task done, delegated, or eliminated

─── Reflect ──────────────────────────────────────────────
  /review-week   Friday weekly review
  /status        Org-wide status — projects, delegates, risks
  /status awaiting  External-blocker rollup
  /trends        4-week behavioral retro

─── Setup ────────────────────────────────────────────────
  /setup         First-time configuration (stakeholders, adapters)
  /help          This page
```

---

## Step 4: Done

The command is complete. It writes nothing. The user drives any follow-on
commands.
