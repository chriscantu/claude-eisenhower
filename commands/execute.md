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
1. Move the task from its current quadrant to `## Completed`
2. Add `Done: [today's date]` to the task record
3. Remove the checkbox marker `[ ]` and replace with `[x]`
4. If a stakeholder was waiting on this, remind: "Was [requester/delegate] expecting a notification when this was done?"
5. Offer to log a stakeholder update via the productivity:memory-management skill

### Log Progress
1. Find the task in the board
2. Append a progress note: `Progress [date]: [user's update]`
3. Ask: "Any blockers? Should we adjust the due date?"

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
