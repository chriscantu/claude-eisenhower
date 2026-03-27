# DRY Plugin Root Resolution

**Plugin**: claude-eisenhower
**Version target**: v1.3.0
**Status**: Draft
**Date**: 2026-03-26
**Author**: Cantu

---

## Problem Statement

Five commands independently read `plugin_root` from `config/task-output-config.md`
and implement identical fallback logic when the value is missing:

```
If plugin_root is not present, use ~/repos/claude-eisenhower and note:
"plugin_root not configured — using default."
```

This fallback path and hardcoded default appear in:

1. `commands/schedule.md` (calendar section + script invocations)
2. `commands/execute.md` (complete_reminder invocation)
3. `commands/delegate.md` (match-delegate CLI invocation)
4. `commands/scan-email.md` (cal_query.swift invocation)
5. `commands/review-week.md` (cal_query.swift invocation)

### Risks

- **Silent inconsistency** — A typo in one command's fallback path breaks that
  command while the other four continue working. No test catches this.
- **DRY violation** — The same 4-line resolution block is copy-pasted five times.
  `docs/PRINCIPLES.md` explicitly prohibits this pattern.
- **Hardcoded path** — `~/repos/claude-eisenhower` assumes a specific install
  location. Users who clone elsewhere get silent failures in the fallback case.

---

## Goals

- Single source of truth for `plugin_root` resolution logic
- All five commands consume the resolved value, not the raw config
- The hardcoded fallback path appears in exactly one place
- No user-visible behavior change

## Non-Goals

- Eliminating the need for `plugin_root` entirely (that would require
  `${CLAUDE_PLUGIN_ROOT}` to be available in prompt context, which it isn't today)
- Changing the config file schema
- Adding new config validation to `/setup`

---

## Options

### Option A: SessionStart hook resolves once, commands consume

The `SessionStart` hook already reads TASKS.md. Extend it to also read
`config/task-output-config.md`, resolve `plugin_root` (with fallback), and include
the resolved value in its output. Commands then read the hook's briefing output
instead of re-resolving.

**Pros:**
- Resolution happens once per session
- Commands become simpler (no resolution logic)
- Fallback warning appears at session start, not mid-command

**Cons:**
- Hook output is a prompt injection — commands would need to parse a known format
- If the hook fails or is skipped, all five commands break
- Adds coupling between the hook and command layer

### Option B: Shared resolution block in a reference file

Create a `skills/core/references/plugin-root-resolution.md` file containing the
canonical resolution instructions. Each command includes a one-line reference:

```markdown
Resolve `plugin_root` following `skills/core/references/plugin-root-resolution.md`.
```

The reference file contains:
1. Read `plugin_root` from `config/task-output-config.md`
2. If present, use it
3. If absent, use `~/repos/claude-eisenhower` and emit warning
4. Store resolved value for use in all subsequent script paths this session

**Pros:**
- Single source of truth (one file to edit)
- Commands retain independence (no hook dependency)
- Pattern matches existing reference file usage (e.g., `email-patterns.md`)
- LLM reads the reference and applies it — no parsing required

**Cons:**
- Still relies on the LLM reading and following the reference correctly
- Five commands still each have a "resolve plugin_root" step, just shorter

### Option C: `/setup` writes an absolute path, remove fallback entirely

Make `/setup` resolve the plugin root at configuration time and write the absolute
path to `config/task-output-config.md`. Remove all fallback logic from commands.
If `plugin_root` is missing, commands fail with: "Run /setup to configure."

**Pros:**
- Eliminates the fallback entirely — no hardcoded path anywhere
- Commands become trivially simple (read config or fail)
- `/setup` already validates config completeness

**Cons:**
- Breaking change for users who haven't run `/setup` recently
- Requires `/setup` to detect the install location (which it can via
  `${CLAUDE_PLUGIN_ROOT}` in the hook layer, but not in the command layer)

---

## Recommendation: Option B

Option B is the pragmatic choice:

- It's a pure DRY fix with zero behavioral change
- It follows the existing pattern (commands already reference skill files)
- It doesn't add hook-to-command coupling (Option A's risk)
- It doesn't require a migration (Option C's cost)
- The hardcoded fallback path moves to one file instead of five

Option A is architecturally cleaner but introduces fragility. Option C is the
long-term right answer but requires solving the "how does a command know its own
install path" problem, which is a platform limitation.

---

## Proposed Change (Option B)

### New file: `skills/core/references/plugin-root-resolution.md`

```markdown
# Plugin Root Resolution

Before invoking any script in `scripts/`, resolve the plugin root path:

1. Read `config/task-output-config.md`
2. Find the `plugin_root` value
3. If present: use it as the base path for all script invocations
4. If absent: use `~/repos/claude-eisenhower` as the default and emit this warning
   to the user:

   > "plugin_root not configured in config/task-output-config.md — using default
   > path ~/repos/claude-eisenhower. Run /setup to configure."

5. Store the resolved path for the remainder of this command's execution

All script paths are constructed as: `{plugin_root}/scripts/{script_name}`
```

### Command changes (5 files)

Replace each command's inline resolution block with:

```markdown
Resolve `plugin_root` following `skills/core/references/plugin-root-resolution.md`.
```

### Files changed

| File | Change |
|------|--------|
| `skills/core/references/plugin-root-resolution.md` | New file — canonical resolution logic |
| `commands/schedule.md` | Replace inline resolution with reference |
| `commands/execute.md` | Replace inline resolution with reference |
| `commands/delegate.md` | Replace inline resolution with reference |
| `commands/scan-email.md` | Replace inline resolution with reference |
| `commands/review-week.md` | Replace inline resolution with reference |
| `docs/STRUCTURE.md` | Add new reference file to skills/core listing |

---

## Verification

1. **Prompt contracts** — `tests/prompt-contracts.test.ts` should still pass (no
   prohibited vocabulary introduced).
2. **Manual smoke test** — Run `/schedule` and `/scan-email` with `plugin_root`
   configured. Confirm scripts execute correctly.
3. **Fallback test** — Temporarily remove `plugin_root` from
   `config/task-output-config.md`. Run `/schedule`. Confirm the warning message
   appears and the fallback path is used.
4. **Grep verification** — After the change, grep for `~/repos/claude-eisenhower`
   across all command files. It should appear in zero commands (only in the
   reference file).

---

## Decision Log

| Date | Decision | Reasoning |
|------|----------|-----------|
| 2026-03-26 | Option B (shared reference file) over Option A (hook) | Hook coupling is fragile; reference file follows existing patterns. |
| 2026-03-26 | Option B over Option C (setup-time resolution) | Option C requires solving platform-level path detection; Option B is a pure DRY fix with no migration cost. |
| 2026-03-26 | Keep the hardcoded fallback for now | Removing it (Option C) is the right long-term answer but requires `${CLAUDE_PLUGIN_ROOT}` availability in prompt context. Defer until that platform feature exists. |
