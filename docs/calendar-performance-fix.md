# Calendar Query Performance Fix

## Date
2026-02-19

## Problem
The `/scan-email` command's Step 6 calendar availability check was timing out when querying the "Cantu" calendar. The same issue affected `/plan-week` from the mac-calendar-planner plugin and the `/schedule` command's calendar integration.

## Root Cause
Both plugins used AppleScript's `whose` clause to filter calendar events by date range:

```applescript
set calEvents to (events of cal whose start date >= startDate and start date <= endDate)
```

This approach has two compounding issues:

1. **No indexing** — AppleScript's `whose` iterates through every event object in the calendar sequentially (O(n) on total calendar size), regardless of the date range requested
2. **Full calendar scan** — the original script looped over all calendars (`repeat with cal in calendars`), not just "Cantu"

The "Cantu" calendar contains 7,000+ events accumulated over its lifetime and growing. Even scoped to a 7-day window, the AppleScript query exceeded the 30-second MCP osascript timeout.

## Diagnosis Evidence

| Method | Calendar | Window | Result |
|--------|----------|--------|--------|
| AppleScript `whose` (all calendars) | All | 7 days | Timeout at 30s |
| AppleScript `whose` (Cantu only) | Cantu | 7 days | Timeout at 30s |
| Swift EventKit | Cantu | 7 days | Instant (57 events) |
| Swift EventKit | Cantu | 14 days | Instant |
| Swift EventKit | Cantu | 90 days | Instant (full quarter) |

## Solution
Replaced AppleScript calendar queries with a Swift script (`scripts/cal_query.swift`) that uses Apple's EventKit framework. EventKit queries the CalendarStore database with proper indexing, making lookups instant regardless of total calendar size.

### Why EventKit
- Uses the same indexed database that Calendar.app itself uses
- Predicate-based queries are evaluated at the database level, not in-memory
- Supports calendar filtering by name (no need to iterate all calendars)
- Future-proof: performance won't degrade as the calendar grows

### Alternatives Considered
- **icalBuddy** — CLI tool with native CalendarStore access. Not installed; would require Homebrew. Good option but adds a dependency.
- **Scoping AppleScript to "Cantu" only** — Tested; still timed out. The `whose` clause is the bottleneck, not the outer loop.
- **Google Calendar MCP tools** — The Cantu calendar syncs from Google, so `list_gcal_events` / `find_free_time` could work. However, these also have their own timeout limits for large calendars and would add a network dependency. The local EventKit approach is faster and works offline.
- **Export .ics and parse** — Requires file system access to `~/Library/Calendars/` which is permission-restricted. Would also need custom ICS parsing logic.

## Files Changed

### New
- `scripts/cal_query.swift` — Reusable EventKit-based calendar query script
- `scripts/README.md` — Usage documentation for the script
- `docs/calendar-performance-fix.md` — This document

### Updated
- `commands/scan-email.md` — Step 6 now calls `cal_query.swift` instead of AppleScript
- `commands/schedule.md` — Calendar integration section now references `cal_query.swift`

### Not Updated (read-only)
- `mac-calendar-planner` plugin — Marketplace install, read-only. A customization layer is provided separately (see `docs/mac-calendar-planner-override.md`).

## Script Usage

```bash
# Full event list for next 7 days
swift ~/repos/claude-eisenhower/scripts/cal_query.swift "Cantu" 7 full

# Business day availability summary
swift ~/repos/claude-eisenhower/scripts/cal_query.swift "Cantu" 14 summary
```

Invocation from osascript MCP tool:
```applescript
do shell script "swift ~/repos/claude-eisenhower/scripts/cal_query.swift 'Cantu' 7 summary 2>&1"
```

## Availability Rules (summary mode)
A business day is "available" when all of these are true:
- Monday through Friday
- No all-day PTO/OOO/vacation event
- Less than 7 hours of meetings (accounts for overlapping events)
- At least 2 hours of free time remaining
