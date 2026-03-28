---
description: Weekly planning — propose commitments based on priorities, capacity, and carryover
argument-hint: (no arguments)
allowed-tools: Read, Write, Edit
---

You are running the PLAN WEEK phase of the Engineering Task Flow.

This command is designed for Monday morning use but works any day of the week.
It proposes a concrete commitment list based on carryover, fresh priorities,
delegation follow-ups, and calendar capacity. The user approves or adjusts the
plan, then runs /schedule to assign specific dates and push to Reminders.

Write is used for two purposes: updating `Scheduled:` fields in TASKS.md after
user confirmation, and appending to the silent analytics log.

---

## Step 1: Config check

Read `config/task-output-config.md`.
If missing → note it. Plugin root will use default with warning. Continue.

Read `config/calendar-config.md`.
If missing → note it. Calendar section will show a graceful fallback. Continue.

Resolve `plugin_root` following `skills/core/references/plugin-root-resolution.md`.
Read `calendar_name` from calendar-config.md (if available).

---

## Step 2: Determine planning window

Compute the planning window based on today's day of the week:

- **Monday**: Planning window = Monday through Friday of this week.
  Carryover label = "open from last week".
  Calendar header = "Calendar Load".
- **Tuesday–Friday**: Planning window = today through Friday of this week.
  Carryover label = "open from earlier this week".
  Calendar header = "Calendar Load ({today's day name}–Fri)".
- **Saturday/Sunday**: Planning window = Monday through Friday of next week.
  Carryover label = "open from last week".
  Calendar header = "Calendar Load".

Compute `current_monday`: the Monday of the current week (or next week if today is
Saturday/Sunday). This value is used for the `Scheduled: week of YYYY-MM-DD` write.

---

## Step 3: Load the task board

Read TASKS.md from the root of the workspace.
If TASKS.md does not exist: show "No task board found. Run /intake to get started." and stop.

Extract the following data from TASKS.md:

**A — Open commitments (carryover)**
All tasks with `State: Active` where `Scheduled:` contains a past date or a
`week of YYYY-MM-DD` value where that Monday is before `current_monday`, and no
`Done:` date is set. Exclude tasks in the `## Done` section.
Sort: Q1 first, then Q2.

**B — Unscheduled Active tasks**
All tasks with `State: Active` that have no `Scheduled:` field.
Exclude tasks in the `## Done` section.
Sort: Q1 first, then Q2. Within same priority, tasks with `Due date:` before tasks
without. Among tasks with due dates, sort ascending by date.

**C — Already scheduled this week**
All tasks with `State: Active` where `Scheduled:` contains `week of {current_monday}`
(already committed for this week by a prior `/plan-week` run). These are not proposed
again — they are noted in the output as already committed.

**D — Delegation check-ins**
All tasks with `State: Delegated` (not in `## Done`) where `Check-by:` date falls
within the planning window (today through Friday, inclusive).
Include overdue delegations (Check-by before today) — flag with "⚠️ {N} days overdue"
using business day count (skip Saturday and Sunday).
Sort: Check-by date ascending (soonest first, overdue first).

**E — Inbox count**
Count all tasks with `State: Inbox`.
If count > 0, find the newest intake date among them (from `[ INTAKE — {date} ]` header).

**F — Recently completed**
Read `memory/plan-log.md` for the most recent entry date. If it exists, collect tasks
in `## Done` with `Done:` date after that entry date. If `plan-log.md` does not exist
or has no entries, use a 5 business day lookback from today.
Maximum 5 items. If more exist, note the overflow count.

---

## Step 4: Review log bridge and calendar

### Part A — Review log bridge

Read `memory/review-log.md`. If the file does not exist, skip to Part B.

Find the most recent entry line. Parse its date and fields:
```
[YYYY-MM-DD] day:{day} inbox:{N} active:{N} delegated:{N} overdue:{N} calendar:{grade}
```

If the entry date is within 7 days of today, compute deltas:
- Overdue delta: current overdue count (from Step 3 bucket D, overdue items only) minus logged `overdue` value
- Inbox delta: current inbox count (from Step 3 bucket E) minus logged `inbox` value

Store these for output assembly. If the entry is older than 7 days, skip the bridge.

### Part B — Calendar query

Read `calendar_name` (from Step 1). If unavailable, skip to Step 5 with
calendar = unavailable.

Run:
```applescript
do shell script "swift {plugin_root}/scripts/cal_query.swift '{calendar_name}' 7 summary 2>&1"
```

From the output, extract availability for each day in the planning window
(today through Friday, or Mon through Fri if running on Monday).

Classify each day as:
- `busy` — mostly committed, limited capacity
- `moderate` — some meetings, room for focused work
- `light` — open, strong focus window candidate
- `free` — clear

Count focus days: days rated `light` or `free`.

Do NOT use AppleScript `whose` clause. Always use cal_query.swift.

---

## Step 5: Build the proposal

Assemble the sectioned proposal. Omit any section where there is nothing to show
(do not render empty sections or "nothing here" placeholders).

Use this exact section order:

---

### Header

```
## 📋 Week Plan — {full day name}, {full date, e.g. Monday, March 30}
```

---

### Section 1 — 🔗 Since Friday's Review

Render only if the review log bridge from Step 4 Part A produced data (entry within 7 days).

```
─── 🔗 Since Friday's Review ──────────────────────────────
  Last review ({date}): {overdue} overdue, {inbox} inbox items, {calendar} calendar.
  Since then: {delta summary}.
```

Delta summary examples:
- "overdue resolved, 3 new inbox items arrived"
- "1 new overdue, inbox unchanged"
- "no significant changes"

Compute deltas from the values parsed in Step 4 Part A.

---

### Section 2 — 📬 Inbox Alert

Render only if Inbox count > 0 (bucket E from Step 3).

```
─── 📬 Inbox Alert ─────────────────────────────────────────
  {N} unprocessed items in Inbox (newest: {relative day name or date}).
  Run /prioritize first, or plan with what's already classified?
```

**This is a blocking prompt.** Wait for the user to respond:
- If user says to prioritize (or equivalent): stop and say "Run /prioritize to triage your inbox, then re-run /plan-week." Do not continue.
- If user says to continue (or equivalent): proceed to the next section.

---

### Section 3 — 📆 Calendar Load

Render always (use fallback text if calendar unavailable).

**If available (Monday run):**
```
─── 📆 Calendar Load ──────────────────────────────────────
  Mon: {grade}  |  Tue: {grade}  |  Wed: {grade}  |  Thu: {grade}  |  Fri: {grade}
  Focus windows: {list of light/free day names, or "None — heavy week ahead"}
```

**If available (mid-week run, e.g. Wednesday):**
```
─── 📆 Calendar Load (Wed–Fri) ─────────────────────────────
  Wed: {grade}  |  Thu: {grade}  |  Fri: {grade}
  Focus windows: {list of light/free day names, or "None — heavy week ahead"}
```

**If unavailable:**
```
─── 📆 Calendar Load ──────────────────────────────────────
  Calendar unavailable — run /setup to configure.
```

---

### Section 4 — ✅ Completed Since Last Plan

Render only if bucket F from Step 3 has results.

```
─── ✅ Completed Since Last Plan ({N} items) ───────────────
  • "{task title}" — Done: {date}
  • "{task title}" — Done: {date}
```

If more than 5: `  ... and {N} more`

---

### Section 5 — ⭐ Proposed Plan

Always render — this is the core of the command. Two sub-sections.

**Sub-section: Personal commitments**

List open commitments (bucket A) first, then unscheduled candidates (bucket B).

```
─── ⭐ Proposed Plan ───────────────────────────────────────

  Personal commitments ({total count}):
    1. [{priority}] "{task title}" ← {carryover label}
    2. [{priority}] "{task title}" ← {carryover label}
    3. [{priority}] "{task title}" — Due: {date}
    4. [{priority}] "{task title}"
```

Rules:
- Open commitments appear first, each with carryover label:
  `← open from last week` (Monday) or `← open from earlier this week` (Tue–Fri)
- Fresh candidates appear after, sorted Q1→Q2, due-dated before undated
- Show `— Due: {date}` only if `Due date:` field is set on the task
- Number items sequentially (1, 2, 3...) for easy reference during adjustment

If bucket C (already scheduled this week) has items, note them:
```
  Already committed this week: {N} task(s) from a prior /plan-week run.
```

If no personal commitments exist (buckets A and B both empty):
```
  Personal commitments: none. All Active tasks are already scheduled.
  Consider running /intake or /prioritize to surface new work.
```

**Sub-section: Delegation check-ins**

```
  Delegation check-ins ({count}):
    • {alias} — "{task title}" — Check-by: {relative label}
    • {alias} — "{task title}" — ⚠️ {N} day(s) overdue
```

Rules:
- Overdue items first, flagged with ⚠️ and business days overdue
- Non-overdue items show relative labels: "today", "tomorrow", or day name (e.g., "Wed")
- If no check-ins exist in the planning window, omit this sub-section entirely

**Capacity note** (always render after the two sub-sections):

```
  ⚖️ {N} tasks + {M} check-ins against ~{X} focus days ({day names}).
  {Actionable guidance.}
```

Guidance logic:
- Total items (personal commitments + check-ins) <= focus days → "Looks manageable."
- Total items > focus days but within 1.5x → "Consider deferring 1 Q2 item if meetings expand."
- Total items > 1.5x focus days → "Heavy week — consider deferring Q2 items to next week."
- If calendar is unavailable → "{N} tasks + {M} check-ins this week. Calendar unavailable for capacity check."

---

### Section 6 — 💡 Recommended

Always render. Generate 2–4 action items based on what was surfaced:

- If open commitments (carryover) contain Q1 items → "Handle {task title} first — open commitment from last week."
- If open commitments contain only Q2 items → "Prioritize carried-over Q2 work before taking on new items."
- If light/free calendar days exist → "Block {day name} for Q2 deep work (lightest calendar day)."
- If overdue delegation check-ins exist → "Chase {alias} — check-in {N} days overdue."
- If check-in due tomorrow or today → "Follow up with {alias} — check-in due {today/tomorrow}."
- If inbox count > 3 → "Run /prioritize — {N} inbox items waiting."
- If no carryover, no overdue, and light calendar → "Clean slate — good week to tackle Q2 strategic work."

```
─── 💡 Recommended ─────────────────────────────────────────
  1. {action}
  2. {action}
  ...
```

**Closing prompt:**

```
Adjust the plan (add, remove, defer items) or confirm as-is.
Then run /schedule to assign dates and push to Reminders.
```

---

## Step 6: Interactive adjustment

After presenting the proposal, wait for the user's response. Accept conversational
adjustments:

**Remove**: User says "drop item 3" or "remove the retro template" → exclude that item
from the plan. Do not write anything for it.

**Defer**: User says "defer item 4" or "push the SLA review to next week" → exclude that
item. No write. It will reappear as an unscheduled candidate in the next `/plan-week` run.
Increment the deferred count for analytics.

**Add**: User says "add the SLA review" or "include the infra audit too" → look up the
task in TASKS.md. It must be `State: Active` and not already in the proposal. If found,
add it to the commitment list. If the task is `State: Inbox`, say: "That task is still in
Inbox. Run /prioritize first to classify it."

**Confirm**: User says "looks good", "confirm", "yes", or equivalent → proceed to Step 7.

Do NOT write to TASKS.md until the user explicitly confirms. If the user makes multiple
adjustments, re-display the updated plan after each round of changes and ask again:
"Updated. Confirm this plan, or make more changes?"

---

## Step 7: Write to TASKS.md

After user confirms the plan:

For each confirmed personal commitment (from the final adjusted list):
- If the task already has a `Scheduled:` field: overwrite it with `Scheduled: week of {current_monday}`
  (where `{current_monday}` is the YYYY-MM-DD date computed in Step 2)
- If the task has no `Scheduled:` field: add `Scheduled: week of {current_monday}`

For delegation check-ins: **do not modify**. They are already tracked via `Check-by:` dates.

For removed or deferred items: **do not write anything**. The absence of a `Scheduled:` field
is the signal that the task was not committed this week.

Show a confirmation:
```
Plan saved — {N} tasks committed for the week of {current_monday formatted as Mon DD}.
Run /schedule to assign specific dates and push to Reminders.
```

---

## Step 8: Write analytics log

After saving to TASKS.md, append one line to `memory/plan-log.md`.
Create the file if it does not exist. Create the `memory/` directory if it does not exist.

Format:
```
[YYYY-MM-DD] day:{full-day-name} committed:{N} carryover:{N} checkins:{N} inbox:{N} deferred:{N}
```

Fields:
- `committed` — total personal tasks the user confirmed
- `carryover` — how many of those were open commitments from a prior week (bucket A count in the final confirmed list)
- `checkins` — delegation check-ins surfaced in the planning window (awareness count, not committed)
- `inbox` — Inbox count at time of planning (bucket E from Step 3)
- `deferred` — items the user explicitly deferred during adjustment

Example:
```
[2026-03-30] day:Monday committed:4 carryover:2 checkins:3 inbox:3 deferred:1
```

Rules:
- One line per run — append unconditionally
- No PII — no alias names, task titles, or email addresses
- Write is silent — do not mention it in the output to the user
- If the write fails → log the error internally and continue. Do not surface to user.

---

## Step 9: Done

The command is complete. Do not prompt for further action beyond the closing line
in Step 7. The user drives any follow-on commands (/schedule, /prioritize, etc.).
