# Engineering Principles

This file defines the engineering principles that govern all code and AI-assisted
work in this repository. It is referenced from CLAUDE.md so these constraints are
active in every session.

When adding a feature, fixing a bug, or reviewing AI-generated code, use this as
a checklist � not a suggestion list.

---

## Claude Code Plugin Best Practices

All code and structure in this repository MUST adhere to Claude Code plugin
conventions. This is the foundational principle — everything else builds on it.

**Required conventions:**
- Plugin manifest lives at `.claude-plugin/plugin.json`
- Commands, agents, skills, and hooks directories are at plugin root level
- Commands are `.md` files with YAML frontmatter in `commands/`
- Skills are subdirectories under `skills/`, each with a `SKILL.md`
- Agents are `.md` files with YAML frontmatter in `agents/`
- Hooks are configured via `hooks/hooks.json`
- Use `${CLAUDE_PLUGIN_ROOT}` for all intra-plugin path references in hooks and scripts
- Use kebab-case for file and directory names
- Auto-discovery drives component loading — rely on conventional directory layout

**In this repo:**
- `.claude-plugin/plugin.json` defines the plugin manifest
- `commands/` holds 8 slash commands (intake, prioritize, schedule, execute, delegate, scan-email, review-week, setup)
- `skills/` holds 3 skills (core, memory-manager, skill-enhancer), each with `SKILL.md` and `references/`
- `agents/` holds 1 agent (task-prioritizer)
- `hooks/hooks.json` registers SessionStart and PostToolUse hooks
- Config files use `.example` templates (committed) + gitignored actuals

**Red flags:** hardcoded absolute paths in hooks, components nested inside `.claude-plugin/`,
manifest fields that duplicate auto-discoverable structure, non-kebab-case naming.

---

## DRY � Don't Repeat Yourself

Single source of truth for every concept. If the same logic, type, constant, or
copy appears in more than one place, it belongs in a shared module.

**In this repo:**
- Scoring logic lives in `scripts/delegate-core.ts`. Both the CLI (`match-delegate.ts`)
  and the test suite (`tests/delegation.test.ts`) import from it. Neither duplicates it.
- Config values live in `config/`. Commands and skills read them; they
  do not hardcode values.
- Scoring weights (`WEIGHTS`, `REL_RANK`) are defined once and imported wherever needed.
- Memory backend access (read and write) is abstracted via the Memory Access Layer pattern
  so commands never branch on which backend is active. See
  `docs/adrs/memory-access-layer.md` for the full contract.

**Red flags:** copy-pasted functions, types defined in multiple files, the same
constant appearing in both a script and a test.

---

## SOLID

Applied pragmatically to TypeScript modules in `scripts/`:

**Single Responsibility** � each file owns one concern.
- `delegate-core.ts` � pure scoring logic (no I/O, no CLI concerns)
- `match-delegate.ts` � CLI entry point (file I/O, arg parsing, output formatting)
- `cal_query.swift` � calendar query only

**Open/Closed** � scoring weights and relationship ranks are in a single `WEIGHTS`
and `REL_RANK` constant. Adding a new relationship type or adjusting a weight means
editing one object, not hunting through logic.

**Liskov / Interface Segregation** � keep interfaces narrow. `Stakeholder`,
`ScoredCandidate`, and `MatchResult` in `delegate-core.ts` are each responsible
for exactly what they describe.

**Dependency Inversion** � pure functions (`scoreDelegate`, `rankCandidates`,
`runMatch`) take data as arguments. They do not reach into the filesystem or
call external services. File I/O is the CLI's job.

---

## TDD � Test-Driven Development

Specs before code. Tests before shipping.

**In this repo:**
- Gherkin spec goes in `docs/specs/` before implementation starts.
- Jest regression tests go in `tests/` and must pass before any feature is merged.
- Run tests with: `cd scripts && npm test`
- Tests import from `scripts/delegate-core.ts` � they test the algorithm directly,
  not via subprocess.

**Rules:**
- No feature ships without a corresponding test in `tests/`.
- Tests must be runnable without mocks, network calls, or environment setup beyond
  `npm install`.
- Test names follow the `TEST-DEL-XXX` convention from `tests/delegation-regression.md`.

---

## PII Safety

Personal data stays local. It is never committed to source control.

**Rules:**
- Files with real names, roles, or contact info are gitignored. Always.
- Templates use `FIRST_LAST`, `VENDOR_1`, etc. as placeholders.
- Test fixtures use the same placeholder convention.
- Match output surfaces `alias`, never `name`.
- If you add a new config file that could contain personal data, add it to
  `.gitignore` immediately � before writing any content to it.

**Gitignored personal files:**
- `config/stakeholders.yaml`
- `config/calendar-config.md`
- `config/email-config.md`
- `config/task-output-config.md`
- `TASKS.md`
- `memory/`

---

## Project Structure

Files go where `docs/STRUCTURE.md` says. When in doubt, check the decision tree there
before creating anything.

**Never:**
- Create files at the repo root unless they are top-level project documents
  (README, CLAUDE, .gitignore). Project docs (STRUCTURE, CONNECTORS, PRINCIPLES) live in `docs/`.
- Duplicate a file to work around a path issue � fix the path.
- Commit build artifacts (`node_modules/`, `dist/`, `package-lock.json` in some cases).

---

## Platform Architecture

The plugin core is platform-agnostic: flat markdown files (TASKS.md, memory/, config/)
and pure prompt logic. Platform-specific integrations (Calendar via EventKit, Reminders
via AppleScript, Mail via AppleScript) are optional layers — commands and skills that
depend on them degrade gracefully when unavailable.

**Rules:**
- New features that only read/write markdown files must not introduce platform dependencies
- Platform-specific integrations belong in `scripts/` with graceful fallback when unavailable
- Config files gate optional integrations — missing config = skip that data source, not an error

**In this repo:**
- Core (platform-agnostic): `/intake`, `/prioritize`, `/execute`, `/delegate`, `/today`, `/review-week`, `/status`
- Optional macOS integrations: `/schedule` (Calendar + Reminders), `/scan-email` (Apple Mail)
- Graceful degradation: `/today` skips the calendar section if `calendar-config.md` is missing

---

## Dependency on Claude

This plugin is designed to be operated by Claude, not run as standalone software.
Scripts output JSON; Claude formats and presents it. Scripts never auto-assign or
auto-commit. Claude always confirms with the user before writing to TASKS.md or
delegating a task.

---

## Human Sign-Off Before Commit

**Claude never commits code without explicit engineer approval.**

After completing any unit of work — a new file, a command update, a test suite —
Claude stops and presents what changed. The engineer reviews and gives explicit
sign-off before any `git commit` is run.

**Rules:**
- Show a `git diff --stat` summary and ask: "Ready to commit?" before running `git commit`.
- Never chain staging + commit in a single step without a confirmation pause in between.
- If the engineer says "commit" without prior review in the session, run `git diff --stat`
  first, summarize what's included, and confirm before proceeding.
- This applies to every commit, regardless of how small or mechanical the change appears.
