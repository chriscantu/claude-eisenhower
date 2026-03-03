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
- Guardrails: count any bullet or numbered item containing `DO NOT`, `NEVER`,
  `WARNING:`, or `CRITICAL:` anywhere in the file — not limited to labeled sections
- Edge cases: count items in any `## Edge cases` section PLUS inline conditional
  branches matching `If [condition] →` or `If [condition]:` patterns within numbered steps
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
