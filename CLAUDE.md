# Claude Eisenhower — Plugin Instructions

## Calendar Query Override (CRITICAL)

**NEVER use AppleScript's `whose` clause to query the "Cantu" calendar.** It contains 7,000+ events and the query will time out.

Instead, always use the EventKit-based Swift script:

```applescript
do shell script "swift ~/repos/claude-eisenhower/scripts/cal_query.swift 'Cantu' {DAYS} {FORMAT} 2>&1"
```

Where:
- `{DAYS}` = number of days ahead to query (e.g., 7, 14, 90)
- `{FORMAT}` = `full` (event list) or `summary` (business day availability)

This applies to ALL calendar queries across all commands and skills, including:
- `/scan-email` Step 6 (calendar availability check)
- `/schedule` calendar integration
- `/plan-week` from mac-calendar-planner
- Any ad-hoc calendar lookups

See `docs/calendar-performance-fix.md` for the full diagnosis and `docs/mac-calendar-planner-override.md` for mac-calendar-planner-specific usage.
