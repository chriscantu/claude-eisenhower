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
