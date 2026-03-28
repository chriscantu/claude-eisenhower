# SessionStart Enhancement Spec

**Version:** 1.8.0
**Status:** Draft
**Feature:** P5 — Proactive delegation surfacing and overdue alerting

---

## Problem Statement

The Director of Engineering has no proactive surfacing of delegation check-ins
or overdue items at session start. The current SessionStart hook outputs a
compressed one-liner with task counts and generic overdue/check-in counts:

```
Task Board: 2 Inbox, 3 Active, 1 Delegated, 8 Done. Overdue: 1 active task. Check-in due: 1 delegation.
```

This tells you _something_ needs attention but not _what_. You have to remember
to run `/today` or manually scan TASKS.md to find out which tasks slipped and
which delegations need follow-up.

**Goal:** Rewrite the SessionStart prompt hook to output a structured briefing
that names the specific items needing attention, suggests a next action, and
surfaces board health signals — so the director starts every session knowing
exactly what needs their attention.

---

## Design Decisions

### D1: Output format — multi-line structured briefing

**Decision:** Replace the single-line summary with a multi-line structured
briefing that lists specific items with titles, dates, and overdue durations.

**Why:** The whole point of P5 is that you shouldn't have to dig for this
information. A scannable briefing block on session start is the right UX.

### D2: Overdue threshold — any overdue, no minimum

**Decision:** Surface any Active task with a `Scheduled` date strictly before
today. No 2-day minimum threshold.

**Why:** If something is overdue, you want to know immediately, not after it's
been slipping for days.

### D3: Flat list, no severity tiers

**Decision:** List all overdue items with their scheduled date and business days
overdue. No tier labels (warning/critical).

**Why:** The director can assess urgency from the date. Adding tier labels is
noise that doesn't help act differently.

### D4: Check-in trigger — due today or past

**Decision:** Surface Delegated tasks with `Check-by` ≤ today. Same logic as
current hook, but with item details.

**Why:** Looking ahead is what `/plan-week` and `/today` do. SessionStart
surfaces what needs action _now_.

### D5: Preserve task board counts as header

**Decision:** Keep the `Task Board: N Inbox, N Active, N Delegated, N Done`
line as the first line, with the detailed briefing block below.

**Why:** The counts give a quick pulse on board health even when nothing is
overdue.

### D6: Approach — enhanced prompt hook (no scripts)

**Decision:** Rewrite the existing SessionStart prompt in `hooks/hooks.json`.
No new files, no scripts, no platform dependencies.

**Why:** The existing commands (`/today`, `/plan-week`, `/review-week`) all
parse TASKS.md via prompt instructions and do date comparisons successfully.
Core features stay markdown-only per PRINCIPLES.md.

---

## UX Enhancements (R1–R5)

### R1: Inbox gate alert

If the Inbox section has 5 or more items, surface a nudge:

```
📥 Inbox has {N} items — consider running /intake before diving in.
```

**Why:** Prevents the backlog from silently growing while you focus on
execution.

### R2: Suggested next action

End the briefing with one concrete recommendation based on what was surfaced.
Priority order (highest-leverage first):

1. Overdue check-ins exist → `💡 Suggested: Reach out to {owner} about {title}`
2. Overdue active tasks exist → `💡 Suggested: Consider rescheduling overdue tasks with /schedule`
3. Inbox alert triggered → `💡 Suggested: Run /intake to process inbox`
4. Staleness triggered → `💡 Suggested: Review board — nothing completed recently`

Only one suggestion is shown — the highest priority one.

**Why:** Turns awareness into action. Delegation follow-through is the
highest-leverage director action, so it takes priority.

### R3: Staleness signal

If the Done section exists and has tasks, but no `Done:` date falls within the
last 5 business days, surface:

```
💤 No tasks completed in the last 5 business days — board may need attention.
```

Skip entirely if the Done section is empty (new board, not stale).

**Why:** Catches the scenario where you've been heads-down in meetings and the
board drifted.

### R4: Quiet mode for clean boards

When nothing is actionable (no overdue tasks, no check-ins due, inbox < 5,
not stale), output only the task board counts line. No "all clear" message —
absence of alerts _is_ the signal.

**Why:** Reduces noise. A clean board doesn't need commentary.

### R5: Business day math

All "days overdue" calculations exclude Saturdays and Sundays.

- A task scheduled for Friday checked on Monday = 1 business day overdue
- A task scheduled for Thursday checked on Monday = 2 business days overdue
- A Saturday session treats a Friday-scheduled task as 0 business days overdue
  (not yet overdue — becomes 1 on Monday)

**Why:** "3 days overdue" for a Friday→Monday gap is misleading. Business day
math matches the urgency the director actually feels.

---

## Output Format

### Full briefing (actionable items present)

```
Task Board: {N} Inbox, {N} Active, {N} Delegated, {N} Done

🔴 Overdue Active Tasks
  - {Title} (scheduled {YYYY-MM-DD}, {N} business days overdue)
  - {Title} (scheduled {YYYY-MM-DD}, {N} business days overdue)

🟡 Delegation Check-ins Due
  - {Owner} — {Title} (check-by {YYYY-MM-DD})
  - {Owner} — {Title} (check-by {YYYY-MM-DD}, {N} business days overdue)

📥 Inbox has {N} items — consider running /intake before diving in.

💤 No tasks completed in the last 5 business days — board may need attention.

💡 Suggested: Reach out to {owner} about {title}
```

### Quiet mode (nothing actionable)

```
Task Board: 1 Inbox, 3 Active, 2 Delegated, 15 Done
```

### Icon legend

| Icon | Signal | Meaning |
|------|--------|---------|
| 🔴 | Overdue active tasks | Something slipped — needs action now |
| 🟡 | Delegation check-ins | Attention needed — follow up with delegate |
| 📥 | Inbox volume | Backlog growing — consider triaging |
| 💤 | Board staleness | Nothing completed recently — board may have drifted |
| 💡 | Suggested action | Highest-priority next step |

Consistent with 🔴🟡🟢 health signals used in `/status`. Color is never the
sole differentiator — each section has a distinct text label (WCAG 1.4.1).

### Section visibility rules

| Section | Condition to appear |
|---------|-------------------|
| Task Board counts | Always (if TASKS.md exists) |
| Overdue Active Tasks | At least 1 Active task with `Scheduled` date before today |
| Delegation Check-ins Due | At least 1 Delegated task with `Check-by` ≤ today |
| Inbox alert | Inbox section has ≥ 5 items |
| Staleness signal | Done section has tasks but none with `Done:` in last 5 business days |
| Suggested next action | At least one of the above sections appeared |

### Ordering within sections

- **Overdue active tasks:** Most overdue first (longest-overdue at top)
- **Delegation check-ins:** Overdue first (sorted by most overdue), then
  due-today items

---

## Edge Cases

### `Scheduled: week of YYYY-MM-DD`

A task with `Scheduled: week of 2026-03-23` (Monday) is overdue only when the
entire week has passed — meaning today is after the Friday of that week
(2026-03-27). It becomes overdue on 2026-03-30 (the following Monday).

The task is not overdue on Saturday or Sunday after that Friday. It becomes
1 business day overdue on the following Monday — consistent with the weekend
sessions rule.

### Tasks with no `Scheduled` field

Not surfaced as overdue. Unscheduled tasks are a planning gap, not an urgency.
That's `/plan-week`'s job.

### Delegated task with both `Check-by` due and `Scheduled` overdue

Show in the check-ins section only. The delegation follow-up is the action,
not rescheduling. Do not duplicate in the overdue section.

### Unparseable dates

If a `Scheduled` or `Check-by` value is not a valid `YYYY-MM-DD` and does not
match the `week of YYYY-MM-DD` pattern, skip that task. If any tasks were
skipped, append to the briefing:

```
Note: {N} task(s) have unparseable date values.
```

### TASKS.md does not exist

Output nothing. Same as current behavior.

### Empty Done section

Skip the staleness check entirely. A board with no completed tasks is new,
not stale.

### Weekend sessions

Business day math still applies. If you open a session on Saturday, a task
scheduled for Friday is 0 business days overdue (not yet overdue). It becomes
1 business day overdue on Monday.

### Hook timeout

The current 15-second timeout is sufficient. The enhanced prompt still only
reads one file and formats text.

---

## Requirements

### P0 — Must have

| ID | Requirement | Acceptance Criteria |
|----|------------|-------------------|
| SS-001 | Task board counts header | First line always shows `Task Board: {N} Inbox, {N} Active, {N} Delegated, {N} Done` when TASKS.md exists |
| SS-002 | Overdue active task surfacing | Any Active task with `Scheduled` date (YYYY-MM-DD) strictly before today appears with title and business days overdue |
| SS-003 | `week of` overdue detection | Active tasks with `Scheduled: week of YYYY-MM-DD` are overdue only after the Friday of that week has passed |
| SS-004 | Delegation check-in surfacing | Any Delegated task with `Check-by` ≤ today appears with owner, title, and business days overdue (if past) |
| SS-005 | Business day math | All "days overdue" exclude Saturdays and Sundays |
| SS-006 | Overdue ordering | Overdue active tasks sorted most-overdue-first |
| SS-007 | Check-in ordering | Overdue check-ins first (most overdue), then due-today |
| SS-008 | Quiet mode | When nothing is actionable, output only the counts line |
| SS-009 | No TASKS.md fallback | If TASKS.md does not exist, output nothing |
| SS-010 | Suggested next action | One concrete recommendation following priority: check-ins > overdue > inbox > staleness |
| SS-011 | Read-only | Hook must not write to TASKS.md or any other file |

### P1 — Should have

| ID | Requirement | Acceptance Criteria |
|----|------------|-------------------|
| SS-012 | Inbox gate alert | If Inbox has ≥ 5 items, surface nudge recommending `/intake` |
| SS-013 | Staleness signal | If Done section has tasks but none completed in last 5 business days, surface warning |
| SS-014 | Unparseable date notice | Tasks with invalid date formats are skipped with a count notice |

### P2 — Nice to have

| ID | Requirement | Acceptance Criteria |
|----|------------|-------------------|
| SS-015 | Delegated-only dedup | Delegated tasks with both `Check-by` due and `Scheduled` overdue appear only in check-ins section |

---

## Verification Checklist

- [ ] Hook prompt in `hooks/hooks.json` is updated
- [ ] No new files created (prompt-only change)
- [ ] Task board counts appear on every session with TASKS.md
- [ ] Overdue active tasks listed with titles and business days
- [ ] `week of` scheduled tasks use end-of-week overdue logic
- [ ] Delegation check-ins listed with owner, title, and dates
- [ ] Business day math excludes weekends
- [ ] Quiet mode: only counts when nothing actionable
- [ ] Inbox alert at ≥ 5 items
- [ ] Staleness signal when no completions in 5 business days
- [ ] Suggested action follows priority order
- [ ] No writes to any file (read-only hook)
- [ ] 15-second timeout unchanged
- [ ] Unparseable dates skipped with notice
- [ ] STRUCTURE.md updated if needed
- [ ] PRINCIPLES.md updated if needed
- [ ] CHANGELOG.md updated
