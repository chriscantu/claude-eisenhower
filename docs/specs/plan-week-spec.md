# Feature Spec: `/plan-week`

**Plugin**: claude-eisenhower
**Version**: v1.7.0 (planned)
**Status**: Draft
**Last updated**: 2026-03-27
**Author**: Cantu

---

## Problem Statement

The four-phase task loop (Intake, Prioritize, Schedule, Execute) has a retrospective
view (`/review-week`) and a daily briefing (`/today`), but no forward-planning command.
A Director of Engineering ends the weekend with a vague sense of what slipped and what's
coming, then spends Monday morning manually stitching together carryover items, new
priorities, delegation follow-ups, and calendar constraints to figure out what to commit
to this week.

`/review-week` tells you what happened. `/schedule` assigns dates to individual tasks.
Nothing helps you step back and say: "Given my calendar capacity and what carried over,
here are the 5 things I'm committing to this week."

`/plan-week` fills that gap. It proposes a concrete commitment list based on priorities,
carryover, and calendar capacity. The user approves or adjusts, and the command marks
tasks as planned for the week. `/schedule` then refines those commitments into specific
dates and Reminders pushes.

---

## Goals

1. **One command = weekly commitment decisions** — carryover, fresh priorities, delegation
   follow-ups, and calendar capacity in a single proposal the user approves or adjusts.
2. **Bridge `/review-week` and `/schedule`** — reference Friday's review for continuity,
   produce output that `/schedule` consumes for date assignment.
3. **Neutral framing on carryover** — unfinished items are "open commitments," not failures.
   The command surfaces them without guilt-trip language.
4. **Capacity-informed but not capacity-enforced** — show calendar load as a soft signal
   with actionable guidance, not hard constraints requiring effort estimation.
5. **Works any day of the week** — designed for Monday morning but scopes dynamically to
   remaining days when run mid-week.

---

## Non-Goals

1. **No specific date assignment** — `/plan-week` writes `Scheduled: week of YYYY-MM-DD`,
   not a specific date. That is `/schedule`.
2. **No Reminders push** — adapter integration is `/schedule`'s responsibility.
3. **No delegate confirmation** — delegation workflows (confirm delegate, set check-in,
   log memory) happen in `/prioritize` and `/schedule`.
4. **No task creation or intake** — surfaces Inbox count as an alert, does not triage.
5. **No effort estimation** — task schema has no effort field. Capacity is a soft signal
   based on calendar availability and item count.

---

## User Stories

**As a Director**, I want to run one command on Monday morning and see a proposed plan
for the week — what carried over, what's new, and what delegation follow-ups I have —
so I can commit to a realistic set of tasks before my first meeting.

**As a Director**, I want unfinished items from last week automatically surfaced as
candidates — not hidden — so nothing slips through the cracks between weeks.

**As a Director**, I want to see my calendar load alongside the proposed task list so I
can judge whether I'm overcommitting without needing to check my calendar separately.

**As a Director**, I want delegation check-ins included in my weekly capacity picture so
I account for follow-up conversations, not just deep work.

**As a Director**, I want to adjust the proposed plan (add, remove, defer items) before
committing, so the command works with my judgment rather than overriding it.

**As a Director**, I want continuity from Friday's review — what changed since then — so
Monday planning builds on Friday context rather than starting from scratch.

---

## Design Decisions

### D1: Monday-optimized, any-day-capable

Designed for Monday morning but works any day. When run after Monday, the command scopes
to remaining days (today through Friday): calendar shows remaining days only, carryover
is labeled "open from earlier this week" instead of "open from last week," and the
capacity note reflects remaining days.

The command never plans into the following week — that's next Monday's job.

### D2: `Scheduled: week of YYYY-MM-DD` reuses existing field

Instead of adding a new `Planned:` field to the task schema, `/plan-week` writes
`Scheduled: week of YYYY-MM-DD` (always the Monday of the current week, even if run on
Wednesday). This avoids schema debt and the "planned but never scheduled" limbo state.

`/schedule` refines `week of ...` to a specific date, overwriting the week-level value.
Carryover detection for next week: find Active tasks where `Scheduled: week of ...` has
a past Monday date and no `Done:` date.

### D3: Inbox alert, not Inbox triage

If Inbox items exist, `/plan-week` shows a count and asks whether to triage first or
plan with what's classified. It does not prioritize Inbox items itself — that's
`/prioritize`. This prevents a new Q1 from blindsiding the plan after commitment.

### D4: Soft capacity signal with actionable guidance

Calendar load is shown per-day with focus windows identified, but no effort estimation
or hard cap. The capacity note gives concrete guidance: "4 tasks + 3 check-ins against
~2 focus days. Consider deferring 1 Q2 item if meetings expand." Decision levers, not
labels.

### D5: Delegation check-ins are read-only in the proposal

Check-ins due this week are surfaced for awareness and included in the capacity math, but
`/plan-week` does not modify `Check-by:` dates or write to delegation memory. The user
acts on check-ins via `/execute` or direct follow-up.

### D6: Neutral carryover language

Unfinished items are "open commitments" — framed as continuing work, not missed deadlines.
The label says `open from last week` or `open from earlier this week`, not "was scheduled
Mar 26, not completed."

### D7: Review log bridge

When `memory/review-log.md` has a recent entry (within 7 days), `/plan-week` shows a
one-liner bridge: what the review snapshot looked like and what changed since. Creates
continuity between Friday review and Monday planning.

### D8: Throughput calibration via completed items

A brief "Completed since last plan" section (max 5 items) shows what got done since the
last `/plan-week` run. Helps the user calibrate: if 2 items were completed last week and
6 are proposed this week, something may be off. Omitted if nothing was completed.

### D9: Interactive adjustment, not binary approval

After presenting the proposal, the user can add, remove, or defer items conversationally.
No formal wizard — the user talks naturally ("drop item 4", "defer the retro template",
"add the SLA review"). Confirmation happens when the user says "looks good" or equivalent.

---

## Output Format

The output is a sectioned proposal, ordered for Monday morning decision-making. Sections
with no data are omitted.

```
## 📋 Week Plan — Monday, March 30

─── 🔗 Since Friday's Review ──────────────────────────────
  Last review (Mar 28): 1 overdue, 5 inbox items, moderate calendar.
  Since then: overdue resolved, 3 new inbox items arrived.

─── 📬 Inbox Alert ─────────────────────────────────────────
  3 unprocessed items in Inbox (newest: Saturday).
  Run /prioritize first, or plan with what's already classified?

─── 📆 Calendar Load ──────────────────────────────────────
  Mon: busy  |  Tue: moderate  |  Wed: light  |  Thu: busy  |  Fri: moderate
  Focus windows: Wednesday, Friday afternoon

─── ✅ Completed Since Last Plan (2 items) ─────────────────
  • "Close API deprecation ticket" — Done: Mar 27
  • "Update staging runbook" — Done: Mar 26

─── ⭐ Proposed Plan ───────────────────────────────────────

  Personal commitments (4):
    1. [Q1] "Finalize auth migration rollback plan" ← open from last week
    2. [Q2] "Draft Q2 roadmap" ← open from last week
    3. [Q2] "Review platform SLA proposal" — Due: Apr 2
    4. [Q2] "Write incident retro template"

  Delegation check-ins (3):
    • Alex R. — "Migrate auth config" — Check-by: tomorrow
    • Jordan V. — "Load test results" — Check-by: Wed
    • Sam T. — "Capacity planning doc" — Check-by: Fri

  ⚖️ 4 tasks + 3 check-ins against ~2 focus days (Wed, Fri PM).
  Consider deferring 1 Q2 item if meetings expand.

─── 💡 Recommended ─────────────────────────────────────────
  1. Q1 auth rollback plan first — open commitment from last week.
  2. Block Wednesday for Q2 deep work.
  3. Chase Alex R. tomorrow — check-in due.

Adjust the plan (add, remove, defer items) or confirm as-is.
Then run /schedule to assign dates and push to Reminders.
```

**Mid-week variant (run on Wednesday):**

```
## 📋 Week Plan — Wednesday, April 1

─── 📆 Calendar Load (Wed–Fri) ─────────────────────────────
  Wed: light  |  Thu: busy  |  Fri: moderate
  Focus windows: Wednesday (today)

─── ⭐ Proposed Plan ───────────────────────────────────────

  Personal commitments (2):
    1. [Q1] "Finalize auth migration rollback plan" ← open from earlier this week
    2. [Q2] "Review platform SLA proposal" — Due: Apr 2

  Delegation check-ins (2):
    • Jordan V. — "Load test results" — Check-by: today
    • Sam T. — "Capacity planning doc" — Check-by: Fri

  ⚖️ 2 tasks + 2 check-ins against ~1.5 focus days (today, Fri PM).
  Tight — prioritize the Q1 item.

...
```

---

## Requirements

### P0 — Must Have

**1. Open commitment detection (carryover)**

Scan TASKS.md for Active tasks where `Scheduled:` contains a date or `week of` value
in the past and no `Done:` date is set.

Display format: priority tag, title, `← open from last week` or `← open from earlier
this week` depending on timing.

Sort: Q1 first, then Q2.

*Acceptance criteria:*
- [ ] Tasks with `Scheduled: week of YYYY-MM-DD` where Monday is in the past are detected
- [ ] Tasks with `Scheduled: YYYY-MM-DD` where date is in the past are detected
- [ ] Tasks in `## Done` are excluded
- [ ] Carryover label adjusts based on whether run is Monday vs later in the week

---

**2. Unscheduled Active task candidates**

Scan TASKS.md for Active tasks with no `Scheduled:` field.

Display format: priority tag, title, due date if set.

Sort: Q1 first, then Q2. Within same priority, due date ascending (tasks with due dates
before tasks without).

*Acceptance criteria:*
- [ ] Only `State: Active` tasks are included
- [ ] Tasks already in `## Done` are excluded
- [ ] Tasks with existing `Scheduled:` field (current week or future) are excluded
- [ ] Sort order: Q1 before Q2, due-dated before undated within same priority

---

**3. Delegation check-ins due this week**

Scan TASKS.md for Delegated tasks (not in Done) where `Check-by:` falls within the
planning window (today through Friday of the current week).

Display format: delegate alias, task title, relative Check-by date ("tomorrow", day
name, or "today").

Sort: Check-by date ascending (soonest first).

*Acceptance criteria:*
- [ ] Only `State: Delegated` tasks not in `## Done`
- [ ] Planning window = today through Friday, inclusive
- [ ] Overdue delegations (Check-by before today) are included with "⚠️ {N} days overdue" signal
- [ ] Relative date labels: "today", "tomorrow", or day name (e.g., "Wed") for non-overdue items

---

**4. Calendar load for planning window**

Read `calendar_name` from `config/calendar-config.md`. Read `plugin_root`. Run
`cal_query.swift` in summary mode.

Display per-day availability for remaining days this week. Identify focus windows
(light/free days).

*Acceptance criteria:*
- [ ] Uses `cal_query.swift`, never AppleScript `whose`
- [ ] Monday: shows Mon–Fri. Other days: shows today–Fri
- [ ] Focus windows identified from light/free days
- [ ] Missing calendar config → graceful fallback message, command continues

---

**5. Inbox alert**

Count `State: Inbox` tasks. If count > 0, show alert with count and newest item age.
Ask user whether to triage first or continue.

*Acceptance criteria:*
- [ ] Omitted when Inbox count = 0
- [ ] If user chooses to triage: stop and direct to `/prioritize`
- [ ] If user chooses to continue: proceed with classified tasks only
- [ ] Newest item age shown (not oldest — "newest: Saturday" tells user when the last
      item arrived)

---

**6. Proposal assembly and presentation**

Combine all data into the sectioned output format defined above. Two sub-sections in
the Proposed Plan: Personal commitments (open + fresh, sorted Q1→Q2) and Delegation
check-ins (sorted by Check-by ascending).

Capacity note: `"{N} tasks + {M} check-ins against ~{X} focus days ({day names}).
{Actionable guidance}."`

Guidance logic:
- Items + check-ins <= focus days → "Looks manageable."
- Items + check-ins > focus days but within 1.5x → "Consider deferring 1 Q2 item if
  meetings expand."
- Items + check-ins > 1.5x focus days → "Heavy week — consider deferring Q2 items to
  next week."

*Acceptance criteria:*
- [ ] Open commitments appear before fresh candidates
- [ ] Each open commitment is labeled with carryover flag
- [ ] Delegation check-ins are in a separate sub-section
- [ ] Capacity note includes both tasks and check-ins
- [ ] Actionable guidance is generated, not a static label

---

**7. Interactive adjustment**

After presenting the proposal, accept conversational adjustments:
- **Remove**: drop an item from the plan (no write, not deferred — just excluded)
- **Defer**: explicitly push to next week (no write — absence of `Scheduled:` is the signal)
- **Add**: include an existing Active task from TASKS.md not in the current proposal

Confirmation happens when the user says "looks good", "confirm", "yes", or equivalent.

*Acceptance criteria:*
- [ ] User can remove items by number or title reference
- [ ] User can add Active tasks not already in the proposal
- [ ] User cannot add Inbox tasks (must run /prioritize first)
- [ ] Deferred items receive no write — they reappear as candidates next time
- [ ] No write happens until explicit confirmation

---

**8. Write to TASKS.md**

After user confirms, for each committed personal task:
- Write `Scheduled: week of YYYY-MM-DD` where YYYY-MM-DD is the Monday of the current
  week

For delegation check-ins: no write. Already tracked via `Check-by:`.

For deferred items: no write. Absence of `Scheduled:` is the signal.

*Acceptance criteria:*
- [ ] `Scheduled:` field uses `week of YYYY-MM-DD` format with Monday's date
- [ ] If task already has a `Scheduled:` value (from prior week carryover), it is
      overwritten with the new week
- [ ] Delegation check-in records are not modified
- [ ] Write only occurs after explicit user confirmation

---

**9. Analytics log**

After writing to TASKS.md, append one line to `memory/plan-log.md` (create if absent).

Format:
```
[YYYY-MM-DD] day:{day-name} committed:{N} carryover:{N} checkins:{N} inbox:{N} deferred:{N}
```

Fields:
- `committed` — total personal tasks the user confirmed
- `carryover` — how many of those were open commitments from a prior week
- `checkins` — delegation check-ins surfaced (not a commitment, an awareness count)
- `inbox` — Inbox count at time of planning
- `deferred` — items the user explicitly deferred during adjustment

*Acceptance criteria:*
- [ ] Silent write — not mentioned to user
- [ ] No PII — no aliases, titles, or email addresses
- [ ] Append-only, one line per run
- [ ] Write failure does not block command output

---

**10. Review log bridge**

Read `memory/review-log.md` for the most recent entry. If the entry is within 7 days,
show a one-liner bridge section:

```
Last review ({date}): {overdue} overdue, {inbox} inbox items, {calendar} calendar.
Since then: {delta summary}.
```

Delta summary compares review-log values against current TASKS.md state:
- Overdue count delta
- Inbox count delta

*Acceptance criteria:*
- [ ] Omitted if no review-log entry within 7 days
- [ ] Omitted if `memory/review-log.md` does not exist
- [ ] Delta is computed from current TASKS.md state vs. logged values
- [ ] Bridge is informational — no writes, no actions

---

**11. Completed since last plan**

Read `memory/plan-log.md` for the most recent entry date. Collect tasks in `## Done`
with `Done:` date after that date. If no prior plan entry exists, use 5 business day
lookback.

Display format: task title, Done date. Max 5 items.

*Acceptance criteria:*
- [ ] Omitted if no tasks completed in the window
- [ ] Max 5 items, with overflow note if more exist
- [ ] Lookback anchored to last plan-log date, falling back to 5 business days
- [ ] Tasks shown regardless of prior state (Active or Delegated)

---

### P1 — Nice to Have

**12. Trend note from plan-log**

When `memory/plan-log.md` has 2+ entries, surface a brief trend:
`"Last week: committed 4, completed 2. Carryover trending up — consider smaller commitments."`

Only shown when there is meaningful signal (carryover increasing or committed >> completed).

**13. Recommended section personalization**

Weight recommendations based on `plan-log.md` trends. If carryover has increased for
3+ weeks, escalate the recommendation language from "consider deferring" to "strongly
recommend reducing commitments."

---

## Configuration

No new config file. Uses existing:

| Config file | Field used | Purpose |
|-------------|-----------|---------|
| `config/calendar-config.md` | `calendar_name` | Calendar availability query |
| `config/task-output-config.md` | `plugin_root` | Path to `cal_query.swift` |

Analytics log (created by the command, gitignored):

| File | Created by | Format |
|------|-----------|--------|
| `memory/plan-log.md` | `/plan-week` on first run | Append-only, one line per run |

---

## Schema Impact

**No new fields.** `/plan-week` writes `Scheduled: week of YYYY-MM-DD` using the
existing `Scheduled:` field from `docs/specs/tasks-schema-spec.md`.

**`/schedule` update required:** When `/schedule` encounters a task with
`Scheduled: week of YYYY-MM-DD`, it refines the value to a specific date (overwrites
the week-level value). This is a minor behavioral update to `commands/schedule.md`,
not a schema change.

**Carryover detection:** Active tasks where `Scheduled: week of YYYY-MM-DD` has a Monday
date in the past and no `Done:` date are open commitments for the next `/plan-week` run.
Tasks with a specific-date `Scheduled:` value in the past are also detected as carryover.

---

## Files to Create or Update

| File | Action | Purpose |
|------|--------|---------|
| `commands/plan-week.md` | Create | New `/plan-week` command |
| `commands/schedule.md` | Update | Handle `Scheduled: week of ...` refinement |
| `docs/STRUCTURE.md` | Update | Add plan-week to commands list |
| `docs/specs/plan-week-spec.md` | Create | This document |
| `memory/plan-log.md` | Created at runtime | Analytics log (gitignored) |

---

## Blast Radius

- **TASKS.md**: Writes `Scheduled: week of ...` to confirmed tasks. Reversible — user
  can edit or re-run `/plan-week`.
- **`commands/schedule.md`**: Minor update to recognize `week of` prefix and refine to
  specific date. No behavior change for tasks already scheduled with specific dates.
- **No new dependencies**: Uses existing `cal_query.swift`, existing config files,
  existing TASKS.md schema.
- **No PII exposure**: Analytics log contains counts only.

---

## Gherkin Scenarios

### PW-001: Open commitments surfaced as carryover

```gherkin
Given TASKS.md has an Active task with "Scheduled: week of 2026-03-23" and no Done date
And today is Monday 2026-03-30
When the user runs /plan-week
Then the task appears in the Personal commitments section
And it is labeled "← open from last week"
And it appears before unscheduled candidates
```

### PW-002: Unscheduled Active tasks proposed as candidates

```gherkin
Given TASKS.md has 2 Active tasks with no Scheduled field (one Q1, one Q2)
When the user runs /plan-week
Then both tasks appear in the Personal commitments section
And the Q1 task appears before the Q2 task
```

### PW-003: Delegation check-ins surfaced in planning window

```gherkin
Given TASKS.md has a Delegated task with Check-by: 2026-03-31
And today is Monday 2026-03-30
When the user runs /plan-week
Then the task appears in the Delegation check-ins section
And the Check-by is shown as "tomorrow"
```

### PW-004: Inbox alert shown when unprocessed items exist

```gherkin
Given TASKS.md has 3 tasks with State: Inbox
When the user runs /plan-week
Then the Inbox Alert section shows "3 unprocessed items"
And it asks whether to triage first or continue
```

### PW-005: Inbox alert omitted when Inbox is empty

```gherkin
Given TASKS.md has 0 tasks with State: Inbox
When the user runs /plan-week
Then the Inbox Alert section is not shown
```

### PW-006: Calendar scoped to remaining days mid-week

```gherkin
Given today is Wednesday 2026-04-01
When the user runs /plan-week
Then the Calendar Load section shows Wed, Thu, Fri only
And the header reads "Calendar Load (Wed–Fri)"
```

### PW-007: Confirmed tasks receive week-level Scheduled field

```gherkin
Given the user confirms the proposed plan on Monday 2026-03-30
When /plan-week writes to TASKS.md
Then each confirmed personal task has "Scheduled: week of 2026-03-30"
And delegation check-in records are not modified
```

### PW-008: Mid-week run uses current Monday for Scheduled value

```gherkin
Given today is Wednesday 2026-04-01
And the user confirms 2 tasks in /plan-week
When /plan-week writes to TASKS.md
Then each confirmed task has "Scheduled: week of 2026-03-30" (Monday of current week)
```

### PW-009: User defers an item — no write

```gherkin
Given /plan-week proposes 4 personal commitments
And the user says "defer item 4"
And the user confirms the remaining 3
When /plan-week writes to TASKS.md
Then 3 tasks have "Scheduled: week of ..." written
And the deferred task has no Scheduled field added
```

### PW-010: Review log bridge shown when recent review exists

```gherkin
Given memory/review-log.md has an entry dated 2026-03-28 (last Friday)
And today is Monday 2026-03-30
When the user runs /plan-week
Then the "Since Friday's Review" section is shown
And it includes the overdue count and inbox count from the review entry
```

### PW-011: Review log bridge omitted when no recent review

```gherkin
Given memory/review-log.md does not exist
When the user runs /plan-week
Then the "Since Friday's Review" section is not shown
```

### PW-012: Analytics log written after confirmation

```gherkin
Given the user confirms the plan
When /plan-week completes
Then memory/plan-log.md contains one new line
And the line includes committed, carryover, checkins, inbox, and deferred counts
And the line contains no alias names or task titles
```

### PW-013: Completed since last plan shown

```gherkin
Given memory/plan-log.md has a last entry dated 2026-03-23
And TASKS.md has 2 tasks in Done with Done dates after 2026-03-23
When the user runs /plan-week
Then the "Completed Since Last Plan" section shows both tasks
```

### PW-014: Carryover label adjusts for mid-week run

```gherkin
Given TASKS.md has an Active task with "Scheduled: week of 2026-03-30" and no Done date
And today is Wednesday 2026-04-01
When the user runs /plan-week
Then the task appears labeled "← open from earlier this week"
```

### PW-015: Missing calendar config — graceful fallback

```gherkin
Given config/calendar-config.md does not exist
When the user runs /plan-week
Then all non-calendar sections render normally
And the Calendar Load section shows "Calendar unavailable — run /setup to configure"
```

### PW-016: Schedule command refines week-level Scheduled value

```gherkin
Given a task has "Scheduled: week of 2026-03-30"
When the user runs /schedule for that task and confirms a specific date
Then the Scheduled field is overwritten to "Scheduled: 2026-03-31"
```

---

## Verification Checklist

- [ ] `/plan-week` on Monday shows Mon–Fri calendar, "open from last week" labels
- [ ] `/plan-week` on Wednesday shows Wed–Fri calendar, "open from earlier this week" labels
- [ ] Carryover detection finds both `Scheduled: week of ...` and specific past dates
- [ ] Inbox alert blocks proposal until user chooses (triage or continue)
- [ ] Interactive adjustment allows add/remove/defer before confirmation
- [ ] `Scheduled: week of YYYY-MM-DD` is written only after explicit confirmation
- [ ] Delegation check-in records are never modified
- [ ] Analytics log written silently with no PII
- [ ] Review log bridge shows delta from Friday when available
- [ ] `/schedule` correctly refines `week of ...` to a specific date
- [ ] Missing calendar config does not break the command
