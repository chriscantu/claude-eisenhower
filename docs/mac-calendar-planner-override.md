# Mac Calendar Planner — Calendar Query Override

This document overrides the calendar reading method used by the `mac-calendar-planner` plugin's `/plan-week` skill. The original plugin uses AppleScript's `whose` clause, which times out on the "Cantu" calendar (7,000+ events).

## Override: Reading the Calendar

**ALWAYS use this method instead of the AppleScript templates in `references/applescript-calendar.md` when querying the Cantu calendar.**

### Full event list (for Calendar Digest, Conflict Detection, Overload Detection)

```applescript
do shell script "swift ~/repos/claude-eisenhower/scripts/cal_query.swift 'Cantu' 7 full 2>&1"
```

Output format (one event per line):
```
2026-02-19 08:45|||2026-02-19 09:00|||Goals for the Day|||
2026-02-19 09:00|||2026-02-19 09:30|||SoftServe/Procore UIF team progress|||
...
TOTAL: 57 events
```

Parse by splitting on newlines, then splitting each line on `|||` to get `[start, end, title, allday_flag]`.

### For next week (Monday planning)

```applescript
do shell script "swift ~/repos/claude-eisenhower/scripts/cal_query.swift 'Cantu' 7 full 2>&1"
```

Replace `7` with `14` if the user asks to plan two weeks out.

### Business day availability summary (for Task Scheduling Suggestions)

```applescript
do shell script "swift ~/repos/claude-eisenhower/scripts/cal_query.swift 'Cantu' 7 summary 2>&1"
```

Output:
```
DAY_SUMMARY:
2026-02-19|9.0h_busy|-1.0h_free|available
2026-02-23|5.6h_busy|2.4h_free|available
...
BUSINESS_DAYS: 5
PTO_DAYS: 0
AVAILABLE_DAYS: 1
```

### Querying other calendars

For non-Cantu calendars (which are small), the original AppleScript templates in `references/applescript-calendar.md` still work fine. Only the Cantu calendar requires the Swift EventKit approach.

## Why This Override Exists

See `docs/calendar-performance-fix.md` for the full diagnosis. In short: AppleScript walks every event object to evaluate date filters (O(n) on total calendar size). EventKit uses database indexing and returns instantly regardless of calendar size.
