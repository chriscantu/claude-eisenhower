---
description: Friday weekly review — overdue delegations, upcoming check-ins, active commitments, inbox backlog, and next week's calendar load
argument-hint: (no arguments)
allowed-tools: Read, Write, Edit
---

You are running the REVIEW WEEK phase of the Engineering Task Flow.

This command is designed for Friday afternoon use. It surfaces a complete situational
snapshot for the coming week — no scheduling, no task creation, no writes to task records.

---

## Step 1: Config check

Read `config/task-output-config.md`.
If missing → stop and say:
> "I need your plugin path configured before running the calendar check. Let me run setup first."
Then run `/setup` and resume `/review-week` when complete.

Read `config/calendar-config.md`.
If missing → note it. Calendar section will show a graceful fallback. Continue.

Read `plugin_root` from task-output-config.md.
If `plugin_root` is not present, use `~/repos/claude-eisenhower` and note:
`"plugin_root not configured — using default path ~/repos/claude-eisenhower. Update config/task-output-config.md if your installation is at a different location."`
Read `calendar_name` from calendar-config.md (if available).

---

## Step 2: Load the task board

Read TASKS.md from the root of the workspace.
If TASKS.md does not exist: show "No task board found. Run /intake to get started." and stop.

Collect the following from TASKS.md:

**A — Overdue delegations**
All tasks with `State: Delegated` where `Check-by:` date is today or earlier.
Exclude tasks in the `## Done` section.
Compute days overdue as business days (skip Saturday and Sunday).
Sort: most overdue first.

**B — Upcoming delegated check-ins**
All tasks with `State: Delegated` where `Check-by:` date falls within the next 5 business days.
Exclude tasks already captured in A (overdue).
Exclude tasks in `## Done`.
Sort: soonest first.

**C — Active tasks due next week**
All tasks with `State: Active` where `Due date:` falls within next Monday through Friday
(the coming full calendar week, regardless of what day today is).
Exclude tasks with no `Due date:` field.
Sort: by Priority (Q1 first, then Q2, Q3, Q4), then by due date ascending within each priority.

**D — Inbox backlog**
Count all tasks with `State: Inbox`.
Find the oldest intake date among them (from `[ INTAKE — {date} ]` header).
Compute age in days from today.

**E — Counts for analytics**
Record: inbox count, active count (total Active tasks in TASKS.md), delegated count
(total Delegated tasks not in Done), overdue count (count from A).

---

## Step 3: Query delegation memory

Invoke the memory-manager skill:
`query-pending — within: 5 business days`

The skill returns a unified list regardless of which backend was active (this command
does not branch on the backend). See `skills/memory-manager/SKILL.md` for the contract.

**Deduplication**
Cross-reference the results against the TASKS.md upcoming check-ins (Section B above).
If the same alias + task title appears in both, suppress the memory-only entry.
TASKS.md is the authoritative source for that entry.

---

## Step 4: Query calendar availability

Read `calendar_name` (from Step 1). If unavailable, skip to Step 5 with calendar = unavailable.

Run:
```applescript
do shell script "swift {plugin_root}/scripts/cal_query.swift '{calendar_name}' 14 summary 2>&1"
```

From the output, extract availability for next Monday through Friday (the coming full
calendar week). Classify each day as:
- `busy` — mostly committed, limited capacity
- `moderate` — some meetings, room for focused work
- `light` — open, strong focus window candidate
- `free` — clear

Identify "best focus windows": days rated `light` or `free`.

Compute aggregate calendar grade for analytics:
- `light` — 3 or more light/free days
- `busy` — 3 or more busy days
- `moderate` — otherwise
- `unavailable` — if calendar config was missing or script errored

Do NOT use AppleScript `whose` clause. Always use cal_query.swift.

---

## Step 5: Build the digest

Assemble the sectioned digest. Omit any section where there is nothing to show
(do not render empty sections or "nothing here" placeholders).

Use this exact section order:

---

### Header

```
## 🗓 Weekly Review — {today's full date, e.g. Friday, March 7}
```

---

### Section 1 — 🔴 Needs Action Before Weekend

Render only if overdue delegations exist (Section A from Step 2).

```
─── 🔴 Needs Action Before Weekend ──────────────────────────────────────
Delegated tasks with Check-by date today or earlier:

  • {alias} — "{task title}" — Check-by: {date} ({N} day(s) overdue)
  ...
```

---

### Section 2 — 🟡 Delegated Check-ins Due Next Week

Render only if there are upcoming check-ins from TASKS.md (Section B) or memory
(Step 3 after deduplication).

```
─── 🟡 Delegated Check-ins Due Next Week ─────────────────────────────────
  • {alias} — "{task title}" — Check-by: {date}
  ...
```

---

### Section 3 — 📋 Your Plate — Active Tasks Due Next Week

Render only if Section C from Step 2 has results.

```
─── 📋 Your Plate — Active Tasks Due Next Week ───────────────────────────
  • "{task title}" — Due: {date}  [Priority: {Q1|Q2|Q3|Q4}]
  ...
```

---

### Section 4 — 📬 Inbox Backlog

Render only if Inbox count > 0.

```
─── 📬 Inbox Backlog ─────────────────────────────────────────────────────
  {N} unprocessed tasks  |  Oldest: {N} days ago ({date})
  Run /prioritize to clear the backlog.
```

---

### Section 5 — 📆 Calendar Load — Next Week

Render always (use fallback text if calendar unavailable).

**If available:**
```
─── 📆 Calendar Load — Next Week ({Mon date}–{Fri date}) ──────────────────
  Mon: {grade}  |  Tue: {grade}  |  Wed: {grade}  |  Thu: {grade}  |  Fri: {grade}
  Best focus windows: {list of light/free days, or "None — heavy week ahead"}
```

**If unavailable:**
```
─── 📆 Calendar Load — Next Week ──────────────────────────────────────────
  Calendar unavailable — run /setup to configure.
```

---

### Section 6 — ✅ Recommended Next Steps

Always render. Generate 2–4 action items based on what was surfaced:

- If overdue delegations exist → "Chase {alias(es)} on overdue delegation(s) before EOD."
- If upcoming check-ins exist → "Prepare for {N} check-in(s) early next week."
- If Inbox count > 3 → "Run /prioritize — {N} inbox items are waiting."
- If Inbox count is 1–3 → "Consider clearing {N} inbox item(s) before Monday."
- If light/free focus days exist → "Schedule a focus block for {day} — lightest calendar day."
- If no overdue and no inbox → "You're in good shape. Review Active tasks for any that need a push."

```
─── ✅ Recommended Next Steps ────────────────────────────────────────────
  1. {action}
  2. {action}
  ...
```

End with a one-line prompt:
> "Ready for next week? Run /schedule to lock in focus blocks, or /prioritize to clear the inbox."

---

## Step 6: Write analytics log

After displaying the digest, append one line to `memory/review-log.md`.
Create the file if it does not exist. Create the `memory/` directory if it does not exist.

Format:
```
[YYYY-MM-DD] day:{full-day-name} inbox:{N} active:{N} delegated:{N} overdue:{N} calendar:{grade}
```

Example:
```
[2026-03-07] day:Friday inbox:5 active:3 delegated:4 overdue:1 calendar:moderate
```

Rules:
- One line per run — do not write multiple lines if run twice in one day
  (append unconditionally; retention/dedup is a future concern)
- No PII — no alias names, task titles, or email addresses
- Write is silent — do not mention it in the output to the user
- If the write fails → log the error internally and continue. Do not surface to user.

---

## Step 7: Done

The command is complete. Do not prompt for further action beyond the "Ready for next week?"
closing line. The user drives any follow-on commands.
