---
description: Schedule prioritized tasks and assign dates
argument-hint: [optional: quadrant (Q1/Q2/Q3/Q4) or task title]
allowed-tools: Read, Write, Edit
---

You are running the SCHEDULE phase of the Engineering Task Flow.

## Step 1: Load the task board

Read TASKS.md from the root of the user's mounted workspace folder.
If the file does not exist or has no prioritized tasks, inform the user: "No prioritized tasks found. Run /prioritize first."

## Step 1b: Surface overdue delegations and stale capacity signals

### Part A — Overdue check-ins

Scan TASKS.md for Q3 tasks that have a `Check-in date:` field set to today or earlier and are not yet in the `## Completed` section.

If any exist, surface them first:
"You have [N] delegated item(s) due for check-in today or overdue:"
- List each: delegate alias, task title, original check-in date

Ask: "Do you want to mark any of these resolved, or create a follow-up? I'll handle the new items after."

Process any responses (mark done → /execute flow, create follow-up → append to Unprocessed), then continue.

### Part B — Capacity signal review

After handling overdue check-ins, scan all open Q3 tasks (not in `## Completed`) for delegates who may be overloaded.

For each delegate alias, collect all open Q3 tasks delegated to them. Count business days elapsed since each task's `Scheduled:` date (skip Saturdays and Sundays).

Flag any delegate who meets **both** conditions:
- **2 or more** open delegations assigned to them, AND
- At least one of those delegations has been open for **more than 5 business days**

If any delegates are flagged, surface a single grouped prompt **after** the overdue check-in resolution:

```
⚠ Capacity check — the following delegate(s) have 2+ open items aged over 5 business days:
  • [alias] — [N] open delegations (oldest: [X] business days)
    Tasks: [task title 1], [task title 2]
```

Then ask: "Consider reviewing [alias]'s capacity signal in stakeholders.yaml before delegating more to them. Update it now, or continue scheduling?"

- If the user wants to update: remind them to edit `integrations/config/stakeholders.yaml` and set `capacity_signal` to `low`, `medium`, or `high`. Do NOT edit the file — the user owns it.
- If the user says continue: note it and proceed to the main schedule flow.

**Do not block scheduling** — this is an advisory prompt, not a gate. If the user ignores it or says continue, proceed normally.

**Threshold**: 5 business days, 2+ open delegations. Both conditions must be met to surface the prompt. A delegate with 1 open task (no matter how old) is not flagged. A delegate with 2 tasks open for 3 days each is not flagged.

## Step 2: Determine scope

If $ARGUMENTS specifies a quadrant (Q1, Q2, Q3, Q4), schedule only tasks in that quadrant.
If $ARGUMENTS specifies a task title, schedule only that task.
If no argument, schedule all prioritized tasks that don't yet have a date assigned.

## Step 3: Apply scheduling rules — these are strict defaults, not suggestions

**Q1 — Urgent + Important → Scheduled: TODAY**
- Assign today's date automatically. Do not propose an alternative date.
- Mark as `[CRITICAL]` in the task record.
- No questions needed — just confirm it's on today's list.

**Q2 — Important, Not Urgent → Propose 1–2 business days out as a focus block**
- Calculate 1–2 business days from today (skip weekends).
- Propose a specific date and a 90-minute focus block window (e.g., "Tuesday Feb 20 — 90-min focus block").
- Do NOT say "sometime next week" or leave the date vague.
- Ask: "Does [specific date] work for a focus block, or would [+1 day] be better?"
- The user picks; you lock it in.

**Q3 — Urgent, Not Important → Confirm delegate + set check-in date**
- Do NOT assign a do-date for the user. This task should NOT be on their plate.
- See Step 3b below for delegate confirmation flow.
- Once a delegate is confirmed, assign a check-in date 2–3 business days out.
- Frame the output as: "Delegated to [alias] — check in [date]."

**Q4 — Not Urgent, Not Important → Cut it**
- Default action is to remove it from the active board entirely.
- Do NOT offer to defer it or set a review date. Q4 tasks should be eliminated.
- Move to Completed with note: `Eliminated — Q4 cut [today's date]`.
- If the user pushes back and insists on keeping it, allow a single "Review on: [date 4+ weeks out]" entry, but note: "Keeping Q4 tasks creates noise — revisit only if something changes."

## Step 3b: For each Q3 task — confirm or assign the delegate

For every Q3 task being scheduled:

1. **Check the task record for an existing delegate suggestion**:

   - If the record has `Suggested delegate: [alias]` (set at prioritize time):
     Show: "Delegate: [alias] (suggested at prioritize)"
     Ask: "Confirm [alias] as the delegate, or assign someone else?"

   - If the record has `Delegate to: [not yet assigned — see stakeholders.yaml]`:
     Ask: "Who should own this? Check your stakeholder graph or name someone."

   - If the record already has `Delegate to: [alias]` AND `Synced:` is present (confirmed in a prior session):
     **Skip this task entirely in the schedule flow.** Note in the summary: "Delegation already confirmed — check-in entry exists." Do NOT re-ask for confirmation, do NOT create a duplicate memory entry, do NOT push another Reminder.

   - If the record has `Delegate to: [alias]` but NO `Synced:` field:
     The delegate was confirmed but the Reminders push or memory log failed previously. Proceed to create the memory entry and push to Reminders. Skip the confirmation question — delegate is already chosen.

2. **After user confirms or names a delegate**:
   - If the user overrides the suggested delegate: update the task record and note: "Delegate changed from [original alias] to [new alias] at schedule"
   - Update the task record: `Delegate to: [alias]`
   - Set `Check-in date: [2–3 business days from today]`

3. **Create a follow-up memory entry** via `productivity:memory-management`:
   - Stakeholder: delegate alias
   - What was delegated: task title
   - Expected by: check-in date
   - Status: pending

## Step 4: Present the schedule summary

Show a clean table before saving anything:

```
| Task | Q | Scheduled | Action |
|------|---|-----------|--------|
| [title] | Q1 | Today — [date] | [CRITICAL] Start today |
| [title] | Q2 | [date] | 90-min focus block |
| [title] | Q3 | Delegate: [alias] | Check-in [date] |
| [title] | Q4 | — | Eliminated |
```

Ask: "Does this look right? I'll save it once you confirm."

## Step 5: Save confirmed schedule to TASKS.md

After the user confirms:
- Add `Scheduled: [date]` to each task record
- Add `Action: [specific action]` to each task record
- For Q3: add `Delegate to: [alias]` and `Check-in date: [date]`
- For Q4 cuts: move to `## Completed` with `Eliminated — Q4 cut [date]`

## Step 6: Push to task output adapter

After TASKS.md is saved, push confirmed tasks to the active external task manager.

**Read the active adapter** from `integrations/config/task-output-config.md`. If the adapter is still set to `~~task_output` (not configured), skip this step silently — the schedule is complete.

**For each confirmed task (Q1, Q2, Q3 only — never Q4):**

Prepare a `task_output_record`:
- `title` — task title as-is for Q1/Q2; for Q3 prefix as: `"Check in: [alias] re: [original title]"`
- `description` — full task description plus Source and Requester if known
- `due_date` — Q1: today (YYYY-MM-DD); Q2: confirmed focus block date; Q3: check-in date; Q4: never pushed
- `priority` — Q1: `high`; Q2/Q3: `medium`
- `quadrant` — Q1 | Q2 | Q3
- `source` — from the task record
- `requester` — from the task record (null if not known)
- `list_name` — value of `list_name` from the adapter's settings block

Call `scripts/push_reminder.applescript` via osascript for the reminders adapter (see `integrations/adapters/reminders.md` for full field mapping and error handling).

**Collect all results** — do not surface errors mid-flow. Process all tasks first.

**Show a push summary after all pushes complete:**
```
Task output: [N] pushed to Reminders (Eisenhower List)
  ✓ Fix deploy pipeline issue               → Q1, Due: 2026-02-19
  ✓ Draft Q1 roadmap                        → Q2, Due: 2026-02-25
  ✓ Check in: Sarah E. re: Review dashboards → Q3, Due: 2026-02-24
  - Update old wiki page                    → Q4, not pushed
```

**If any push failed**, append all errors after the summary:
```
⚠ 1 task could not be pushed:
  • "Fix deploy pipeline issue" — list not found. Check integrations/config/task-output-config.md.
```

**Update each task record in TASKS.md** with a `Synced:` field:
- Success: `Synced: Reminders (Eisenhower List) — [today's date]`
- Skipped: `Synced: skipped (already exists)`
- Failed:  `Synced: failed — [reason]`

## Step 7: Log Q3 stakeholders

For every Q3 task with a confirmed delegate that does NOT already have a memory entry, log to `productivity:memory-management`:
- Stakeholder alias and role
- What was delegated and the expected outcome
- Check-in date

**Deduplication guard**: Only create a memory entry if the task record does NOT already have a `Synced:` field. If `Synced:` is present, the entry was already created in a prior run — skip it and note "check-in entry already exists" in the summary. This is the single source of truth for dedup — do not rely on searching memory, which may be incomplete.

Confirm to the user: "Schedule saved. Run /execute as you complete work — or /intake to capture anything new that comes in."

## Calendar integration (if mentioned)

If the user asks to block time or mentions Mac Calendar, check availability before locking in a Q2 date.

First read `calendar_name` from `integrations/config/calendar-config.md`, then run:

```applescript
do shell script "swift ~/repos/claude-eisenhower/scripts/cal_query.swift '{calendar_name}' {DAYS_AHEAD} summary 2>&1"
```

This returns business day availability instantly regardless of calendar size.
Do NOT use AppleScript's `whose` clause — it times out on large calendars.

Also read `integrations/config/task-output-config.md` for the active adapter and list name used in Step 6.

Offer: "Want me to check your calendar before committing to that day?"
