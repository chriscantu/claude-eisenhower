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

See `docs/adrs/calendar-performance-fix.md` for the full diagnosis and
`docs/mac-calendar-planner-override.md` for mac-calendar-planner-specific usage.

---

## Code Review Requirements

Every code review MUST validate against the following principles from
`docs/PRINCIPLES.md`. These are not suggestions — flag violations as issues.

**Claude Code Plugin Best Practices:**
- Components use conventional directory layout (commands/, skills/, agents/, hooks/)
- Hooks and scripts reference paths via `${CLAUDE_PLUGIN_ROOT}`, not hardcoded paths
- File and directory names use kebab-case
- No components nested inside `.claude-plugin/`

**DRY — Don't Repeat Yourself:**
- No duplicated logic, types, constants, or config values across files
- Scoring logic lives in `scripts/delegate-core.ts` only — imported, never copied
- Config values are read from `config/`, never hardcoded in commands or skills

**SOLID:**
- Each file owns one concern (SRP)
- Pure functions take data as arguments, no filesystem or external service calls (DI)
- Interfaces are narrow and purpose-specific

**Reliability:**
- Calendar queries MUST use `scripts/cal_query.swift` (EventKit), never AppleScript `whose`
- PII files (`config/stakeholders.yaml`, `config/*-config.md`, `memory/`, `TASKS.md`) are gitignored — never committed
- All file path references must resolve to existing files on disk
- No feature ships without a corresponding test in `tests/`

**Structure:**
- New files go where `docs/STRUCTURE.md` says — check the decision tree before creating anything
- Project docs (PRINCIPLES, STRUCTURE, CONNECTORS) live in `docs/`, not repo root