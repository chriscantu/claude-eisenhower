# Claude Eisenhower — Plugin Instructions

## Configuration Files (Read First)

Before running any command that touches calendar or email, read the relevant
config file from `integrations/config/`:

| Config file | Controls | Used by |
|-------------|----------|---------|
| `integrations/config/calendar-config.md` | Mac Calendar name | `/schedule`, `/scan-email` |
| `integrations/config/email-config.md` | Apple Mail account + inbox | `/scan-email` |
| `integrations/config/task-output-config.md` | Reminders list + active adapter | `/schedule` |

---

## Calendar Query Override (CRITICAL)

**NEVER use AppleScript's `whose` clause to query any calendar.** It is O(n)
on total event count and will time out on large calendars.

Instead, always read `calendar_name` from `integrations/config/calendar-config.md`
and use the EventKit-based Swift script:

```applescript
do shell script "swift ~/repos/claude-eisenhower/scripts/cal_query.swift '{calendar_name}' {DAYS} {FORMAT} 2>&1"
```

Where:
- `{calendar_name}` = value of `calendar_name` from `integrations/config/calendar-config.md`
- `{DAYS}` = number of days ahead to query (e.g., 7, 14, 90)
- `{FORMAT}` = `full` (event list) or `summary` (business day availability)

This applies to ALL calendar queries across all commands and skills, including:
- `/scan-email` Step 6 (calendar availability check)
- `/schedule` calendar integration
- `/plan-week` from mac-calendar-planner
- Any ad-hoc calendar lookups

See `integrations/docs/calendar-performance-fix.md` for the full diagnosis and
`integrations/docs/mac-calendar-planner-override.md` for mac-calendar-planner-specific usage.

# currentDate
Today's date is 2026-02-19.
