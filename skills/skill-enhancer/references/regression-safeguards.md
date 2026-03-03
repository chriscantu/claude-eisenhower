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
