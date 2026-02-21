---
description: Delegate a task directly — score candidates, confirm, and write a Q3 entry to TASKS.md
argument-hint: [task title or description]
allowed-tools: Read, Write, Edit
---

You are running the DELEGATE direct entry point for the claude-eisenhower plugin.

This command bypasses the full intake → prioritize → schedule chain. It is designed
for ad-hoc delegation: a task that arrives mid-session and needs an owner immediately.

A confirmed run produces a complete Q3 task record in TASKS.md, pushes a check-in
Reminder, and logs a follow-up memory entry — no `/schedule` run needed.

---

## Config check

Before doing anything else, check that `integrations/config/stakeholders.yaml` exists.

If it does not exist → stop and say:
> "I need a stakeholders file before I can score delegation candidates. Would you like me to create a starter file now? You'll fill in your team's details after setup."

If yes → run the `/setup` command (stakeholders step only), then resume `/delegate` when complete.
If no → stop and tell the user: "You can run /setup at any time to create the stakeholders file. /delegate requires it to score candidates."

## Step 1: Resolve the task input

If $ARGUMENTS is provided, treat it as the task title (and optionally description,
if the user passed both separated by " — " or on separate lines).

If $ARGUMENTS is empty, prompt:
1. "What's the task title?"
2. "Any additional context — description, deadline, or requester?" (optional)

Proceed with whatever the user provides. Do not require intake first.

---

## Step 2: Authority flag check

Before scoring, scan the task title and description for authority-sensitive language:
- "requires your sign-off"
- "executive decision"
- "personnel decision"
- "sensitive communication on your behalf"

If any match (case-insensitive):

> ⚠ This task may require your authority — are you sure you want to delegate it?

Ask: "Confirm delegation, or should this be reclassified as Q1 instead?"

- If the user says Q1: stop here. Say "Run /intake or /prioritize to add this as a Q1 task." Do NOT write to TASKS.md.
- If the user confirms delegation: note the override and continue.

---

## Step 3: Load the stakeholder graph and score

Read `integrations/config/stakeholders.yaml` from `~/repos/claude-eisenhower/`.

**If the file does not exist:**
> No stakeholder graph found. Copy `integrations/config/stakeholders.yaml.example`
> to `stakeholders.yaml` and fill in your delegates to enable scoring.

Ask: "Who should own this?" Accept a manually-entered alias and skip to Step 5.

**If the file exists but the stakeholders list is empty:**
> Stakeholder graph is empty — no delegates configured.

Ask: "Who should own this?" Accept a manually-entered alias and skip to Step 5.

**If the file exists and has delegates:**
Run the scoring CLI:

```
do shell script "cd ~/repos/claude-eisenhower/scripts && npx ts-node match-delegate.ts " & quoted form of taskTitle & " " & quoted form of taskDescription & " 2>&1"
```

Parse the JSON output. The `status` field will be one of:
- `match` — one or more candidates found
- `no_match` — no domain keyword scored above 0
- `empty_graph` — graph empty (handled above)
- `no_graph` — file missing (handled above)

---

## Step 4: Present the scoring result

**If `status: match`:**

```
Suggested delegate: [candidates[0].alias] ([candidates[0].role])
Reason: domain match on [matched_domains.join(", ")], relationship: [relationship], capacity: [capacity_signal]
```

If a runner-up exists (candidates[1] is within 2 points of candidates[0]):
```
Runner-up: [candidates[1].alias] ([candidates[1].role])
```

If `capacity_warning` is true for the top candidate, append:
> Note: [alias] is currently showing low capacity — confirm they can take this on.

Ask: "Delegate this to [alias]? Or would you like to assign someone else?"

**If `status: no_match`:**
> No clear domain match in your stakeholder graph.

Ask: "Who should own this?" Accept a manually-entered alias. If the input does not
match any alias in the graph, note: "That alias isn't in your stakeholder graph —
you can add them to stakeholders.yaml later. Proceeding with [input] as the delegate."

---

## Step 5: Confirm before writing — never auto-assign

Once a delegate is identified (scored or manual), present the confirmation prompt:

```
Ready to delegate:
  Task:       [title]
  Delegate:   [alias]
  Check-in:   [2–3 business days from today — skip weekends]
  TASKS.md:   Will write a Q3 entry
  Reminders:  Will push "Check in: [alias] re: [title]" if adapter is configured

Confirm? (yes / assign someone else / make this Q1 instead)
```

Do NOT write anything until the user says yes (or equivalent: "confirm", "go ahead",
"looks good").

If the user says "assign someone else": return to Step 4 and ask who.
If the user says "make this Q1": stop. Say "Run /intake or /prioritize to log this as Q1."

---

## Step 6: Write the Q3 task record to TASKS.md

Read TASKS.md from the workspace root. If the file does not exist, create it with
these section headers before appending:

```markdown
## Q1 — Do Now

## Q2 — Schedule

## Q3 — Delegate

## Q4 — Eliminate

## Unprocessed

## Completed
```

Append the following record to the `## Q3 — Delegate` section:

```
[ Q3 — DELEGATE — {TODAY} ]
Title:           {task title}
Description:     {task description or "(none provided)"}
Source:          Direct delegation
Requester:       Self
Urgency:         Delegated
Quadrant:        Q3 — Delegate if possible
Delegate to:     {confirmed alias}
Check-in date:   {check-in date — 2–3 business days, skip weekends}
Scheduled:       {today's date}
Action:          Delegated — check in {check-in date}
```

Where `{TODAY}` and `{Scheduled}` are today's date in YYYY-MM-DD format.

---

## Step 7: Push to task output adapter

Read `integrations/config/task-output-config.md` for the active adapter.

If the adapter is not configured (`~~task_output` or missing), skip this step silently.

If configured, push via `scripts/push_reminder.applescript`:
- **Title**: `"Check in: {alias} re: {task title}"`
- **Due date**: check-in date (YYYY-MM-DD)
- **Priority**: medium
- **Quadrant**: Q3

On success: update the task record with:
```
Synced: Reminders (Eisenhower List) — {today's date}
```

On failure:
```
Synced: failed — {reason}
```

Show a one-line result: `✓ Check-in pushed to Reminders` or `⚠ Reminder push failed — [reason]. TASKS.md entry is saved.`

---

## Step 8: Log to memory

Create a follow-up memory entry via `productivity:memory-management`:
- **Stakeholder**: delegate alias and role
- **What was delegated**: task title and brief description
- **Check-in date**: the confirmed date
- **Status**: pending

---

## Step 9: Confirm to the user

```
Delegated ✓
  Task:       {title}
  Owner:      {alias}
  Check-in:   {check-in date}
  TASKS.md:   Q3 entry written
  Reminders:  {push result}
  Memory:     Follow-up logged for {alias}

Run /execute when {alias} reports back, or /schedule to review all open delegations.
```

---

## Edge cases

**Task already exists in TASKS.md**: Before Step 3, scan TASKS.md for a close title
match. If found, ask: "A task titled '[title]' already exists in [{quadrant}]. Do you
want to delegate the existing task or create a new Q3 entry?"

**User provides a name not in the graph at Step 4**: Record the literal name as the
`Delegate to:` alias and note in the confirmation: "This alias isn't in your stakeholder
graph — scoring was not used."

**Synced field already present on an existing Q3 task**: If the user is re-delegating
a task that already has `Synced:` set, warn: "This task was already delegated and synced.
Confirm you want to create a duplicate entry, or update the existing one?"

**No TASKS.md write permission**: If the write fails, surface the error clearly and
do not attempt the Reminders push. The user must resolve file access before retrying.
