# Spec: Plugin Path Resolution
**Version**: v0.9.3
**Status**: Implemented — v0.9.3
**Author**: Cantu
**Date**: 2026-03-02

---

## Problem Statement

`~/repos/claude-eisenhower/` is hardcoded in 4 command files across 6 occurrences.
This path assumption breaks the plugin for any user who has cloned the repository
to a different location (e.g., `~/projects/`, `/opt/work/`, a shared drive path).
It also makes the plugin non-distributable: anyone who installs it via the
`.plugin` artifact will have a different root path.

The hardcoded path currently appears in:

| File | Location | Usage |
|------|----------|-------|
| `commands/schedule.md` | Step 6 cal query | `swift ~/repos/claude-eisenhower/scripts/cal_query.swift` |
| `commands/scan-email.md` | Step 6 cal query | `swift ~/repos/claude-eisenhower/scripts/cal_query.swift` |
| `commands/prioritize.md` | Stakeholder graph note | reference text `~/repos/claude-eisenhower/` |
| `commands/delegate.md` | Step 2 stakeholder read | reference text `~/repos/claude-eisenhower/` |
| `commands/delegate.md` | Step 5 match-delegate | `cd ~/repos/claude-eisenhower/scripts && npx ts-node ...` |
| `commands/execute.md` | Reminders adapter | `osascript ~/repos/claude-eisenhower/scripts/complete_reminder.applescript` |

---

## Goals

1. Replace every hardcoded `~/repos/claude-eisenhower/` with a resolved plugin root
2. Support two resolution strategies (priority order): env var → config file fallback
3. Keep the resolution transparent to users — no new setup step if `$PLUGIN_ROOT` is available
4. Require config file setup only as a fallback (documented in `/setup`)
5. Do not break the existing CLAUDE.md `cal_query.swift` override contract

---

## Investigation Gate — Resolved

**Finding**: `$CLAUDE_PLUGIN_ROOT` exists as a Claude Code variable BUT is only
injected when executing `command:`-type hooks (e.g., `"type": "command"` in hooks.json).
It is NOT present in the bash/shell environment used by the Bash tool or the
`mcp__Control_your_Mac__osascript` MCP tool — which is how all claude-eisenhower
script calls are executed.

**Evidence**: `env | grep CLAUDE_PLUGIN_ROOT` returns empty in Bash tool context.
The `superpowers` plugin uses it in hooks.json `command:` hooks only. Official
plugin-dev documentation confirms: "available in plugin commands" refers to
command-type hooks, not MCP tool calls.

**Decision**: Strategy B (config file). `plugin_root` added to `task-output-config.md`.

---

## Implementation Design

### Strategy A: Environment Variable (preferred)

If Cowork or Claude Code exposes `$PLUGIN_ROOT`:

```applescript
-- In each call site, replace the hardcoded path with:
set pluginRoot to do shell script "echo $PLUGIN_ROOT"
do shell script "swift " & pluginRoot & "/scripts/cal_query.swift '{calendar_name}' {DAYS} summary 2>&1"
```

For `npx ts-node` in delegate.md:
```applescript
set pluginRoot to do shell script "echo $PLUGIN_ROOT"
do shell script "cd " & quoted form of pluginRoot & "/scripts && npx ts-node match-delegate.ts ..."
```

### Strategy B: Config File Fallback

If no env var is available, add to `integrations/config/task-output-config.md`:

```
plugin_root: /Users/{username}/repos/claude-eisenhower
```

Then at each call site, read this value before constructing the path:
```
Read `plugin_root` from `integrations/config/task-output-config.md`.
If not present, fall back to `~/repos/claude-eisenhower` with a warning:
"plugin_root not set in task-output-config.md — using default path.
Update the config if your repository is at a different location."
```

### Files to Update

All 4 files must be updated in a single commit:

1. **`commands/schedule.md`** — replace `swift ~/repos/claude-eisenhower/scripts/cal_query.swift`
2. **`commands/scan-email.md`** — replace `swift ~/repos/claude-eisenhower/scripts/cal_query.swift`
3. **`commands/prioritize.md`** — replace reference text
4. **`commands/delegate.md`** — replace both the stakeholder read reference and the `npx ts-node` call
5. **`commands/execute.md`** — replace `osascript ~/repos/claude-eisenhower/scripts/complete_reminder.applescript`

If Strategy B: also update **`/setup` command** to prompt for `plugin_root` during first-run setup.

---

## Acceptance Scenarios

### PLUGIN-PATH-001: Path resolved from env var

```
Given $PLUGIN_ROOT is set to /Users/bob/projects/claude-eisenhower
When Claude runs /schedule and queries the calendar
Then the cal_query.swift call uses /Users/bob/projects/claude-eisenhower/scripts/cal_query.swift
And no hardcoded ~/repos/claude-eisenhower path appears in any osascript call
```

### PLUGIN-PATH-002: Path falls back to config when env var absent

```
Given $PLUGIN_ROOT is not set
And task-output-config.md contains plugin_root: /Users/alice/work/claude-eisenhower
When Claude runs /scan-email and reaches the calendar check step
Then the cal_query.swift call uses /Users/alice/work/claude-eisenhower/scripts/cal_query.swift
```

### PLUGIN-PATH-003: Config fallback with warning when neither source is set

```
Given $PLUGIN_ROOT is not set
And task-output-config.md does not contain plugin_root
When Claude runs any command that needs the plugin path
Then Claude uses ~/repos/claude-eisenhower as the default
And Claude surfaces: "plugin_root not set — using default path ~/repos/claude-eisenhower"
```

### PLUGIN-PATH-004: delegate match-delegate.ts uses resolved path

```
Given plugin_root is resolved to /Users/bob/projects/claude-eisenhower
When Claude runs /delegate and scores delegation candidates
Then the npx ts-node call uses cd /Users/bob/projects/claude-eisenhower/scripts
And the script executes without a "No such file or directory" error
```

### PLUGIN-PATH-005: execute complete_reminder.applescript uses resolved path

```
Given plugin_root is resolved to /Users/alice/work/claude-eisenhower
When Claude runs /execute and marks a task done
Then the osascript call uses /Users/alice/work/claude-eisenhower/scripts/complete_reminder.applescript
```

### PLUGIN-PATH-006: No regression on default install path

```
Given plugin_root resolves to ~/repos/claude-eisenhower (default)
When Claude runs /schedule, /scan-email, /delegate, or /execute
Then all script calls succeed as they did before this change
And no new config prompts or setup steps are shown to the user
```

---

## Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Resolution priority | Env var first, config fallback | Env var requires no setup; config fallback supports all users |
| Config file location | Extend `task-output-config.md` | Avoids introducing a new config file; this is the existing shared runtime config |
| Fallback behavior | Warn + use default path | Silent default would hide misconfiguration; fail-hard would break existing installs |
| Reference text paths | Replace with resolved path at runtime | Consistency — even informational references should reflect actual paths |
| Scope | 4 files, single commit | Smallest safe unit; atomic so no file is partially updated |

---

## Open Questions

1. **Cowork env var availability** — must be answered before choosing Strategy A vs B.
   Test: `do shell script "env 2>&1"` in a command and inspect the output.

2. **`/setup` update scope** — if Strategy B, does `/setup` need a new `plugin_root` prompt,
   or is the warning-and-default approach sufficient for v0.9.3?
