# /today — Daily Briefing Command

**Plugin**: claude-eisenhower
**Version target**: v1.4.0
**Status**: Approved
**Date**: 2026-03-27
**Author**: Cantu

---

## Problem Statement

**User**: Director of Engineering starting their workday
**Problem**: No consolidated view of what needs attention today — urgent tasks,
overdue delegations, inbox backlog, and calendar shape require running multiple
commands manually. The Director starts every day reactive instead of proactive.
**Impact**: Daily. Risk of missing urgent items compounds throughout the day.
The Director's scarcest resource (attention) is spent on assembly instead of action.
**Evidence**: Current workflow requires manually checking TASKS.md, running
/scan-email, and reviewing calendar separately. `/review-week` exists but is
designed for Friday retrospectives, not daily action. All underlying data already
exists — nothing assembles it for "right now."
**Constraints**: Must work with existing TASKS.md, calendar, and memory data
sources. Plugin is local-first. Optional integrations (Calendar, Reminders, Mail) are macOS-specific; /today degrades gracefully when unavailable.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Read vs. read+triage | Read-only | A briefing that tries to act on items becomes a second `/schedule`. Keep it fast and predictable. Suggest commands, never execute them. |
| Recently completed | Yes, lightweight (1 business day, max 5) | Useful for ad-hoc supervisor conversations. Capped to prevent the briefing from becoming a report. |
| Nothing urgent behavior | Suggest proactive Q2 work | A clean board is the best time for focused work. Nudge without being prescriptive. |
| Calendar format | `full` (event list with times) | `/review-week` uses `summary` for day-level grades. `/today` needs actual events to show schedule shape and focus windows. |
| Analytics log | Yes, daily KPIs | Daily trend data makes weekly reports credible. One line per run to `memory/today-log.md`, same pattern as `/review-week`'s `memory/review-log.md`. No PII. |
| Arguments | None | Always "today." One command, one purpose. No date overrides, no filters. |

---

## Command Identity

**File**: `commands/today.md`

```yaml
---
description: Daily briefing — what needs your attention right now
argument-hint: (no arguments)
allowed-tools: Read, Write
---
```

Read-only with respect to TASKS.md — this command never modifies task records.
Write is used solely for the daily analytics log (`memory/today-log.md`).

---

## Data Gathering

Four data sources. All reuse existing patterns — no new scripts, no new
integrations.

### A. TASKS.md

Read TASKS.md from the workspace root. If it does not exist: "No task board found.
Run /intake to get started." and stop.

Extract:

1. **Overdue delegations**: All tasks with `State: Delegated` where `Check-by:`
   date is today or earlier. Exclude tasks in `## Done`. Compute business days
   overdue (skip Saturday and Sunday).

2. **Tasks due today**: All tasks with `State: Active` where `Due date:` or
   `Scheduled:` matches today's date.

3. **Inbox count**: Count of all tasks with `State: Inbox`. Find oldest intake
   date from `[ INTAKE — {date} ]` header. Compute age in days.

4. **Recently completed**: Tasks in `## Done` with `Done:` date matching today
   or the previous business day (e.g., if today is Monday, include Friday).
   Maximum 5 items. If more exist, note the overflow count.

### B. Delegation Memory

Invoke the memory-manager skill:
`query-pending — within: 0 business days`

Cross-reference results against TASKS.md overdue delegations (Section A.1).
If the same alias + task title appears in both, suppress the memory-only entry.
TASKS.md is the authoritative source.

### C. Calendar

1. Resolve `plugin_root` following `skills/core/references/plugin-root-resolution.md`.
2. Read `calendar_name` from `config/calendar-config.md`.
   - If missing: skip calendar section with graceful fallback text.
3. Run:
   ```
   do shell script "swift {plugin_root}/scripts/cal_query.swift '{calendar_name}' 1 full 2>&1"
   ```
   This returns today's events with start/end times.
4. Parse events and identify the best available focus window (largest gap between
   meetings, minimum 30 minutes to qualify).

Do NOT use AppleScript `whose` clause. Always use cal_query.swift.

### D. Config Fallbacks

| Missing config | Behavior |
|---------------|----------|
| `config/calendar-config.md` | Skip calendar section, show fallback text |
| `config/task-output-config.md` | Use default plugin_root with warning per `plugin-root-resolution.md` |
| TASKS.md | Show "No task board found" message and stop |

---

## Output Format

### Header

```
## Today — {full day name}, {full date, e.g. Thursday, March 27}
```

### Section Order

Six sections, rendered in this exact order. **Omit any section with nothing to
show** — no empty sections, no "nothing here" placeholders.

---

### Section 1 — Needs Attention

Overdue delegations + check-ins due today. Render only if any exist.

```
─── 🔴 Needs Attention ──────────────────────────────────────
  • {alias} — "{task title}" — Check-by: {date} ({N} day(s) overdue)
  • {alias} — "{task title}" — Check-by: today
```

Sort: most overdue first, then due-today items.

---

### Section 2 — On Your Plate Today

Active tasks scheduled or due today. Render only if any exist.

```
─── 📋 On Your Plate Today ──────────────────────────────────
  • [Q1] "{task title}" — Due: today
  • [Q2] "{task title}" — Scheduled: today
```

Sort: Q1 first, then Q2.

---

### Section 3 — Inbox

Render only if inbox count > 0.

```
─── 📬 Inbox ─────────────────────────────────────────────────
  {N} unprocessed tasks — oldest: {N} days ago ({date})
```

---

### Section 4 — Today's Calendar

Always render (use fallback text if calendar unavailable).

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

### Section 5 — Recently Completed

Tasks completed in the last 1 business day. Render only if any exist. Max 5 items.

```
─── ✅ Recently Completed ───────────────────────────────────
  • "{task title}" — Done: {relative time: "yesterday" / "this morning" / date}
```

If more than 5: `  ... and {N} more`

---

### Section 6 — Recommended Next

Always render. Generate 2-4 action items based on what was surfaced:

| Signal | Recommendation |
|--------|---------------|
| Overdue delegations exist | "Chase {alias(es)} on overdue delegation(s)" |
| Q1 tasks due today | "Handle {task} — due today" |
| Inbox > 3 | "Run /prioritize — {N} inbox items waiting" |
| Inbox 1-3 | "Consider clearing {N} inbox item(s)" |
| Focus window available | "Good day for Q2 work — {window} is open" |
| Nothing urgent, light calendar | "You're clear. Consider pulling a Q2 task forward or running /review-week for the weekly view." |

```
─── 💡 Recommended Next ──────────────────────────────────────
  1. {action}
  2. {action}
  ...
```

End with a one-line prompt:
> "Run any command to get started, or /intake if something new comes in."

---

## Daily Analytics Log

After displaying the briefing, append one line to `memory/today-log.md`.
Create the file if it does not exist. Create the `memory/` directory if needed.

### Format

```
[YYYY-MM-DD] day:{full-day-name} overdue:{N} inbox:{N} on_plate:{N} completed:{N}
```

### Fields

| Field | Source |
|-------|--------|
| `overdue` | Count of delegations with Check-by date today or earlier (Section 1) |
| `inbox` | Count of Inbox tasks (Section 3) |
| `on_plate` | Count of Active tasks due/scheduled today (Section 2) |
| `completed` | Count of tasks completed in last 1 business day (Section 5) |

### Example

```
[2026-03-27] day:Thursday overdue:2 inbox:3 on_plate:2 completed:1
[2026-03-28] day:Friday overdue:1 inbox:5 on_plate:0 completed:3
```

### Rules

- One line per run — append unconditionally (same as `/review-week`)
- No PII — no alias names, task titles, or email addresses
- Write is silent — do not mention it in the output to the user
- If the write fails: log error internally, continue. Do not surface to user.

### KPI Trend Signals

These daily metrics enable trend analysis in `/review-week` and future features:

| KPI | Healthy | Unhealthy |
|-----|---------|-----------|
| `overdue` | Trending toward 0 | Consistently > 2 or trending up |
| `inbox` | Stays below 5 | Growing week over week |
| `on_plate` | 1-3 tasks per day | Consistently 0 (undercommitted) or 5+ (overloaded) |
| `completed` | Steady throughput | Dropping (blocked or context-switching) |

---

## Boundaries — What /today Is Not

| Not this | Why |
|----------|-----|
| `/review-week` | `/today` shows today. `/review-week` shows the coming week. Different time range, different calendar format (`full` vs `summary`), different purpose (daily action vs weekly retrospective). |
| `/status` | No per-delegate portfolio, no team rollup, no historical reporting. Recently completed is capped — it's a conversation aid, not a report. |
| A triage tool | Read-only. No writes, no state changes, no inline action flows. Suggests what to do, never does it. |
| A full analytics suite | Writes daily KPIs only. Trend analysis and reporting belong in `/review-week` and `/status`. |

---

## Blast Radius

| File | Change |
|------|--------|
| Create: `commands/today.md` | New command file |
| Modify: `docs/STRUCTURE.md` | Add today.md to commands listing |

No other files change. No scripts, no tests (command is pure prompt — no
TypeScript logic to test), no config changes.

---

## Verification

1. **Manual smoke test** — Run `/today` on a board with overdue delegations,
   Q1 tasks, inbox items, and recent completions. Confirm all sections render
   correctly and empty sections are omitted.
2. **Empty board test** — Run `/today` with no tasks. Confirm "No task board
   found" message.
3. **Clean board test** — Run `/today` with no urgent items. Confirm the
   "nothing urgent" proactive suggestion renders.
4. **Calendar unavailable test** — Remove `calendar-config.md` and confirm
   graceful fallback.
5. **Existing tests** — `cd scripts && npm test` (196 tests, all passing).
   No new tests needed — no TypeScript logic added.
