# claude-eisenhower — Product Roadmap

**Format**: Now / Critical Fixes / Near-Term / Long-Term
**Last updated**: 2026-03-02
**Owner**: Cantu

---

## Now — Shipped and Stable

These features are complete, tested, and committed. The plugin is in active use.

### Core Workflow (v0.1–v0.3)
The four-phase task management loop is fully operational.

- **`/intake`** — captures tasks from any source in natural language; extracts title, source, requester, urgency automatically; alias-resolves requester names against stakeholder graph
- **`/prioritize`** — Eisenhower matrix classification (Q1–Q4 as `Priority:` metadata) with reasoning before saving; authority flag detects tasks requiring Director sign-off; routes to correct state section
- **`/schedule`** — quadrant-specific scheduling rules; Step 1b surfaces overdue delegations and stale capacity signals before scheduling new work
- **`/execute`** — mark done, log progress, delegate, create follow-ups; syncs completion to Reminders adapter; delegation-aware close-out updates memory
- **`/delegate`** — ad-hoc delegation: scores candidates, confirms, writes a Delegated entry, pushes a Reminder, and logs memory in one step
- **`/scan-email`** — reads Apple Mail inbox, classifies actionable emails into Q1–Q3; checks calendar availability before proposing dates; read-only
- **`/setup`** — conversational 5-step first-run flow; per-command config guards auto-trigger setup for missing config then resume the original command

### Integrations (v0.2–v0.3, v0.8)
- **Mac Calendar** — real-time availability check via EventKit Swift script; O(1) regardless of calendar size
- **Mac Reminders** — swappable adapter pushes confirmed tasks with correct title format, priority, and due date; completion synced on `/execute`
- **Apple Mail** — configurable account and inbox; three scan modes (admin, escalations, all)

### Delegation Engine (v0.4–v0.5)
- **Stakeholder graph** (`stakeholders.yaml`) — local, gitignored, PII-safe; alias used everywhere
- **Weighted scoring algorithm** — domain match (+3), relationship (+2/+1/0), capacity (+2/+1/−1); top candidate + runner-up surfaced
- **Authority flag** — detects executive/personnel decisions; proposes reclassification before delegating
- **Alias resolution** — `alias` is an array; first item is display name, rest are lookup terms; `resolveAlias()` normalizes at intake
- **Capacity signal review** — surfaces overloaded delegates (2+ open tasks, 5+ business days) at schedule time; advisory only
- **Lifecycle management** — `Synced:` field as dedup guard; overdue detection; follow-up auto-creation on missed check-ins

### Four-State Task Model (v0.9.0)
- **Inbox → Active → Delegated → Done** — action-oriented states replace Q1/Q2/Q3/Q4 as the status driver
- **Eisenhower preserved as `Priority:` metadata** — the matrix classifies work; state tracks where it lives
- **Check-by enforcement** — Delegated requires a Check-by date; no exceptions
- **No Blocked state** — blockers are notes with a check-by forcing function

### Engineering Foundation (v0.4.1)
- **`PRINCIPLES.md`** — DRY, SOLID, TDD, PII safety rules; read at every session
- **`delegate-core.ts`** — single source of truth for shared types, scoring, authority flag, Q3 constants, alias resolution, and date helpers
- **113 passing tests** — covering delegation engine, alias resolution, capacity detection, schedule/execute pure logic
- **Self-healing test setup** — `postinstall`/`pretest` hooks auto-create `tests/node_modules` symlink

---

## Critical Fixes — v0.9.x

These are bugs or consistency gaps in the shipped code. Not new features — repairs.
All are low-risk, targeted changes. See `integrations/specs/architectural-review-2026-03-02.md`
for full analysis.

### v0.9.2 — Four-State Consistency Pass + Build Cleanup

**Problem 1 — Four-state model partially rolled out.**
v0.9.0 updated `commands/intake.md` and `commands/prioritize.md` but missed four
files that still reference the old Q1/Q2/Q3/Q4 vocabulary. Claude will write
inconsistent TASKS.md records depending on which command path was followed.

Files to fix:
- `commands/delegate.md` Step 6 — creates `## Q3 — Delegate` section (should be `## Delegated`)
- `commands/scan-email.md` Step 9 — writes `Status: Q1/Q2/Q3` in record format (should write `State: Inbox`)
- `hooks/hooks.json` — SessionStart prompt references Q1/Q2/Q3/Q4 counts (should describe Inbox/Active/Delegated/Done)
- `skills/claude-eisenhower/SKILL.md` — references `## Unprocessed` section and Q1-Q4 headers

**Problem 2 — `dist/` committed to source control.**
Compiled TypeScript artifacts live alongside source. They drift, cause unnecessary
merge conflicts, and are regenerated at build/package time anyway.

Fix: Add `dist/` to `.gitignore`. The GitHub Actions release workflow already calls
`npm run build` before packaging — nothing breaks.

### v0.9.3 — Plugin Path Resolution

**Problem**: `~/repos/claude-eisenhower/` is hardcoded in four command files and all
`cal_query.swift` invocations. Breaks for any clone at a different path; makes the
plugin non-distributable to other users without manual path editing.

Files affected: `commands/delegate.md`, `commands/schedule.md`,
`commands/scan-email.md`, all `cal_query.swift` call sites.

Fix: Investigate whether Cowork exposes a `$PLUGIN_ROOT` environment variable. If
yes, replace all hardcoded paths. If no, add `plugin_root` to a shared config file
and have commands read from it.

---

## Shipped — Infrastructure (v0.9.4)

Internal technical improvements with no user-visible behavior change. These close
the gap between what is tested and what is documented, and give the adapter contract
a compiler-enforced boundary.

### 1. TypeScript Adapter Contract Interfaces

**Problem**: The `task_output_record` and `push_result` contracts are documented in
`integrations/adapters/README.md` only — no machine-checkable TypeScript interfaces.
Future adapters have no compiler-enforced contract.

**Plan**: Export `TaskOutputRecord` and `PushResult` interfaces from a new
`scripts/adapter-types.ts`. Both types are already described in the adapter README —
this is a formalization, not new design. Update `integrations/adapters/README.md`
to reference the TypeScript interfaces as the authoritative source.

**Scope**: New `scripts/adapter-types.ts`. One import line change in `delegate-core.ts`.

### 2. Four-State Model Test Suite

**Problem**: The four-state model (v0.9.0) has a complete 10-scenario Gherkin spec
in `integrations/specs/four-state-task-model-spec.md` but zero Jest coverage.

**Plan**: New `tests/four-state.test.ts` covering all 10 FOUR-STATE-xxx Gherkin
scenarios. Extract any pure functions needed (state transition routing,
Check-by enforcement, section-to-state mapping).

**Pattern**: Same approach as `tests/phase2-3.test.ts` — extract pure functions
from the command layer and test them directly.

---

## Near-Term — Self-Improvement (v0.9.5)

A meta-capability that allows the plugin to improve its own skills and commands
without manual rewriting. Lands before v1.0 so it can be applied during the
`/review-week` development cycle.

### Self-Skill Enhancer

A research-driven skill upgrade engine. Detects skill domain, mines sibling skills
for patterns, dispatches parallel research agents to gather best practices, classifies
improvements by Impact × Effort, then applies validated changes with dry-run diffs
and regression safeguards.

**Two workflows**:
- **Full Enhancement** (9 phases): domain detection → artifact collection → sibling
  mining → parallel research agents (up to 3) → classify/prioritize improvements →
  dry-run diffs → safety checks → apply → re-score
- **Targeted Enhancement** (5 phases): focused improvement on a specific skill
  component without full research sweep

**Guardrails**: Before/after scoring via skill-reviewer agent; capability
preservation rules prevent removing working behaviors; regression safeguards run
existing test suite before and after.

**Reference implementation**: `skill-enhancer.md` (Cantu personal superpowers).

**Dependency**: Task tool parallel agent support (already available). Skill-reviewer
agent for before/after scoring comparison.

---

## Near-Term — First Major Milestone (v1.0)

v1.0 is the first release that closes the weekly workflow loop. The four-phase
Intake → Prioritize → Schedule → Execute cycle is complete, but there is no command
to step back and review the week as a whole. `/review-week` fills that gap.
That is the user-facing capability that justifies a major version milestone.

### Weekly Review (`/review-week`)

One command to start the week: surfaces overdue delegations + calendar load for the
coming week + unprocessed Inbox tasks + memory entries approaching check-in date.
Gives the Director a complete situational snapshot before making scheduling decisions.

**Dependency**: Mac Calendar integration already works. `mac-calendar-planner`
override pattern already documented in `integrations/docs/`.

---

## Near-Term — Integrations (v1.1)

New capabilities that extend the plugin's reach.

### 1. Slack Intake (`/scan-slack`)

Spec complete: `integrations/specs/slack-intake-spec.md`.

Ship immediately upon Slack MCP connector availability in Cowork. No architectural
work required — the feature plugs directly into the existing intake pipeline using
the same confirmation table pattern as `/scan-email`.

**Dependency**: Slack MCP connector availability in Cowork (blocking).

### 2. Anti-Domain Support in Stakeholder Graph

Add optional `anti_domains` field to `stakeholders.yaml` — domains that score a
hard 0 for this person regardless of keyword match. Prevents routing work to people
who should structurally never own it (e.g., vendor receiving internal architecture
decisions).

**Scope**: Schema addition + 2–3 new test cases in `tests/delegation.test.ts`.

### 3. YAML Front Matter for TASKS.md

Add YAML front matter to task records. Non-breaking — Markdown remains human-readable.
Enables programmatic filtering by owner, state, and date without regex parsing.

**Timing**: After TASKS.md schema spec is stable and validated by the four-state
test suite. Schema first; structured encoding second.

### 4. Direct unit tests for `addBusinessDays`

`scripts/date-helpers.ts` exports `addBusinessDays` and `addBusinessDaysStr`, but
both functions lack dedicated unit tests. `businessDaysElapsed` (their inverse) is
well-covered in `schedule-capacity.test.ts`. Gap identified during v0.9.4 QE audit.

**Scope**: 4–5 boundary cases added to `schedule-capacity.test.ts`:
Monday+2, Friday+2 (spans weekend), n=0 (same day), n=1 on Friday → Monday.
Small lift; no new file needed.

---

## Long-Term — Architecture Evolution (v1.2+)

Strategic bets for when the plugin scales beyond its current single-user, local-first
design. Timing is flexible; direction is set.

### Structured Task Store (YAML → SQLite)

**When**: When TASKS.md filtering becomes the bottleneck — 50+ tasks, cross-owner
queries, date range searches, multi-delegate reporting.

**Design**: YAML front matter (v1.1) is the non-breaking bridge. When the pain
materializes, write a migration script that reads YAML front matter and writes SQLite
rows. TASKS.md becomes a view over the store, not the store itself.

**Triggers**: User reports pain finding tasks by owner/date/state.

### Task Output Adapter Expansion

The Reminders adapter proves the pattern. When the plugin is used in team contexts,
`/schedule` should push to Jira, Linear, or Asana.

**Priority**: Jira first (most common in engineering orgs) → Linear (growing adoption)
→ Asana (cross-functional).

**Dependency**: MCP connectors for each system. Adapter contract interfaces (v0.9.4)
must land first to give these a TypeScript interface to implement against.

### Source Control Integration (GitHub / GitLab)

`/scan-email` handles GitHub notification emails today, but they're lossy (no PR
metadata). A direct GitHub connector would let `/intake` pull PR review requests,
assigned issues, and failing CI with full context — author, branch, PR title, status.

**Dependency**: GitHub MCP connector availability in Cowork.

### Multi-Adapter Fan-Out

Allow `/schedule` to push to multiple adapters simultaneously (e.g., Reminders + Jira).

**Triggers**: User manages tasks in two systems simultaneously and is manually
reconciling between them.

### Memory System as a Queryable Layer

A `/memory` command (or agent) that surfaces: all pending delegations for a given
alias, all follow-ups due this week, overdue check-ins not yet resolved.

**Dependency**: YAML front matter in memory files (or a structured store).

### Self-Skill Enhancer

Moved to Near-Term (v0.9.5) — ships before v1.0 so it can be used during the
`/review-week` development cycle. See the v0.9.5 section above for the full spec.

---

## Won't Do (Explicit Cuts)

These were considered and deliberately excluded to keep the plugin focused.

| Item | Reason |
|------|--------|
| Auto-send delegation messages (Slack/email) | Delegation is a human conversation — the plugin suggests, you act |
| Live capacity checking (Jira/Asana bandwidth) | Too much integration complexity for v1; manual `capacity_signal` is sufficient |
| Multi-delegate splitting of a single task | Adds coordination overhead; better to break the task at `/intake` |
| Building stakeholder graph from task history | Interesting v2 idea; requires enough history to be useful — premature now |
| Automatic follow-up scheduling (no user prompt) | Follow-up cadence is a judgment call; always ask before creating |
| Blocked state | Anti-pattern — creates a holding area with no forcing function. Every stuck task needs an action decision (escalate / re-delegate / drop). |

---

## Open Questions

1. ~~**Plugin path resolution**~~: Resolved in v0.9.3. `$CLAUDE_PLUGIN_ROOT` is only
   available for `command:`-type hooks, not MCP tool calls. Solution: `plugin_root`
   field in `task-output-config.md`.

2. **Memory system ownership**: Is `productivity:memory-management` the long-term
   stakeholder memory system, or should this plugin own its memory fully? Currently
   both are used. Decouple or consolidate?

3. **YAML front matter timing**: Should YAML front matter land in v1.0 alongside
   the schema spec, or after the spec has been stable for one release cycle?
   Recommendation: spec first — validate field definitions are stable before adding
   parsing complexity.

4. **Behavioral test ceiling**: Should tests cover the full command flow, or is
   pure-function coverage + Gherkin spec the right ceiling for a Claude-operated
   plugin? Recommendation: the latter — you cannot test Claude's judgment in Jest.

5. When a delegate's `capacity_signal` changes, should the plugin prompt a review
   of all open Delegated tasks assigned to them?

6. Should there be a `max_delegations` field in `stakeholders.yaml` to cap how
   many open items one person can hold?

---

## Version History Summary

| Version | What shipped |
|---------|-------------|
| v0.1.0 | Core workflow: intake, prioritize, schedule, execute |
| v0.2.0 | scan-email command, Apple Mail integration |
| v0.3.0 | integrations/ structure, Mac Calendar EventKit, Mac Reminders adapter, STRUCTURE.md |
| v0.4.0 | Delegation engine: stakeholder graph, scoring CLI, 24-test Jest suite |
| v0.4.1 | DRY refactor (delegate-core.ts), PRINCIPLES.md, self-healing test setup |
| v0.4.2 | Delegation lifecycle: dedup guard, Mark Done close-out, follow-up auto-creation |
| v0.4.3 | Full regression validation: TEST-DEL-100/201/202; PII fix in TASKS.md |
| v0.5.0 | Alias resolution: `alias` array schema, `resolveAlias()`, `/intake` normalization, 35-test suite |
| v0.5.1 | `/delegate` direct entry point: new command, inline Reminders push, memory log, 31-test suite |
| v0.5.2 | Capacity signal review prompt: `/schedule` Step 1b Part B, 15-test suite (TEST-CAP-6xx) |
| v0.5.3 | Phase 2–3 automated test coverage: 32-test suite (DEL-7xx), replaces TEST-DEL-020–032 manual |
| v0.6.0 | scan-email crash fix (U+FFFC ASCII strip); build packaging system (`npm run package` / `release`) |
| v0.7.0 | GitHub Actions release workflow: tag-triggered `.plugin` artifact build + GitHub Release publish |
| v0.8.0 | First-run setup: `/setup` command, per-command config guards, stakeholders starter template |
| v0.9.0 | Four-state task model: Inbox → Active → Delegated → Done; Eisenhower preserved as Priority metadata |
| v0.9.1 | `/execute` Reminders sync: completion now propagates to adapter; `complete_reminder.applescript` |
| v0.9.2 | Four-state consistency pass (delegate/scan-email/hooks/SKILL.md); `dist/` removed from source control |
| v0.9.3 | Plugin path resolution (`plugin_root` config); UTC timezone fix in `businessDaysElapsed`; CI test workflow |
| v0.9.4 | Adapter contract interfaces (`adapter-types.ts`); four-state model test suite; QE audit (−6 low-signal tests) |
| v0.9.5 | *(planned)* Self-Skill Enhancer — research-driven skill upgrade engine with parallel agents and regression safeguards |
| v1.0.0 | *(planned)* Weekly review command (`/review-week`) — closes the weekly workflow loop |
| v1.1.0 | *(planned)* Integrations: `/scan-slack` (blocked on Slack MCP), anti-domain support, YAML front matter |
