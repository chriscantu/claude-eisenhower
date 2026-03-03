# Skill Enhancer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a research-driven, developer-only skill that enhances claude-eisenhower plugin artifacts (commands, skills, reference files) through sibling mining, parallel research agents, dry-run diffs, and npm test verification before any file is written.

**Architecture:** Companion-file design — `SKILL.md` is the lean router, heavy content lives in three progressive-disclosure reference files loaded per phase. Phase 0 environment gate halts execution if not running from source repo. Two workflows: Full Enhancement (WF1, 6 phases) and Targeted Enhancement (WF2, 4 phases).

**Tech Stack:** Markdown skill files, bash hook script, Claude Code plugin hooks system.

**Spec:** `integrations/specs/skill-enhancer-spec.md`

---

## Task 1: Create Git Worktree

**Files:**
- No files created — worktree setup only

**Step 1: Invoke using-git-worktrees skill**

Use `superpowers:using-git-worktrees` to create an isolated worktree.
Branch name: `v0.9.5/skill-enhancer`
Worktree path: `.worktrees/v0.9.5`

**Step 2: Verify worktree is active**

Run: `git worktree list`
Expected: `.worktrees/v0.9.5` listed with branch `v0.9.5/skill-enhancer`

---

## Task 2: Record Artifact Construct Baselines

**Files:**
- Create: `integrations/specs/artifact-baselines.md`

This file is required by Phase 6's regression check. Count constructs in all existing
plugin artifacts before any enhancement session runs.

**Step 1: Read each command file and count constructs**

Read and count for each of: `commands/intake.md`, `commands/prioritize.md`,
`commands/schedule.md`, `commands/execute.md`, `commands/delegate.md`,
`commands/scan-email.md`, `commands/setup.md`

Count per file:
- **steps**: numbered top-level steps (e.g. `**Step 1:**`, `### Step 1`)
- **examples**: fenced code blocks or indented example blocks
- **guardrails**: explicitly labelled rules, warnings, or DO NOT items
- **edge cases**: conditional handling sections or `if X then Y` branching steps

**Step 2: Read skill files and count constructs**

Read and count for: `skills/claude-eisenhower/SKILL.md` and each file in
`skills/claude-eisenhower/references/`

Count per file:
- **phases**: `### Phase N` headings
- **steps**: numbered items within phases
- **guardrails**: guardrail/rule sections or inline DO NOT items
- **examples**: fenced blocks or inline examples

**Step 3: Write the baselines file**

```markdown
# Artifact Construct Baselines

Recorded: 2026-03-03
Purpose: Floor values for skill-enhancer Phase 6 regression check.
Any post-enhancement construct count below these values is a hard warning.

## commands/intake.md
- steps: [N]
- examples: [N]
- guardrails: [N]
- edge cases: [N]

## commands/prioritize.md
- steps: [N]
- examples: [N]
- guardrails: [N]
- edge cases: [N]

## commands/schedule.md
- steps: [N]
- examples: [N]
- guardrails: [N]
- edge cases: [N]

## commands/execute.md
- steps: [N]
- examples: [N]
- guardrails: [N]
- edge cases: [N]

## commands/delegate.md
- steps: [N]
- examples: [N]
- guardrails: [N]
- edge cases: [N]

## commands/scan-email.md
- steps: [N]
- examples: [N]
- guardrails: [N]
- edge cases: [N]

## commands/setup.md
- steps: [N]
- examples: [N]
- guardrails: [N]
- edge cases: [N]

## skills/claude-eisenhower/SKILL.md
- phases: [N]
- steps: [N]
- guardrails: [N]
- examples: [N]

## skills/claude-eisenhower/references/eisenhower.md
- rules: [N]
- tables: [N]
- examples: [N]

## skills/claude-eisenhower/references/intake-sources.md
- rules: [N]
- tables: [N]
- examples: [N]

## skills/claude-eisenhower/references/delegation-guide.md
- rules: [N]
- tables: [N]
- examples: [N]

## skills/claude-eisenhower/references/email-patterns.md
- rules: [N]
- tables: [N]
- examples: [N]
```

Fill `[N]` with actual counts from Step 1 and Step 2.

**Step 4: Commit**

```bash
git add integrations/specs/artifact-baselines.md
git commit -m "feat(v0.9.5): record artifact construct baselines for skill-enhancer regression check"
```

---

## Task 3: Create Skill Directory Structure

**Files:**
- Create: `skills/skill-enhancer/` (directory)
- Create: `skills/skill-enhancer/references/` (directory)

**Step 1: Create directories**

```bash
mkdir -p skills/skill-enhancer/references
```

**Step 2: Verify**

Run: `ls skills/skill-enhancer/`
Expected: `references/` directory listed

No commit yet — empty directories aren't tracked by git.

---

## Task 4: Write enhancement-protocol.md

**Files:**
- Create: `skills/skill-enhancer/references/enhancement-protocol.md`

**Step 1: Write the file**

```markdown
# Enhancement Protocol

Loaded by: SKILL.md at Phase 1 start.
Contains: Artifact type registry, domain detection, Impact-Effort scoring,
classification rules, sibling mining patterns, research agent prompts.

---

## Section 1: Artifact Type Registry

Detect artifact type from file path. Count the listed constructs before and after
any enhancement session (Phase 1 baseline, Phase 6 regression check).

| Type | Path pattern | Constructs to count |
|---|---|---|
| Command | `commands/*.md` | numbered steps, examples (fenced blocks), guardrails (DO NOT / WARNING items), edge cases (conditional branches) |
| Skill entry | `skills/*/SKILL.md` | phases (### Phase N headings), steps per phase, guardrails, examples |
| Reference file | `skills/*/references/*.md` | rules (numbered or bulleted rule items), tables, examples (fenced blocks), cross-references to other files |

**Counting rules:**
- Steps: count top-level numbered items only (not sub-bullets)
- Examples: count distinct fenced code blocks and labelled example sections
- Guardrails: count items in any section labelled Guardrails, Rules, DO NOT, WARNING
- Edge cases: count conditional handling items (`If X → Y` patterns)
- Cross-references: count `> Read ...` or `See ...` directives pointing to other files

---

## Section 2: Domain Detection

Map artifact path to plugin domain. Domain determines which research queries to use
in Phase 3.

| Artifact path | Domain | Key concepts |
|---|---|---|
| `commands/intake.md` | task-intake | capture, source parsing, inbox triage, no-prioritize-during-intake |
| `commands/prioritize.md` | prioritization | Eisenhower matrix, Q1-Q4, urgency vs. importance |
| `commands/schedule.md` | scheduling | capacity planning, time blocking, calendar integration, Q1/Q2 assignment |
| `commands/execute.md` | execution | progress tracking, follow-up, stakeholder updates, done criteria |
| `commands/delegate.md` | delegation | authority matching, check-by dates, re-escalation, alias resolution |
| `commands/scan-email.md` | email-intake | email parsing, signal vs. noise, action item extraction |
| `commands/setup.md` | onboarding | configuration, first-run, plugin setup |
| `skills/claude-eisenhower/SKILL.md` | orchestration | workflow routing, phase coordination, all domains |
| `skills/*/references/*.md` | varies | inherit domain from parent SKILL.md |

---

## Section 3: Classification Rules

Classify each candidate finding as NEW, ENHANCEMENT, or VALIDATION.

**Rules (apply in order):**

1. If the candidate addresses a gap not covered anywhere in the artifact → NEW
2. If the candidate strengthens, clarifies, or extends existing content → ENHANCEMENT
3. If the candidate confirms existing content is correct and complete → VALIDATION
4. Consolidation-before-addition: if an ENHANCEMENT and a NEW both address the same
   gap, prefer ENHANCEMENT (strengthen what's there) over NEW (add something new)
5. If a proposal would duplicate logic already in a sibling artifact → downgrade to
   Money Pit (DRY violation)
6. If a proposal adds a second distinct responsibility to the artifact → downgrade to
   Money Pit (SRP violation)
7. Assign sequential IDs only to NEW and ENHANCEMENT items (R1, R2...).
   VALIDATION items are listed separately, no ID.

---

## Section 4: Impact-Effort Scoring

Score each NEW and ENHANCEMENT candidate.

**Impact levels:**
- High: directly improves a common user workflow or prevents a known failure mode
- Medium: improves edge case handling or clarity for infrequent scenarios
- Low: cosmetic, formatting, or minor wording improvement

**Effort levels:**
- Simple: add or change 1-3 lines or one section; no cross-file effects
- Moderate: add or change one full phase or section; may require sibling update
- Complex: restructure multiple sections; requires companion file changes or
  cross-artifact consistency updates

**Quadrant assignment:**

| | Simple | Moderate | Complex |
|---|---|---|---|
| **High** | Quick Win ✅ | Quick Win ✅ | Big Bet 🎯 |
| **Medium** | Fill-In 📋 | Fill-In 📋 | Big Bet 🎯 |
| **Low** | Fill-In 📋 | Money Pit ❌ | Money Pit ❌ |

**Sort order for presentation:** Quick Wins → Big Bets → Fill-Ins
**Money Pits:** appendix only, never presented as recommendations

---

## Section 5: Sibling Mining Patterns

### Sibling mapping

| Target artifact | Siblings to mine |
|---|---|
| `commands/intake.md` | all other `commands/*.md` |
| `commands/prioritize.md` | all other `commands/*.md` + `skills/claude-eisenhower/references/eisenhower.md` |
| `commands/schedule.md` | all other `commands/*.md` |
| `commands/delegate.md` | all other `commands/*.md` + `skills/claude-eisenhower/references/delegation-guide.md` |
| `skills/claude-eisenhower/SKILL.md` | all `commands/*.md` + all `skills/*/references/*.md` |
| `skills/*/references/*.md` | sibling reference files + parent SKILL.md |

### 6 pattern types to extract

1. **Checklist pattern**: numbered step sequences with clear entry/exit criteria
2. **Guardrail wording**: DO NOT / WARNING / NEVER phrasing for rules
3. **Example format**: how examples are structured (fenced block, inline, labelled)
4. **Edge case handling**: If X then Y branching patterns for unusual inputs
5. **Cross-reference style**: how files reference each other (`> Read ...` vs `See ...`)
6. **Table structure**: column headers and row format for reference tables

Cap at 5 extracted patterns. Record each with: pattern type, source file path, and
a one-sentence description of what makes it worth reusing.

---

## Section 6: Research Agent Prompts

### Agent A: Domain Best Practices

Domain-adapted query templates. Use the detected domain from Section 2.

| Domain | Agent A query |
|---|---|
| task-intake | "best practices for engineering manager task intake and inbox triage workflows 2025" |
| prioritization | "Eisenhower matrix refinements and edge cases for engineering directors 2025" |
| scheduling | "time blocking and capacity planning patterns for engineering managers 2025" |
| execution | "task follow-up and stakeholder update patterns for engineering managers 2025" |
| delegation | "delegation frameworks for engineering directors — check-in cadence and re-escalation 2025" |
| email-intake | "engineering manager email triage and action item extraction patterns 2025" |
| orchestration | "AI-assisted productivity workflow design for engineering leaders 2025" |

### Agent B: Counter-Evidence (dispatch when WF1 and domain is non-trivial)

Searches for failure modes and anti-patterns in the artifact's domain.

| Domain | Agent B query |
|---|---|
| task-intake | "common failures in task intake systems — what causes inbox overload" |
| prioritization | "Eisenhower matrix criticism and failure modes" |
| scheduling | "time blocking failure modes and over-scheduling pitfalls" |
| delegation | "delegation failure patterns — what causes delegated tasks to stall" |

If Agent B findings contradict Agent A: note both in research summary.
User decides which direction to take before Phase 4.
```

**Step 2: Verify file exists and is readable**

Run: `wc -l skills/skill-enhancer/references/enhancement-protocol.md`
Expected: ~120 lines

**Step 3: Commit**

```bash
git add skills/skill-enhancer/references/enhancement-protocol.md
git commit -m "feat(v0.9.5): add enhancement-protocol.md — artifact registry, domain detection, scoring"
```

---

## Task 5: Write regression-safeguards.md

**Files:**
- Create: `skills/skill-enhancer/references/regression-safeguards.md`

**Step 1: Write the file**

```markdown
# Regression Safeguards

Loaded by: SKILL.md at Phase 6 start.
Contains: Pre-apply checklist, construct count comparison, npm test verification,
rollback procedure, capability preservation rules.

---

## Section 1: Pre-Apply Checklist (7 checks)

Run all checks before writing any file. Present results as a summary table.
Critical failures remove the proposal from the apply set. Warnings flag but allow.

| # | Check | Severity | Pass condition |
|---|---|---|---|
| 1 | Backup created | Critical | `.backup/skill-enhancer-[timestamp]/` exists with copies of all target files |
| 2 | No phase/step removal | Critical | Approved proposals do not remove any existing phase or numbered step |
| 3 | SKILL.md line count | Warning | After apply, SKILL.md stays under 300 lines |
| 4 | No instruction contradictions | Warning | New instructions do not directly contradict existing guardrails |
| 5 | Cross-file references valid | Warning | Any new `> Read ...` directives point to files that exist |
| 6 | Baseline npm test green | Critical | `cd scripts && npm test` passed in Phase 1; if failed at Phase 1, session was halted |
| 7 | Construct count delta calculated | Critical | Before-counts from Phase 1 recorded; after-counts will be compared post-apply |

**Summary table format:**
```
Pre-Apply Checklist
  1. Backup created              ✅ PASS
  2. No phase/step removal       ✅ PASS  (R1 adds step 9; no removals)
  3. SKILL.md line count         ⚠️ WARN  (will reach 287 lines — under 300)
  4. No instruction contradictions ✅ PASS
  5. Cross-file references valid ✅ PASS
  6. Baseline npm test green     ✅ PASS  (124/124 at Phase 1)
  7. Construct count delta       ✅ PASS  (calculated: +2 steps, +1 example)

Result: Proceeding with apply. 0 Critical failures. 1 Warning noted.
```

---

## Section 2: Construct Count Comparison

After applying all changes, recount constructs for every modified artifact.
Compare against Phase 1 baseline.

**Comparison table format:**
```
Construct Count Comparison: commands/intake.md

| Construct | Before | After | Delta | Status |
|-----------|--------|-------|-------|--------|
| steps     |   8    |   9   |  +1   | ✅     |
| examples  |   2    |   3   |  +1   | ✅     |
| guardrails|   3    |   3   |   0   | ✅     |
| edge cases|   1    |   2   |  +1   | ✅     |
```

**Hard warning trigger**: any negative delta in any construct type.

Hard warning message:
```
⚠️ Regression detected: [construct type] count decreased from [N] to [N] in [file].
This may indicate an accidental removal. Review the diff before proceeding.
Proceed anyway? [y/n]
```

---

## Section 3: npm test Verification

After applying all changes:

```bash
cd scripts && npm test
```

**Expected output pattern:**
```
Test Suites: N passed, N total
Tests:       N passed, N total
```

**If tests fail:**
1. Note which test(s) failed and the failure message.
2. Do NOT ask the user to decide — initiate rollback automatically.
3. After rollback completes, report: "Tests failed after apply. Rolled back to backup.
   Failing test: [test name]. Enhancement session ended without changes."

---

## Section 4: Rollback Procedure

If npm test fails after apply, or if user requests rollback after session:

1. Identify backup directory: `.backup/skill-enhancer-[timestamp]/`
2. For each file in the backup: restore to original location.
   ```bash
   cp .backup/skill-enhancer-[timestamp]/commands/intake.md commands/intake.md
   # repeat for each backed-up file
   ```
3. Run `cd scripts && npm test` to confirm clean restoration.
4. Report: "Rolled back. npm test: [PASS/FAIL]. Files restored: [list]."
5. Recommend investigating the failing test before re-attempting enhancement.

---

## Section 5: Capability Preservation Rules

These 5 rules are checked as part of the pre-apply checklist (Check 2).
Any approved proposal that violates a rule must be redesigned or rejected.

1. **No existing workflow step removed** without explicit user approval in Phase 5.
   User approval of a proposal that removes a step must explicitly acknowledge the removal
   (e.g. "R3 — yes, remove step 4").
2. **No guardrail removed.** Guardrails may be strengthened or reworded but never deleted.
3. **No example removed.** Examples may be replaced with better ones but not deleted.
4. **No cross-reference broken.** If a proposal moves content between files, all
   `> Read ...` directives pointing to the moved content must be updated in the same apply.
5. **No phase count decreased.** Phases in SKILL.md may be added or split but not merged
   or removed without explicit user approval.
```

**Step 2: Verify**

Run: `wc -l skills/skill-enhancer/references/regression-safeguards.md`
Expected: ~90 lines

**Step 3: Commit**

```bash
git add skills/skill-enhancer/references/regression-safeguards.md
git commit -m "feat(v0.9.5): add regression-safeguards.md — pre-apply checks, rollback, capability preservation"
```

---

## Task 6: Write edge-cases.md

**Files:**
- Create: `skills/skill-enhancer/references/edge-cases.md`

**Step 1: Write the file**

```markdown
# Edge Cases

Loaded by: SKILL.md on-demand when an EC-N reference triggers.
Load this file once per session at most — do not reload per edge case.

---

## EC-1: Target Artifact Is a Stub

**Trigger**: Target artifact is fewer than 20 lines.

**Handling**: Flag before Phase 2 starts.
"[artifact] is only [N] lines — it may be too early in development to enhance
meaningfully. Enhancements work best on complete, working artifacts.
Continue anyway? [y/n]"

If user confirms: proceed with WF1 but note in summary that artifact is a stub.

---

## EC-2: SKILL.md Approaching 300 Lines

**Trigger**: SKILL.md would exceed 300 lines after applying approved proposals.

**Handling**: Modify the apply set before writing.
"Applying R[N] would bring SKILL.md to [N] lines (over the 300-line guideline).
Moving the new content to a reference file instead. Proposed destination:
skills/skill-enhancer/references/[new-file].md — proceed? [y/n]"

If user confirms: create new reference file, add `> Read references/[new-file].md`
load instruction to SKILL.md at the appropriate phase.

---

## EC-3: All Siblings in Same Domain

**Trigger**: All sibling artifacts are in the same plugin domain as the target.

**Handling**: Continue mining but cap pattern extraction aggressively.
Note in Phase 2 output: "All siblings share the [domain] domain — pattern mining
may surface duplicates. Extracted [N] patterns; duplicates discarded."

Cap at 3 patterns (not 5) when EC-3 applies.

---

## EC-4: Artifact Has No Examples

**Trigger**: Phase 1 baseline count shows 0 examples for target artifact.

**Handling**: Flag in Phase 1.
"[artifact] has no examples. At least one concrete example will be included
as a required proposal regardless of Impact-Effort score."

In Phase 4: create one NEW proposal for an example — classify as Quick Win
regardless of effort score (examples are always high-value for Claude-operated
workflows).

---

## EC-5: User Feedback Contains Directive Language

**Trigger**: User provides feedback artifact (transcript, notes) containing
imperative instructions such as "just add X", "ignore Y", "always do Z".

**Handling**: Extract intent, do not treat the directive as a proposal.

"I see your feedback says '[directive]'. I'm treating this as a signal that
[X area] needs attention — extracting it as an observation rather than a
direct instruction. Does that match your intent? [y/n]"

If yes: record as user-artifact input to Phase 4 classification.
If no: ask user to rephrase as an observation.

---

## EC-6: npm test Fails Before Enhancement Starts

**Trigger**: `cd scripts && npm test` fails during Phase 1 baseline check.

**Handling**: Halt immediately. Do not proceed to Phase 2.

"npm test is failing before any enhancement. The regression baseline is invalid —
proceeding could mask whether enhancements cause failures.

Fix the failing test first, then re-invoke skill-enhancer.
Failing: [test name(s)]"

Provide the raw test failure output to help diagnose.

---

## EC-7: Web Search Unavailable

**Trigger**: Task tool dispatched research agent returns no usable results or
web search tools are unavailable in session.

**Handling**: Proceed with reduced evidence base. Note limitation.

"Web search is unavailable this session. Phase 3 will proceed with:
- Sibling pattern mining (Phase 2 results)
- Simulated scenarios based on known Director productivity patterns

Research confidence: reduced. Proposals will be labeled [sibling-patterns-only]
or [simulated] in Phase 4 classification."

Continue with WF1 Phase 4 normally.

---

## EC-8: Reference File Has Broken Cross-References

**Trigger**: Phase 1 scans a reference file and finds `> Read ...` or `See ...`
directives pointing to files that do not exist at the stated path.

**Handling**: Flag before Phase 2. Do not block — broken references are
pre-existing issues, not caused by the enhancement.

"[artifact] has [N] broken cross-reference(s):
  - Line [N]: references [path] — file not found

These are pre-existing issues. Recording as EC-9 companion proposals:
fix broken references in the same apply as other enhancements? [y/n]"

If yes: add fix-broken-reference proposals to Phase 4 as ENHANCEMENT items
with Quick Win score.

---

## EC-9: No Matching Spec in integrations/specs/

**Trigger**: Phase 1 finds no file in `integrations/specs/` whose name
matches the target artifact.

**Handling**: Warn but do not block enhancement.

"No spec found in integrations/specs/ for [artifact].
Per PRINCIPLES.md, specs should precede implementation. Enhancement can
proceed but proposals cannot be verified against stated requirements.

Recommend: write a spec in integrations/specs/ before or alongside this
enhancement session. Should I include a spec-writing proposal in Phase 4? [y/n]"

If yes: add one NEW proposal to write the spec — Big Bet classification
(High Impact, Moderate Effort).
```

**Step 2: Verify**

Run: `wc -l skills/skill-enhancer/references/edge-cases.md`
Expected: ~110 lines

**Step 3: Commit**

```bash
git add skills/skill-enhancer/references/edge-cases.md
git commit -m "feat(v0.9.5): add edge-cases.md — EC-1 through EC-9 plugin-scoped edge cases"
```

---

## Task 7: Write SKILL.md

**Files:**
- Create: `skills/skill-enhancer/SKILL.md`

This is the router and workflow conductor. Written last so companion file
references are accurate.

**Step 1: Write the file**

```markdown
---
name: skill-enhancer
description: >
  Use when: "enhance the [command] command", "improve skills/claude-eisenhower/SKILL.md",
  "research improvements for [artifact]", "upgrade the [command] command",
  "make [command] better", "run skill-enhancer on [file]".
  Do NOT use when: creating new commands from scratch (use brainstorming skill),
  editing a specific known line with clear instructions (direct file edit is better),
  reviewing without changes (use requesting-code-review skill).
version: 0.1.0
---

# Skill Enhancer

You are a Senior Plugin Architect who improves claude-eisenhower plugin artifacts
through evidence-based, research-driven enhancement. You operate interactively —
every enhancement is presented as a dry-run diff and the developer approves by ID
before anything is written to disk.

> **Companion files (load progressively — do not load all upfront):**
> - `references/enhancement-protocol.md` — load at Phase 1
> - `references/regression-safeguards.md` — load at Phase 6
> - `references/edge-cases.md` — load on-demand when an EC-N reference triggers

## Prerequisites

- Source repository with `.git` (not a deployed plugin install at `~/.claude/plugins/cache/`)
- `cd scripts && npm test` passing baseline
- Target artifact: `commands/*.md`, `skills/*/SKILL.md`, or `skills/*/references/*.md`

## Workflow Router

| User says | Workflow |
|---|---|
| "enhance the [X] command" | WF1 Full Enhancement |
| "research improvements for [X]" | WF1 Full Enhancement |
| "improve [section] of [artifact]" | WF2 Targeted Enhancement |
| "[specific gap] in [artifact] — fix it" | WF2 Targeted Enhancement |
| Ambiguous | Ask: "Full research pass, or improve a specific area?" |

---

## Phase 0: Environment Gate

**Goal**: Verify running from plugin source repository. Halt if not.

1. Run:
   ```bash
   git rev-parse --is-inside-work-tree 2>/dev/null
   git remote get-url origin 2>/dev/null
   echo $CLAUDE_PLUGIN_ROOT
   ```
2. Apply decision table:
   - `.git` present + remote matches `claude-eisenhower` + path not in `.claude/plugins/cache/` → **Proceed to Phase 1**
   - Path contains `.claude/plugins/cache/` → **HALT** with deployed-install message below
   - No `.git` → **HALT**: "Not a source repository. Clone https://github.com/chriscantu/claude-eisenhower and run from there."
   - Remote mismatch → **WARN**: "Unexpected repository remote. Confirm this is claude-eisenhower? [y/n]"

**Halt message — deployed install:**
```
skill-enhancer is a plugin development tool and cannot run from a deployed install.

To use this skill:
  1. Clone: git clone https://github.com/chriscantu/claude-eisenhower
  2. Work from ~/repos/claude-eisenhower/ (or your clone path)
  3. Re-invoke from there

Deployed installs are read-only — enhancements are overwritten on the next plugin update.
```

**Exit**: Environment confirmed. Proceed to Phase 1.

---

## Workflow 1: Full Enhancement

### Phase 1: Load & Baseline

> **Load `references/enhancement-protocol.md`** — Sections 1 and 2.

**Goal**: Read target artifact, count constructs, detect domain, check spec alignment.

1. Ask: "Which artifact do you want to enhance?" If already stated, confirm.
2. Read target artifact. Detect type using Section 1 of enhancement-protocol.md.
3. Count baseline constructs per type (Section 1 construct counting rules).
4. Detect domain using Section 2.
5. Check for matching spec in `integrations/specs/`:
   - Found, artifact newer than spec → "Spec may be stale — include spec sync proposal"
   - Not found → flag as EC-9 (load `references/edge-cases.md`)
6. Run `cd scripts && npm test`. If failing → halt (EC-6).
7. Present baseline summary: type, domain, construct counts, spec status, test result.

**Exit**: Baseline established, npm test green.

---

### Phase 2: Sibling Mining

> **Reference `references/enhancement-protocol.md`** — Section 5.

**Goal**: Extract reusable patterns from related plugin artifacts.

1. Identify siblings per sibling mapping in Section 5.
2. Read sibling artifacts. Scan for the 6 pattern types.
3. Record applicable patterns with source file and one-line description.
4. Cap at 5 patterns. Apply EC-3 cap (3 patterns) if all siblings share same domain.

**Exit**: Sibling pattern inventory complete.

---

### Phase 3: Domain Research

> **Reference `references/enhancement-protocol.md`** — Section 6.

**Goal**: Research best practices for the artifact's domain.

1. Select agents per domain from Section 6.
2. Dispatch 1–2 agents in parallel via Task tool.
3. If web search unavailable: proceed with sibling patterns + simulated scenarios (EC-7).
4. Synthesize: deduplicate, cross-validate, discard unsupported claims.
5. Present research summary (3–5 bullets). Ask: "Any angles I should dig deeper on?"

**Exit**: User confirms research summary.

---

### Phase 4: Classify & Prioritize

> **Reference `references/enhancement-protocol.md`** — Sections 3 and 4.

**Goal**: Classify findings, check PRINCIPLES.md alignment, sort by priority.

1. Collect candidates: sibling patterns (Phase 2), research (Phase 3), user artifacts.
2. PRINCIPLES.md alignment check on each candidate:
   - DRY violation → downgrade to Money Pit
   - SRP violation → downgrade to Money Pit
   - PII exposure → discard
   - Skips human sign-off before writes → discard
3. Classify as NEW / ENHANCEMENT / VALIDATION. Consolidation-before-addition.
4. Assign IDs (R1, R2...) to NEW and ENHANCEMENT only.
5. Score Impact × Effort → quadrant (Section 4). Sort: Quick Wins → Big Bets → Fill-Ins.
6. Cap at 15 proposals. Money Pits to appendix only.

**Exit**: Sorted, PRINCIPLES-checked proposal list ready.

---

### Phase 5: Dry-Run Diffs

**Goal**: Present proposals as before/after diffs with scenario traces. Get approval.

1. Present proposals in order (Quick Wins → Big Bets → Fill-Ins) with IDs.
2. For each ENHANCEMENT: show before/after diff with section identified.
3. For each NEW: describe additions, files affected, estimated line delta.
4. For each proposal: present scenario dry-run:
   ```
   Proposal RN — [title]

   Scenario: [user intent that triggers the gap]
   Current:  [what happens now — where behavior fails or is suboptimal]
   Enhanced: [what the proposal adds or changes]
   Result:   [specific improvement in outcome]
   ```
5. Cross-artifact consistency check:
   - Change affects task field names or states? → flag `tasks-schema-spec.md` for review
   - Change affects downstream command input? → propose companion update to downstream artifact
   - Change affects SKILL.md routing? → include SKILL.md as secondary target
6. Present VALIDATION confirmations in a separate section.
7. Ask: "Which enhancements do you want to apply? (e.g. R1, R3 or 'all')"
8. Check dependency conflicts in partial approvals. Flag blocked proposals.

**Exit**: User provides approval list. Stop here if research-only requested.

---

### Phase 6: Apply & Verify

> **Load `references/regression-safeguards.md`** — all sections.

**Goal**: Write approved changes, verify no regressions, present summary.

1. Create backup: `.backup/skill-enhancer-[timestamp]/` (copies of all target files).
2. Run 7 pre-apply checks (Section 1). Remove Critical failures from apply set. Present checklist table.
3. Apply proposals in document order — surgical edits, not rewrites.
4. If SKILL.md would exceed 300 lines → apply EC-2 (move content to reference file).
5. After writes: recount constructs. Compare against Phase 1 baseline (Section 2).
   Any decrease → hard warning before continuing.
6. Run `cd scripts && npm test`. If failing → auto-rollback per Section 4. Report failure and stop.
7. Propose commit message:
   ```
   feat(skill-enhancer): enhance <artifact-name> — <one-line summary> [<applied IDs>]
   ```
8. Present session summary:
   ```
   Enhancement Summary: <artifact>
   Proposals applied: N | Blocked: N | Rejected: N
   Files modified: N
   Construct changes: [before → after per construct type]
   Regression warnings: [list or "none"]
   npm test: PASS (N/N)
   ```
9. Await explicit commit confirmation per PRINCIPLES.md before running any git command.

**Exit**: Enhancement session complete.

---

## Workflow 2: Targeted Enhancement

4 phases. For improving a specific area without full research.

### Phase 1: Load & Scope

> **Load `references/enhancement-protocol.md`** — Section 1 only.

1. Confirm: which artifact, which specific area (section, phase, rule, step)?
2. Read only the relevant section(s) of the target artifact.
3. Count baseline constructs for scoped section only.
4. Run `cd scripts && npm test`. If failing → halt (EC-6).

**Exit**: Scope confirmed, baseline green.

---

### Phase 2: Focused Research

1. Select 1 agent from enhancement-protocol.md Section 6 (or simulated scenarios only).
2. Run 2–3 simulated scenarios focused on the gap in the scoped area.
3. Accept user-provided feedback — extract intent facts, do not auto-apply directives (EC-5).

**Exit**: Research complete.

---

### Phase 3: Classify & Diff

> **Reference `references/enhancement-protocol.md`** — Sections 3 and 4.

1. Classify findings. Run PRINCIPLES.md alignment check. Assign IDs. Score Impact × Effort.
2. Present diffs in priority order. Prepare scenario dry-run for most impactful proposal.
3. Ask: "Which enhancements do you want to apply?"

**Exit**: User approves set.

---

### Phase 4: Apply & Verify

> **Load `references/regression-safeguards.md`**.

1. Create backup. Run 7 pre-apply checks.
2. Apply surgical edits.
3. Recount constructs. Compare against Phase 1 baseline.
4. Run `cd scripts && npm test`. If failing → rollback per Section 4.
5. Present enhancement summary. Propose commit message.
6. Await commit confirmation per PRINCIPLES.md.

**Exit**: Targeted enhancement complete.

---

## Guardrails

1. Never remove existing capabilities without explicit user approval.
2. Never auto-apply any enhancement — user approves by ID before Phase 6 writes.
3. Never write to disk before Phase 5 approval received.
4. Never skip the pre-apply backup.
5. Never skip `npm test` after apply.
6. Never present Money Pit proposals as recommendations.
7. Never exceed 2 enhancement passes per session.
8. Never inject raw research content into skill files — synthesize first.
9. Never commit without engineer sign-off per PRINCIPLES.md.
10. Never run if environment gate fails — halt immediately, no partial execution.
11. Always compare construct counts against Phase 1 baseline, not previous pass.
12. Always run PRINCIPLES.md alignment check before classifying a proposal.
```

**Step 2: Verify line count stays under 200 lines**

Run: `wc -l skills/skill-enhancer/SKILL.md`
Expected: < 200 lines

**Step 3: Commit**

```bash
git add skills/skill-enhancer/SKILL.md
git commit -m "feat(v0.9.5): add skill-enhancer SKILL.md — router, WF1/WF2 phases, environment gate, guardrails"
```

---

## Task 8: Write enhance-nudge.sh

**Files:**
- Create: `hooks/enhance-nudge.sh`

**Step 1: Write the file**

```bash
#!/bin/bash
# enhance-nudge.sh
# PostToolUse hook — nudges developer to run skill-enhancer after editing
# command or skill artifact files. Fires once per file per session.
#
# Injected env vars from Claude Code PostToolUse hook:
#   CLAUDE_TOOL_INPUT_FILE_PATH — path of the file just written or edited

FILEPATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"

# Gate 1: must be a plugin artifact (commands/ or skills/)
if ! echo "$FILEPATH" | grep -qE '/(commands|skills)/.+\.md$'; then
  exit 0
fi

# Gate 2: must be source repo — not deployed plugin cache
REPO_ROOT=$(git -C "$(dirname "$FILEPATH")" rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi

REMOTE=$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null)
if ! echo "$REMOTE" | grep -q "claude-eisenhower"; then
  exit 0
fi

if echo "$REPO_ROOT" | grep -q ".claude/plugins/cache"; then
  exit 0
fi

# Gate 3: session dedup — only fire once per file per session
FILE_HASH=$(echo "$FILEPATH" | md5sum | cut -d' ' -f1)
DEDUP_FILE="/tmp/skill-enhancer-nudge-${FILE_HASH}.lock"

if [ -f "$DEDUP_FILE" ]; then
  exit 0
fi

touch "$DEDUP_FILE"

# Emit nudge
FILENAME=$(basename "$FILEPATH")
echo "You've modified ${FILENAME} this session. Consider running the skill-enhancer on it before committing."
```

**Step 2: Make executable**

```bash
chmod +x hooks/enhance-nudge.sh
```

**Step 3: Test gate behavior manually**

Test Gate 1 (non-artifact file, should exit silently):
```bash
CLAUDE_TOOL_INPUT_FILE_PATH="/tmp/README.md" bash hooks/enhance-nudge.sh
```
Expected: no output, exit 0

Test Gate 3 (dedup — run twice with same path):
```bash
rm -f /tmp/skill-enhancer-nudge-*.lock
CLAUDE_TOOL_INPUT_FILE_PATH="$(pwd)/commands/intake.md" bash hooks/enhance-nudge.sh
CLAUDE_TOOL_INPUT_FILE_PATH="$(pwd)/commands/intake.md" bash hooks/enhance-nudge.sh
```
Expected: first run emits nudge, second run is silent

Clean up locks after testing:
```bash
rm -f /tmp/skill-enhancer-nudge-*.lock
```

**Step 4: Commit**

```bash
git add hooks/enhance-nudge.sh
git commit -m "feat(v0.9.5): add enhance-nudge.sh — PostToolUse session nudge with source-repo gate and dedup"
```

---

## Task 9: Update hooks/hooks.json

**Files:**
- Modify: `hooks/hooks.json`

**Step 1: Read current hooks.json**

Current content:
```json
{
  "SessionStart": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "At the start of this session...",
          "timeout": 15
        }
      ]
    }
  ]
}
```

**Step 2: Add PostToolUse hook**

New content:
```json
{
  "SessionStart": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "At the start of this session, check if TASKS.md exists at the root of the user's mounted workspace folder. If it exists, read it and provide a brief task context summary: how many tasks are in each state (Inbox/Active/Delegated/Done). Format as: '📋 Task Board: [N] Inbox, [N] Active, [N] Delegated, [N] Done.' If the file does not exist, say nothing — the user hasn't started using the task board yet.",
          "timeout": 15
        }
      ]
    }
  ],
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
}
```

**Step 3: Verify JSON is valid**

```bash
python3 -c "import json; json.load(open('hooks/hooks.json')); print('valid')"
```
Expected: `valid`

**Step 4: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat(v0.9.5): add PostToolUse hook for skill-enhancer session nudge"
```

---

## Task 10: Update STRUCTURE.md

**Files:**
- Modify: `STRUCTURE.md`

**Step 1: Add skill-enhancer to the skills directory listing**

Find the `skills/` section in STRUCTURE.md. It currently shows:
```
skills/
  claude-eisenhower/
    SKILL.md
    references/
      ...
```

Add skill-enhancer:
```
skills/
  claude-eisenhower/
    SKILL.md
    references/
      eisenhower.md
      intake-sources.md
      delegation-guide.md
      email-patterns.md
  skill-enhancer/
    SKILL.md
    references/
      enhancement-protocol.md
      regression-safeguards.md
      edge-cases.md
```

**Step 2: Add enhance-nudge.sh to the hooks section**

Find the `hooks/` section. Add `enhance-nudge.sh`:
```
hooks/
  hooks.json
  enhance-nudge.sh    ← PostToolUse hook: nudges skill-enhancer after command/skill edits
```

**Step 3: Add artifact-baselines.md and plan to integrations/specs/ listing**

Add to the integrations/specs/ listing:
```
  artifact-baselines.md       ← baseline construct counts for all plugin artifacts (v0.9.5)
  skill-enhancer-spec.md      ← skill enhancer feature spec (v0.9.5)
  2026-03-03-skill-enhancer-plan.md ← skill enhancer implementation plan (v0.9.5)
```

**Step 4: Add version history entry**

Add to the Version History table:
```
| v0.9.5 | Skill Enhancer — research-driven artifact enhancement workflow |
|         | New: `skills/skill-enhancer/` — SKILL.md + 3 reference files |
|         | New: `hooks/enhance-nudge.sh` — PostToolUse session nudge |
|         | New: `integrations/specs/artifact-baselines.md` — construct count baselines |
|         | Updated: `hooks/hooks.json` — PostToolUse hook added |
```

**Step 5: Commit**

```bash
git add STRUCTURE.md
git commit -m "docs(v0.9.5): update STRUCTURE.md — skill-enhancer directories, hooks, specs"
```

---

## Task 11: Update ROADMAP.md

**Files:**
- Modify: `ROADMAP.md`

**Step 1: Mark v0.9.5 section as active**

Find the v0.9.5 section in ROADMAP.md. Change its status header from
`*(planned)*` or `Near-Term` to `Near-Term — Active (v0.9.5)` and remove
the `*(planned)*` qualifier from the description.

**Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): mark v0.9.5 skill-enhancer as in-progress"
```

---

## Task 12: Smoke Test

No new files — manual verification only.

**Step 1: Verify full skill structure is present**

```bash
find skills/skill-enhancer -type f | sort
```
Expected:
```
skills/skill-enhancer/SKILL.md
skills/skill-enhancer/references/edge-cases.md
skills/skill-enhancer/references/enhancement-protocol.md
skills/skill-enhancer/references/regression-safeguards.md
```

**Step 2: Verify hook files are present and executable**

```bash
ls -la hooks/
```
Expected: `enhance-nudge.sh` listed with execute bit (`-rwxr-xr-x`)

```bash
python3 -c "import json; json.load(open('hooks/hooks.json')); print('valid')"
```
Expected: `valid`

**Step 3: Run npm test to verify baseline is still green**

```bash
cd scripts && npm test
```
Expected: all tests pass (124/124 or current passing count)

**Step 4: Trace WF1 Phase 0 manually against commands/intake.md**

In a new Claude Code session (still in the worktree), invoke:
"enhance the intake command"

Verify:
- Phase 0 passes (running from source repo)
- Phase 1 loads enhancement-protocol.md, counts constructs, runs npm test
- Phases 2-5 run without writing any files
- Phase 5 presents dry-run diffs with scenario traces
- Phase 6 does not execute unless user explicitly approves proposals

This is a manual verification — no automated assertion. Document the result.

---

## Task 13: Finishing the Branch

**Step 1: Run full test suite one final time**

```bash
cd scripts && npm test
```
Expected: all tests pass

**Step 2: Invoke finishing-a-development-branch skill**

Use `superpowers:finishing-a-development-branch` to present merge options.
Select Option 2 (Push and Create PR) for review before merging to main.
