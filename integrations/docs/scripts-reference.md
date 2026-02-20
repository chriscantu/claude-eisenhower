# Calendar Query Scripts

## cal_query.swift

Fast calendar query using Apple's EventKit framework. Replaces slow AppleScript `whose` clause queries that time out on large calendars (7000+ events).

### Why this exists

AppleScript's `whose` clause iterates through every event object sequentially — O(n) on total calendar size, regardless of the date range. The "Cantu" calendar has 7000+ events and growing, causing 30s+ timeouts even for a 7-day query window. EventKit uses the CalendarStore database with proper indexing, making queries instant.

### Usage

```bash
# Full event list for next 7 days
swift ~/repos/claude-eisenhower/scripts/cal_query.swift "Cantu" 7 full

# Business day availability summary (for scan-email escalation logic)
swift ~/repos/claude-eisenhower/scripts/cal_query.swift "Cantu" 14 summary
```

### Invocation from osascript MCP tool

```applescript
do shell script "swift ~/repos/claude-eisenhower/scripts/cal_query.swift 'Cantu' 7 summary 2>&1"
```

### Output formats

**full** — one event per line: `start|||end|||title|||allday_flag`
**summary** — business day breakdown with availability counts:
```
DAY_SUMMARY:
2026-02-19|9.0h_busy|-1.0h_free|available
BUSINESS_DAYS: 5
PTO_DAYS: 0
AVAILABLE_DAYS: 1
```

### Availability rules (summary mode)

A day counts as "available" if all of these are true:
- It's a business day (Mon–Fri)
- No all-day PTO/OOO/vacation event
- Less than 7 hours of meetings scheduled
- At least 2 hours of free time remaining
