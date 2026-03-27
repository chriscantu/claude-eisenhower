# Feature Spec: `/review-week`

**Plugin**: claude-eisenhower
**Version**: v1.0.0 (planned)
**Status**: Draft
**Last updated**: 2026-03-04
**Author**: Cantu

---

## Problem Statement

The four-phase task loop (Intake → Prioritize → Schedule → Execute) is complete, but
there is no command to step back and review the week as a whole. A Director interfacing
with 60+ teams ends the week with open delegations, Inbox backlog, and upcoming commitments
spread across TASKS.md, memory, and calendar — none of it aggregated in one view.

Friday afternoon review currently requires running multiple commands and mentally stitching
the results together. Items fall through: a delegation due for check-in on Monday is missed
because no command surfaced it; an Inbox task is forgotten because the count was never shown.

`/review-week` replaces that manual process with one command that gives a complete
situational snapshot before the weekend, optimized for Friday afternoon use.

---

## Goals

1. **One command = complete Friday readiness snapshot** — overdue delegations, upcoming
   check-ins, active commitments, Inbox backlog, and next week's calendar load in a
   single output.
2. **Urgency-ordered output** — items that require action before the weekend appear first;
   informational signals appear last. The user stops reading when they've seen what matters.
3. **Zero writes to task records** — `/review-week` is a read-only command over TASKS.md.
   It never modifies, reclassifies, or closes tasks.
4. **Memory backend transparency** — the command retrieves delegation memory without
   knowledge of whether it is stored via `productivity:memory-management` or the local
   fallback file. One call, same result shape either way.
5. **Track usage analytics** — record a structured review event on each run to support
   trend analysis and plugin improvement over time.

---

## Non-Goals

1. **No scheduling** — `/review-week` does not assign dates or propose focus blocks. That
   is `/schedule`.
2. **No task creation** — it does not create follow-ups or intake records. Surface signals;
   the user decides what to act on.
3. **No TASKS.md writes** — task records are not modified. The only write is the analytics
   log (see P0 Requirement 7).
4. **No inline action flows** — the command does not branch into delegation confirmation,
   escalation, or check-in resolution. It surfaces; the user acts via other commands.
5. **No email or Slack scanning** — those are separate intake commands. `/review-week`
   reads from the existing task board and memory only.

---

## User Stories

**As a Director**, I want to run one command on Friday afternoon and see everything that
needs my attention before the weekend, so that I can head into Saturday confident that
nothing important is slipping.

**As a Director**, I want overdue delegations surfaced first — before calendar load or
Inbox backlog — so that I can decide whether to chase a delegate before EOD Friday rather
than discovering the miss on Monday.

**As a Director**, I want to see my Inbox backlog count and oldest item age so that I
know whether to run `/prioritize` before or after the weekend without digging through
TASKS.md manually.

**As a Director**, I want the coming week's calendar load so that I can mentally size my
scheduling capacity before committing to any new Active work on Monday.

**As a Director**, I want delegation memory (from whichever backend stores it) surfaced
alongside TASKS.md data, so that check-ins I logged outside the task board are not
silently missed at review time.

---

## Output Format

The output is a **sectioned digest**, ordered by urgency. Each section uses a labeled
header. Sections with no data are omitted (not shown as empty).

```
## 🗓 Weekly Review — Friday, March 7

─── 🔴 Needs Action Before Weekend ──────────────────────────────────────
Delegated tasks with Check-by date today or earlier:

  • Jordan V. — "Migrate auth service config" — Check-by: Mar 5 (2 days overdue)
  • Alex M.   — "Review incident post-mortem" — Check-by: Mar 4 (3 days overdue)

─── 🟡 Delegated Check-ins Due Next Week ─────────────────────────────────
  • Sam T.  — "Draft capacity planning doc"  — Check-by: Mar 10
  • Robin K. — "Close API deprecation ticket" — Check-by: Mar 11

─── 📋 Your Plate — Active Tasks Due Next Week ───────────────────────────
  • "Finalize Q2 roadmap"            — Due: Mar 10  [Priority: Q1]
  • "Review platform SLA proposal"   — Due: Mar 12  [Priority: Q2]

─── 📬 Inbox Backlog ─────────────────────────────────────────────────────
  5 unprocessed tasks  |  Oldest: 6 days ago (Feb 29)
  Run /prioritize to clear the backlog.

─── 📆 Calendar Load — Next Week (Mar 10–14) ─────────────────────────────
  Mon: busy  |  Tue: moderate  |  Wed: light  |  Thu: busy  |  Fri: moderate
  Best focus windows: Tuesday morning, Wednesday all-day

─── ✅ Recommended Next Steps ────────────────────────────────────────────
  1. Chase Jordan V. and Alex M. on overdue delegations before EOD.
  2. Run /prioritize — 5 inbox items are waiting.
  3. Schedule a Q2 roadmap focus block for Wednesday (light calendar day).
```

**Design principles for this format:**
- Section order is fixed and urgency-driven. 🔴 always first; 📆 always last before next steps.
- Sections with zero items are silently omitted (no "nothing to report here" noise).
- Delegate alias display name used throughout (resolved from stakeholders.yaml).
- "Recommended Next Steps" section is generated from the surfaced data, not hardcoded.
  If there are no overdue delegations and no Inbox backlog, the next steps reflect that.

---

## Requirements

### P0 — Must Have

**1. Overdue delegation check (TASKS.md)**

Scan TASKS.md for all tasks with `State: Delegated` where `Check-by:` date is today or
earlier and the task is not in `## Done`.

Display format: delegate alias, task title, check-by date, days overdue.
Sort: most overdue first.

*Acceptance criteria:*
- [ ] Tasks in `## Done` are excluded
- [ ] Check-by date comparison uses today's date (local timezone)
- [ ] Days overdue is computed as business days, consistent with existing date helpers
- [ ] Output is sorted by overdue age, descending

---

**2. Upcoming delegated check-ins (TASKS.md)**

Scan TASKS.md for all tasks with `State: Delegated` where `Check-by:` date falls within
the next 5 business days (Mon–Fri of the coming week).

Display format: delegate alias, task title, check-by date.
Sort: soonest first.

*Acceptance criteria:*
- [ ] Only tasks not yet in `## Done` are included
- [ ] "Next 5 business days" is computed from today, skipping weekends
- [ ] Overdue tasks (already in Requirement 1) are excluded from this section

---

**3. Active tasks due next week (TASKS.md)**

Scan TASKS.md for all tasks with `State: Active` where `Due date:` falls within Mon–Fri
of the coming calendar week.

Display format: task title, due date, Priority field value.
Sort: by priority (Q1 first), then by due date ascending.

*Acceptance criteria:*
- [ ] Only `State: Active` tasks are included (not Inbox or Delegated)
- [ ] Tasks without a `Due date:` field are excluded from this section (not surfaced here)
- [ ] "Coming calendar week" = next Monday through Friday, regardless of what day Friday
     `/review-week` is run

---

**4. Inbox backlog summary (TASKS.md)**

Count all tasks with `State: Inbox`. Find the oldest intake date among them.

Display format: count + oldest item age in days.
If count is 0: omit this section entirely.

*Acceptance criteria:*
- [ ] Count includes all `State: Inbox` tasks regardless of Priority
- [ ] Oldest item age uses the `[ INTAKE — {date} ]` header date
- [ ] Section is omitted (not shown) when count is zero

---

**5. Calendar load for coming week**

Read `calendar_name` from `config/calendar-config.md`.
Read `plugin_root` from `config/task-output-config.md`.
Run the EventKit Swift script in summary mode:

```applescript
do shell script "swift {plugin_root}/scripts/cal_query.swift '{calendar_name}' 14 summary 2>&1"
```

Parse the per-day availability output and display Mon–Fri of the coming week only.

*Acceptance criteria:*
- [ ] NEVER uses AppleScript `whose` clause — always uses `cal_query.swift`
- [ ] Displays coming Mon–Fri only (not current week, not beyond)
- [ ] If calendar config is missing: show "Calendar unavailable — run /setup to configure"
     and continue (non-blocking)
- [ ] "Best focus windows" line is generated from days showing `light` or `free` availability

---

**6. Memory check-ins approaching (Memory Access Layer)**

Retrieve all delegation memory entries where check-in date falls within the next 5 business
days.

**Memory Access Layer** (defined here for the first time; see Design Note below):
- Attempt to read via `productivity:memory-management` skill first
- If unavailable: parse `memory/stakeholders-log.md` for entries with `status: pending`
  and check-in dates in range
- Return the same data shape regardless of backend: `[{alias, task, check_in_date}]`
- Do NOT expose which backend was used in the output

Cross-reference against Requirement 2 (TASKS.md delegations): if the same alias+task
already appears in the TASKS.md delegated check-ins section, deduplicate — show once
(prefer TASKS.md as the authoritative source for that entry).

*Acceptance criteria:*
- [ ] Entries appear whether stored in `productivity:memory-management` or local fallback
- [ ] No branching logic visible in command output
- [ ] Deduplication against TASKS.md Delegated section prevents double-listing
- [ ] If neither backend is available: omit silently (not an error)

---

**7. Analytics write**

After displaying the digest, append one structured line to `memory/review-log.md`
(create file if absent; create `memory/` directory if absent):

```
[YYYY-MM-DD] day:{day-of-week} inbox:{N} active:{N} delegated:{N} overdue:{N} calendar:{light|moderate|busy|unavailable}
```

Where:
- `day` = full day name (e.g., `Friday`)
- `inbox` = count from Requirement 4
- `active` = count of Active tasks scanned in Requirement 3
- `delegated` = count of open Delegated tasks scanned in Requirement 2
- `overdue` = count from Requirement 1
- `calendar` = aggregate load grade for next week: `light` if 3+ light days, `busy` if 3+
  busy days, otherwise `moderate`; `unavailable` if calendar config missing

This write is silent — no confirmation, no output to the user.

*Acceptance criteria:*
- [ ] One line appended per `/review-week` run (not per section)
- [ ] Analytics write failure does not block or alter the command output
- [ ] File is human-readable and machine-parseable (space-separated key:value pairs)
- [ ] No PII written — alias names are NOT included in the log (counts only)

---

**8. Config guard**

Before running, check:
- `config/calendar-config.md` — if missing, note in calendar section and continue
- `config/task-output-config.md` — required for `plugin_root` path to Swift script

If `task-output-config.md` is missing, prompt setup and resume:
> "I need your plugin path configured before running the calendar check. Let me run setup."
Then invoke `/setup` and resume `/review-week` when complete.

*Acceptance criteria:*
- [ ] Missing calendar config → calendar section shows graceful fallback message
- [ ] Missing task-output config → triggers `/setup` then resumes (same pattern as `/schedule`)

---

### P1 — Nice to Have

**9. Trend line in analytics output**

When `memory/review-log.md` has 2+ prior entries, surface a brief trend note at the end
of the digest:

```
📈 Trend: Inbox has grown from 3 → 5 items since last Friday. Consider a /prioritize session.
```

Only shown when there is meaningful signal (count increased or overdue count increased).
Omit if this is the first review or the log has only one entry.

**10. "Since last review" delta**

Next to the Inbox count, optionally show the change since the last logged review:
`5 unprocessed tasks (+2 since last Friday)`

Requires `memory/review-log.md` to have a prior entry.

**11. Configurable look-ahead window**

Add optional `review_lookahead_days` field to `task-output-config.md` (default: 5 business
days). Allows users who do reviews mid-week to widen or narrow the check-in window.

---

### P2 — Future Considerations

**12. Recommended next steps personalization**

Today's "Recommended Next Steps" section is generated from a fixed decision tree
(overdue → chase first; Inbox > 3 → prioritize; light calendar day → propose focus block).
A future version could weight recommendations based on `review-log.md` trends — e.g., if
overdue count has been rising for 3 weeks, escalate the recommendation language.

**13. Memory Access Layer retrofit**

The Memory Access Layer defined in Requirement 6 (try skill → fall back to local file,
same return shape) should be retrofitted to the write paths in `schedule.md`, `execute.md`,
and `delegate.md`, which currently duplicate the try/fallback pattern verbatim. This is a
DRY fix, not a behavior change. Tracked as a separate task; unblocks Requirement 6 reuse.

---

## Design Note: Memory Access Layer

This is the first command that needs to **read** from the memory backend. Existing commands
only write to it. Writing the read path as a branch (`if skill available → query skill,
else → parse local file`) would create a third duplication of the try/fallback logic already
in `schedule.md`, `execute.md`, and `delegate.md`.

**Proposed abstraction**: document a "Memory Access Layer" pattern in `docs/PRINCIPLES.md` or
a new `docs/adrs/memory-access-layer.md`:

```
interface MemoryEntry {
  alias: string
  task: string
  check_in_date: string   // YYYY-MM-DD
  status: 'pending' | 'resolved'
}

Memory Access Layer contract:
  readDelegationMemory(lookAheadDays: number): MemoryEntry[]
    1. Attempt productivity:memory-management query
    2. On failure/unavailability: parse memory/stakeholders-log.md
    3. Return same shape regardless of path
    4. Never expose backend to caller
```

The command `.md` file references this abstraction by name:
> "Query the Memory Access Layer for pending entries with check-in within {N} business days."

This keeps the command clean, makes the fallback logic maintainable in one place, and
establishes the pattern for future commands that need memory reads.

**Implementation note**: For v1.0, the abstraction is documented in the spec and enforced
via command prompt phrasing. A TypeScript implementation (analogous to `delegate-core.ts`)
is a P2 enhancement that would benefit commands beyond `/review-week`.

---

## Configuration

No new config file. Uses existing config files:

| Config file | Field used | Purpose |
|-------------|-----------|---------|
| `config/calendar-config.md` | `calendar_name` | Calendar availability query |
| `config/task-output-config.md` | `plugin_root` | Path to `cal_query.swift` |

Analytics log (created by the command, gitignored):

| File | Created by | Format |
|------|-----------|--------|
| `memory/review-log.md` | `/review-week` on first run | Append-only, one line per run |

---

## Success Metrics

**Leading indicators (first 4 weeks):**
- Does the user run `/review-week` each Friday? (detectable from `review-log.md` entries)
- Does the overdue delegation count trend down over time? (signals the command is driving
  follow-up behavior)
- Does the Inbox count stay below 5? (signals the command is prompting `/prioritize`)

**Lagging indicators (2+ months):**
- Are fewer tasks missed at check-in? (qualitative — user reports fewer "forgot to follow up")
- Is the calendar load signal being used to inform scheduling? (user reports using Wednesday
  focus window recommendation from the digest)

**Failure signal**: If `review-log.md` shows consistent Friday entries but overdue count
grows week-over-week, the "Recommended Next Steps" section is not driving action — consider
making the delegation follow-up recommendation more directive.

---

## Open Questions

1. **Inline action prompt for overdue delegations** — Should the command offer to send a
   follow-up (e.g., "Chase Jordan V. now via /delegate?") or remain strictly read-only?
   Current spec: read-only. The next steps section directs the user but does not branch
   into another command flow. *(Decision: keep read-only for v1; reconsider if users
   consistently ask for it.)*

2. **Analytics opt-out** — Should `review-log.md` writes be opt-out via a config flag?
   Current spec: always on. The data is local, contains no PII, and is append-only.
   *(Decision: always on for v1; add opt-out flag if user raises privacy concern.)*

3. **Memory Access Layer documentation location** — `docs/PRINCIPLES.md` (extends existing
   engineering principles) vs. new `docs/adrs/memory-access-layer.md` (dedicated
   reference). *(Recommendation: new dedicated doc; link from docs/PRINCIPLES.md. Keeps
   docs/PRINCIPLES.md focused on DRY/SOLID/TDD rules and avoids mixing architectural patterns
   with engineering principles.)*

4. **"Coming calendar week" boundary on non-Fridays** — Spec assumes Friday use. If the
   user runs `/review-week` on a Wednesday, "next week" is ambiguous — is it the remainder
   of the current week or the following Mon–Fri? *(Recommendation: always interpret as the
   next full Mon–Fri week, regardless of the run day. Simpler and more consistent.)*

5. **`review-log.md` retention** — Should old entries be pruned (e.g., keep last 90 days)?
   An append-only log grows indefinitely. *(Defer to v1.1 — the log is small and the
   growth rate is ~1 line/week. Revisit if size becomes a concern.)*

---

## Files to Create or Update

| File | Action | Purpose |
|------|--------|---------|
| `commands/review-week.md` | Create | New `/review-week` command prompt |
| `memory/review-log.md` | Created at runtime | Analytics log (gitignored) |
| `docs/adrs/memory-access-layer.md` | Create | Memory Access Layer pattern doc |
| `docs/specs/review-week-spec.md` | Create | This document |
| `docs/PRINCIPLES.md` | Update | Link to `memory-access-layer.md` under DRY section |
| `.gitignore` | Update | Add `memory/review-log.md` |
| `ROADMAP.md` | Update | Move `/review-week` from Near-Term → Shipped on completion |

---

## Gherkin Scenarios

### REVIEW-WEEK-001: Overdue delegations surfaced first

```gherkin
Given TASKS.md has a Delegated task with Check-by date 2 days ago
And the task is not in ## Done
When the user runs /review-week
Then the 🔴 Needs Action section appears before all other sections
And the task shows delegate alias, title, and "2 days overdue"
```

### REVIEW-WEEK-002: No overdue delegations — section omitted

```gherkin
Given TASKS.md has no Delegated tasks with past Check-by dates
When the user runs /review-week
Then the 🔴 Needs Action section is not shown
And the output begins with the next non-empty section
```

### REVIEW-WEEK-003: Inbox backlog shown with oldest age

```gherkin
Given TASKS.md has 4 tasks with State: Inbox
And the oldest was logged 8 days ago
When the user runs /review-week
Then the 📬 Inbox section shows "4 unprocessed tasks | Oldest: 8 days ago"
```

### REVIEW-WEEK-004: Analytics log written after each run

```gherkin
Given /review-week completes successfully
When the digest is displayed
Then memory/review-log.md contains one new line
And the line includes today's date, day name, and all count fields
And the line contains no alias names or task titles
```

### REVIEW-WEEK-005: Memory backend transparency

```gherkin
Given a delegation entry exists in memory/stakeholders-log.md with check-in in 3 days
And productivity:memory-management skill is unavailable
When the user runs /review-week
Then the check-in appears in the 🟡 Delegated Check-ins section
And the output contains no reference to "stakeholders-log.md" or "fallback"
```

### REVIEW-WEEK-006: Memory deduplication

```gherkin
Given TASKS.md has a Delegated task for alias "Jordan V." with Check-by: Mar 10
And memory/stakeholders-log.md has an entry for the same alias and task
When the user runs /review-week
Then "Jordan V." appears once in the check-ins section, not twice
```

### REVIEW-WEEK-007: Missing calendar config — graceful fallback

```gherkin
Given config/calendar-config.md does not exist
When the user runs /review-week
Then all non-calendar sections render normally
And the 📆 Calendar section shows "Calendar unavailable — run /setup to configure"
And no error is thrown
```

### REVIEW-WEEK-008: Zero Inbox — section omitted

```gherkin
Given TASKS.md has no tasks with State: Inbox
When the user runs /review-week
Then the 📬 Inbox Backlog section is not shown
```
