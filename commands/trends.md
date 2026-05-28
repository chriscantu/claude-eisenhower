---
description: 4-week behavioral retro — throughput, defer rate, overdue delegation patterns
argument-hint: [weeks] (optional, default 4)
allowed-tools: Read
---

You are running the TRENDS command of the Engineering Task Flow.

This command reads accumulated analytics logs and the live task board, then
surfaces three patterns about the user's behavior over the last N weeks
(default 4). It writes nothing. It is the reflective loop that turns silently
collected data into insight.

Issue #43 motivates this command: `/today`, `/plan-week`, and `/review-week`
have been appending one-line analytics to `memory/today-log.md`,
`memory/plan-log.md`, and `memory/review-log.md` since the four-state model
shipped, but nothing reads them for trend analysis. The data is being
collected; the insight loop is missing.

---

## Step 1: Resolve the window

If the user provided an integer argument, treat it as the window size in weeks.
Clamp to `[1, 52]`. If the argument is missing or non-numeric, default to `4`.

Compute the cutoff date as `today − (weeks × 7)` days.

---

## Step 2: Load the logs and the task board

Read all three log files and the live task board. Tolerate missing files
silently — sparse data is the common case for newer installs.

| Source | Path | Format |
|--------|------|--------|
| Daily briefing log | `memory/today-log.md` | `[YYYY-MM-DD] day:X overdue:N inbox:N on_plate:N completed:N` |
| Weekly plan log | `memory/plan-log.md` | `[YYYY-MM-DD] day:X committed:N carryover:N checkins:N inbox:N deferred:N` |
| Weekly review log | `memory/review-log.md` | `[YYYY-MM-DD] day:X inbox:N active:N delegated:N overdue:N calendar:{grade}` |
| Task board | `TASKS.md` | See `docs/specs/tasks-schema-spec.md` |

For each log file:
- Parse one record per line. Skip lines that do not match the expected shape.
- Drop records older than the cutoff date.
- If the file is missing, treat the source as empty — do NOT error.

Per `commands/review-week.md` Step 6 rules, log files contain NO PII (no
alias names, task titles, or email addresses). Alias-level breakdowns come
from `TASKS.md` only, never from the logs.

---

## Step 3: Compute the three patterns

### Pattern 1 — Throughput trend

Use `plan-log` (`committed` field) and `today-log` (`completed` field), grouped
into ISO weeks (Monday → Sunday) over the window.

For each week, report:
- `committed_total` — sum of `committed` from `plan-log` records in that week
- `completed_total` — sum of `completed` from `today-log` records in that week
- `completion_ratio` — `completed_total / committed_total` (skip if `committed_total = 0`)

Surface the trend in one of these shapes:

- **Sustained throughput** — both totals stable within ±20% week over week
- **Growing throughput** — `completed_total` rising ≥20% week over week for the last 2 weeks
- **Falling throughput** — `completed_total` falling ≥20% week over week for the last 2 weeks
- **Commit/complete gap** — average `completion_ratio` over the window is < 0.6 or > 1.5

If there are fewer than 2 weeks of data, write: `Throughput: insufficient data
({N} week(s) collected; need 2+ for a trend).`

### Pattern 2 — Defer/cut rate

Use `plan-log` (`deferred` and `committed`) over the window.

Compute:
- `defer_total = sum(deferred)` over the window
- `commit_total = sum(committed)` over the window
- `defer_rate = defer_total / commit_total`

Surface as:
- `Defer rate: {pct}% ({defer_total} deferred / {commit_total} committed over {weeks}w)`
- If `defer_rate > 0.40`: append `→ pattern, not exception. Worth examining what gets deferred.`
- If `defer_rate < 0.10`: append `→ low — either tight scoping or insufficient ambition.`
- If `commit_total = 0`: write `Defer rate: insufficient data (no plan-log entries in window).`

Q-priority breakdown is intentionally absent because `plan-log` does not record
per-Q deferrals. Adding that would require a schema change to the log format
(out of scope for this command).

### Pattern 3 — Overdue delegation rate by alias

Read `TASKS.md` task records via `scripts/tasks-parser.ts`. Source the alias
list from there — the logs are PII-free by design.

For each unique `Owner:` alias appearing on Delegated or Done records within
the window (Done records with `Done:` date inside the window count toward the
denominator for that alias):

- `total_in_window` — count of Delegated records whose check-by date falls in
  the window OR Done records that were Delegated with `Done:` in the window
- `resolved_on_time` — Done records that were Delegated where `Done:` ≤
  `Check-by:`
- `overdue_current` — Delegated records (not Done) where `Check-by` is today
  or earlier
- `resolution_rate = resolved_on_time / total_in_window`

Surface the top 3 aliases by `total_in_window` descending. For each:

```
{alias}: {resolution_rate_pct}% resolved on time ({resolved_on_time}/{total_in_window}), {overdue_current} currently overdue
```

If no aliases have any delegated tasks in the window, write: `Overdue rate:
no delegated tasks in window.`

---

## Step 4: Render the report

```
## Trends — last {weeks} weeks

─── Throughput ──────────────────────────────────────────
  {pattern 1 line, plus per-week breakdown if data permits}

─── Defer rate ──────────────────────────────────────────
  {pattern 2 line}

─── Overdue delegations by alias ────────────────────────
  {pattern 3 lines, top 3 by activity}
```

Close with a single reflective prompt:

> Run `/plan-week` to act on this, or `/status awaiting` to see external
> blockers.

---

## Step 5: Done

The command is complete. It writes nothing — no log entry of its own, no
TASKS.md mutation. The user drives any follow-on commands.

---

## Edge cases

- **All three log files missing** → render header + `No analytics data yet.
  Run /today, /plan-week, and /review-week to accumulate the logs this
  command reads.` Stop after Step 4.
- **Window argument > 52** → clamp to 52, mention in header: `## Trends — last
  52 weeks (clamped from {arg})`
- **Window argument < 1 or non-numeric** → fall back to default 4, do not warn
- **TASKS.md missing** → Patterns 1 and 2 still render from logs; Pattern 3
  renders `Overdue rate: TASKS.md not found.`
- **Log file present but no entries in window** → that pattern degrades to
  `insufficient data` line, others continue
