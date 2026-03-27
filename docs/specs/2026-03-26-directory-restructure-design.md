# Directory Restructure — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Version target:** v1.2.0
**Branch:** `feature/restructure-directory-layout`

---

## Problem

The project has grown to 8 commands, 3 skills, 18 specs, and 20+ shipped versions.
Two specific structural problems have emerged:

1. **Naming collision** — `claude-eisenhower/skills/claude-eisenhower/` is confusing
   to navigate and explain.
2. **Buried specs** — `integrations/specs/` buries a first-class concept two levels
   deep inside a directory that also holds config, adapters, and docs.

More broadly, the `integrations/` directory serves as a catch-all for four unrelated
concerns (config, adapters, specs, docs). Developer-reference docs at the root
(`PRINCIPLES.md`, `STRUCTURE.md`, `CONNECTORS.md`) compete with project-identity
files (`README.md`, `CLAUDE.md`) for attention.

The features are solid. The problem is navigability and coherence.

---

## Goals

- Every directory has one clear purpose
- Specs, config, and docs are findable in one hop from root
- The `skills/claude-eisenhower/` naming collision is eliminated
- Root stays clean: only project-identity files
- No feature changes, no behavior changes — purely structural
- Existing 196-test suite remains green throughout

## Non-Goals

- Product spec or feature redefinition (features are solid)
- Rewriting command/skill behavior
- Adding new features or tests

---

## Section 1: Directory Moves

| # | Before | After | Rationale |
|---|--------|-------|-----------|
| M1 | `skills/claude-eisenhower/` | `skills/core/` | Kill naming collision |
| M2 | `integrations/specs/` | `specs/` | Specs are first-class |
| M3 | `integrations/config/` | `config/` | One hop, not two |
| M4 | `integrations/adapters/` | `adapters/` | Same as M3 |
| M5 | `integrations/docs/*` | `docs/` | ADRs and notes get a real home |
| M10 | `docs/superpowers/specs/*` | `specs/` | Consolidate all specs into one location |
| M6 | `PRINCIPLES.md` | `docs/PRINCIPLES.md` | Dev reference, not project identity |
| M7 | `STRUCTURE.md` | `docs/STRUCTURE.md` | Same as M6 |
| M8 | `CONNECTORS.md` | `docs/CONNECTORS.md` | Same as M6 |
| M9 | `integrations/` | *(deleted — empty after M2–M5)* | Middleman eliminated |

**Stays at root:** `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `ROADMAP.md`,
`.gitignore`, `TASKS.md` (gitignored)

**Does NOT move:** `commands/`, `scripts/`, `tests/`, `agents/`, `hooks/`,
`.claude-plugin/`, `.github/`, `memory/`

### Resulting tree

```
claude-eisenhower/
├── README.md
├── CLAUDE.md
├── CHANGELOG.md
├── ROADMAP.md
│
├── docs/                    # dev reference + ADRs
│   ├── PRINCIPLES.md
│   ├── STRUCTURE.md
│   ├── CONNECTORS.md
│   ├── architecture.md
│   ├── calendar-performance-fix.md
│   ├── mac-calendar-planner-override.md
│   ├── memory-system-adr.md
│   ├── memory-access-layer.md
│   ├── scripts-reference.md
│   ├── architectural-review-2026-03-02.md
│   ├── applescript-test-protocol.md
│   └── security-audit-applescript.md
│
├── specs/                   # all specs (feature + design)
│   ├── delegation-spec.md
│   ├── email-integration-spec.md
│   ├── 2026-03-26-directory-restructure-design.md
│   └── ... (18 feature specs + design specs)
│
├── config/                  # user config (gitignored actuals, committed .examples)
│   ├── calendar-config.md.example
│   ├── email-config.md.example
│   ├── task-output-config.md.example
│   └── stakeholders.yaml.example
│
├── adapters/                # output adapters
│   ├── README.md
│   └── reminders.md
│
├── commands/                # unchanged
├── skills/
│   ├── core/                # was claude-eisenhower/
│   ├── memory-manager/
│   └── skill-enhancer/
├── agents/                  # unchanged
├── hooks/                   # unchanged
├── scripts/                 # unchanged
├── tests/                   # unchanged
└── memory/                  # unchanged (gitignored)
```

---

## Section 2: Reference Updates

Every file referencing a moved path must be updated. The blast radius:

### Category 1: CLAUDE.md + .gitignore (highest priority — runtime + PII safety)

**CLAUDE.md references:**

| Current reference | New reference |
|---|---|
| `PRINCIPLES.md` | `docs/PRINCIPLES.md` |
| `integrations/config/calendar-config.md` | `config/calendar-config.md` |
| `integrations/config/email-config.md` | `config/email-config.md` |
| `integrations/config/task-output-config.md` | `config/task-output-config.md` |
| `integrations/docs/calendar-performance-fix.md` | `docs/calendar-performance-fix.md` |
| `integrations/docs/mac-calendar-planner-override.md` | `docs/mac-calendar-planner-override.md` |

**.gitignore paths (PII-critical — missing any of these leaks personal data):**

| Current .gitignore entry | New .gitignore entry |
|---|---|
| `integrations/config/calendar-config.md` | `config/calendar-config.md` |
| `integrations/config/email-config.md` | `config/email-config.md` |
| `integrations/config/task-output-config.md` | `config/task-output-config.md` |
| `integrations/config/stakeholders.yaml` | `config/stakeholders.yaml` |

### Category 2: Commands (8 files) + Agents (1 file)

All `integrations/config/...` → `config/...`. All `skills/claude-eisenhower/` →
`skills/core/`. Systematic find-and-replace scoped per move.

Note: `agents/task-prioritizer.md` references `skills/claude-eisenhower/` and
needs the same rename update as commands. The `agents/` directory itself does not
move, but its contents contain path references that do.

### Category 3: Skills (3 directories)

- `skills/core/` — self-references update
- `skills/memory-manager/` — config path and docs references
- `skills/skill-enhancer/` — specs and artifact baseline references

### Category 4: Docs cross-references

- `docs/PRINCIPLES.md` — **full path sweep required** (~10+ references):
  - Line 25: `integrations/docs/memory-access-layer.md` → `docs/memory-access-layer.md` (resolves deferred TODO R9)
  - DRY section: `integrations/config/` references
  - TDD section: `integrations/specs/` references
  - PII Safety section: 6 `integrations/config/` paths
  - Project Structure section: root-level file references (`CONNECTORS.md`, `STRUCTURE.md`)
- `docs/STRUCTURE.md` — full rewrite (see Phase 3)
- `docs/CONNECTORS.md` — config path references

### Category 5: Tests

- `tests/prompt-contracts.test.ts` — file path globs
- `tests/agent-contracts.test.ts` — structural checks
- Any test referencing `integrations/specs/` or `integrations/config/`

### Category 6: Other

- `README.md` — config paths, adapter references, ROADMAP link
- `ROADMAP.md` — spec path references
- `.gitignore` — config file paths at new locations
- `hooks/hooks.json` — **no changes needed.** Uses `${CLAUDE_PLUGIN_ROOT}` runtime
  variable, not hardcoded paths. SessionStart prompt references `TASKS.md` at
  workspace root which does not move.
- `.claude-plugin/plugin.json` — verify, likely no path references but confirm

### CHANGELOG.md decision

Historical entries reference old paths (e.g., `integrations/specs/delegation-spec.md`).
**Leave as-is.** They document what was true at that version. Add a one-line note at
the top: "Paths in entries before v1.2.0 reflect the pre-restructure layout."

---

## Section 3: Safety Net

### Automated checks

1. **Test suite** — `cd scripts && npm test` passes before and after (196 tests).
   `prompt-contracts.test.ts` validates vocabulary and structural consistency across
   command/skill/agent files.
2. **Dead path scan** — grep entire repo for remaining `integrations/` references
   (excluding CHANGELOG.md and node_modules). Any hit is a missed update.
3. **Gitignore validation** — confirm gitignored config files are still excluded at
   new paths (`config/calendar-config.md`, etc.).
4. **Plugin packaging** — `npm run package` produces a valid `.plugin` artifact.

### Manual checks

5. **CLAUDE.md smoke test** — read final CLAUDE.md, confirm every referenced path exists.
6. **Command walkthrough** — run one command (`/intake` or `/scan-email`) post-restructure
   to confirm config resolution works end-to-end.

### Does NOT need verification (runtime behavior)

- Script runtime behavior — `scripts/` doesn't move
- Calendar query — `cal_query.swift` doesn't move
- AppleScript adapters — don't move

Note: `agents/` and `hooks/` directories do not move, but their file *contents*
may contain path references that need updating (covered in Section 2, Categories
2 and 6 respectively).

---

## Section 4: Migration Strategy

### Phase 1: Branch + move files (no content changes)

All `git mv` operations in a single commit. No reference updates.

```
git mv skills/claude-eisenhower skills/core
git mv integrations/specs specs
git mv integrations/config config
git mv integrations/adapters adapters
git mv integrations/docs/* docs/
git mv docs/superpowers/specs/* specs/
git mv PRINCIPLES.md docs/PRINCIPLES.md
git mv STRUCTURE.md docs/STRUCTURE.md
git mv CONNECTORS.md docs/CONNECTORS.md
```

After verifying all tracked files are moved, clean up empty directories:
```
rm -rf integrations docs/superpowers
```

Note: `git mv` with shell glob does not match hidden files. After the glob move,
verify `integrations/docs/` is empty before removing. If untracked files remain
(e.g., `.DS_Store`), `rm -rf` handles them safely since they are not tracked.

Commit: `refactor: restructure directory layout (moves only)`

### Phase 2: Update all references

Systematic find-and-replace across all six categories from Section 2. Single
commit for all reference updates — the Phase 1 move commit provides the
auditability boundary; splitting mechanical replacements into 6 sub-commits
adds git noise without aiding review.

Update order (dependencies flow top-down):

1. `.gitignore` — **first, PII-critical** (see Category 1 table)
2. `CLAUDE.md` — runtime instructions
3. Commands (8 files) + agents (1 file)
4. Skills (3 directories)
5. Docs cross-references (including PRINCIPLES.md full sweep)
6. Tests
7. README.md, ROADMAP.md, plugin.json

Commit: `refactor: update all path references for new directory layout`

### Phase 3: Rewrite docs/STRUCTURE.md

Full rewrite to reflect the new layout. Cannot be a find-and-replace — needs a
fresh pass as the canonical "where does everything go" document.

Note: the current STRUCTURE.md is already stale vs the actual file list (e.g.,
`2026-03-04-quality-gates-spec.md` is not listed). The rewrite should audit the
real directory contents, not just update paths from the old STRUCTURE.md.

Must also document the `specs/` directory convention: feature specs (from the
former `integrations/specs/`) and design specs (from the former
`docs/superpowers/specs/`) coexist here. Date-prefixed filenames distinguish
design specs from feature specs.

### Phase 4: Verify

Run the full safety net:
- `npm test` (196 tests green)
- Dead path grep for `integrations/`
- Gitignore check
- `npm run package`
- CLAUDE.md path existence check

### Phase 5: CHANGELOG entry

Add `[v1.2.0]` entry documenting the restructure. Decide whether to ship as
multiple commits (more reviewable) or squash (cleaner history).

**One PR, one feature branch** (`feature/restructure-directory-layout`).
No feature changes bundled — purely structural.
