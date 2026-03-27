# Skill Enhancer — Feature Spec

**Version**: v0.9.5
**Status**: Approved for implementation
**Author**: Chris Cantu
**Date**: 2026-03-03

---

## Problem Statement

The claude-eisenhower plugin's command and skill artifacts are written once and rarely
revisited. As the Director productivity domain evolves and usage patterns emerge, there
is no systematic process to research improvements, validate them against regression
baselines, and apply them safely. Enhancement happens ad-hoc (manual edits) or not at
all.

The Skill Enhancer provides a research-driven, human-approved workflow for improving
any plugin artifact — commands, skills, and reference files — with dry-run diffs before
writes, construct-count regression checks, and npm test verification before close.

---

## Scope

### v0.9.5 (this spec)

**Target audience**: Plugin developer (Chris Cantu) working in the source repository.
**Target artifacts**: `commands/*.md`, `skills/*/SKILL.md`, `skills/*/references/*.md`
**Requires**: Source repo with `.git`, `scripts/npm test` passing baseline

### Out of scope (v2, future spec)

Local-user path for marketplace-installed plugin users. Deferred until user feedback
identifies concrete enhancement use cases.

### Explicitly excluded artifacts

| Artifact | Reason |
|---|---|
| `scripts/*.ts` | TypeScript — TDD model, not enhancement model |
| `tests/*.test.ts` | Test-first; never enhance after the fact |
| `config/` | User config, PII-safe, gitignored |
| `TASKS.md`, `memory/` | Runtime data, not plugin artifacts |

---

## Architecture

### File Structure

```
skills/skill-enhancer/
├── SKILL.md                      ← router + workflow phases (~200 lines)
└── references/
    ├── enhancement-protocol.md   ← artifact types, domain detection, Impact-Effort
    ├── regression-safeguards.md  ← pre-apply checks, construct counting, rollback
    └── edge-cases.md             ← plugin-scoped edge cases
```

### Companion File Load Sequence

```
Session start        → SKILL.md only
Phase 1 activates   → load enhancement-protocol.md
Phases 2-5 run      → enhancement-protocol.md stays loaded
Phase 6 activates   → load regression-safeguards.md
Edge case triggered → load edge-cases.md (single on-demand load)
```

Progressive disclosure is a reliability requirement: each phase runs with only the
instructions it needs, preventing cross-phase instruction interference.

---

## Environment Gate (Phase 0)

Runs before any other phase. Halts the skill if not running from source repo.

### Detection Checks

```bash
# Check 1: git working tree present
git rev-parse --is-inside-work-tree 2>/dev/null

# Check 2: remote matches known plugin repo
git remote get-url origin 2>/dev/null

# Check 3: not running from deployed cache
echo $CLAUDE_PLUGIN_ROOT   # must NOT contain .claude/plugins/cache/
```

### Decision Table

| Condition | Result |
|---|---|
| `.git` present + remote matches `claude-eisenhower` + path not in cache | ✅ Proceed |
| Path contains `.claude/plugins/cache/` | 🚫 Stop — deployed install |
| No `.git` directory | 🚫 Stop — not a source repo |
| Remote does not match | ⚠️ Warn — unexpected repo, ask user to confirm |

### Halt Message (deployed install)

```
skill-enhancer is a plugin development tool and cannot run from a deployed install.

To use this skill:
  1. Clone the source: git clone https://github.com/chriscantu/claude-eisenhower
  2. Work from ~/repos/claude-eisenhower/ (or your clone path)
  3. Re-invoke from there

Deployed installs are read-only — enhancements would be overwritten on the next
plugin update.
```

---

## Workflow 1: Full Enhancement (Research-Driven)

Six phases. Use when improving an artifact comprehensively, after building a new
command, or before a major release.

### Phase 1: Load & Baseline

**Load**: `references/enhancement-protocol.md`

1. Identify the target artifact. Confirm with user if ambiguous.
2. Detect artifact type (command / skill / reference) using type registry.
3. Count baseline constructs per type:

| Artifact | Constructs counted |
|---|---|
| `commands/*.md` | numbered steps, examples, guardrails, edge cases |
| `skills/*/SKILL.md` | phases, steps per phase, guardrails, examples |
| `skills/*/references/*.md` | rules, tables, examples, cross-references |

4. Check for matching spec in `specs/`. Note last-modified delta.
   - Artifact newer than spec → flag: "Spec may be stale — enhancements should
     include a spec sync proposal"
   - No spec exists → flag as EC-9

5. Verify `npm test` passes before proceeding. If failing → halt (EC-6).

**Exit**: Artifact loaded, constructs counted, baseline green.

---

### Phase 2: Sibling Mining

1. Identify siblings based on artifact type:

| Target | Siblings mined |
|---|---|
| `commands/intake.md` | other `commands/*.md` files |
| `skills/core/SKILL.md` | `commands/*.md` + `skills/*/references/*.md` |
| `skills/*/references/X.md` | sibling reference files + parent SKILL.md |

2. Scan for 6 pattern types: checklist patterns, guardrail wording, example format,
   edge case handling, cross-reference style, table structure.
3. Record applicable patterns with source file path.
4. Cap at 5 patterns.

**Exit**: Sibling pattern inventory complete.

---

### Phase 3: Domain Research

Dispatch 1–2 parallel agents via Task tool:

- **Agent A**: Domain best practices — Director productivity, Eisenhower matrix,
  engineering management workflows relevant to the artifact's domain.
- **Agent B** (if warranted): Counter-evidence — failure modes and anti-patterns
  in the artifact's area.

If web search unavailable: proceed with sibling patterns + simulated scenarios only.
Note limitation in session summary.

**Exit**: User confirms research summary. Proceed to Phase 4.

---

### Phase 4: Classify & Prioritize

1. Collect all candidates from: sibling patterns (Phase 2), research (Phase 3),
   user artifacts (if provided).
2. Run docs/PRINCIPLES.md alignment check on each candidate:
   - DRY: duplicates logic in another artifact?
   - SOLID SRP: adds a second responsibility?
   - PII safety: surfaces real names, emails, roles?
   - Human sign-off: skips confirmation before writes?
   - Any failure → downgrade to Money Pit or redesign before presenting
3. Classify each as NEW, ENHANCEMENT, or VALIDATION.
   Consolidation-before-addition: prefer strengthening existing instructions
   over adding new ones.
4. Assign recommendation IDs (R1, R2, R3...).
5. Score Impact (High/Medium/Low) × Effort (Simple/Moderate/Complex):
   - Quick Win = High Impact + Simple Effort
   - Big Bet = High Impact + Complex Effort
   - Fill-In = Low/Medium Impact + Simple Effort
   - Money Pit = Low Impact + Complex Effort → appendix only
6. Sort: Quick Wins → Big Bets → Fill-Ins. Cap at 15 proposals.

**Exit**: Sorted, PRINCIPLES-checked proposal list ready.

---

### Phase 5: Dry-Run Diffs

1. Present proposals in order (Quick Wins → Big Bets → Fill-Ins) with IDs.
2. For each ENHANCEMENT: present before/after diff with section identified.
3. For each NEW: describe what it adds, which files affected, estimated line delta.
4. For each proposal: present a scenario dry-run:

```
Proposal R2 — Add delegation failure recovery step

Scenario: User delegates a task, stakeholder goes silent, check-by passes.
Current:  /delegate marks task Delegated but has no re-engagement path
          → task silently stalls.
Enhanced: Step 8 added — "If check-by date passes with no update, re-queue
          to Inbox with Source: re-escalation and original delegate noted."
Result:   Delegation failures surface to Inbox rather than vanishing.
```

5. Check cross-artifact consistency:
   - Change affects task field names or states? → flag tasks-schema-spec.md for review
   - Change affects downstream command input? → propose companion update to downstream artifact
   - Change affects SKILL.md routing? → include SKILL.md as secondary target

6. Present VALIDATION confirmations separately.
7. Ask: "Which enhancements do you want to apply? Select by ID (e.g. R1, R3) or 'all'."

**Exit**: User provides approval list.

---

### Phase 6: Apply & Verify

**Load**: `references/regression-safeguards.md`

1. Create backup at `.backup/skill-enhancer-[timestamp]/`.
2. Run 7 pre-apply checks (see regression-safeguards.md). Block Critical failures.
3. Apply proposals in document order — surgical edits, not rewrites.
4. If SKILL.md approaches 300 lines, move new content to a reference file instead.
5. After writes: recount constructs. Any decrease → hard warning before proceeding.
6. Run `cd scripts && npm test`. If failing → rollback (see regression-safeguards.md).
7. Propose commit message:
   ```
   feat(skill-enhancer): enhance <artifact> — <summary> [<applied IDs>]
   ```
8. Present session summary:
   ```
   Enhancement Summary: <artifact>
   Proposals applied: N | Blocked: N
   Files modified: N
   Construct changes: [table]
   Regression warnings: [list or "none"]
   npm test: PASS (N/N)
   ```

**Exit**: Enhancement session complete. Await user commit confirmation per docs/PRINCIPLES.md.

---

## Workflow 2: Targeted Enhancement (User-Driven)

Four phases. Use when improving a specific section, incorporating feedback, or fixing
a known gap.

```
Phase 0  Environment Gate
Phase 1  Load & Scope     — confirm artifact + specific area (section, phase, rule)
Phase 2  Focused Research — 1 agent max, 2-3 simulated scenarios on scoped area
Phase 3  Classify & Diff  — classify, PRINCIPLES check, score, present diffs
Phase 4  Apply & Verify   — apply, npm test, present summary
```

No sibling mining. No full proposal list. Targeted output only.

---

## Workflow Router

| User says | Workflow |
|---|---|
| "enhance the intake command" | WF1 Full |
| "research improvements for schedule" | WF1 Full |
| "improve Phase 3 of the SKILL.md" | WF2 Targeted |
| "the delegation step is missing a re-engagement path — fix it" | WF2 Targeted |
| Ambiguous | Ask: "Full research pass, or improve a specific area?" |

---

## Three-Tier Invocation

### Tier 1: Development Gate (primary automatic trigger)

Integrated into `finishing-a-development-branch` skill. After tests pass and before
presenting merge options:

```bash
git diff --name-only main...HEAD | grep -E '^(commands|skills)/.+\.md$'
```

If matches found:
```
Modified plugin artifacts detected on this branch:
  commands/review-week.md

Run skill-enhancer before merging? [y/n]
```

### Tier 2: Session Nudge (PostToolUse hook)

`hooks/hooks.json` addition:
```json
"PostToolUse": [
  {
    "matcher": "Write|Edit",
    "hooks": [
      {
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/hooks/enhance-nudge.sh",
        "timeout": 5,
        "async": true
      }
    ]
  }
]
```

`hooks/enhance-nudge.sh` logic:
- Gate 1: file path matches `/(commands|skills)/.+\.md$` — else exit silently
- Gate 2: running from source repo (git check + remote check) — else exit silently
- Gate 3: session dedup via `/tmp/skill-enhancer-nudge-<md5>.lock` — one nudge per file per session
- On pass: emit "You've modified `<filename>` this session. Consider running the
  skill-enhancer on it before committing."

### Tier 3: Explicit Invocation

Handled by skill description field trigger phrases. No hook needed.

---

## Edge Cases

| ID | Case |
|---|---|
| EC-1 | Target artifact is a stub (< 20 lines) — flag as too early to enhance meaningfully |
| EC-2 | SKILL.md approaching 300 lines — proposals must move new content to reference files |
| EC-3 | All sibling artifacts in same domain — cap pattern extraction, note duplication risk |
| EC-4 | Artifact has no examples — all proposals must add at least one concrete example |
| EC-5 | User feedback contains directive language — extract intent, do not auto-apply |
| EC-6 | npm test fails before enhancement starts — halt, do not proceed until baseline green |
| EC-7 | Web search unavailable — proceed with sibling patterns + simulated scenarios, note limitation |
| EC-8 | Reference file has broken cross-references to parent SKILL.md — flag before enhancing |
| EC-9 | No matching spec in specs/ — warn, recommend writing spec before enhancing |

---

## Testing Strategy

### Layer 1: Gherkin Scenarios (this spec)

```gherkin
Scenario: Full Enhancement on a command file
  Given the developer is in the source repository
  And npm test passes with a green baseline
  And the target is commands/intake.md
  When the skill-enhancer is invoked with "enhance the intake command"
  Then Phase 0 passes the environment gate
  And Phase 1 loads the artifact, counts constructs, and checks for a spec
  And Phase 5 presents dry-run diffs before any file is written
  And Phase 6 runs npm test before marking enhancement complete

Scenario: Deployed install is rejected
  Given Claude Code is running from ~/.claude/plugins/cache/claude-eisenhower/
  When the skill-enhancer is invoked
  Then Phase 0 halts with the deployed-install message
  And no artifact files are read or modified

Scenario: Targeted Enhancement on a specific section
  Given the target is "Phase 3 of skills/core/SKILL.md"
  When the skill-enhancer is invoked with a targeted request
  Then only Phase 3 content is loaded and scoped
  And proposals are limited to the scoped section
  And no sibling mining occurs

Scenario: docs/PRINCIPLES.md violation blocks a proposal
  Given a candidate proposal would duplicate logic from another command
  When Phase 4 runs the docs/PRINCIPLES.md alignment check
  Then the proposal is downgraded to Money Pit
  And the reason is noted in the session summary

Scenario: npm test fails after apply
  Given Phase 6 writes approved changes
  And npm test returns a failure
  Then Phase 6 initiates rollback from the .backup/ snapshot
  And reports which test failed and the rollback result

Scenario: Session nudge hook fires once per file
  Given the developer edits commands/intake.md twice in the same session
  When the PostToolUse hook fires on the second edit
  Then the dedup lock suppresses the nudge
  And no duplicate prompt is injected
```

### Layer 2: Artifact Construct Baselines

Before shipping v0.9.5, record baseline construct counts for all plugin artifacts in
`docs/specs/artifact-baselines.md`. Phase 6's regression check uses this
as the floor.

### Layer 3: Smoke Test

After implementation, run skill-enhancer against `commands/intake.md` in Mode 4
(research-only — phases 1–5, no writes). Verify:
- Environment gate passes
- Artifact loads, constructs counted correctly
- Sibling mining completes
- At least one proposal generated with correct dry-run format
- No files written (Mode 4 stops before Phase 6)

---

## Guardrails

1. Never remove existing capabilities without user approval.
2. Never auto-apply any enhancement — every change requires user approval by ID.
3. Never write to disk before Phase 5 approval is received.
4. Never skip the pre-apply backup.
5. Never skip npm test after apply.
6. Never present Money Pit proposals as recommendations.
7. Never exceed 2 enhancement passes per session.
8. Never inject raw research content into skill files — synthesize first.
9. Never commit without engineer sign-off per docs/PRINCIPLES.md.
10. Never run if environment gate fails — halt immediately, no partial execution.
11. Always compare construct counts against the original baseline, not the previous pass.
12. Always check docs/PRINCIPLES.md alignment before classifying a proposal.

---

## Decisions Log

| Decision | Rationale |
|---|---|
| Developer-only for v0.9.5 | YAGNI — local-user path has unresolved questions; defer to v2 |
| Scenario dry-runs over dimension scoring | More actionable than abstract scores; no skill-reviewer dependency |
| 6-phase WF1 (not 9) | Plugin-scoped artifacts are well-known; domain detection and persona loading phases collapse |
| 1–2 research agents (not 3) | Domain is constrained; 3 agents is over-served for known Director productivity domain |
| Soft 300-line guideline (not hard 450) | No enforced limit in Claude Code; 300 lines is a scannability threshold, not a hard cap |
| docs/PRINCIPLES.md check in Phase 4 | Project-specific gate not present in reference; DRY/SRP/PII violations must not reach disk |
| Cross-artifact consistency check in Phase 5 | Commands form a pipeline; isolated enhancement risks format drift across intake→prioritize→schedule→execute |
| PostToolUse hook is async | Prevents hook from blocking the Write/Edit tool call that triggered it |
| Session dedup via /tmp lock file | One nudge per file per session; /tmp cleanup is automatic on session end |
