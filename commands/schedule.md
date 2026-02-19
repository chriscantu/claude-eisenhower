---
description: Schedule prioritized tasks and assign dates
argument-hint: [optional: quadrant (Q1/Q2/Q3/Q4) or task title]
allowed-tools: Read, Write, Edit
---

You are running the SCHEDULE phase of the Engineering Task Flow.

## Step 1: Load the task board

Read TASKS.md from the root of the user's mounted workspace folder.

If the file does not exist or has no prioritized tasks, inform the user: "No prioritized tasks found. Run /prioritize first."

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

**Q3 — Urgent, Not Important → Suggest a delegate + check-in date**
- Do NOT assign a do-date for the user. This task should NOT be on their plate.
- Ask: "Who's the right person to own this?" if not already obvious from context.
- Once a delegate is named, assign a check-in date 2–3 business days out.
- Record the delegate as a stakeholder follow-up via productivity:memory-management.
- Frame the output as: "Delegated to [name] — check in [date]."

**Q4 — Not Urgent, Not Important → Cut it**
- Default action is to remove it from the active board entirely.
- Do NOT offer to defer it or set a review date. Q4 tasks should be eliminated.
- Move to Completed with note: `Eliminated — Q4 cut [today's date]`.
- If the user pushes back and insists on keeping it, allow a single "Review on: [date 4+ weeks out]" entry, but note: "Keeping Q4 tasks creates noise — revisit only if something changes."

## Step 4: Present the schedule summary

Show a clean table before saving anything:

```
| Task | Q | Scheduled | Action |
|------|---|-----------|--------|
| [title] | Q1 | Today — [date] | [CRITICAL] Start today |
| [title] | Q2 | [date] | 90-min focus block |
| [title] | Q3 | Delegate: [name] | Check-in [date] |
| [title] | Q4 | — | Eliminated |
```

Ask: "Does this look right? I'll save it once you confirm."

## Step 5: Save confirmed schedule to TASKS.md

After the user confirms:
- Add `Scheduled: [date]` to each task record
- Add `Action: [specific action]` to each task record
- For Q3: add `Delegate to: [name]`
- For Q4 cuts: move to `## Completed` with `Eliminated — Q4 cut [date]`

## Step 6: Log Q3 stakeholders

For every Q3 task with a named delegate, log to productivity:memory-management:
- Stakeholder name and role
- What was delegated and the expected outcome
- Check-in date

Confirm to the user: "Schedule saved. Run /execute as you complete work — or /intake to capture anything new that comes in."

## Calendar integration (if mentioned)

If the user asks to block time or mentions Mac Calendar, use the fast EventKit-based calendar query to check availability before locking in a Q2 date:

```applescript
do shell script "swift ~/repos/claude-eisenhower/scripts/cal_query.swift 'Cantu' {DAYS_AHEAD} summary 2>&1"
```

This returns business day availability instantly, even on large calendars (7000+ events). Do NOT use AppleScript's `whose` clause for calendar queries — it times out on the Cantu calendar.

Offer: "Want me to check your calendar before committing to that day?"
