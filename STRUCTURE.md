# Plugin Structure

This document is the canonical reference for how this repository is organized.
All contributors and AI assistants working in this codebase should follow it.
When adding a new file, find the right directory here before creating anything.

---

## Top-Level Files

| File | Purpose |
|------|---------|
| `README.md` | Plugin overview, workflow summary, setup instructions, usage examples |
| `ROADMAP.md` | Now / Next / Later product roadmap — shipped features, planned work, strategic bets |
| `STRUCTURE.md` | This file — canonical directory structure and file placement rules |
| `CONNECTORS.md` | Registry of all active and planned integrations |
| `PRINCIPLES.md` | Engineering principles: DRY, SOLID, TDD, PII safety, structure rules |
| `CLAUDE.md` | Runtime instructions for Claude — config table, calendar query override |
| `.gitignore` | Excludes personal config files, TASKS.md, memory/, .DS_Store, *.plugin |
| `.claude-plugin/plugin.json` | Plugin metadata (name, version, author, keywords) |
| `TASKS.md` | ⚠ Runtime only — personal task board, gitignored, not committed |
| `claude-eisenhower-{version}.plugin` | ⚠ Build artifact — produced by `npm run package`, gitignored, not committed |

---

## Directory Map

```
claude-eisenhower/
│
├── commands/          # Slash command definitions — one file per command
├── skills/            # Skill definitions — one subdirectory per skill
├── agents/            # Autonomous agent definitions
├── hooks/             # Lifecycle hooks (e.g., SessionStart)
│
├── integrations/      # Everything related to external system connections
│   ├── config/        # Per-integration config files (gitignored) + .example templates
│   ├── adapters/      # Output adapter definitions (one file per target system)
│   ├── specs/         # Feature specs for integration work (design docs, Gherkin)
│   └── docs/          # Integration implementation notes, overrides, and ADRs
│
├── scripts/           # Executable scripts (Swift, AppleScript, shell)
│
├── docs/              # ⛔ DEPRECATED — do not add new files here
│                      #   Contents migrated to integrations/docs/
│
├── tests/             # Regression test suites — runnable via `npm test` in scripts/
│
└── memory/            # ⚠ Runtime only — personal memory, gitignored, not committed
    ├── glossary.md
    └── people/
```

---

## Directory Rules

### `commands/`
One `.md` file per slash command. Filename matches the command name.

```
commands/
  intake.md
  prioritize.md
  schedule.md
  execute.md
  scan-email.md
  delegate.md
```

**What belongs here**: Command prompt text, step-by-step behavior, allowed tools.
**What does not belong here**: Config values, business logic explanations, specs.

---

### `skills/`
One subdirectory per skill, each containing a `SKILL.md` and a `references/` folder.

```
skills/
  claude-eisenhower/
    SKILL.md
    references/
      eisenhower.md
      intake-sources.md
      delegation-guide.md
      email-patterns.md
```

**One skill directory only**: `claude-eisenhower/` is the canonical skill. The former `task-flow/` directory was the original plugin name and has been removed — it was an identical duplicate.

**What belongs here**: Domain knowledge, classification rules, reference tables.
**What does not belong here**: Config values, command step logic, integration specs.

---

### `agents/`
One `.md` file per autonomous agent definition.

```
agents/
  task-prioritizer.md
```

---

### `hooks/`
Single `hooks.json` defining lifecycle hooks.

```
hooks/
  hooks.json
```

---

### `integrations/`
All integration-related files live here, organized into four subdirectories.
Nothing lives directly in `integrations/` — files must go into a subdirectory.

#### `integrations/config/`
User-specific configuration — one file per integration.
**Actual config files are gitignored. Only `.example` templates are committed.**

```
integrations/config/
  calendar-config.md.example   ← committed (template)
  calendar-config.md            ← gitignored (your values)
  email-config.md.example      ← committed (template)
  email-config.md               ← gitignored (your values)
  task-output-config.md.example ← committed (template)
  task-output-config.md         ← gitignored (your values)
```

Naming convention: `{integration-name}-config.md` / `{integration-name}-config.md.example`

#### `integrations/adapters/`
Output adapter definitions — one file per target system. Plus a `README.md`
defining the adapter interface contract.

```
integrations/adapters/
  README.md          ← adapter interface contract (input schema, output schema, rules)
  reminders.md       ← Mac Reminders adapter (v1, active)
  asana.md           ← future
  jira.md            ← future
  linear.md          ← future
```

#### `integrations/specs/`
Feature specification documents — written before implementation, kept as a record
of decisions. One file per integration or major feature.

```
integrations/specs/
  email-integration-spec.md
  reminders-integration-spec.md
  delegation-spec.md                  ← delegation validation: Gherkin spec for match algorithm
  alias-resolution-spec.md            ← alias array schema and resolveAlias() behavior
  delegate-entry-point-spec.md        ← /delegate direct entry point: PRD for v0.5.1
  build-spec.md                       ← plugin packaging: npm run package / .plugin artifact
  setup-spec.md                       ← first-run setup and /setup reconfiguration
```

Format: problem statement, Gherkin user stories, goals, architecture, decisions log.

#### `integrations/docs/`
Implementation notes, architectural decision records (ADRs), and override
documentation that explains *how* something works or *why* a choice was made.
Not specs (which describe *what* to build) — docs explain the built thing.

```
integrations/docs/
  calendar-performance-fix.md    ← ADR: why Swift EventKit instead of AppleScript
  mac-calendar-planner-override.md ← override instructions for external plugin
  scripts-reference.md           ← moved from scripts/README.md
```

---

### `scripts/`
Executable scripts only. No documentation files.

```
scripts/
  cal_query.swift           ← EventKit calendar query (used by /schedule, /scan-email)
  push_reminder.applescript ← Reminders write adapter (used by /schedule)
  delegate-core.ts          ← shared types + pure scoring functions (imported by CLI and tests)
  match-delegate.ts         ← CLI entry point — file I/O, argument parsing, human-readable output
  build-plugin.js           ← packaging script — produces claude-eisenhower-{version}.plugin
  package.json              ← Node.js deps + npm scripts (test, build, package, release)
  tsconfig.json             ← TypeScript compiler config for scripts/
```

**Build scripts:**

| npm script | What it does |
|------------|-------------|
| `npm test` | Run full Jest regression suite |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run package` | Package plugin → `claude-eisenhower-{version}.plugin` at repo root |
| `npm run package:dev` | Same, skip dirty tree warning |
| `npm run release` | Run tests, then package (safe for distribution) |

Script-level documentation belongs in a docstring/header comment within the
script file itself, or in `integrations/docs/scripts-reference.md`.

---

### `tests/`
Runnable Jest regression suites. Each test file covers one integration or feature.

```
tests/
  delegation.test.ts           ← 35-test suite for delegation matching + alias resolution
  delegate-entry.test.ts       ← 31-test suite for /delegate entry point (v0.5.1, DEL-5xx)
  schedule-capacity.test.ts    ← 15-test suite for capacity signal review prompt (v0.5.2, CAP-6xx)
  phase2-3.test.ts             ← 32-test suite for /schedule + /execute pure logic (v0.5.3, DEL-7xx)
  delegation-regression.md     ← plain-language test descriptions (BDD format)
  node_modules                 ← symlink → ../scripts/node_modules (not committed)
```

**What belongs here**: Regression tests for scripts/ algorithms.
**What does not belong here**: Spec docs (integrations/specs/), fixtures with real names (PII).

---

## File Placement Decision Tree

When adding a new file, ask:

1. **Is it a slash command definition?** → `commands/`
2. **Is it skill domain knowledge or reference material?** → `skills/{skill-name}/references/`
3. **Is it a user-specific value (account name, list name)?** → `integrations/config/` as `.example` + gitignored actual
4. **Is it an output adapter (how to push to a system)?** → `integrations/adapters/`
5. **Is it a feature spec written before implementation?** → `integrations/specs/`
6. **Is it an implementation note, ADR, or override doc?** → `integrations/docs/`
7. **Is it an executable script?** → `scripts/`
8. **Is it runtime/personal data?** → `memory/` or `TASKS.md` (both gitignored)
9. **None of the above?** → Ask before creating. Do not default to `docs/` or repo root.

---

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Commands | kebab-case | `scan-email.md` |
| Config templates | `{name}-config.md.example` | `email-config.md.example` |
| Adapters | lowercase system name | `reminders.md`, `asana.md` |
| Specs | `{integration}-integration-spec.md` | `email-integration-spec.md` |
| Scripts | kebab-case with extension | `cal_query.swift`, `push_reminder.applescript` |
| People memory | `{first}-{last}.md` | `alex-rivera.md` |

---

## What Is Gitignored

```
TASKS.md                              ← personal task board
memory/                               ← personal stakeholder memory
integrations/config/calendar-config.md
integrations/config/email-config.md
integrations/config/task-output-config.md
integrations/config/stakeholders.yaml     ← PII — personal stakeholder graph
.DS_Store
```

Everything else is committed. `.example` config templates are always committed.

---

## Version History

| Version | Change |
|---------|--------|
| v0.1.0 | Initial structure — commands, skills, agents, hooks |
| v0.2.0 | Added scan-email command, email integration |
| v0.3.0 | Added integrations/ with config/, adapters/, specs/, docs/ |
|         | Deprecated docs/ (top-level) — contents migrated to integrations/docs/ |
|         | Added STRUCTURE.md |
|         | Removed skills/task-flow/ (deprecated name, duplicate of skills/claude-eisenhower/) |
| v0.4.0  | Added delegation validation feature                                              |
|         | New: `scripts/match-delegate.ts` — weighted scoring (domain×3, relationship, capacity) |
|         | New: `integrations/config/stakeholders.yaml.example` — PII-safe template           |
|         | New: `integrations/specs/delegation-spec.md` — full Gherkin spec (15 scenarios)    |
|         | New: `tests/delegation.test.ts` — 24-test Jest regression suite (24/24 passing)    |
|         | Updated: `.gitignore` — `stakeholders.yaml` excluded from source control           |
| v0.4.1  | Housekeeping: structure and DRY compliance pass                                    |
|         | New: `PRINCIPLES.md` — DRY, SOLID, TDD, PII safety, structure rules               |
|         | New: `scripts/delegate-core.ts` — shared algorithm (eliminates test duplication)   |
|         | Removed: `MAC-COPY-INSTRUCTIONS.md` — obsolete deploy workaround                  |
|         | Removed: 4 misplaced root-level duplicate files                                    |
|         | Fixed: `tests/node_modules` symlink now gitignored                                |
|         | Updated: `CLAUDE.md` — references PRINCIPLES.md at session start                  |
| v0.5.0  | Alias resolution: system-wide stakeholder name lookup                              |
|         | New: `integrations/specs/alias-resolution-spec.md` — full Gherkin spec            |
|         | Updated: `scripts/delegate-core.ts` — `alias: string \| string[]`; `getDisplayAlias()`, `resolveAlias()` |
|         | Updated: `integrations/config/stakeholders.yaml.example` — array alias format     |
|         | Updated: `commands/intake.md` — requester alias resolution step                   |
|         | Updated: `scripts/tsconfig.json` — `typeRoots` for ts-jest compatibility          |
|         | Tests: 35/35 passing (11 new TEST-DEL-203 scenarios)                              |
| v0.5.1  | `/delegate` direct entry point                                                     |
|         | New: `commands/delegate.md` — ad-hoc delegation command (authority flag, scoring, confirm, write, push, memory) |
|         | New: `tests/delegate-entry.test.ts` — 31-test Jest suite (DEL-5xx; 66/66 total passing) |
|         | New: `integrations/specs/delegate-entry-point-spec.md` — full PRD                 |
|         | Updated: `README.md`, `STRUCTURE.md`, `ROADMAP.md`                                |
| v0.5.2  | Capacity signal review prompt in `/schedule` Step 1b                               |
|         | Updated: `commands/schedule.md` — Part B added to Step 1b (advisory, non-blocking) |
|         | New: `tests/schedule-capacity.test.ts` — 15-test suite (CAP-6xx; 81/81 total passing) |
|         | Updated: `ROADMAP.md`, `STRUCTURE.md`                                              |
| v0.5.3  | Phase 2–3 automated test coverage (replaces manual TEST-DEL-020–032)               |
|         | New: `tests/phase2-3.test.ts` — 32-test suite (DEL-7xx; 113/113 total passing)     |
|         | Covers: dedup guard, delegate state machine, follow-up title/record format,         |
|         | overdue detection, check-in date arithmetic                                         |
|         | Updated: `ROADMAP.md`, `STRUCTURE.md`                                              |
