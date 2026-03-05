# claude-eisenhower — Product Roadmap

**Format**: Now / Critical Fixes / Near-Term / Long-Term
**Last updated**: 2026-03-05
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

## Shipped — Self-Improvement (v0.9.5)

A meta-capability that allows the plugin to improve its own skills and commands
without manual rewriting.

### skill-enhancer

A research-driven skill upgrade engine. Detects artifact domain, mines sibling
artifacts for reusable patterns, dispatches parallel research agents (Agent A best
practices + Agent B counter-evidence), classifies improvements by Impact × Effort,
then applies validated changes with dry-run diffs and regression safeguards.

**Two workflows**:
- **WF1 Full Enhancement** (6 phases): environment gate → baseline + domain detection
  → sibling mining → parallel research agents → classify/prioritize proposals →
  apply with pre-apply checklist and npm test verification
- **WF2 Targeted Enhancement** (4 phases): focused improvement on a specific area
  without a full research sweep

**Key files**:
- `skills/skill-enhancer/SKILL.md` — workflow router, Phase 0 environment gate, WF1/WF2
- `skills/skill-enhancer/references/enhancement-protocol.md` — artifact type registry,
  unified domain registry (detection + Agent A/B queries in one table), classification
  rules, Impact-Effort scoring, sibling mining patterns
- `skills/skill-enhancer/references/regression-safeguards.md` — 7-check pre-apply
  checklist, construct count comparison, rollback procedure, capability preservation rules
- `skills/skill-enhancer/references/edge-cases.md` — EC-1 through EC-9 (stub, 300-line
  overflow, same-domain siblings, no examples, directive feedback, test failures, no
  web search, broken cross-references, no matching spec)

**Hook**: `hooks/enhance-nudge.sh` fires after writing any `commands/` or `skills/`
artifact in the source repo; session-deduped so it fires once per file per session.

**Guardrails**: 12 explicitly listed in SKILL.md; capability preservation rules block
removing phases, guardrails, or examples without explicit user approval; npm test
auto-rollback on regression.

---

## Shipped — Critical Fixes (v0.9.6)

Skills and agents consistency pass. Fixes high and medium severity issues identified
in the 2026-03-04 SME review of claude-eisenhower's skills, agents, and hooks.
Full spec and task breakdown: `integrations/specs/2026-03-04-skills-agents-consistency-pass.md`.

**Issues addressed:**
- **H7** — `enhance-nudge.sh` uses `md5sum` (GNU-only); replaced with `shasum`
  for macOS/Linux compatibility. Without this fix the session-dedup guard silently
  fails and the nudge fires on every file write.
- **H10** — `task-prioritizer` agent reads "the Unprocessed section" but TASKS.md
  uses `## Inbox`. Agent found zero tasks to triage on every run.
- **H5** — `skill-enhancer` Phase 3 dispatch was underspecified (no model, no tools,
  no synthesis rules for conflicting agent results). Added concrete Task tool template.
- **M6** — `skill-enhancer` WF1/WF2 routing ambiguity: "enhance" vs "improve" triggers
  overlapped. Added disambiguation question and two additional router rows.
- **M9** — `skill-enhancer` had no guard against self-enhancement. Added Phase 0 halt
  if target artifact is `skills/skill-enhancer/SKILL.md` itself.
- **M1** — `claude-eisenhower` SKILL.md triggers didn't cover scan-email, delegate,
  or setup natural language phrases. Extended trigger description.
- **M4/M11/M16** — Eisenhower scoring rules appeared in three places (SKILL.md, agent,
  `eisenhower.md`) with a subtle divergence in the urgency boundary. Agent and SKILL.md
  now reference `eisenhower.md` as the single authority.
- **M15** — SessionStart hook only counted tasks by state. Extended prompt to surface
  overdue Active tasks and Delegated check-ins at session open.
- **H18** — `/setup` Step 3 defaulted `plugin_root` to `~/repos/claude-eisenhower`
  silently. Now validates the path exists before writing config; blocks setup if invalid.
- **H2** — `productivity:memory-management` was called across four artifacts with no
  documentation, no install instructions, and no fallback. Registered in CONNECTORS.md;
  added local `memory/stakeholders-log.md` fallback at each call site.

### Low severity — deferred to v0.9.7 polish pass

See v0.9.7 section below.

---

## Shipped — Critical Fixes (v0.9.7)

Three rounds of AI SME review (v0.9.5–v0.9.7) produced 9 remediation findings plus
3 follow-on quality gate improvements. PR #7. All 153 tests pass.

**Remediation (9 findings):**
- **C1/I3** — `scan-email`: fixed 31–40 batch gap; stored `msgIndex` to prevent TOCTOU
  index drift; surface body-fetch errors via `BODY_UNAVAILABLE:` prefix
- **C2** — `match-delegate.ts`: guard `yaml.load()` with structured JSON error output;
  `require.main` guard prevents test-import side effects
- **C3** — `SKILL.md`: aligned Q4 with two-step staging (stage → weekly review or explicit confirm)
- **C4** — regression tests for `AUTHORITY_PATTERNS`; cross-reference comments in prompts
- **I1** — gitignored `dist/` and `*.plugin` build artifacts
- **I2** — Option B single-write memory pattern enforced across all fallback blocks; ADR added
- **I4** — `complete_reminder.applescript`: POSIX `tr` for full Unicode lowercasing
- **I5** — `task-prioritizer`: four-state section routing; bare `## Q1`–`## Q4` headers prohibited

**Quality gates (3 new):**
- **S1** — AppleScript shell injection audit: all `do shell script` calls verified safe-quoted
- **Q1** — Manual test protocol for AppleScript scripts (8 test cases)
- **Q2** — Prompt consistency contract tests: prohibits vocabulary drift in Markdown prompt files

---

## Shipped — Housekeeping (integrations/specs/ Cleanup)

Removed 5 session execution plans that accumulated during v0.9.5–v0.9.7 implementation.
These were working documents with no ongoing reference value once the work shipped.
`integrations/specs/` now contains only permanent reference documents: `*-spec.md` files,
`artifact-baselines.md`, and `2026-03-04-quality-gates-spec.md`.

---

## Shipped — v1.0 (Weekly Review + Architecture Documentation)

Closes the weekly workflow loop. The four-phase Intake → Prioritize → Schedule → Execute
cycle is complete; `/review-week` adds the Friday readiness snapshot that ties it together.
Spec: `integrations/specs/review-week-spec.md`.

### Weekly Review (`/review-week`)

Friday afternoon command. Surfaces in one output:
- 🔴 Overdue delegations (require action before weekend)
- 🟡 Delegated check-ins due next week
- 📋 Active tasks due next week
- 📬 Inbox backlog count + oldest item age
- 📆 Calendar load for next Mon–Fri (via `cal_query.swift`)
- ✅ Recommended next steps (generated from surfaced signals)

Writes a structured analytics line to `memory/review-log.md` after each run (no PII;
counts only). Silent write — not surfaced to the user.

### Memory Access Layer

First command to need memory reads (not just writes). Defines a transparent read
abstraction: `productivity:memory-management` primary, `memory/stakeholders-log.md`
fallback. Same return shape regardless of backend. Command never branches on which
backend was used. See `integrations/docs/memory-access-layer.md` for the full contract.

### Architecture Documentation

Three Mermaid diagrams added to `integrations/docs/architecture.md`:
system overview (all layers + key connections), task state machine
(Inbox → Active → Delegated → Done with command labels), and memory access layer
(write path + read path side by side). `STRUCTURE.md` and `PRINCIPLES.md` updated
to reference new docs.

---

## Shipped — v1.0.1 (Memory Manager — DRY Refactor)

Patch release. No user-visible behavior change.

### Memory Manager skill

Three separate memory patterns existed across the plugin:
- **Write/create**: 4-step try-skill-then-fallback block copy-pasted 6 times across 4 files
- **Read**: Memory Access Layer inline in `review-week.md` Step 3
- **Update**: Direct writes to `memory/glossary.md` and `memory/people/*.md` in `execute.md` with no abstraction

All three consolidated into `skills/memory-manager/SKILL.md` — a single internal skill
with four operations: `log-delegation`, `resolve-delegation`, `update-checkin`, `query-pending`.
The backend contract (try `productivity:memory-management`, fall back to `memory/stakeholders-log.md`)
is now defined once. Commands delegate by intent only.

**Changes:**
- New: `skills/memory-manager/SKILL.md` + `references/memory-operations.md`
- Updated: `commands/schedule.md`, `commands/execute.md`, `commands/delegate.md`, `commands/review-week.md`
- Updated: `skills/claude-eisenhower/SKILL.md` — Stakeholder Memory section points to memory-manager
- Updated: `tests/prompt-contracts.test.ts` — Q2-002 extended to skill files (guard line now in skill)
- Deprecated: `integrations/docs/memory-access-layer.md` — superseded by memory-manager
- Updated: `integrations/docs/memory-system-adr.md`, `integrations/docs/architecture.md`
- 155 tests passing.

---

## Shipped — v1.0.2 (Memory Robustness)

Patch release. No user-visible behavior change.

### Memory robustness fixes

- **Schema constants** — `GLOSSARY_COLUMNS` and `glossaryColIndex()` defined once in `delegate-core.ts`; shared between runtime and tests. Eliminates the schema drift risk between write and read paths.
- **Header validation guard** — `loadPendingCounts()` now validates `glossary.md` header against `GLOSSARY_COLUMNS` before parsing. Schema mismatch emits a warning to stderr and returns `{}` safely instead of silently returning wrong counts.
- **Memory-manager fallback targets corrected** — all four operations (`log-delegation`, `resolve-delegation`, `update-checkin`, `query-pending`) now reference the canonical two-file fallback schema (`memory/glossary.md` + `memory/people/`). Previously pointed to deprecated `stakeholders-log.md`.
- **Known limitation documented** — `loadPendingCounts()` JSDoc and `memory-system-adr.md` now explain that pending-count scoring is inoperative when the primary backend is active (entries go to external store, not `glossary.md`). Static `capacity_signal` still fires.

**Changes:**
- Updated: `scripts/delegate-core.ts` — `GLOSSARY_COLUMNS` constant, `glossaryColIndex()` helper
- Updated: `scripts/match-delegate.ts` — `validateGlossaryHeader()`, `loadPendingCounts()` column-name resolution, known-limitation JSDoc
- Updated: `skills/memory-manager/SKILL.md` — all 4 operations use two-file fallback schema
- Updated: `skills/memory-manager/references/memory-operations.md` — two-file fallback documentation
- Updated: `integrations/docs/memory-system-adr.md` — Read Paths table, Known Limitation section
- 185 tests passing.

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

Shipped as v0.9.5. See the v0.9.5 section above for the full spec.

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
| v0.9.5 | skill-enhancer — WF1/WF2 enhancement workflows, domain registry, regression safeguards, EC-1–EC-9, enhance-nudge hook |
| v0.9.6 | Skills & agents consistency pass — 10 medium/high issues from SME review |
| v0.9.7 | SME review remediation (9 findings) + 3 quality gates (shell injection audit, AppleScript test protocol, prompt contract tests) — PR #7 |
| v1.0.0 | `/review-week` — Friday readiness snapshot; Memory Access Layer; Mermaid architecture docs |
| v1.0.1 | Memory Manager DRY refactor — inline try/fallback consolidated into `memory-manager` skill |
| v1.0.2 | Memory robustness — live pending counts, schema constants, drift prevention, known-limitation docs |
| v1.1.0 | *(planned)* Integrations: `/scan-slack` (blocked on Slack MCP), anti-domain support, YAML front matter |
