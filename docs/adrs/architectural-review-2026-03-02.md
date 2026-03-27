# ADR: Architectural Review — claude-eisenhower v0.9.x

**Type**: Architectural Decision Record
**Date**: 2026-03-02
**Author**: Cantu
**Scope**: Full codebase review — v0.1.0 through v0.9.1
**Status**: Resolved — all 6 decisions implemented as of v1.1.3 (2026-03-05)

---

## Context

A full codebase review was conducted at v0.9.1 to assess structural health,
identify consistency gaps introduced during rapid feature delivery, and set the
architectural direction for v1.0 and beyond. This document records what was found
and the decisions made as a result. Forward-looking work items spawned by this
review each have their own spec in `docs/specs/`.

---

## What Is Working Well

These decisions were validated and should be preserved and extended:

- **`delegate-core.ts` as a shared algorithm module** — scoring, ranking, authority
  flag, Q3 constants, alias resolution, and date helpers all live here. CLI and tests
  import from it. Zero duplication. This pattern should apply to any new pure logic.

- **Adapter pattern for task output** — the `task_output_record` / `push_result`
  contract with a swappable adapter file and one config line to switch. The Reminders
  adapter proves the pattern. Future adapters slot in without touching any command.

- **Spec-before-code discipline** — every major feature has a spec in
  `docs/specs/` before implementation. Gherkin scenarios act as acceptance
  criteria. This must continue for every domain in the roadmap below.

- **PII safety** — aliases everywhere, full names only in gitignored files,
  `resolveAlias()` as the single normalization point. No changes needed here.

- **Four-state task model design** — Inbox → Active → Delegated → Done is the right
  model for a Platform leader managing 60+ teams. Preserving Eisenhower as a
  `Priority:` metadata field (not the status driver) is correct.

---

## Findings by Domain

### Domain 1: Command Consistency (Critical)

v0.9.0 updated `commands/intake.md` and `commands/prioritize.md` to the four-state
model but missed four files that still reference the old Q1/Q2/Q3/Q4 vocabulary.
Claude will write inconsistent TASKS.md records depending on which command was last
used.

| File | Bug | Correct value |
|------|-----|---------------|
| `commands/delegate.md` Step 6 | Creates `## Q3 — Delegate` section header | `## Delegated` |
| `commands/scan-email.md` Step 9 | Writes `Status: Q1/Q2/Q3` in record format | `State: Inbox` |
| `hooks/hooks.json` SessionStart | Describes "Q1/Q2/Q3/Q4 quadrant counts" | "Inbox/Active/Delegated/Done state counts" |
| `skills/core/SKILL.md` | References `## Unprocessed` section, Q1-Q4 headers | `## Inbox`, four-state vocabulary |

**Root cause**: No canonical TASKS.md schema spec. Each command describes the record
format inline, so a partial rollout like v0.9.0 inevitably misses files.

### Domain 2: Data Model

TASKS.md is a flat Markdown file with no schema enforcement. Record format is
described independently in each command file — not in a single source of truth.
The v0.9.x drift above is a direct consequence.

The four-state model spec (`docs/specs/four-state-task-model-spec.md`)
defines the state transitions but not the full per-field schema, valid values, or
required-vs-optional rules per state.

### Domain 3: Testing Architecture

Pure functions in `delegate-core.ts` and `date-helpers.ts` are extremely well tested
(113 tests, all passing). The test-per-feature discipline is strong.

**Gap**: The four-state model (v0.9.0) has a complete 10-scenario Gherkin spec in
`docs/specs/four-state-task-model-spec.md` but zero Jest coverage. Pure
functions need to be extracted from the command layer (state transition routing,
Check-by enforcement, section-to-state mapping) and covered before v1.0.

### Domain 4: Integration Layer — Adapter Contract

The `task_output_record` and `push_result` contracts are documented in
`adapters/README.md`. No TypeScript interfaces exist — future adapters
have no compiler-enforced contract to implement against. This is manageable with one
adapter but becomes a liability when Jira/Linear/Asana adapters are built.

### Domain 5: Structural / DevOps

**Issue 1 — `dist/` committed to source control**: Compiled TypeScript artifacts
live alongside source. They drift from source between rebuilds and create unnecessary
merge conflicts. The GitHub Actions release workflow already calls `npm run build`
before packaging — `dist/` has no reason to be committed.

**Issue 2 — Hardcoded plugin path**: `~/repos/claude-eisenhower/` is hardcoded in
four command files and all `cal_query.swift` invocations. Breaks for any clone at
a different path; makes the plugin non-distributable without manual path editing.

### Domain 6: Memory System

`memory/glossary.md` (Stakeholder Follow-ups table) and `memory/people/*.md`
(per-delegate delegation log) are written by `commands/execute.md` and
`commands/schedule.md`. The format is described inline in those command files —
there is no schema spec. This is the memory system equivalent of the TASKS.md
problem: no single source of truth means format drifts as commands evolve.

---

## Decisions Made

### Decision 1: Create a canonical TASKS.md schema spec

**Decision**: Write `docs/specs/tasks-schema-spec.md` defining every field,
valid values, required vs. optional per state, and section structure. All commands
reference this spec instead of duplicating format inline.

**Alternatives considered**: Document inline in each command (rejected — this is
exactly what caused the v0.9.x drift). Enforce via TypeScript validation at runtime
(deferred — adds complexity before the schema is stable).

**Spec**: `docs/specs/tasks-schema-spec.md`

### Decision 2: Formalize the adapter contract as TypeScript interfaces

**Decision**: Export `TaskOutputRecord` and `PushResult` as TypeScript interfaces
from `scripts/adapter-types.ts`. This gives future adapters a compiler-enforced
contract to implement against and makes the README-only documentation authoritative
by pointing to the code.

**Alternatives considered**: Keep as documentation only (rejected — no enforcement
as adapter count grows). Derive from a JSON Schema (deferred — unnecessary complexity
for the current scale).

**Spec**: `docs/specs/adapter-types-spec.md`

### Decision 3: Write a memory schema spec

**Decision**: Write `docs/specs/memory-schema-spec.md` defining the
canonical structure for `memory/glossary.md` and `memory/people/*.md`, who writes
them, when, and how alias filenames are derived.

**Alternatives considered**: Leave inline (rejected — same problem as TASKS.md
format drift). Consolidate with `productivity:memory-management` skill (deferred —
open question on memory system ownership, see below).

**Spec**: `docs/specs/memory-schema-spec.md`

### Decision 4: Remove dist/ from source control

**Decision**: Add `dist/` to `.gitignore`. Generate at build/package time only.
No functionality change — GitHub Actions already rebuilds before packaging.

**Target**: v0.9.2.

### Decision 5: Fix four-state consistency in four files

**Decision**: Patch `commands/delegate.md`, `commands/scan-email.md`,
`hooks/hooks.json`, and `skills/core/SKILL.md` to use the four-state
vocabulary. Single targeted commit, no new logic.

**Target**: v0.9.2.

### Decision 6: Resolve hardcoded plugin path

**Decision**: Investigate whether Cowork exposes a `$PLUGIN_ROOT` environment
variable. If yes, replace all hardcoded `~/repos/claude-eisenhower/` references. If
no, add `plugin_root` to a shared config file.

**Target**: v0.9.3. Blocked on Cowork platform investigation.

---

## Open Questions

1. **Plugin path resolution**: Does Cowork expose `$PLUGIN_ROOT`? Blocking for v0.9.3.

2. **Memory system ownership**: Is `productivity:memory-management` the long-term
   stakeholder memory system, or should this plugin own its memory fully? Currently
   both are used — commands write to `memory/` files AND use the memory-management
   skill. Decouple or consolidate?

3. **Behavioral test ceiling**: Should tests cover the full command flow, or is
   pure-function coverage + Gherkin spec the right ceiling for a Claude-operated
   plugin? Recommendation: the latter — you cannot test Claude's judgment in Jest.

4. **YAML front matter timing**: Should structured encoding of TASKS.md records land
   in v1.0 alongside the schema spec, or after the spec has been stable for one
   release cycle? Recommendation: spec first, encoding second.

---

## Outputs of This Review

| Output | Location | Status |
|--------|----------|--------|
| This ADR | `docs/adrs/architectural-review-2026-03-02.md` | ✅ Complete |
| ROADMAP.md restructured | `ROADMAP.md` | ✅ Complete |
| TASKS.md schema spec | `docs/specs/tasks-schema-spec.md` | ✅ Complete (v1.0) |
| Adapter contract spec | `docs/specs/adapter-types-spec.md` | ✅ Complete (v1.0) |
| Memory schema spec | `docs/specs/memory-schema-spec.md` | ✅ Complete (v1.0) |
| v0.9.2 consistency patch — delegate.md, scan-email.md, hooks.json, SKILL.md | Various | ✅ Complete (v0.9.2) |
| D5 remaining: schedule.md + execute.md four-state vocabulary | `commands/schedule.md`, `commands/execute.md` | ✅ Complete (v1.1.3) |
| D4: dist/ removed from source control | `.gitignore` | ✅ Complete (v0.9.7/I1) |
| D6: Plugin path resolution | `config/task-output-config.md`, command files | ✅ Complete (v0.9.3) |
| Four-state test suite (Gherkin → Jest) | `tests/four-state.test.ts` | ⚠ Deferred — prompt-contracts.test.ts provides vocabulary enforcement; behavioral coverage ceiling is pure functions only (see Open Question 3) |

### Resolution Notes (added 2026-03-05)

All 6 decisions from this review have been implemented. The DRY/SOLID audit in v1.1.3
completed D5 (four-state vocabulary in schedule.md and execute.md), confirmed D4 was
already resolved in v0.9.7, and validated that the adapter contract (D2) and memory
schema (D3) are formalized and operational.

**Open Question 1** resolved: `$CLAUDE_PLUGIN_ROOT` is not available in the Bash/MCP
tool context — Strategy B (config file `plugin_root`) implemented in v0.9.3.

**Open Question 2** partially resolved: Memory system consolidated into
`skills/memory-manager/SKILL.md` (v1.0.1). `productivity:memory-management` remains
the primary backend; the plugin-owned fallback is `memory/stakeholders-log.md` →
refactored to two-file schema (`memory/glossary.md` + `memory/people/`) in v1.0.2.
Full consolidation (single backend) deferred pending platform decision.
