# skill-enhancer Pre-Ship Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve 2 High and 4 Medium architectural findings before shipping skill-enhancer v0.1.0.

**Architecture:** Four targeted edits across four files — no new files created.
Each task is a surgical edit to an existing markdown skill file, followed by
`npm test` verification and a commit. Changes are independent and can be applied
in any order except Tasks 3 and 4 (both touch enhancement-protocol.md and must run
sequentially).

**Tech Stack:** Markdown skill files. Verification via `cd scripts && npm test`.

**Design doc:** `integrations/specs/2026-03-03-skill-enhancer-pre-ship-fixes-design.md`

---

## Task 1: Update artifact-baselines.md header

**Files:**
- Modify: `integrations/specs/artifact-baselines.md` (lines 1–5)

**Step 1: Read the current header**

Read `integrations/specs/artifact-baselines.md` lines 1–5.
Current content:
```
# Artifact Construct Baselines

Recorded: 2026-03-03
Purpose: Floor values for skill-enhancer Phase 6 regression check.
Any post-enhancement construct count below these values is a hard warning.
```

**Step 2: Replace the Purpose block**

Replace lines 3–5 with the expanded version:

```markdown
Recorded: 2026-03-03
Purpose: Floor values — not rolling baselines — for skill-enhancer Phase 6 regression check.
These counts reflect the plugin state at first recording. The regression check flags any
construct count that drops below these values, indicating an accidental removal.

Update these rows when a structural expansion is intentional: a new phase added to a command,
a new guardrail section created, or a new example block deliberately introduced. Do not update
after routine wording changes. When in doubt, leave the floor as-is.
```

**Step 3: Verify**

Read the file and confirm the header now has 7 lines of purpose text (not 2).

**Step 4: Commit**

```bash
git add integrations/specs/artifact-baselines.md
git commit -m "fix(v0.9.5): clarify artifact-baselines floor semantics and update trigger"
```

---

## Task 2: Update EC-2 in edge-cases.md

**Files:**
- Modify: `skills/skill-enhancer/references/edge-cases.md` (EC-2 section)

**Step 1: Read the current EC-2 section**

Read `skills/skill-enhancer/references/edge-cases.md`.
Find the EC-2 block. Current content ends at:
```
If user confirms: create new reference file, add `> Read references/[new-file].md`
load instruction to SKILL.md at the appropriate phase.
```

**Step 2: Add naming convention and STRUCTURE.md instruction**

Append two lines after the existing EC-2 "If user confirms" block:

```markdown
Naming convention for the new file: `[artifact-slug]-extended-[N].md` where
`[artifact-slug]` is the artifact filename without extension and `[N]` starts at 1.
Example: enhancing `commands/intake.md` → create `references/intake-extended-1.md`.
If a `[slug]-extended-1.md` already exists, use `-2`, `-3`, etc.

After creating the file: update `STRUCTURE.md` to register it under the
`skills/skill-enhancer/references/` listing so the directory stays current.
```

**Step 3: Verify**

Read EC-2. Confirm it now contains the naming convention and the STRUCTURE.md update instruction.

**Step 4: Commit**

```bash
git add skills/skill-enhancer/references/edge-cases.md
git commit -m "fix(v0.9.5): EC-2 — add naming convention and STRUCTURE.md update requirement"
```

---

## Task 3: Rewrite construct counting rules in enhancement-protocol.md

**Files:**
- Modify: `skills/skill-enhancer/references/enhancement-protocol.md` (Section 1 counting rules block)

**Step 1: Read the current counting rules**

Read `enhancement-protocol.md`. Find the "Counting rules:" block under Section 1.
Current content:
```
**Counting rules:**
- Steps: count top-level numbered items only (not sub-bullets)
- Examples: count distinct fenced code blocks and labelled example sections
- Guardrails: count items in any section labelled Guardrails, Rules, DO NOT, WARNING
- Edge cases: count conditional handling items (`If X → Y` patterns)
- Cross-references: count `> Read ...` or `See ...` directives pointing to other files
```

**Step 2: Replace the counting rules block**

Replace the entire Counting rules block with:

```markdown
**Counting rules:**
- Steps: count top-level numbered items only (not sub-bullets)
- Examples: count distinct fenced code blocks and labelled example sections
- Guardrails: count any bullet or numbered item containing `DO NOT`, `NEVER`,
  `WARNING:`, or `CRITICAL:` anywhere in the file — not limited to labeled sections
- Edge cases: count items in any `## Edge cases` section PLUS inline conditional
  branches matching `If [condition] →` or `If [condition]:` patterns within numbered steps
- Cross-references: count `> Read ...` or `See ...` directives pointing to other files
```

**Step 3: Verify**

Read the Counting rules block. Confirm:
- Guardrails rule now says "anywhere in the file" not "in any section labelled"
- Edge cases rule now includes both `## Edge cases` sections AND inline `If` patterns

**Step 4: Run npm test**

```bash
cd scripts && npm test
```
Expected: all tests pass (124/124)

**Step 5: Commit**

```bash
git add skills/skill-enhancer/references/enhancement-protocol.md
git commit -m "fix(v0.9.5): content-based guardrail and edge case counting rules"
```

---

## Task 4: Merge Sections 2 and 6 in enhancement-protocol.md into Domain Registry

**Files:**
- Modify: `skills/skill-enhancer/references/enhancement-protocol.md` (Sections 2 and 6, section headings)

This is the largest change. Sections 2 and 6 are replaced with a single unified
Domain Registry table. Sections 3, 4, 5 are renumbered to 3, 4, 5 (unchanged numbering
since old Section 6 is removed, not inserted). The Agent B research queries column is
added directly to the domain table.

**Step 1: Read the full file to understand current structure**

Read `enhancement-protocol.md` in full. Note the exact text of:
- The `## Section 2: Domain Detection` block (table with 3 columns)
- The `## Section 6: Research Agent Prompts` block (Agent A and B sub-sections)
- The `## Section 3`, `## Section 4`, `## Section 5` headings (to verify renumbering isn't needed — these stay as-is since we're only removing Section 6, not inserting)

**Step 2: Replace Section 2 with merged Domain Registry**

Replace the entire `## Section 2: Domain Detection` block (from `## Section 2:` heading
through the end of the domain table, including the trailing `---`) with:

```markdown
## Section 2: Domain Registry

Maps artifact path to plugin domain and provides research agent queries for Phase 3.
Agent B queries apply only to domains with known failure-mode literature; cells marked
`—` skip counter-evidence research.

| Artifact path | Domain | Key concepts | Agent A query | Agent B query |
|---|---|---|---|---|
| `commands/intake.md` | task-intake | capture, source parsing, inbox triage, no-prioritize-during-intake | "best practices for engineering manager task intake and inbox triage workflows 2025" | "common failures in task intake systems — what causes inbox overload" |
| `commands/prioritize.md` | prioritization | Eisenhower matrix, Q1-Q4, urgency vs. importance | "Eisenhower matrix refinements and edge cases for engineering directors 2025" | "Eisenhower matrix criticism and failure modes" |
| `commands/schedule.md` | scheduling | capacity planning, time blocking, calendar integration, Q1/Q2 assignment | "time blocking and capacity planning patterns for engineering managers 2025" | "time blocking failure modes and over-scheduling pitfalls" |
| `commands/execute.md` | execution | progress tracking, follow-up, stakeholder updates, done criteria | "task follow-up and stakeholder update patterns for engineering managers 2025" | — |
| `commands/delegate.md` | delegation | authority matching, check-by dates, re-escalation, alias resolution | "delegation frameworks for engineering directors — check-in cadence and re-escalation 2025" | "delegation failure patterns — what causes delegated tasks to stall" |
| `commands/scan-email.md` | email-intake | email parsing, signal vs. noise, action item extraction | "engineering manager email triage and action item extraction patterns 2025" | — |
| `commands/setup.md` | onboarding | configuration, first-run, plugin setup | "first-run plugin setup and configuration UX patterns for developer tools 2025" | — |
| `skills/claude-eisenhower/SKILL.md` | orchestration | workflow routing, phase coordination, all domains | "AI-assisted productivity workflow design for engineering leaders 2025" | — |
| `skills/*/references/*.md` | varies | inherit domain from parent SKILL.md | — (use parent SKILL.md domain row) | — |

---
```

**Step 3: Remove the old Section 6**

Delete the entire `## Section 6: Research Agent Prompts` block — the Agent A and Agent B
sub-sections and their tables. This section no longer exists; its content is in Section 2.

**Step 4: Verify section structure**

Read the full file. Confirm:
- Section 2 is now "Domain Registry" with a 5-column table (9 data rows)
- Section 6 no longer exists
- Sections 1, 3, 4, 5 are unchanged
- File has no dangling `---` separators or duplicate content

**Step 5: Run npm test**

```bash
cd scripts && npm test
```
Expected: all tests pass (124/124)

**Step 6: Commit**

```bash
git add skills/skill-enhancer/references/enhancement-protocol.md
git commit -m "fix(v0.9.5): merge domain detection and research queries into unified Domain Registry"
```

---

## Task 5: Update SKILL.md — named section references and Resume Protocol

**Files:**
- Modify: `skills/skill-enhancer/SKILL.md`

Two changes in one file: (a) replace section number references with named references,
(b) add Resume router entry and Resume Protocol block.

**Step 1: Read SKILL.md to locate all section reference directives**

Read `SKILL.md`. Find the four `> **Load/Reference**` directives:
- Phase 1 (WF1): `> **Load \`references/enhancement-protocol.md\`** — Sections 1 and 2.`
- Phase 2 (WF1): `> **Reference \`references/enhancement-protocol.md\`** — Section 5.`
- Phase 3 (WF1): `> **Reference \`references/enhancement-protocol.md\`** — Section 6.`
- Phase 4 (WF1): `> **Reference \`references/enhancement-protocol.md\`** — Sections 3 and 4.`
- Phase 1 (WF2): `> **Load \`references/enhancement-protocol.md\`** — Section 1 only.`
- Phase 3 (WF2): `> **Reference \`references/enhancement-protocol.md\`** — Sections 3 and 4.`

**Step 2: Replace each directive with named + hint version**

Apply these replacements one at a time:

```
WF1 Phase 1:
OLD: > **Load `references/enhancement-protocol.md`** — Sections 1 and 2.
NEW: > **Load `references/enhancement-protocol.md`** — Artifact Type Registry and Domain Registry (Sections 1–2).

WF1 Phase 2:
OLD: > **Reference `references/enhancement-protocol.md`** — Section 5.
NEW: > **Reference `references/enhancement-protocol.md`** — Sibling Mining Patterns (Section 5).

WF1 Phase 3:
OLD: > **Reference `references/enhancement-protocol.md`** — Section 6.
NEW: > **Reference `references/enhancement-protocol.md`** — Domain Registry, Agent A/B queries column (Section 2).

WF1 Phase 4:
OLD: > **Reference `references/enhancement-protocol.md`** — Sections 3 and 4.
NEW: > **Reference `references/enhancement-protocol.md`** — Classification Rules and Impact-Effort Scoring (Sections 3–4).

WF2 Phase 1:
OLD: > **Load `references/enhancement-protocol.md`** — Section 1 only.
NEW: > **Load `references/enhancement-protocol.md`** — Artifact Type Registry (Section 1) only.

WF2 Phase 3:
OLD: > **Reference `references/enhancement-protocol.md`** — Sections 3 and 4.
NEW: > **Reference `references/enhancement-protocol.md`** — Classification Rules and Impact-Effort Scoring (Sections 3–4).
```

**Step 3: Add Resume entry to Workflow Router table**

Find the Workflow Router table. Current last row before the `| Ambiguous |` row:
```
| "[specific gap] in [artifact] — fix it" | WF2 Targeted Enhancement |
```

Add a new row after the WF2 row and before the Ambiguous row:
```
| "resume skill-enhancer Phase N on [artifact]" | Resume WF1 at Phase N |
```

**Step 4: Add Resume Protocol block**

Add the following block immediately after the Workflow Router table and before the `---` separator:

```markdown
### Resume Protocol

Use when a WF1 session was interrupted before Phase 6 completed.

1. Ask: "Which phase did you reach? Which artifact? Were any proposals approved?"
2. Re-read the target artifact fresh — do not assume prior baseline counts are still valid.
3. Restore context from conversation history: approved proposals, research summary,
   sibling patterns found.
4. If interrupted before Phase 3 complete: restart from Phase 1. Research results
   are not reliably recoverable from conversation history alone.
5. Re-run `cd scripts && npm test` before any phase that writes files.
6. Continue from the stated phase.
```

**Step 5: Verify**

Read SKILL.md. Confirm:
- All 6 section directives use named references with section numbers as hints
- Workflow Router table has 5 rows (WF1, research, WF2, resume, ambiguous)
- Resume Protocol block exists after the router table

**Step 6: Run npm test**

```bash
cd scripts && npm test
```
Expected: all tests pass (124/124)

**Step 7: Commit**

```bash
git add skills/skill-enhancer/SKILL.md
git commit -m "fix(v0.9.5): named section references in SKILL.md; add Resume Protocol"
```

---

## Task 6: Final verification

**Step 1: Verify all four fix files are present and correct**

```bash
find skills/skill-enhancer -name "*.md" | sort
```
Expected:
```
skills/skill-enhancer/SKILL.md
skills/skill-enhancer/references/edge-cases.md
skills/skill-enhancer/references/enhancement-protocol.md
skills/skill-enhancer/references/regression-safeguards.md
```

**Step 2: Spot-check section structure in enhancement-protocol.md**

```bash
grep "^## Section" skills/skill-enhancer/references/enhancement-protocol.md
```
Expected output:
```
## Section 1: Artifact Type Registry
## Section 2: Domain Registry
## Section 3: Classification Rules
## Section 4: Impact-Effort Scoring
## Section 5: Sibling Mining Patterns
```
(Section 6 must NOT appear.)

**Step 3: Spot-check Resume Protocol in SKILL.md**

```bash
grep -n "Resume" skills/skill-enhancer/SKILL.md
```
Expected: at least 3 matches — router table row, Protocol heading, and Protocol body.

**Step 4: Run full test suite**

```bash
cd scripts && npm test
```
Expected: all tests pass (124/124)

**Step 5: Review the branch log**

```bash
git log main..HEAD --oneline
```
Expected: 10+ commits including the 4 fix commits from this plan.
