---
description: Mark tasks done, log progress, or create follow-ups
argument-hint: [task title or "done" / "progress" / "followup"]
allowed-tools: Read, Write, Edit
---

You are running the EXECUTE phase of the Engineering Task Flow.

## Step 1: Load the task board

Read TASKS.md from the root of the user's mounted workspace folder.

If the file does not exist, inform the user: "No task board found. Nothing to execute yet."

## Step 2: Determine what the user wants to do

Parse $ARGUMENTS for intent:

- **"done [task]"** or **"complete [task]"** → Mark the task as completed
- **"progress [task]"** or **"update [task]"** → Log progress note on an in-flight task
- **"followup [task]"** or **"follow up [task]"** → Create a new intake task linked to this one
- **"delegate [task] to [person]"** → Move to Q3, record delegate and stakeholder
- Just a task name with no verb → Ask what they want to do with it

If no argument is provided, show a brief summary of all scheduled tasks and ask which one they're working on.

## Step 3: Handle each action

### Mark Done
1. **If the task is in Q4**: Do NOT move to `## Completed` immediately. Instead:
   - If the user explicitly confirms the task is being eliminated: move to `## Completed` and add `Done: [today's date] | Eliminated`
   - If the task was just classified Q4 this session: leave it in `## Q4 — Defer / Eliminate` with `Deferred: [today's date]` and note `Review on: [date 2 weeks out]`. Q4 tasks stage there first; they are not the same as done.
2. Move the task from its current quadrant to `## Completed`
2. Add `Done: [today's date]` to the task record
3. Remove the checkbox marker `[ ]` and replace with `[x]`
4. **If the task has `Delegate to: [alias]`** (it was a delegated Q3 task):
   - Update `memory/glossary.md` Stakeholder Follow-ups table: set the Status for this alias + task title row to `Resolved — [today's date]`
   - Update `memory/people/[alias-filename].md` delegation log row for this task to `Resolved — [today's date]`
   - Do NOT create a new Reminder or follow-up task
   - Confirm: "Delegation closed — [alias]'s entry marked resolved."
5. If a non-delegate stakeholder was waiting on this, remind: "Was [requester] expecting a notification when this was done?"
6. Offer to log a stakeholder update via the productivity:memory-management skill

### Log Progress
1. Find the task in the board
2. Append a progress note: `Progress [date]: [user's update]`
3. **If the task has `Delegate to: [alias]` AND the check-in date has passed**:
   - Treat "still in progress" as a missed check-in
   - Append to `## Unprocessed` in TASKS.md:
     ```
     [ INTAKE — [today's date] ]
     Title:       Follow up: [original task title] with [alias]
     Description: Delegation follow-up — [alias] reported still in progress as of [today's date]. Original check-in was [check-in date].
     Source:      Delegation follow-up
     Requester:   [alias]
     Urgency:     Check-in overdue
     Due date:    Not specified
     Status:      Unprocessed
     ```
   - Update `memory/glossary.md` Stakeholder Follow-ups: change the check-in date for this row to [today's date + 2 business days]
   - Update `memory/people/[alias-filename].md` delegation log: add progress note and new check-in date
   - Confirm: "Follow-up task created for [alias]. New check-in date: [date]."
4. Otherwise ask: "Any blockers? Should we adjust the due date?"

### Create Follow-Up
1. Create a new task record linked to the original:
   - Title: Follow-up: [original task title]
   - Source: Internal
   - Requester: Self
   - Description: What the follow-up action is
2. Add it to `## Unprocessed` for prioritization
3. Confirm: "Follow-up logged. Run /prioritize to assign it a quadrant."

### Delegate
1. Move task to Q3 section
2. Record delegate name in the task
3. Use productivity:memory-management to log:
   - Delegate name + role
   - What was handed off
   - Check-in date
4. Suggest check-in date (3–5 business days unless deadline is sooner)

## Step 4: Stakeholder wrap-up

After marking any task done or logging a delegation, check:
- Is there a stakeholder who should be notified?
- Is there a follow-up commitment to log in memory?

If yes: "Want me to log a stakeholder note for [name] so you can follow up?"

## Step 5: Weekly review prompt

If completing the last Q1 task, prompt: "Nice — your Q1 list is clear. Want to run /prioritize to pull anything from Q2 or review what's coming up?"
