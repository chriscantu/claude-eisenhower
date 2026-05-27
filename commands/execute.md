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

## Step 2b: Match the task and confirm before mutating

`/execute` is destructive — it moves records between sections, fires the
task-output adapter (e.g., Reminders), and invokes memory-manager. **There is
no undo.** Once confirmed, the change is committed and side-effects fire.
The confirmation step below is the last gate.

1. **Scan TASKS.md** for tasks matching the free-text portion of $ARGUMENTS
   (case-insensitive substring match against the `Title:` field across
   `## Active`, `## Delegated`, and `## Inbox` sections).

2. **If exactly one match:** Display the matched record verbatim before
   any mutation. Preview shape:

   ```
   Matched task:
     Title:      {title}
     State:      {state}
     Owner:      {owner or "self"}
     Priority:   {Q1·Do | Q2·Schedule | Q3·Delegate | Q4·Cut}
     Scheduled:  {scheduled date or "—"}
     Check-by:   {check-by date or "—"}

   Confirm {done | progress | followup | delegate} for this task? (yes / no / cancel)
   ```

   Do NOT proceed to Step 3 until the user explicitly confirms with
   "yes", "confirm", "go ahead", or equivalent.

3. **If 2+ matches (multiple match scenario):** Do NOT silently pick. List
   every match with a number and force a disambiguation pick:

   ```
   Multiple tasks match "{free text}":
     1. {title}  [{state}]  Scheduled: {date}
     2. {title}  [{state}]  Scheduled: {date}
     3. {title}  [{state}]  Scheduled: {date}

   Which one? (pick by number, or "cancel")
   ```

   After the user picks a number, render the matched-record preview
   from (2) and require explicit confirmation before any mutation.

4. **If zero matches:** Surface the miss explicitly — "No task matches
   '{free text}'. Closest titles: ..." — and ask the user to refine
   their input. Do NOT create a new task as a fallback.

After explicit confirmation, proceed to Step 3 and run the action.

## Step 3: Handle each action

### Mark Done
1. **If the task has `Priority: Q4`**: Do NOT move to `## Done` immediately. Instead:
   - If the user explicitly confirms the task is being eliminated: move to `## Done` and add `Done: [today's date] | Eliminated — Q4 cut`
   - If the task was just classified Q4 this session: leave it in `## Active` with `Deferred: [today's date]` and note `Review on: [date 2 weeks out]`. Q4 tasks stage in `## Active` first; they are not the same as done.
2. Move the task to `## Done`
2. Add `Done: [today's date]` to the task record
3. Remove the checkbox marker `[ ]` and replace with `[x]`
4. **If the task has `Delegate to: [alias]`** (it was a delegated Q3 task):
   - Invoke the memory-manager skill:
     `resolve-delegation — alias: [alias], task: [task title], resolved_date: [today's date]`
   - Do NOT create a new Reminder or follow-up task
   - Confirm: "Delegation closed — [alias]'s entry marked resolved."
5. **Sync to task output adapter** (Reminders or configured system):
   - Resolve `plugin_root` following `skills/core/references/plugin-root-resolution.md`. Read `config/task-output-config.md` for: the active adapter and adapter settings
   - If the active adapter is still a placeholder (`~~task_output`) → skip silently
   - If the active adapter is `reminders`:
     - Read `list_name` from the `### reminders` block
     - Run: `osascript {plugin_root}/scripts/complete_reminder.applescript {title} {list_name}`
     - **For Q3 tasks** that were pushed as check-in reminders, the title in Reminders was prefixed: "Check in: [delegate] re: [original title]". Use that prefixed form as the lookup title.
     - Interpret the result:
       - `success:` → append `Synced: Reminders completed — [today's date]` to the task record in TASKS.md
       - `success: ... (already completed)` → append `Synced: Reminders already complete — [today's date]`
       - `skipped:` → append `Synced: skipped — not found in Reminders (may not have been pushed)`
       - `error:` → append `Synced: failed — [error message]` and show a non-blocking warning: "⚠ Could not mark reminder complete: [error message]"
   - This step is **non-blocking** — a failed or skipped sync does not prevent task completion in TASKS.md
6. If a non-delegate stakeholder was waiting on this, remind: "Was [requester] expecting a notification when this was done?"
7. Offer to log a stakeholder update via the memory-manager skill

If the user accepted the offer, invoke the memory-manager skill:
`log-delegation — alias: [requester/alias], task: [task title], check_in_date: [agreed follow-up date]`

### Log Progress
1. Find the task in the board
2. Append a progress note: `Progress [date]: [user's update]`
3. **If the task has `Delegate to: [alias]` AND the check-in date has passed**:
   - Treat "still in progress" as a missed check-in
   - Append to `## Inbox` in TASKS.md:
     ```
     [ INTAKE — [today's date] ]
     Title:       Follow up: [original task title] with [alias]
     Description: Delegation follow-up — [alias] reported still in progress as of [today's date]. Original check-in was [check-in date].
     Source:      Delegation follow-up
     Requester:   [alias]
     Urgency:     Check-in overdue
     Due date:    Not specified
     State:       Inbox
     ```
   - Invoke the memory-manager skill:
     `update-checkin — alias: [alias], task: [original task title], new_check_in_date: [today's date + 2 business days]`
   - Confirm: "Follow-up task created for [alias]. New check-in date: [date]."
4. Otherwise ask: "Any blockers? Should we adjust the due date?"

### Create Follow-Up
1. Create a new task record linked to the original:
   - Title: Follow-up: [original task title]
   - Source: Internal
   - Requester: Self
   - Description: What the follow-up action is
2. Add it to `## Inbox` for prioritization
3. Confirm: "Follow-up logged. Run /prioritize to assign it a quadrant."

### Delegate
1. Set `Priority: Q3` and `State: Delegated` on the task record (task stays in `## Active`)
2. Record `Delegate to: [alias]` and `Check-by: [date]` in the task
3. Invoke the memory-manager skill:
   `log-delegation — alias: [delegate alias], task: [task title], check_in_date: [check-in date]`
4. Suggest check-in date (3–5 business days unless deadline is sooner)

## Step 4: Stakeholder wrap-up

After marking any task done or logging a delegation, check:
- Is there a stakeholder who should be notified?
- Is there a follow-up commitment to log in memory?

If yes: "Want me to log a stakeholder note for [name] so you can follow up?"

## Step 5: Weekly review prompt

If completing the last Q1 task, prompt: "Nice — your Q1 list is clear. Want to run /prioritize to pull anything from Q2 or review what's coming up?"
