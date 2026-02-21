# Plugin Build & Packaging — Feature Spec

**Plugin**: claude-eisenhower
**Version**: 0.3.0 (planned)
**Status**: Draft — pending author review
**Last updated**: 2026-02-21
**Author**: Cantu

---

## Problem Statement

The plugin today is installed by manually placing the repo folder into the Cowork marketplace directory. There is no packaging step, no versioned artifact, and no clean way to distribute it to another machine or team member. When someone wants to install the plugin, they either clone the repo (which includes personal config files, memory, and TASKS.md) or receive a hand-crafted folder of unknown provenance.

This also means there is no enforced separation between "things that belong in the plugin" and "things that belong to the user's runtime." Personal config, the task board, and memory files can accidentally travel with the plugin.

---

## Goals

1. **Single command to produce a distributable artifact** — `npm run package` produces a versioned `.plugin` file ready to install.
2. **Clean separation of plugin vs. user data** — The artifact never includes personal config files, TASKS.md, memory, or node_modules.
3. **Version stamped** — The artifact filename includes the version from `plugin.json` (e.g., `claude-eisenhower-0.3.0.plugin`).
4. **Reproducible** — Running `npm run package` twice from the same commit produces the same artifact.
5. **No new runtime dependencies** — The build script uses only Node.js built-ins (no additional npm packages).

---

## Non-Goals

1. **No CI/CD pipeline** — Manual `npm run package` only. Automation is a future concern.
2. **No auto-publish** — The script produces a file; distribution (email, shared drive, etc.) is manual.
3. **No auto-version-bump** — Version is read from `plugin.json` as-is. Bumping is a manual step before packaging.
4. **No Windows support** — Plugin targets macOS only (Apple Mail, Mac Calendar, Mac Reminders). The build script runs on macOS.
5. **No minification or compilation of command files** — Command `.md` files ship as-is. No pre-processing.

---

## User Stories (Gherkin)

### Scenario 1: Developer packages the plugin for distribution

```gherkin
Feature: Package plugin into distributable artifact

  Scenario: Developer runs npm run package
    Given the repo is at a clean, committed state
    And plugin.json contains version "0.3.0"
    When the developer runs `npm run package` from the scripts/ directory
    Then a file named "claude-eisenhower-0.3.0.plugin" is created at the repo root
    And the file is a valid zip archive
    And the archive contains all required plugin files
    And the archive does not contain any gitignored personal files
    And the archive does not contain node_modules or dist/
```

### Scenario 2: Build fails gracefully if plugin.json is missing or malformed

```gherkin
Feature: Build fails with a clear error message

  Scenario: plugin.json is missing version field
    Given .claude-plugin/plugin.json does not contain a "version" field
    When the developer runs `npm run package`
    Then the build exits with a non-zero status code
    And the error message is: "Build failed: version not found in .claude-plugin/plugin.json"
    And no .plugin file is created
```

### Scenario 3: Existing artifact is overwritten on rebuild

```gherkin
Feature: Rebuild overwrites previous artifact

  Scenario: Developer rebuilds after a change
    Given "claude-eisenhower-0.3.0.plugin" already exists at the repo root
    When the developer runs `npm run package` again
    Then the existing file is replaced with the new build
    And the developer sees: "✅ Built claude-eisenhower-0.3.0.plugin"
```

---

## Artifact Specification

### Filename

```
claude-eisenhower-{version}.plugin
```

Version is read from `.claude-plugin/plugin.json`. Example: `claude-eisenhower-0.3.0.plugin`

### Format

Standard zip archive. The `.plugin` extension signals to Cowork that this is an installable plugin.

### Contents — included

```
claude-eisenhower-0.3.0.plugin (zip)
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   ├── delegate.md
│   ├── execute.md
│   ├── intake.md
│   ├── prioritize.md
│   ├── scan-email.md
│   ├── schedule.md
│   └── setup.md              ← added by setup feature (future)
├── skills/
│   └── claude-eisenhower/
│       ├── SKILL.md
│       └── references/
│           ├── delegation-guide.md
│           ├── eisenhower.md
│           ├── email-patterns.md
│           └── intake-sources.md
├── agents/
│   └── task-prioritizer.md
├── hooks/
│   └── hooks.json
├── scripts/
│   ├── cal_query.swift
│   └── push_reminder.applescript
├── integrations/
│   ├── config/
│   │   ├── calendar-config.md.example
│   │   ├── email-config.md.example
│   │   ├── task-output-config.md.example
│   │   └── stakeholders.yaml.example
│   ├── adapters/
│   │   ├── README.md
│   │   └── reminders.md
│   └── docs/
│       ├── calendar-performance-fix.md
│       ├── mac-calendar-planner-override.md
│       └── scripts-reference.md
├── CLAUDE.md
├── CONNECTORS.md
├── PRINCIPLES.md
├── README.md
└── STRUCTURE.md
```

### Contents — excluded

These are never included in the artifact, even if present in the repo:

| Path | Reason |
|------|--------|
| `integrations/config/calendar-config.md` | Personal — gitignored |
| `integrations/config/email-config.md` | Personal — gitignored |
| `integrations/config/task-output-config.md` | Personal — gitignored |
| `integrations/config/stakeholders.yaml` | PII — gitignored |
| `TASKS.md` | Personal runtime data — gitignored |
| `memory/` | Personal runtime data — gitignored |
| `scripts/node_modules/` | Build artifact — gitignored |
| `tests/node_modules/` | Build artifact — gitignored |
| `dist/` | Build artifact — gitignored |
| `tests/` | Dev-only — not needed at runtime |
| `integrations/specs/` | Dev-only design docs |
| `.git/` | Version control internals |
| `.DS_Store` | macOS metadata |
| `*.plugin` | Output artifact — not recursive |

---

## Implementation — `scripts/build-plugin.js`

Node.js script using only built-ins (`fs`, `path`, `child_process`). Invoked via `npm run package` from the `scripts/` directory.

### Logic

1. Read version from `../.claude-plugin/plugin.json`
2. Validate version field is present and non-empty — exit with error if not
3. Determine output filename: `../claude-eisenhower-{version}.plugin`
4. If output file already exists, delete it
5. Walk the include list (all repo files minus the exclude list above)
6. Zip into the output file using the system `zip` command via `child_process.execSync`
7. Print: `✅ Built claude-eisenhower-{version}.plugin ({size})`

### Why `zip` via shell instead of a pure-JS zip library

No new npm dependencies. macOS ships with `zip`. The build script stays self-contained and readable. If cross-platform support is ever needed, this is the one place to swap.

---

## Files to Create or Update

| File | Change |
|------|--------|
| `scripts/build-plugin.js` | New — build script |
| `scripts/package.json` | Add `"package": "node build-plugin.js"` to `scripts` |
| `STRUCTURE.md` | Document `scripts/build-plugin.js` and the `.plugin` artifact |
| `.gitignore` | Add `*.plugin` to exclude build artifact from version control |

---

## Open Questions

1. **Where should the `.plugin` artifact live?** — Repo root is the most obvious, but it could also go into a `dist/` subdirectory to keep root clean. `dist/` is already gitignored.

2. **Should `npm run package` also run `npm test` first?** — A pre-package test gate would catch regressions before packaging, but adds time. Could be a separate `npm run release` alias that chains `test && package`.

3. **Should the script validate that the working tree is clean (no uncommitted changes) before packaging?** — Ensures the artifact always corresponds to a known git state. A `--skip-dirty-check` flag could bypass it for development builds.
