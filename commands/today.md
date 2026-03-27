---
description: Daily briefing — what needs your attention right now
argument-hint: (no arguments)
allowed-tools: Read, Write
---

You are running the TODAY daily briefing of the Engineering Task Flow.

This command is designed for any-day-of-week use. It surfaces a focused snapshot
of what needs your attention right now — no scheduling, no task creation, no
modifications to task records. Write is used solely for the daily analytics log.

---

## Step 1: Config check

Read `config/task-output-config.md`.
If missing → note it. Plugin root will use default with warning.

Read `config/calendar-config.md`.
If missing → note it. Calendar section will show a graceful fallback. Continue.

Resolve `plugin_root` following `skills/core/references/plugin-root-resolution.md`.
Read `calendar_name` from calendar-config.md (if available).

---

## Step 2: Load the task board

Read TASKS.md from the root of the workspace.
If TASKS.md does not exist: show "No task board found. Run /intake to get started." and stop.

Collect the following from TASKS.md:

**A — Overdue delegations and check-ins due today**
All tasks with `State: Delegated` where `Check-by:` date is today or earlier.
Exclude tasks in the `## Done` section.
Compute days overdue as business days (skip Saturday and Sunday).
Sort: most overdue first, then due-today items.

**B — Tasks on your plate today**
All tasks with `State: Active` where `Due date:` or `Scheduled:` matches today's date.
Sort: Q1 first, then Q2.

**C — Inbox backlog**
Count all tasks with `State: Inbox`.
Find the oldest intake date among them (from `[ INTAKE — {date} ]` header).
Compute age in days from today.

**D — Recently completed**
Tasks in `## Done` with `Done:` date matching today or the previous business day
(e.g., if today is Monday, include Friday).
Maximum 5 items. If more exist, note the overflow count.

---

## Step 3: Query delegation memory

Invoke the memory-manager skill:
`query-pending — within: 0 business days`

The skill returns check-ins due today regardless of which backend was active.
See `skills/memory-manager/SKILL.md` for the contract.

**Deduplication**
Cross-reference the results against the TASKS.md overdue/due-today list (Section A above).
If the same alias + task title appears in both, suppress the memory-only entry.
TASKS.md is the authoritative source for that entry.

---

## Step 4: Query today's calendar

Read `calendar_name` (from Step 1). If unavailable, skip to Step 5 with calendar = unavailable.

Run:
```applescript
do shell script "swift {plugin_root}/scripts/cal_query.swift '{calendar_name}' 1 full 2>&1"
```

From the output, extract today's events with start and end times.
Identify the best available focus window: the largest gap between meetings
(minimum 30 minutes to qualify as a window).

Do NOT use AppleScript `whose` clause. Always use cal_query.swift.

---

## Step 5: Build the briefing

Assemble the sectioned briefing. Omit any section where there is nothing to show
(do not render empty sections or "nothing here" placeholders).

Use this exact section order:

---

### Header

```
## Today — {full day name}, {full date, e.g. Thursday, March 27}
```

---

### Section 1 — 🔴 Needs Attention

Render only if overdue delegations or check-ins due today exist (Section A from Step 2).

```
─── 🔴 Needs Attention ──────────────────────────────────────
  • {alias} — "{task title}" — Check-by: {date} ({N} day(s) overdue)
  • {alias} — "{task title}" — Check-by: today
```

---

### Section 2 — 📋 On Your Plate Today

Render only if tasks due or scheduled today exist (Section B from Step 2).

```
─── 📋 On Your Plate Today ──────────────────────────────────
  • [Q1] "{task title}" — Due: today
  • [Q2] "{task title}" — Scheduled: today
```

---

### Section 3 — 📬 Inbox

Render only if Inbox count > 0.

```
─── 📬 Inbox ─────────────────────────────────────────────────
  {N} unprocessed tasks — oldest: {N} days ago ({date})
```

---

### Section 4 — 📆 Today's Calendar

Render always (use fallback text if calendar unavailable).

**If events exist:**
```
─── 📆 Today's Calendar ─────────────────────────────────────
  9:00–10:00  Eng Staff Meeting
  11:00–11:30 1:1 with Alex R.
  2:00–3:00   Architecture Review
  Best window: {start}–{end} ({N} min)
```

**If no events:**
```
─── 📆 Today's Calendar ─────────────────────────────────────
  No meetings today — full day available for focused work.
```

**If unavailable:**
```
─── 📆 Today's Calendar ─────────────────────────────────────
  Calendar unavailable — run /setup to configure.
```

---

### Section 5 — ✅ Recently Completed

Render only if recently completed tasks exist (Section D from Step 2). Max 5 items.

```
─── ✅ Recently Completed ───────────────────────────────────
  • "{task title}" — Done: {relative time: "yesterday" / "this morning" / date}
```

If more than 5: `  ... and {N} more`

---

### Section 6 — 💡 Recommended Next

Always render. Generate 2–4 action items based on what was surfaced:

- If overdue delegations exist → "Chase {alias(es)} on overdue delegation(s)."
- If Q1 tasks due today → "Handle {task} — due today."
- If Inbox count > 3 → "Run /prioritize — {N} inbox items waiting."
- If Inbox count is 1–3 → "Consider clearing {N} inbox item(s)."
- If a focus window exists → "Good day for Q2 work — {window} is open."
- If no overdue, no Q1, and no inbox → "You're clear. Consider pulling a Q2 task forward or running /review-week for the weekly view."

```
─── 💡 Recommended Next ──────────────────────────────────────
  1. {action}
  2. {action}
  ...
```

End with a one-line prompt:
> "Run any command to get started, or /intake if something new comes in."

---

## Step 6: Write daily analytics log

After displaying the briefing, append one line to `memory/today-log.md`.
Create the file if it does not exist. Create the `memory/` directory if it does not exist.

Format:
```
[YYYY-MM-DD] day:{full-day-name} overdue:{N} inbox:{N} on_plate:{N} completed:{N}
```

Fields:
- `overdue` — count of delegations with Check-by date today or earlier (Section 1)
- `inbox` — count of Inbox tasks (Section 3)
- `on_plate` — count of Active tasks due/scheduled today (Section 2)
- `completed` — count of tasks completed in last 1 business day (Section 5)

Example:
```
[2026-03-27] day:Thursday overdue:2 inbox:3 on_plate:2 completed:1
```

Rules:
- One line per run — append unconditionally
- No PII — no alias names, task titles, or email addresses
- Write is silent — do not mention it in the output to the user
- If the write fails → log the error internally and continue. Do not surface to user.

---

## Step 7: Done

The command is complete. Do not prompt for further action beyond the closing line
in the Recommended Next section. The user drives any follow-on commands.
