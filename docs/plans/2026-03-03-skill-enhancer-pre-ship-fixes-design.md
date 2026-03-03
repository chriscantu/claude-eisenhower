# skill-enhancer Pre-Ship Fixes — Design

**Date:** 2026-03-03
**Branch:** v0.9.5/skill-enhancer
**Addresses:** High and Medium findings from post-implementation architectural review

---

## Problem Statement

After completing the initial skill-enhancer implementation, an architectural review
identified 6 issues (2 High, 4 Medium) that should be resolved before shipping:

| Priority | Finding |
|---|---|
| High | Section number coupling — SKILL.md phase directives brittle to enhancement-protocol.md restructuring |
| High | Construct counting subjectivity — guardrail/edge case detection inconsistent across sessions |
| Medium | Stale baselines — artifact-baselines.md header doesn't explain floor-value semantics or update triggers |
| Medium | EC-2 creates unnamed reference files — no naming convention, no STRUCTURE.md update instruction |
| Medium | No session resumption path — interrupted WF1 sessions must restart from Phase 0 |
| Medium | Domain/query table coupling — Sections 2 and 6 of enhancement-protocol.md must be kept in sync manually |

---

## Design Decisions

### 1. Domain/query table merge (Medium)

**Decision:** Merge Sections 2 and 6 of `enhancement-protocol.md` into a single
"Domain Registry" table. 5 columns: `Artifact path | Domain | Key concepts | Agent A query | Agent B query`.
Agent B cells are `—` where no counter-evidence agent applies (e.g. onboarding, orchestration).

**Rationale:** Eliminates the dual-table sync requirement. Single source of truth.
Section renumbering: 1 (Type Registry) → 2 (Domain Registry) → 3 (Classification) →
4 (Scoring) → 5 (Sibling Mining). Old Section 6 is removed.

### 2. Session resumption (Medium)

**Decision:** Lightweight resume prompt — new router entry in SKILL.md plus a
Resume Protocol block. Uses conversation history as state; no persistent session files.

**Rationale:** A session file would require 6 additional write operations per WF1 run
and could get out of sync with conversation history (the natural state store for a
conversational tool). Interrupted sessions are an edge case; lightweight recovery is
sufficient.

**Router entry:** `"resume skill-enhancer [Phase N] [artifact]" → Resume WF1`

**Resume Protocol (4 steps):**
1. Ask: what phase was reached, what artifact, what was approved so far
2. Re-read the artifact (no cached state assumed)
3. Restore context from conversation history
4. Continue from stated phase; npm test re-run required before writing

### 3. Construct counting rules (High)

**Decision:** Replace label-based detection with content-based matching.

**Guardrails:** Count any bullet or numbered item containing `DO NOT`, `NEVER`,
`WARNING:`, or `CRITICAL:` anywhere in the file — not just in labeled sections.

**Edge cases:** Count items in `## Edge cases` sections PLUS inline conditional
branches matching `If [condition] →` or `If [condition]:` patterns within numbered steps.

**Rationale:** Inline DO NOT items (e.g. `commands/schedule.md:87`) appear inside
numbered steps, not in labeled sections. Label-only detection undercounts guardrails
and produces inconsistent session-to-session baselines.

### 4. Section reference naming (High)

**Decision:** Replace section number references in SKILL.md phase directives with
named references; retain section number as a navigational hint in parentheses.

**Format:** `> Reference — [Section Name] ([Section N])`

**Rationale:** Semantic name is the stable contract. Section number may change if
enhancement-protocol.md is restructured; the name should not. Number aids navigation
but is not load-bearing.

### 5. EC-2 naming convention (Medium)

**Decision:** Auto-created overflow files use `[artifact-slug]-extended-[N].md`
where N is a sequence starting at 1. Example: `intake-extended-1.md`.

**Additional requirement:** EC-2 handling must include an instruction to update
`STRUCTURE.md` to register the new file under the skill-enhancer references section.

**Rationale:** Artifact-tied name makes ownership clear. Sequence number supports
multiple overflow events on the same artifact without collision.

### 6. artifact-baselines.md header (Medium)

**Decision:** Expand the Purpose section to 5 lines covering:
- Floor values, not rolling baselines
- What the regression check does with them (flags drops below floor)
- When to update: after intentional structural expansion (new phase, new command,
  new guardrail section) — update the relevant rows to reflect the new legitimate floor

---

## Files Modified

| File | Change |
|---|---|
| `skills/skill-enhancer/references/enhancement-protocol.md` | Merge Sections 2+6; rewrite counting rules; renumber sections |
| `skills/skill-enhancer/SKILL.md` | Named section references; Resume router entry + Protocol |
| `skills/skill-enhancer/references/edge-cases.md` | EC-2: naming convention + STRUCTURE.md update instruction |
| `integrations/specs/artifact-baselines.md` | Header: floor semantics + update trigger |

No new files. No new companion files.

---

## Out of Scope

The following Low-priority findings are deferred to v1.x:

- WF2 scope expansion mid-session produces incomplete baseline
- `enhance-nudge.sh` remote string match brittleness on forks/renames
