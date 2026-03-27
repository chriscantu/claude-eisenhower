# Claude Eisenhower � Plugin Instructions

## Engineering Principles (Read First)

Before writing any code or creating any files, read `docs/PRINCIPLES.md`.
It defines the DRY, SOLID, TDD, PII safety, and structure rules that govern
all work in this repository. These apply to every session, every feature.

---

## Configuration Files

Before running any command that touches calendar or email, read the relevant
config file from `config/`:

| Config file | Controls | Used by |
|-------------|----------|---------|
| `config/calendar-config.md` | Mac Calendar name | `/schedule`, `/scan-email` |
| `config/email-config.md` | Apple Mail account + inbox | `/scan-email` |
| `config/task-output-config.md` | Reminders list + active adapter | `/schedule` |

---

## Calendar Query Override (CRITICAL)

**NEVER use AppleScript's `whose` clause to query any calendar.** It is O(n)
on total event count and will time out on large calendars.

Instead, always read `calendar_name` from `config/calendar-config.md`
and use the EventKit-based Swift script:

```applescript
do shell script "swift ~/repos/claude-eisenhower/scripts/cal_query.swift '{calendar_name}' {DAYS} {FORMAT} 2>&1"
```

Where:
- `{calendar_name}` = value of `calendar_name` from `config/calendar-config.md`
- `{DAYS}` = number of days ahead to query (e.g., 7, 14, 90)
- `{FORMAT}` = `full` (event list) or `summary` (business day availability)

This applies to ALL calendar queries across all commands and skills, including:
- `/scan-email` Step 6 (calendar availability check)
- `/schedule` calendar integration
- `/plan-week` from mac-calendar-planner
- Any ad-hoc calendar lookups

See `docs/calendar-performance-fix.md` for the full diagnosis and
`docs/mac-calendar-planner-override.md` for mac-calendar-planner-specific usage.