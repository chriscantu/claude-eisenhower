# Unify Q3 Scoring: /prioritize Should Invoke match-delegate CLI

**Plugin**: claude-eisenhower
**Version target**: v1.3.0
**Status**: Draft
**Date**: 2026-03-26
**Author**: Cantu

---

## Problem Statement

`/prioritize` Step 4b and `/delegate` both perform Q3 delegation scoring, but they
use different code paths:

- `/delegate` invokes `scripts/match-delegate.ts` as a subprocess and consumes its
  JSON output. This path is tested by 196 Jest tests.
- `/prioritize` re-implements the same scoring algorithm as inline LLM instructions
  (domain x3, relationship, capacity). This path is untested by any automated suite.

This creates three concrete risks:

1. **Silent behavioral divergence** — If the scoring algorithm changes (new
   relationship type, weight adjustment, anti-domain veto), `/delegate` picks it up
   immediately but `/prioritize` requires a manual edit to match.
2. **Missing feature** — `/prioritize` cannot benefit from `loadPendingCounts()`
   because it never invokes the CLI. Delegates with high open workloads get the same
   score in `/prioritize` that they'd get with zero open items.
3. **Untestable path** — The LLM's inline scoring cannot be validated by Jest. The
   only coverage is the prompt-contracts test (vocabulary check), which verifies
   wording, not behavior.

---

## Goals

- `/prioritize` Step 4b invokes `match-delegate.ts` for Q3 scoring, same as `/delegate`
- One scoring algorithm, one code path, one test suite
- Pending-count scoring becomes available in `/prioritize`
- No user-visible behavior change beyond more accurate scoring

## Non-Goals

- Changing the scoring algorithm itself
- Modifying `/delegate` (it already works correctly)
- Adding new test cases (existing 196 tests cover the CLI path)

---

## Current State

### `/prioritize` Step 4b (inline scoring)

```
1. Load stakeholders.yaml
2. For each keyword in delegate's domains: if keyword appears in task title or
   description, add +3
3. relationship: direct_report → +2, peer → +1, vendor → 0
4. capacity_signal: high → +2, medium → +1, low → -1
5. Surface results, ask for confirmation
```

This is a prose copy of the algorithm in `delegate-core.ts`. It does not include:
- `anti_domains` veto logic (added v1.1.1)
- `PENDING_PENALTY` from `loadPendingCounts()` (added v0.9.0)
- `AUTHORITY_PATTERNS` check (present but as a separate Step 3 gate)

### `/delegate` Step 4 (CLI invocation)

```applescript
do shell script "cd {plugin_root}/scripts && npx ts-node match-delegate.ts
  --task 'task title and description'
  --stakeholders {plugin_root}/config/stakeholders.yaml
  --glossary {plugin_root}/memory/glossary.md 2>&1"
```

Returns structured JSON with ranked candidates, scores, reasoning, and warnings.

---

## Proposed Change

Replace `/prioritize` Step 4b's inline scoring with a CLI invocation matching
`/delegate`'s pattern.

### New Step 4b

```markdown
## Step 4b: For each Q3 task — score delegates via CLI

After classifying a task as Q3, before saving:

1. **Check for stakeholder graph**: Read `plugin_root` from
   `config/task-output-config.md`, then check if
   `{plugin_root}/config/stakeholders.yaml` exists.

   - If not configured: run /setup. If stakeholders.yaml does not exist: show
     placeholder message and continue (same as today).

2. **Invoke the scoring CLI**:

   ```applescript
   do shell script "cd " & quoted form of "{plugin_root}/scripts" & " && npx ts-node match-delegate.ts " & quoted form of taskTitle & " " & quoted form of taskDescription & " 2>&1"
   ```

   Note: the CLI takes two positional arguments (title, description) and discovers
   `config/stakeholders.yaml` and `memory/glossary.md` relative to the working directory.

3. **Parse the JSON output**. The CLI returns:
   ```json
   {
     "candidates": [
       { "alias": "Alex R.", "score": 8, "reasons": ["domain:infrastructure +3", ...] }
     ],
     "warnings": ["Alex R. has 3 pending delegations"],
     "noMatch": false
   }
   ```

4. **Surface results** using the same presentation format as today:
   - One clear top scorer → suggest with reasoning
   - Tied → surface both, prefer direct_report on tiebreak
   - Score 0 or negative → "No clear domain match"
   - Low capacity → advisory warning

5. **Ask for confirmation** before recording (unchanged).
```

### What stays the same

- Step 3 authority flag check (unchanged — runs before Step 4b)
- Step 5 save logic (unchanged)
- User-facing presentation format (unchanged)
- All fallback messages for missing config (unchanged)

### What changes

- Scoring is now computed by `match-delegate.ts`, not LLM arithmetic
- Anti-domain veto is now active in `/prioritize` (was missing)
- Pending-count penalty is now active in `/prioritize` (was missing)
- The inline scoring prose in Step 4b is replaced with CLI invocation instructions

---

## Blast Radius

| File | Change |
|------|--------|
| `commands/prioritize.md` | Rewrite Step 4b to invoke CLI instead of inline scoring |
| `commands/prioritize.md` | Remove inline scoring prose (lines ~62-73) |

No other files change. The CLI, scoring logic, test suite, and all other commands
are untouched.

---

## Verification

1. **Existing tests** — `cd scripts && npm test` (196 tests, all passing).
   No new tests needed — the CLI path is already fully covered.
2. **Manual smoke test** — Run `/prioritize` on a task with a known best delegate.
   Confirm the CLI is invoked and the suggestion matches `/delegate`'s output for
   the same task.
3. **Anti-domain test** — Create a task with a keyword matching a delegate's
   `anti_domains`. Confirm the delegate is vetoed (was not possible before this change).
4. **Pending-count test** — Assign 3+ open delegations to one delegate in
   `memory/glossary.md`. Confirm their score is penalized in `/prioritize` output.

---

## Risks

**LLM JSON parsing** — The CLI outputs JSON. The LLM must parse it correctly.
`/delegate` already does this successfully, so the pattern is proven.

**`npx ts-node` availability** — Same dependency as `/delegate`. If it works for
`/delegate`, it works here. `/setup` could validate this.

**Glossary file missing** — `match-delegate.ts` handles this gracefully: if
`--glossary` path doesn't exist, pending counts default to 0. No error.

---

## Decision Log

| Date | Decision | Reasoning |
|------|----------|-----------|
| 2026-03-26 | Invoke CLI rather than extract scoring to a shared prompt template | CLI is tested, typed, and already handles edge cases. A prompt template would still be untestable by Jest. |
| 2026-03-26 | Keep authority flag check as a separate Step 3 gate | Authority check is a pre-classification gate, not a scoring step. It runs before quadrant assignment. Mixing it into the CLI would conflate two concerns. |
