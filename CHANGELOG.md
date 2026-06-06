# claude-eisenhower — Changelog

All notable changes to this project are documented here.
Format: newest version first. Each entry covers what shipped, what changed, and (where relevant) what was deliberately cut.

> **Note:** Paths in entries before v1.2.0 reflect the pre-restructure directory layout.

---

## [Unreleased]

### Documentation

- **Post-v2.0.0 command-rename reference cleanup (#97, #98, #99).** The v2.0.0
  rename swept live command/skill/test files; these follow-ups finish the job
  across the documentation surface:
  - **#97** — swept `/execute` → `/complete-task` and `/status` → `/review-org`
    (and the `.md` filename refs) across 17 living reference docs:
    `docs/specs/*`, `docs/STRUCTURE.md`, `docs/PRINCIPLES.md`,
    `docs/architecture.md`. `tasks-schema-spec.md` and `memory-schema-spec.md`
    are cited by command files as the canonical schema authority, so stale
    names there were a real accuracy gap, not cosmetics.
  - **#98** — renamed `docs/specs/status-command-spec.md` →
    `review-org-command-spec.md`; updated the 4 inbound path links so nothing
    dangles.
  - **#99** — renamed `tests/execute-confirmation.test.ts` →
    `complete-task-confirmation.test.ts` (the test covers the `/complete-task`
    confirmation gate, issue #31).
- Historical records — ADRs, dated `docs/superpowers/plans/*`,
  `docs/v1.9.0-validation.md`, and prior CHANGELOG entries — were deliberately
  left unchanged as point-in-time documents.

Docs/test-only; no behavior change, no version bump. 760 tests passing.

---

## [v2.0.0] — 2026-06-05 — Command Rename for Discoverability (#45)

**Breaking change.** Two commands are renamed for verb-precision. The old
names are removed — there are no aliases. Update muscle memory and any saved
scripts or snippets.

### Renames

- **`/execute` → `/complete-task`.** The command's dominant path is marking a task
  done; the generic "execute" read like "run a script" and hid four modes.
  Bare `/complete-task <task>` now marks the task done directly (it previously asked
  what to do). `progress`, `followup`, and `delegate` remain explicit
  sub-verbs (`/complete-task progress <task>`, `/complete-task delegate <task> to <person>`).
- **`/status` → `/review-org`.** Disambiguates from `/today` (daily briefing) and
  from the task board itself. All query modes carry over: `/review-org`,
  `/review-org [project]`, `/review-org [alias]`, `/review-org awaiting`.

### Discoverability (#45)

- Command descriptions now carry lifecycle-phase prefixes —
  `[Capture] [Classify] [Plan] [Act] [Reflect] [Memory] [Setup]` — so the
  `/`-autocomplete menu discloses each command's phase at a glance.
- README workflow diagram, verb table, and the `/help` index updated to the
  new names.

### Migration

`/execute` and `/status` no longer exist. Re-learn them as `/complete-task` and
`/review-org`. The lifecycle phase formerly labeled "Execute" is now "Close-out".

760 tests passing.

---

## [v1.9.0] — 2026-05-28 — Multi-Provider Adapters + Daily/Weekly Loop Completion

The largest release since the initial cut. Three threads land together: a
markdown-only core that holds without platform integrations; a Google adapter
stack (Calendar / Gmail / Tasks) sitting behind a dispatcher so Mac-only
users are unaffected; and the daily/weekly visibility loop (`/today`,
`/status`, `/trends`, `/help`, `/memory`, `/forget`) reaching feature
completeness.

### User-facing commands

- **`/help` first-run walkthrough + 16-command index (#41, PR #90).** New users
  with an empty board get a 4-step synthetic-task tour (intake → prioritize
  → schedule → execute) so they form a mental model before live use.
  Returning users get a one-line acknowledgement + the full command index
  grouped by lifecycle phase (Capture / Classify / Plan / Act / Reflect /
  Memory / Setup). New `docs/empty-states.md` audits every command's
  empty-state copy; new `tests/prompt-contracts.test.ts` Q2-005/007 pin the
  walkthrough sequence and bijection between `commands/*.md` and the index.
- **`/memory` + `/forget` correction loop (#42, PR #91).** `/memory` is the
  read-only inspection surface (`/memory show <alias>` renders the
  per-person file verbatim; `/memory show analytics` runs
  `scripts/memory-analytics.ts`). `/forget` is the destructive correction
  surface with three scopes (alias / task / all), each gated by a distinct
  confirmation token (alias name / verbatim task title / literal
  `forget all`) — `yes` is intentionally rejected to prevent
  conversational misfire. `/today` and `/status` now surface
  memory↔TASKS.md drift inline (`⚠️ Memory:` prefix and a dedicated
  drift block respectively).
- **`/trends` 4-week behavioral retro (#43, PR #89).** Reads all three
  `memory/*-log.md` files plus `TASKS.md` and renders three patterns:
  throughput trend, defer/cut rate, overdue delegation rate by alias.
  Window argument clamps to `[1, 52]` weeks. Logs `/today`, `/plan-week`,
  and `/review-week` now write the canonical fields `/trends` consumes
  (`committed:`, `completed:`, `deferred:`).
- **`Awaiting:` field on Active tasks + `/status awaiting` rollup (#44,
  PR #88).** New schema fields `Awaiting:` + `Check-by:` for Active tasks
  blocked on external parties. `SCHEMA-010` rejects Active+Awaiting
  without `Check-by:` (YYYY-MM-DD); `SCHEMA-011` rejects `Awaiting:` on
  any non-Active state. `/status awaiting` groups by blocker
  (case-insensitive), sorts by overdue count, and flags overdue items with
  ⚠️ using business-day computation aligned with the Step 5 Risks
  surface.
- **`/quick` one-shot capture (#35, PR #61).** Collapses
  intake → prioritize → schedule into a single conversational pass for
  "I know exactly what this is" tasks.
- **`/scan-email` rewired to email-scan dispatcher (#68, PR #73).** Replaces
  the inline AppleScript with `scripts/email-scan.ts`, which routes through
  the same adapter dispatcher as Calendar/Tasks. Empty inbox vs. 0-matched
  produce distinct copy with explicit count.

### Adapter infrastructure (cross-cutting)

- **Adapter dispatcher + markdown-file adapter (#27, PR #54).** Introduces
  the dispatcher pattern that lets the core remain platform-agnostic; the
  markdown-file adapter is the default fallback when no platform adapter is
  configured.
- **Google adapter stack (#64/#65/#66/#67/#68, PRs #69–#73).** Shared OAuth
  helper (#67), Calendar (#64), Gmail (#65), Tasks (#66), and the
  /scan-email rewire (#68). Mac users default to EventKit + Apple
  Mail + Reminders unchanged; Google users opt in via config.
- **Adapter unification (#75/#76, PR #82).** Single OAuth helper + Options
  shape across Google adapters.
- **Google Calendar pagination fix (#79, PR #84).** Cursor through
  `nextPageToken`; dayKey computed in local-day parity.
- **AppleScript hardening (#38, PR #55).** JSON stdout, 10s timeout, captures
  reminder id rather than relying on title matching.

### Foundation refactors

- **SessionStart hook overhaul (#22, PR #49).** Structured briefing replaces
  generic one-liner. Tied to the v1.8.0 P5 work; finalized here.
- **Single-backend memory store (#28, PR #50).** Removes the dual-backend
  illusion — the plugin owns delegation memory fully, no
  `productivity:memory-management` dependency. ADR:
  `docs/adrs/single-backend-memory.md`.
- **TASKS.md store layer + atomic write + lockfile (#24, PR #52).** All
  writes go through `scripts/tasks-store.ts` with atomic tmp-file +
  rename + per-file lock. Concurrent /today and /schedule runs no longer
  race.
- **TASKS.md UX scale — archive + reorder + compact Done (#25, PR #53).**
  Long boards now archive old Done entries to `TASKS.archive.md`; Done
  section compacts to title + done-date.
- **Plugin Root Cleanup (#23, PR #51).** Removes the hand-typed
  `plugin_root:` config. Auto-detected via `${CLAUDE_PLUGIN_ROOT}` where
  available; falls back to a single `find` across known install
  locations during `/setup`. Migration: existing valid `plugin_root:`
  values keep working unchanged. Invalid values produce an actionable
  "plugin_root is not configured" error pointing at `/setup`.
- **Stakeholder cold-start (#39, PR #62).** Conversational `/setup` that
  learns delegate aliases by doing rather than upfront form-filling.
- **/setup hardening (#34, PR #60).** Auto-detect, preview, resumable,
  echo-back confirmation.
- **Test coverage tiers (#37, PR #59).** Golden-file, integration scaffold,
  contract expansion. Adds command-prompt contract suite covering
  canonical field tokens, `/trends` source contract, `/help` first-run +
  bijection, `/memory`+`/forget` token contracts, `/status` triage
  threshold.

### Smaller features + fixes

- **Q3 reminder lookup by id, not title (#36, PR #57).** Eliminates a class
  of false-match bugs when titles overlap.
- **Batch 1 quick wins (#26 / #29 / #30 / #31, PR #48).** Scoring
  transparency, intake fields, verb labels, /execute confirmation.
- **/quick Step 2 Row 4 narrowed to require explicit elimination signal
  (#63, PR #87).**
- **gitignore build byproducts + build-plugin contract test (#46, PR #85).**
- **Removed maintainer-only `enhance-nudge.sh` PostToolUse hook (#47,
  PR #86).**
- **active_adapter docs aligned with parser's H2 section format (#77,
  PR #83).**
- **Dispatcher invocations switched from bare `node` to `npx ts-node`
  (#78, PR #80).**
- **tsconfig typeRoots no longer includes `./node_modules` (#74, PR #81).**

### Removed

- **sync-prep skill** — copied into this repo by mistake; its remit (1:1 /
  supervisor sync briefs) is outside the Eisenhower task-prioritization
  scope. A maintained version lives in the `claude-config` project. No
  user-facing functionality affected — `sync-prep` was not invoked by any
  slash command. (PR #58)

### Docs

- New README "Planning & Visibility" section + updated examples.
- New `docs/v1.9.0-validation.md` pre-release validation checklist.
- New ADRs: `single-backend-memory.md`, `calendar-performance-fix.md`,
  `mac-calendar-planner-override.md`.

### Known issues carried forward

- `${CLAUDE_PLUGIN_ROOT}` still not injected into Bash / osascript MCP
  environments in Claude Code 2.1.144 (only into `command:`-type entries
  in `hooks/hooks.json`). Commands resolve install path through
  `plugin_root` field in `config/task-output-config.md` as documented in
  `docs/specs/plugin-path-resolution-spec.md`.
- `commands/forget.md` line 167 Rules section contradicts Step 2B
  confirmation-token spec; functional path follows Step 2B body. Tracked
  in **#92** for v1.9.1.

---

## [v1.8.0] — 2026-03-27 — SessionStart Structured Briefing (P5)

Enhanced SessionStart hook with a structured briefing that surfaces specific
items needing attention, replacing the generic count-only one-liner.

**SessionStart briefing:**
- 🔴 Overdue Active Tasks — lists titles with scheduled dates and business days overdue
- 🟡 Delegation Check-ins Due — lists owner, title, and check-by dates
- 📥 Inbox gate alert when ≥ 5 items in Inbox
- 💤 Staleness signal when no tasks completed in 5 business days
- 💡 Suggested next action (priority: check-ins > overdue > inbox > staleness)
- Quiet mode — only counts line when nothing actionable
- Business day math for all overdue calculations (excludes weekends)
- Handles `Scheduled: week of YYYY-MM-DD` (overdue after Friday of that week)

Spec: `docs/specs/session-start-enhancement-spec.md`

**Other changes:**
- `scripts/date-helpers.ts`: added `weekOfFriday()` and `businessDaysOverdue()` helpers
- `tests/session-start.test.ts`: 30 new tests (hook contracts + overdue logic)

---

## [v1.7.0] — 2026-03-27 — /plan-week Weekly Planning Command

New `/plan-week` command for Monday morning weekly planning. 204 tests passing.

**/plan-week — Weekly planning:**
- Proposes commitments based on carryover, priorities, calendar capacity, and delegation follow-ups
- Bridges `/review-week` (Friday retrospective) and `/schedule` (execution)
- Surfaces open commitments from prior weeks with neutral framing
- Shows delegation check-ins due this week in capacity math
- Inbox alert gate before committing to plan
- Interactive adjustment (add/remove/defer) before confirmation
- Writes `Scheduled: week of YYYY-MM-DD` — refined by `/schedule` to specific dates
- Analytics logged silently to `memory/plan-log.md`
- Works any day — dynamically scopes to remaining days mid-week

Spec: `docs/specs/plan-week-spec.md`

**Updates to existing artifacts:**
- `commands/schedule.md`: handles `Scheduled: week of ...` refinement to specific dates
- `docs/specs/tasks-schema-spec.md`: Scheduled field updated to `string` type, documents both formats
- PRINCIPLES.md: command count 10 → 11, `/plan-week` added to core platform-agnostic list
- STRUCTURE.md: registered in commands, specs, and plans listings

---

## [v1.6.0] — 2026-03-27 — sync-prep Meeting Preparation Skill

New auto-invocable skill for per-person meeting preparation. 202 tests passing.

**sync-prep — Meeting prep skill:**
- Auto-invokes on natural phrases ("prep for my 1:1 with Alex")
- **Downward briefs** (delegates): active delegations with project tags, recently completed, talking points, memory notes
- **Upward briefs** (supervisor): executive summary, portfolio with health signals, risks & mitigations, anticipated questions
- Direction detection: automatic from stakeholders.yaml role tags, TASKS.md Owner fields, memory/people/ files, upward keywords
- Read-only — no writes to any file

Spec: `docs/specs/sync-prep-spec.md`

**Housekeeping:**
- Updated PRINCIPLES.md skill count (3 → 4), `references/` now optional
- Updated memory-manager caller list to include sync-prep, /today, /status
- Updated STRUCTURE.md to reflect optional references/ folders

---

## [v1.5.0] — 2026-03-27 — /today + /status Commands

Two new commands for daily workflow and supervisor reporting. 200 tests passing.

**/today — Daily briefing (v1.4.0 spec):**
- Consolidated view of what needs attention right now
- Surfaces overdue delegations, tasks on plate, inbox backlog, calendar shape
- Read-only with daily analytics log (`memory/today-log.md`)
- Calendar integration optional — degrades gracefully when unavailable

Spec: `docs/specs/today-command-spec.md`

**/status — Org status (v1.5.0 spec):**
- On-demand org-wide status grouped by project/initiative
- Three query modes: `/status`, `/status [project]`, `/status [alias]`
- Health signals per project (🔴 overdue, 🟡 approaching, 🟢 on track)
- Progressive `Project:` tagging via confidence-split triage
- Risk summary leads the default view

Spec: `docs/specs/review-org-command-spec.md`

**Platform Architecture principle:**
- New principle in `docs/PRINCIPLES.md`: core is platform-agnostic (flat markdown),
  macOS integrations (Calendar, Reminders, Mail) are optional layers
- Added to `CLAUDE.md` code review checklist

**Schema update:**
- New optional `Project:` field in `docs/specs/tasks-schema-spec.md`
- Populated progressively by `/status` triage, not required at intake

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
