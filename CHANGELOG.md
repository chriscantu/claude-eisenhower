# claude-eisenhower — Changelog

All notable changes to this project are documented here.
Format: newest version first. Each entry covers what shipped, what changed, and (where relevant) what was deliberately cut.

> **Note:** Paths in entries before v1.2.0 reflect the pre-restructure directory layout.

---

## [v1.3.0] — 2026-03-26 — Scoring Unification + Plugin Root DRY

Two architectural improvements from codebase review. No user-visible behavior change
beyond more accurate Q3 scoring in `/prioritize`. 196 tests passing.

**Q3 scoring unification:**
- `/prioritize` Step 4b now invokes `match-delegate.ts` CLI instead of inline scoring
- Eliminates untested LLM-arithmetic code path
- Enables anti-domain veto in `/prioritize` (was missing)
- Enables pending-count penalty in `/prioritize` (was missing)
- One scoring algorithm, one code path, one test suite

Spec: `docs/specs/prioritize-cli-scoring-spec.md`

**Plugin root DRY fix:**
- New: `skills/core/references/plugin-root-resolution.md` — canonical resolution logic
- 5 commands (schedule, execute, delegate, scan-email, review-week) now reference
  the shared file instead of duplicating inline resolution + fallback
- Hardcoded `~/repos/claude-eisenhower` default now exists in exactly one place

Spec: `docs/specs/plugin-root-resolution-dry-spec.md`

---

## [v1.2.0] — 2026-03-26 — Directory Restructure

Flattened directory layout for navigability and coherence. No feature changes,
no behavior changes — purely structural. 196 tests passing.

Design spec: `docs/specs/2026-03-26-directory-restructure-design.md`

**Directory moves:**

- `skills/claude-eisenhower/` -> `skills/core/` — eliminated naming collision
- `integrations/specs/` -> `docs/specs/` — specs organized under docs
- `integrations/config/` -> `config/` — one hop from root
- `integrations/adapters/` -> `adapters/` — one hop from root
- `integrations/docs/*` -> `docs/` — consolidated with dev reference docs
- ADR files -> `docs/adrs/` — architectural decisions grouped together
- `PRINCIPLES.md`, `STRUCTURE.md`, `CONNECTORS.md` -> `docs/` — dev reference, not project identity
- `integrations/` directory removed (empty after moves)

**Reference updates:**

- All path references updated across 60+ files (commands, skills, agents, tests, scripts, docs, specs)
- `.gitignore` updated for new config paths; added `reports/`, `.claude/`, `.backup/` exclusions
- `docs/STRUCTURE.md` fully rewritten to reflect actual tracked file inventory
- `docs/PRINCIPLES.md` line 25 updated to `docs/adrs/memory-access-layer.md` (resolves deferred TODO R9)
- CHANGELOG.md historical entries left unchanged with explanatory note added

---

## [v1.1.3] — 2026-03-05 — DRY/SOLID Audit + Quality Hardening

DRY/SOLID compliance review and reliability hardening across the full plugin codebase.
No new features. No user-visible behavior change. 196 tests passing.

**Findings resolved (High/Medium impact):**

- **R1** — `commands/schedule.md`: stale four-state vocabulary throughout (Q3 tasks / Check-in date: / ## Completed / ## Q4 — Defer / Eliminate). All references updated to canonical schema fields (`State: Delegated`, `Check-by:`, `## Done`, `## Active`).
- **R2** — `commands/execute.md`: Mark Done and Delegate sections used `## Completed` and `## Q4 — Defer / Eliminate` as write targets. Updated to `## Done` and `## Active` with correct elimination note format.
- **R3** — `scripts/package.json` `postinstall`/`pretest` symlink: `existsSync` resolves through symlinks, causing `EEXIST` on re-run. Replaced with `lstatSync` for true inode-level idempotency.
- **R4** — `commands/delegate.md` Step 2: authority pattern list duplicated inline with a manual sync comment, violating DRY. Removed inline list; Step 2 now references `hasAuthorityFlag()` in `delegate-core.ts` as the single source of truth.
- **R5** — Plugin-root fallback clause missing from `commands/schedule.md` (calendar section) and `commands/review-week.md` (Step 1). Both now match the `scan-email.md` pattern: fallback to `~/repos/claude-eisenhower` with an explicit user-visible warning if `plugin_root` is absent from config.
- **R6** — `tests/prompt-contracts.test.ts` Q2-002 (memory guard line check) covered only `commandFiles` and `skillFiles`. Extended to include `agentFiles` — consistent with Q2-001 coverage and future-proofed for agent files that may reference `productivity:memory-management`.

**D4 verified:** `dist/` already in `.gitignore` (added in v0.9.7 / I1). No history cleanup needed — `dist/` was never committed.
**D5 resolved:** Remaining four-state vocabulary gaps (schedule.md, execute.md) closed by R1 and R2 above.

**Findings documented as TODO (Low impact, deferred):**
- **R8** — Migrate ts-jest config from deprecated `globals` key to `transform` key. Functional today; will break in a future ts-jest major.
- **R9** — Update `PRINCIPLES.md` line 25 to reference `skills/memory-manager/SKILL.md` instead of the superseded `integrations/docs/memory-access-layer.md`.

**Finding marked Won't Do:** R7 — Fix hardcoded paths in `integrations/docs/applescript-test-protocol.md`. Test protocol is a developer reference, not runtime code; cost > benefit.

---

## [v1.1.2] — Anti-domain Test Coverage (PR #11)

Closed the test gap flagged in the v0.9.4 QE audit: `addBusinessDays` and
`addBusinessDaysStr` had zero dedicated unit tests. 6 new tests (TEST-ABD-001–006)
covering Monday+2, Friday+2 (spans weekend), n=0, Friday+1 → Monday, string output,
and mutation guard.

Also documented the UTC-vs-local timezone trap: `new Date("YYYY-MM-DD")` parses as
UTC midnight and misaligns with `addBusinessDays`'s local-time arithmetic in
non-UTC timezones (same class of bug as the v0.9.3 `businessDaysElapsed` fix).
Tests use `new Date(year, month-1, day)` throughout to avoid it. 195 tests passing.

---

## [v1.1.1] — Anti-Domain Hard Veto (PR #10)

Added optional `anti_domains` field to the `Stakeholder` interface. If any keyword
in the list matches the task text, the stakeholder is unconditionally excluded from
delegation candidates (score set to `-Infinity`) regardless of domain match or
relationship weight. `matched_domains` is still populated on vetoed candidates for
debugging visibility.

**Changes**: `scripts/delegate-core.ts` (type + veto logic), `tests/delegation.test.ts`
(4 new tests: TEST-ANTI-001–004), `integrations/config/stakeholders.yaml.example`
(field docs + vendor example with `anti_domains`). 189 tests passing.

---

## [v1.0.2] — Memory Robustness

Patch release. No user-visible behavior change.

- **Schema constants** — `GLOSSARY_COLUMNS` and `glossaryColIndex()` defined once in `delegate-core.ts`; shared between runtime and tests. Eliminates the schema drift risk between write and read paths.
- **Header validation guard** — `loadPendingCounts()` now validates `glossary.md` header against `GLOSSARY_COLUMNS` before parsing. Schema mismatch emits a warning to stderr and returns `{}` safely instead of silently returning wrong counts.
- **Memory-manager fallback targets corrected** — all four operations (`log-delegation`, `resolve-delegation`, `update-checkin`, `query-pending`) now reference the canonical two-file fallback schema (`memory/glossary.md` + `memory/people/`). Previously pointed to deprecated `stakeholders-log.md`.
- **Known limitation documented** — `loadPendingCounts()` JSDoc and `memory-system-adr.md` now explain that pending-count scoring is inoperative when the primary backend is active. Static `capacity_signal` still fires.

**Changes:** `scripts/delegate-core.ts`, `scripts/match-delegate.ts`, `skills/memory-manager/SKILL.md`, `skills/memory-manager/references/memory-operations.md`, `integrations/docs/memory-system-adr.md`. 185 tests passing.

---

## [v1.0.1] — Memory Manager DRY Refactor

Patch release. No user-visible behavior change.

Three separate memory patterns existed across the plugin:
- **Write/create**: 4-step try-skill-then-fallback block copy-pasted 6 times across 4 files
- **Read**: Memory Access Layer inline in `review-week.md` Step 3
- **Update**: Direct writes to `memory/glossary.md` and `memory/people/*.md` in `execute.md` with no abstraction

All three consolidated into `skills/memory-manager/SKILL.md` — a single internal skill
with four operations: `log-delegation`, `resolve-delegation`, `update-checkin`, `query-pending`.
The backend contract (try `productivity:memory-management`, fall back to `memory/stakeholders-log.md`)
is now defined once. Commands delegate by intent only.

**Changes:** New `skills/memory-manager/SKILL.md` + `references/memory-operations.md`. Updated `commands/schedule.md`, `commands/execute.md`, `commands/delegate.md`, `commands/review-week.md`, `skills/claude-eisenhower/SKILL.md`, `tests/prompt-contracts.test.ts`. Deprecated `integrations/docs/memory-access-layer.md`. 155 tests passing.

---

## [v1.0.0] — Weekly Review + Architecture Documentation

Closes the weekly workflow loop. The four-phase Intake → Prioritize → Schedule → Execute
cycle is complete; `/review-week` adds the Friday readiness snapshot that ties it together.
Spec: `integrations/specs/review-week-spec.md`.

### `/review-week`

Friday afternoon command. Surfaces in one output:
- 🔴 Overdue delegations (require action before weekend)
- 🟡 Delegated check-ins due next week
- 📋 Active tasks due next week
- 📬 Inbox backlog count + oldest item age
- 📆 Calendar load for next Mon–Fri (via `cal_query.swift`)
- ✅ Recommended next steps (generated from surfaced signals)

Writes a structured analytics line to `memory/review-log.md` after each run (no PII; counts only). Silent write.

### Memory Access Layer

Defines a transparent read abstraction: `productivity:memory-management` primary, `memory/stakeholders-log.md` fallback. Same return shape regardless of backend. See `integrations/docs/memory-access-layer.md` (now superseded by memory-manager skill).

### Architecture Documentation

Three Mermaid diagrams added to `integrations/docs/architecture.md`: system overview, task state machine (Inbox → Active → Delegated → Done with command labels), and memory access layer (write path + read path side by side).

---

## [v0.9.7] — SME Review Remediation + Quality Gates (PR #7)

Three rounds of AI SME review (v0.9.5–v0.9.7) produced 9 remediation findings plus
3 follow-on quality gate improvements. All 153 tests pass.

**Remediation (9 findings):**
- **C1/I3** — `scan-email`: fixed 31–40 batch gap; stored `msgIndex` to prevent TOCTOU index drift; surface body-fetch errors via `BODY_UNAVAILABLE:` prefix
- **C2** — `match-delegate.ts`: guard `yaml.load()` with structured JSON error output; `require.main` guard prevents test-import side effects
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

## [v0.9.6] — Skills & Agents Consistency Pass

Fixes high and medium severity issues identified in the 2026-03-04 SME review.
Full spec: `integrations/specs/2026-03-04-skills-agents-consistency-pass.md`.

- **H7** — `enhance-nudge.sh`: `md5sum` (GNU-only) replaced with `shasum` for macOS/Linux compatibility
- **H10** — `task-prioritizer` agent: reads "the Unprocessed section" → corrected to `## Inbox`
- **H5** — `skill-enhancer` Phase 3 dispatch: added concrete Task tool template (model, tools, synthesis rules)
- **M6** — `skill-enhancer` WF1/WF2 routing ambiguity resolved; disambiguation question added
- **M9** — `skill-enhancer`: Phase 0 halt added if target artifact is the skill-enhancer itself
- **M1** — `claude-eisenhower` SKILL.md trigger coverage extended to scan-email, delegate, setup phrases
- **M4/M11/M16** — Eisenhower scoring rule divergence: agent and SKILL.md now reference `eisenhower.md` as single authority
- **M15** — SessionStart hook extended to surface overdue Active tasks and Delegated check-ins
- **H18** — `/setup` Step 3: `plugin_root` now validated before writing config; blocks setup if invalid
- **H2** — `productivity:memory-management` registered in CONNECTORS.md; local fallback added at each call site

---

## [v0.9.5] — skill-enhancer

A research-driven skill upgrade engine.

**Two workflows:**
- **WF1 Full Enhancement** (6 phases): environment gate → baseline + domain detection → sibling mining → parallel research agents → classify/prioritize proposals → apply with pre-apply checklist and npm test verification
- **WF2 Targeted Enhancement** (4 phases): focused improvement on a specific area without a full research sweep

**Key files:** `skills/skill-enhancer/SKILL.md`, `references/enhancement-protocol.md`, `references/regression-safeguards.md`, `references/edge-cases.md` (EC-1–EC-9).

**Hook:** `hooks/enhance-nudge.sh` fires after writing any `commands/` or `skills/` artifact; session-deduped so it fires once per file per session.

---

## [v0.9.4] — Infrastructure

Internal technical improvements with no user-visible behavior change.

- **TypeScript Adapter Contract Interfaces** — `TaskOutputRecord` and `PushResult` exported from `scripts/adapter-types.ts`. Compiler-enforced contract for future adapters.
- **Four-State Model Test Suite** — `tests/four-state.test.ts` covering all 10 FOUR-STATE-xxx Gherkin scenarios from `integrations/specs/four-state-task-model-spec.md`.
- **QE audit** — Removed 6 low-signal tests that duplicated coverage without adding signal.

---

## [v0.9.3] — Plugin Path Resolution

- `plugin_root` config field added to `task-output-config.md`; replaces hardcoded `~/repos/claude-eisenhower/` in command files and `cal_query.swift` call sites.
- UTC timezone fix in `businessDaysElapsed`: `new Date("YYYY-MM-DD")` UTC midnight misalignment corrected.
- CI test workflow added.

---

## [v0.9.2] — Four-State Consistency Pass

- `commands/delegate.md` Step 6: `## Q3 — Delegate` → `## Delegated`
- `commands/scan-email.md` Step 9: `Status: Q1/Q2/Q3` → `State: Inbox`
- `hooks/hooks.json` SessionStart: Q1/Q2/Q3/Q4 counts → Inbox/Active/Delegated/Done
- `skills/claude-eisenhower/SKILL.md`: `## Unprocessed` and Q1-Q4 headers corrected
- `dist/` removed from source control (`.gitignore` updated)

---

## [v0.9.1] — `/execute` Reminders Sync

Completion now propagates to the Reminders adapter. Added `complete_reminder.applescript`.

---

## [v0.9.0] — Four-State Task Model

- **Inbox → Active → Delegated → Done** replaces Q1/Q2/Q3/Q4 as the status driver
- **Eisenhower preserved as `Priority:` metadata** — the matrix classifies work; state tracks where it lives
- **Check-by enforcement** — Delegated requires a Check-by date; no exceptions
- **No Blocked state** — blockers are notes with a check-by forcing function

---

## [v0.8.0] — First-Run Setup

`/setup` command: conversational 5-step first-run flow. Per-command config guards auto-trigger setup for missing config then resume the original command. Stakeholders starter template included.

---

## [v0.7.0] — GitHub Actions Release Workflow

Tag-triggered `.plugin` artifact build + GitHub Release publish.

---

## [v0.6.0] — scan-email Crash Fix + Build Packaging

- `scan-email`: U+FFFC ASCII strip crash fix
- Build packaging system: `npm run package` / `release` workflows

---

## [v0.5.3] — Phase 2–3 Automated Test Coverage

32-test suite (DEL-7xx); replaces TEST-DEL-020–032 manual tests.

---

## [v0.5.2] — Capacity Signal Review

`/schedule` Step 1b Part B surfaces overloaded delegates (2+ open tasks, 5+ business days) at schedule time. Advisory only. 15-test suite (TEST-CAP-6xx).

---

## [v0.5.1] — `/delegate` Direct Entry Point

New command: inline Reminders push, memory log. 31-test suite.

---

## [v0.5.0] — Alias Resolution

`alias` array schema, `resolveAlias()`, `/intake` normalization. 35-test suite.

---

## [v0.4.3] — Regression Validation

TEST-DEL-100/201/202 full regression. PII fix in TASKS.md.

---

## [v0.4.2] — Delegation Lifecycle

Dedup guard (`Synced:` field), Mark Done close-out, follow-up auto-creation on missed check-ins.

---

## [v0.4.1] — DRY Refactor

`delegate-core.ts`: single source of truth for shared types, scoring, authority flag, Q3 constants, alias resolution, date helpers. `PRINCIPLES.md` added. Self-healing test setup.

---

## [v0.4.0] — Delegation Engine

Stakeholder graph (`stakeholders.yaml`), weighted scoring algorithm, authority flag, capacity lifecycle management. 24-test Jest suite.

---

## [v0.3.0] — Integrations

`integrations/` structure, Mac Calendar EventKit (`cal_query.swift`), Mac Reminders adapter, `STRUCTURE.md`.

---

## [v0.2.0] — scan-email

`/scan-email` command. Apple Mail integration (configurable account and inbox, three scan modes).

---

## [v0.1.0] — Core Workflow

`/intake`, `/prioritize`, `/schedule`, `/execute` — the four-phase task management loop.
