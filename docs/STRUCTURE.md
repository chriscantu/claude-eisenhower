# Plugin Structure

This document is the canonical reference for how this repository is organized.
All contributors and AI assistants working in this codebase should follow it.
When adding a new file, find the right directory here before creating anything.

---

## Top-Level Files

| File | Purpose |
|------|---------|
| `README.md` | Plugin overview, workflow summary, setup instructions, usage examples |
| `CHANGELOG.md` | Version history — all shipped releases, newest first. Paths in entries before v1.2.0 reflect the pre-restructure layout. |
| `ROADMAP.md` | Forward-looking plan — Near-Term, Long-Term, Won't Do, Open Questions, deferred TODOs |
| `CLAUDE.md` | Runtime instructions for Claude — config table, calendar query override |
| `.gitignore` | Excludes personal config files, TASKS.md, memory/, reports/, .DS_Store, *.plugin |
| `.claude-plugin/plugin.json` | Plugin metadata (name, version, author, keywords) |
| `TASKS.md` | :warning: Runtime only — personal task board, gitignored, not committed |
| `claude-eisenhower-{version}.plugin` | :warning: Build artifact — produced by `npm run package`, gitignored, not committed |

---

## Directory Map

```
claude-eisenhower/
|
+-- .github/workflows/    # GitHub Actions CI/CD workflows
+-- .claude-plugin/        # Plugin manifest and marketplace metadata
|
+-- commands/              # Slash command definitions -- one file per command
+-- skills/                # Skill definitions -- one subdirectory per skill
+-- agents/                # Autonomous agent definitions
+-- hooks/                 # Lifecycle hooks (e.g., SessionStart)
|
+-- config/                # User-specific config (gitignored) + .example templates
+-- adapters/              # Output adapter definitions (one file per target system)
+-- docs/                  # All written reference: specs, ADRs, dev reference
|   +-- specs/             # Feature specs + design specs (pre-implementation)
|   +-- adrs/              # Architectural decision records
|   +-- superpowers/plans/ # Implementation plans for multi-step features (date-prefixed)
|
+-- scripts/               # Executable scripts (Swift, AppleScript, shell, TypeScript)
+-- tests/                 # Regression test suites -- runnable via `npm test` in scripts/
|
+-- memory/                # Runtime only -- personal memory, gitignored, not committed
```

---

## Directory Rules

### `commands/`
One `.md` file per slash command. Filename matches the command name.

```
commands/
  intake.md
  plan-week.md
  prioritize.md
  schedule.md
  execute.md
  delegate.md
  scan-email.md
  review-week.md
  setup.md
  status.md
  today.md
```

**What belongs here**: Command prompt text, step-by-step behavior, allowed tools.
**What does not belong here**: Config values, business logic explanations, specs.

---

### `skills/`
One subdirectory per skill, each containing a `SKILL.md` and optionally a `references/` folder.

```
skills/
  core/
    SKILL.md
    references/
      eisenhower.md
      intake-sources.md
      delegation-guide.md
      email-patterns.md
      plugin-root-resolution.md
  skill-enhancer/
    SKILL.md
    references/
      enhancement-protocol.md
      regression-safeguards.md
      edge-cases.md
  memory-manager/
    SKILL.md
    references/
      memory-operations.md
  sync-prep/
    SKILL.md
```

**`core/`** is the canonical end-user skill (Eisenhower matrix classification, intake routing, delegation logic).
**`skill-enhancer/`** is a developer-only skill for improving plugin artifacts through sibling mining, research, and regression-safe editing.
**`memory-manager/`** manages stakeholder memory reads and writes.
**`sync-prep/`** generates per-person meeting preparation briefs (downward for delegates, upward for supervisor).

**What belongs here**: Domain knowledge, classification rules, reference tables.
**What does not belong here**: Config values, command step logic, specs.

---

### `agents/`
One `.md` file per autonomous agent definition.

```
agents/
  task-prioritizer.md
```

---

### `hooks/`
`hooks.json` defines all lifecycle hooks. Hook scripts live alongside it.

```
hooks/
  hooks.json          -- hook registry (SessionStart, PostToolUse)
  enhance-nudge.sh    -- PostToolUse: nudges developer to run skill-enhancer after editing artifacts
```

---

### `config/`
User-specific configuration — one file per integration.
**Actual config files are gitignored. Only `.example` templates are committed.**

```
config/
  calendar-config.md.example   -- committed (template)
  calendar-config.md            -- gitignored (your values)
  email-config.md.example      -- committed (template)
  email-config.md               -- gitignored (your values)
  task-output-config.md.example -- committed (template)
  task-output-config.md         -- gitignored (your values)
  stakeholders.yaml.example    -- committed (template)
  stakeholders.yaml             -- gitignored (PII)
```

Naming convention: `{integration-name}-config.md` / `{integration-name}-config.md.example`

---

### `adapters/`
Output adapter definitions — one file per target system. Plus a `README.md`
defining the adapter interface contract.

```
adapters/
  README.md          -- adapter interface contract (input schema, output schema, rules)
  reminders.md       -- Mac Reminders adapter (v1, active)
```

---

### `docs/`
All written reference material: specs, ADRs, developer reference, and project
governance. Organized into subdirectories by purpose.

```
docs/
  PRINCIPLES.md                      -- engineering principles: DRY, SOLID, TDD, PII safety, structure rules
  STRUCTURE.md                       -- this file -- canonical directory structure and file placement rules
  CONNECTORS.md                      -- registry of all active and planned integrations
  architecture.md                    -- Mermaid diagrams: system overview, task state machine, memory access layer
  mac-calendar-planner-override.md   -- override instructions for external plugin
  scripts-reference.md               -- script documentation (moved from scripts/README.md)
  applescript-test-protocol.md       -- manual test protocol: 8 test cases for complete_reminder and push_reminder

  specs/                             -- pre-implementation specs (feature + design)
    email-integration-spec.md
    reminders-integration-spec.md
    delegation-spec.md               -- delegation validation: Gherkin spec for match algorithm
    alias-resolution-spec.md         -- alias array schema and resolveAlias() behavior
    delegate-entry-point-spec.md     -- /delegate direct entry point: PRD for v0.5.1
    build-spec.md                    -- plugin packaging: npm run package / .plugin artifact
    setup-spec.md                    -- first-run setup and /setup reconfiguration
    github-release-spec.md           -- GitHub Actions release automation on v* tags
    four-state-task-model-spec.md    -- Inbox->Active->Delegated->Done state model (v0.9.0)
    plan-week-spec.md                -- /plan-week PRD: weekly planning command
    slack-intake-spec.md             -- /scan-slack Slack DM + mention capture (planned v1.1)
    tasks-schema-spec.md             -- canonical TASKS.md field schema + section structure
    adapter-types-spec.md            -- TypeScript interfaces for TaskOutputRecord + PushResult
    memory-schema-spec.md            -- glossary.md + people/*.md schema and write rules
    skill-enhancer-spec.md           -- skill-enhancer implementation plan (v0.9.5)
    artifact-baselines.md            -- floor construct counts for skill-enhancer Phase 6 regression check
    review-week-spec.md              -- /review-week PRD
    session-start-enhancement-spec.md  -- SessionStart structured briefing enhancement (P5)
    plugin-path-resolution-spec.md       -- plugin root path resolution
    prioritize-cli-scoring-spec.md        -- /prioritize CLI scoring unification (v1.3.0)
    plugin-root-resolution-dry-spec.md    -- plugin_root DRY extraction (v1.3.0)
    2026-03-04-quality-gates-spec.md      -- (design spec, date-prefixed)
    2026-03-26-directory-restructure-design.md -- (design spec, date-prefixed)

  superpowers/plans/                 -- implementation plans (date-prefixed, produced by writing-plans skill)
    2026-03-26-v1.3.0-scoring-unification-and-plugin-root-dry.md
    2026-03-27-plan-week-command.md
    2026-03-27-status-command.md
    2026-03-27-session-start-enhancement.md

  adrs/                              -- architectural decision records
    calendar-performance-fix.md      -- ADR: why Swift EventKit instead of AppleScript
    memory-system-adr.md             -- ADR: single write target for delegation memory (Option B)
    memory-access-layer.md           -- Superseded -- see skills/memory-manager/SKILL.md (v1.0.1)
    architectural-review-2026-03-02.md -- ADR: full codebase review at v0.9.1; shaped v1.0 roadmap
    security-audit-applescript.md    -- AppleScript shell injection audit (v0.9.7)
```

**What belongs in `docs/specs/`**: Feature specs (problem statement, Gherkin, goals, architecture, decisions log) and design specs (date-prefixed).
**What belongs in `docs/superpowers/plans/`**: Implementation plans produced by the writing-plans skill. Date-prefixed, one per feature.
**What belongs in `docs/adrs/`**: Post-decision records explaining *why* a choice was made.
**What belongs in `docs/` root**: Governance docs, system diagrams, reference material.

---

### `.github/workflows/`
GitHub Actions workflow definitions. One file per workflow.

```
.github/workflows/
  release.yml   -- builds and publishes .plugin artifact on v* tag push
  test.yml      -- CI test runner
```

**What belongs here**: CI/CD workflows triggered by GitHub events.
**What does not belong here**: Local build scripts (those go in `scripts/`), documentation.

---

### `scripts/`
Executable scripts only. No documentation files.

```
scripts/
  cal_query.swift              -- EventKit calendar query (used by /schedule, /scan-email)
  complete_reminder.applescript -- Reminders complete adapter (used by /execute)
                                  Manual test protocol: docs/applescript-test-protocol.md
  push_reminder.applescript    -- Reminders write adapter (used by /schedule)
                                  Manual test protocol: docs/applescript-test-protocol.md
  delegate-core.ts             -- shared types + pure scoring functions (imported by CLI and tests)
  match-delegate.ts            -- CLI entry point -- file I/O, argument parsing, human-readable output
  adapter-types.ts             -- TypeScript interfaces for adapter contract
  date-helpers.ts              -- business day arithmetic helpers
  build-plugin.js              -- packaging script -- produces claude-eisenhower-{version}.plugin
  install-hooks.sh             -- installs git hooks from scripts/hooks/
  package.json                 -- Node.js deps + npm scripts (test, build, package, release)
  package-lock.json            -- dependency lockfile
  tsconfig.json                -- TypeScript compiler config for scripts/
  hooks/
    pre-push                   -- git pre-push hook (tag/version alignment)
```

**Build scripts:**

| npm script | What it does |
|------------|-------------|
| `npm test` | Run full Jest regression suite |
| `npm run build` | Compile TypeScript -> `dist/` |
| `npm run package` | Package plugin -> `claude-eisenhower-{version}.plugin` at repo root |
| `npm run package:dev` | Same, skip dirty tree warning |
| `npm run release` | Run tests, then package (safe for distribution) |

Script-level documentation belongs in a docstring/header comment within the
script file itself, or in `docs/scripts-reference.md`.

---

### `tests/`
Runnable Jest regression suites. Each test file covers one feature.

```
tests/
  delegation.test.ts           -- 35-test suite for delegation matching + alias resolution
  delegate-entry.test.ts       -- 31-test suite for /delegate entry point (DEL-5xx)
  schedule-capacity.test.ts    -- 15-test suite for capacity signal review prompt (CAP-6xx)
  phase2-3.test.ts             -- 32-test suite for /schedule + /execute pure logic (DEL-7xx)
  agent-contracts.test.ts      -- structural checks: plugin schema, hook registration, file presence
  prompt-contracts.test.ts     -- vocabulary contract tests: prohibited headers, memory guard lines
  adapter-types.test.ts        -- adapter type interface checks
  four-state.test.ts           -- four-state task model checks
  pending-counts.test.ts       -- pending task count logic
  delegation-regression.md     -- plain-language test descriptions (BDD format)
  node_modules                 -- symlink -> ../scripts/node_modules (not committed)
```

**What belongs here**: Regression tests for scripts/ algorithms.
**What does not belong here**: Spec docs (`docs/specs/`), fixtures with real names (PII).

---

## File Placement Decision Tree

When adding a new file, ask:

1. **Is it a slash command definition?** -> `commands/`
2. **Is it skill domain knowledge or reference material?** -> `skills/{skill-name}/references/`
3. **Is it a user-specific value (account name, list name)?** -> `config/` as `.example` + gitignored actual
4. **Is it an output adapter (how to push to a system)?** -> `adapters/`
5. **Is it a feature or design spec written before implementation?** -> `docs/specs/`
6. **Is it an architectural decision record?** -> `docs/adrs/`
7. **Is it an implementation note or dev reference doc?** -> `docs/`
8. **Is it an executable script?** -> `scripts/`
9. **Is it runtime/personal data?** -> `memory/` or `TASKS.md` (both gitignored)
10. **None of the above?** -> Ask before creating. Do not default to repo root.

---

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Commands | kebab-case | `scan-email.md` |
| Config templates | `{name}-config.md.example` | `email-config.md.example` |
| Adapters | lowercase system name | `reminders.md`, `asana.md` |
| Feature specs | `{feature}-spec.md` | `delegation-spec.md` |
| Design specs | `{date}-{name}-spec.md` or `{date}-{name}-design.md` | `2026-03-26-directory-restructure-design.md` |
| Scripts (TypeScript) | kebab-case with extension | `delegate-core.ts`, `match-delegate.ts` |
| Scripts (Swift/AppleScript) | snake_case with extension | `cal_query.swift`, `push_reminder.applescript` |
| People memory | `{first}-{last}.md` | `alex-rivera.md` |

---

## What Is Gitignored

```
TASKS.md                              -- personal task board
memory/                               -- personal stakeholder memory
config/calendar-config.md             -- personal calendar config
config/email-config.md                -- personal email config
config/task-output-config.md          -- personal task output config
config/stakeholders.yaml              -- PII -- personal stakeholder graph
reports/                              -- personal weekly reviews
.claude/                              -- Claude Code local settings
.backup/                              -- local backups
.DS_Store
dist/                                 -- build artifact -- TypeScript compiled output
*.plugin                              -- build artifact -- produced by npm run package
.worktrees/                           -- git worktrees for isolated development
```

`.example` config templates are always committed. Build artifacts (`dist/`, `*.plugin`) are never committed -- CI rebuilds them from source on every release.
