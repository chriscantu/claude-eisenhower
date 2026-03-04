# SME Review Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve all 9 critical and important findings from the 2026-03-04 AI SME review across three domains: runtime bugs, behavioral consistency, and structural/DevOps.

**Architecture:** TypeScript fixes follow TDD (write failing test, implement, verify). Markdown prompt fixes are verified by reading the updated file against the spec's acceptance criteria checklist. Structural fixes (gitignore, memory system) are verified by inspection and CI pass.

**Tech Stack:** TypeScript (ts-jest), AppleScript, Markdown prompt files, GitHub Actions CI

**Spec:** `integrations/specs/2026-03-04-sme-review-remediation.md`

---

## Domain 1 — Runtime Bugs

---

### Task 1 (C2): Guard `yaml.load()` against malformed `stakeholders.yaml`

**Files:**
- Modify: `scripts/match-delegate.ts` — `loadStakeholders()` and `run()`
- Test: `tests/delegation.test.ts` — add new describe block at the bottom

**Background:** `yaml.load()` throws on malformed YAML. The error propagates as a raw stack trace to stdout. Claude receives unparseable output and the delegation flow silently breaks. Fix: make `loadStakeholders()` throw a clean Error on bad YAML, and catch it in `run()` to emit structured JSON.

---

**Step 1: Write the failing test**

Add this describe block at the bottom of `tests/delegation.test.ts`:

```typescript
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Add to existing imports at top if not already present:
// import * as fs from "fs";
// import * as os from "os";
// import * as path from "path";

// ── C2: YAML parse guard ─────────────────────────────────────────────────────

// Re-export loadStakeholders for testing — add this export to match-delegate.ts first (Step 3)
import { loadStakeholders } from "../scripts/match-delegate";

describe("C2: loadStakeholders YAML parse guard", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eisenhower-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("throws a clean Error on malformed YAML", () => {
    const badYaml = path.join(tmpDir, "stakeholders.yaml");
    fs.writeFileSync(badYaml, "bad: yaml: :\n  - [invalid");
    expect(() => loadStakeholders(badYaml)).toThrow("stakeholders.yaml parse error");
  });

  test("returns null when file does not exist", () => {
    const missing = path.join(tmpDir, "missing.yaml");
    expect(loadStakeholders(missing)).toBeNull();
  });

  test("returns empty array for valid YAML with empty stakeholders list", () => {
    const emptyYaml = path.join(tmpDir, "stakeholders.yaml");
    fs.writeFileSync(emptyYaml, "stakeholders: []");
    expect(loadStakeholders(emptyYaml)).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd scripts && npx jest --testPathPattern="delegation.test" --no-coverage -t "C2"
```

Expected: FAIL — `loadStakeholders` is not exported from `match-delegate.ts`

---

**Step 3: Export `loadStakeholders` and add try/catch**

In `scripts/match-delegate.ts`, make two changes:

Change 1 — export `loadStakeholders` and wrap `yaml.load()`:

```typescript
// Before:
function loadStakeholders(graphPath: string): Stakeholder[] | null {
  if (!fs.existsSync(graphPath)) return null;
  const raw = fs.readFileSync(graphPath, "utf8");
  const parsed = yaml.load(raw) as StakeholderFile;
  if (!parsed?.stakeholders || parsed.stakeholders.length === 0) return [];
  return parsed.stakeholders;
}

// After:
export function loadStakeholders(graphPath: string): Stakeholder[] | null {
  if (!fs.existsSync(graphPath)) return null;
  const raw = fs.readFileSync(graphPath, "utf8");
  let parsed: StakeholderFile;
  try {
    parsed = yaml.load(raw) as StakeholderFile;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`stakeholders.yaml parse error: ${msg}`);
  }
  if (!parsed?.stakeholders || parsed.stakeholders.length === 0) return [];
  return parsed.stakeholders;
}
```

Change 2 — catch the new error in `run()` and emit clean JSON:

```typescript
// In run(), replace:
  const stakeholders = loadStakeholders(graphPath);

// With:
  let stakeholders: Stakeholder[] | null;
  try {
    stakeholders = loadStakeholders(graphPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(JSON.stringify({ status: "no_graph", candidates: [], message: msg }, null, 2));
    return;
  }
```

**Step 4: Run test to verify it passes**

```bash
cd scripts && npx jest --testPathPattern="delegation.test" --no-coverage -t "C2"
```

Expected: PASS — 3 tests pass

**Step 5: Run full suite to verify no regressions**

```bash
cd scripts && npm test
```

Expected: All tests pass

**Step 6: Commit**

```bash
git add scripts/match-delegate.ts tests/delegation.test.ts
git commit -m "fix(C2): guard yaml.load() in match-delegate.ts — clean JSON on malformed stakeholders.yaml"
```

---

### Task 2 (C4): Add authority flag regression test + cross-reference comments

**Files:**
- Modify: `tests/delegation.test.ts` — add AUTHORITY_PATTERNS assertion
- Modify: `commands/delegate.md` — add cross-reference comment
- Modify: `commands/prioritize.md` — add cross-reference comment

**Background:** `AUTHORITY_PATTERNS` lives in `delegate-core.ts`. The same four patterns are repeated inline in two command prompts. If the code constant changes without updating the prompts, behavior silently diverges. A regression test pins the contract; comments in the prompts make the coupling visible.

---

**Step 1: Write the failing test**

Add this describe block to `tests/delegation.test.ts` (after the C2 block):

```typescript
import { AUTHORITY_PATTERNS } from "../scripts/delegate-core";

describe("C4: AUTHORITY_PATTERNS contract", () => {
  test("exports exactly 4 authority patterns", () => {
    expect(AUTHORITY_PATTERNS).toHaveLength(4);
  });

  test("contains all expected authority phrases", () => {
    expect(AUTHORITY_PATTERNS).toContain("requires your sign-off");
    expect(AUTHORITY_PATTERNS).toContain("executive decision");
    expect(AUTHORITY_PATTERNS).toContain("personnel decision");
    expect(AUTHORITY_PATTERNS).toContain("sensitive communication on your behalf");
  });
});
```

**Step 2: Run test to verify it passes immediately**

```bash
cd scripts && npx jest --testPathPattern="delegation.test" --no-coverage -t "C4"
```

Expected: PASS — this test documents the current contract. If it fails, a prior change broke the constant and must be fixed before proceeding.

**Step 3: Add cross-reference comment to `commands/delegate.md`**

Find this block in Step 2 of `commands/delegate.md`:

```markdown
- "requires your sign-off"
- "executive decision"
- "personnel decision"
- "sensitive communication on your behalf"
```

Add the following comment immediately after it:

```markdown
<!-- Canonical source: AUTHORITY_PATTERNS in scripts/delegate-core.ts.
     Update both this list AND delegate-core.ts if patterns change. -->
```

**Step 4: Add the same cross-reference comment to `commands/prioritize.md`**

Find the same four-pattern list in Step 3 of `commands/prioritize.md` and add the identical comment after it.

**Step 5: Verify both files**

Read `commands/delegate.md` and `commands/prioritize.md` and confirm:
- All four patterns are present and exactly match `AUTHORITY_PATTERNS` in `delegate-core.ts`
- The cross-reference comment is present after the list in both files

**Step 6: Commit**

```bash
git add tests/delegation.test.ts commands/delegate.md commands/prioritize.md
git commit -m "fix(C4): add authority flag regression test and cross-reference comments in command prompts"
```

---

### Task 3 (I4): Fix ASCII-only `lower()` in `complete_reminder.applescript`

**Files:**
- Modify: `scripts/complete_reminder.applescript` — replace `lower()` and `lowerTrim()` helpers

**Background:** The hand-rolled `lower()` only handles A–Z. Non-ASCII characters in stakeholder aliases or task titles cause the case-insensitive match to fail silently with `skipped:`. Fix: delegate lowercasing to the shell `tr` command, which handles the full POSIX locale.

**Note:** AppleScript has no Jest test coverage. Verify by reading the updated script and confirming the implementation matches the acceptance criteria in the spec.

---

**Step 1: Replace `lower()` and update `lowerTrim()`**

In `scripts/complete_reminder.applescript`, replace the two helper handlers at the bottom:

```applescript
-- Before (replace both handlers entirely):

on lowerTrim(str)
    set str to my lower(str)
    repeat while str begins with " "
        set str to text 2 thru -1 of str
    end repeat
    repeat while str ends with " "
        set str to text 1 thru -2 of str
    end repeat
    return str
end lowerTrim

on lower(str)
    set upperChars to "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    set lowerChars to "abcdefghijklmnopqrstuvwxyz"
    set result to ""
    repeat with c in every character of str
        set charOffset to offset of c in upperChars
        if charOffset > 0 then
            set result to result & character charOffset of lowerChars
        else
            set result to result & c
        end if
    end repeat
    return result
end lower

-- After:

-- Helper: lowercase and trim whitespace — handles full Unicode via shell tr
on lowerTrim(str)
    -- Trim leading/trailing spaces first
    repeat while str begins with " "
        set str to text 2 thru -1 of str
    end repeat
    repeat while str ends with " "
        set str to text 1 thru -2 of str
    end repeat
    -- Lowercase using POSIX tr (handles non-ASCII characters)
    return do shell script "printf '%s' " & quoted form of str & " | tr '[:upper:]' '[:lower:]'"
end lowerTrim
```

**Step 2: Verify the fix is correct by reading the updated file**

Read `scripts/complete_reminder.applescript` and confirm:
- The old `lower()` handler is fully removed
- `lowerTrim()` trims spaces before calling `tr`
- `lowerTrim()` is still called in the same two places in the `run` handler (Steps 2 and 3)
- The `quoted form of str` ensures strings with spaces or special characters are passed safely to the shell

**Step 3: Verify the calling code is unchanged**

Confirm both calls to `my lowerTrim()` in the `run` handler are still present and unmodified:
- Line checking `existingReminders` in Step 2
- Line checking `completedReminders` in Step 3

**Step 4: Commit**

```bash
git add scripts/complete_reminder.applescript
git commit -m "fix(I4): replace ASCII-only lower() with POSIX tr in complete_reminder.applescript"
```

---

### Task 4 (I1): Remove build artifacts from source control

**Files:**
- Modify: `.gitignore` — add `dist/` and `*.plugin` entries
- Run: `git rm --cached` to stop tracking existing artifacts

**Background:** `dist/` (compiled TypeScript) and `*.plugin` archives are committed but should be gitignored. CI rebuilds them. Removing them from tracking reduces repo size and eliminates drift between source and compiled output.

---

**Step 1: Add entries to `.gitignore`**

Read `.gitignore` first. Then add these two lines in the build artifacts section (after the existing `node_modules/` entry or similar):

```
dist/
*.plugin
```

**Step 2: Remove `dist/` from git tracking**

```bash
git rm --cached -r dist/
```

Expected: a list of removed `dist/` files printed to stdout. No working tree files are deleted.

**Step 3: Remove `.plugin` files from git tracking**

```bash
git rm --cached claude-eisenhower-0.2.0.plugin claude-eisenhower-0.6.0.plugin claude-eisenhower-0.9.6.plugin
```

Expected: three files removed from index. Verify with `ls *.plugin` — files still exist on disk but are now gitignored.

**Step 4: Update `STRUCTURE.md`**

In the `scripts/` section table of `STRUCTURE.md`, find the `dist/` note (if present) and confirm it says gitignored. No change needed if already accurate.

In the top-level files table, confirm the `.plugin` row reflects gitignored status. It currently reads: `⚠ Build artifact — produced by npm run package, gitignored, not committed` — this is already correct, no change needed.

**Step 5: Verify CI is unaffected**

Run the test suite to confirm nothing imports from `dist/`:

```bash
cd scripts && npm test
```

Expected: All tests pass (tests import from `../scripts/delegate-core`, not from `../dist/`)

**Step 6: Commit**

```bash
git add .gitignore STRUCTURE.md
git commit -m "fix(I1): gitignore dist/ and *.plugin build artifacts, remove from tracking"
```

---

### Task 5 (C1 + I3): Fix scan-email index drift, batch gap, and silent body-fetch error

**Files:**
- Modify: `commands/scan-email.md` — Steps 3 and 5

**Background:** Two defects in `scan-email.md`: (1) positional indices used to fetch email bodies can drift if messages arrive/move between batch calls; (2) messages 31–40 are never scanned due to a typo in the batch sequence; (3) the body-fetch `try`/`end try` block swallows errors silently, classifying tasks with an empty preview.

**Note:** These are prompt/instruction changes. Verify by reading the updated file against each acceptance criterion in the spec.

---

**Step 1: Fix the batch sequence in Step 3**

Find this line in Step 3 of `commands/scan-email.md`:

```
Scan batches 1–10, 11–20, 21–30, 41–50 sequentially.
```

Replace with:

```
Scan batches 1–10, 11–20, 21–30, 31–40, 41–50 sequentially.
```

**Step 2: Fix index drift — capture message ID at subject-fetch time**

In Step 3, find the AppleScript block that fetches subjects. The current block stores only `msgSubject`, `msgSender`, and `msgDate`. Update it to also capture a stable identifier.

Find:
```applescript
    set end of results to msgSubject & "|||" & msgSender & "|||" & msgDate
```

Replace with:
```applescript
    set msgIndex to i
    set end of results to msgSubject & "|||" & msgSender & "|||" & msgDate & "|||" & msgIndex
```

Then add an instruction immediately after the AppleScript block:

```
For each result, parse and store the four fields: subject, sender, date, and index.
The index value captured here is the stable reference for Step 5 body fetches.
Do not re-derive the index by position in Step 5 — use only the stored value.
```

**Step 3: Fix the body-fetch error handling in Step 5**

Find the `try` block in the Step 5 AppleScript:

```applescript
  try
    set c to content of msg
    ...
    set preview to safeText
  end try
  return preview
```

Replace with:

```applescript
  try
    set c to content of msg
    set charLimit to 500
    if length of c < charLimit then set charLimit to length of c
    set safeText to ""
    repeat with i from 1 to charLimit
      set ch to character i of c
      set cp to id of ch
      if cp >= 32 and cp <= 126 then
        set safeText to safeText & ch
      end if
    end repeat
    set preview to safeText
  on error errMsg
    return "BODY_UNAVAILABLE: " & errMsg
  end try
  return preview
```

Then add an instruction immediately after the Step 5 AppleScript block:

```
If the returned value begins with "BODY_UNAVAILABLE:", the body could not be
retrieved. In the confirmation table (Step 8), add a note for that email:
"body unavailable — classified on subject only". Still log the task (non-blocking).
```

**Step 4: Verify the updated file**

Read `commands/scan-email.md` and confirm:
- Batch sequence reads: 1–10, 11–20, 21–30, 31–40, 41–50 (no gap)
- Step 3 AppleScript captures the index as the fourth field
- A note instructs Claude to use the stored index in Step 5, not re-derive it
- Step 5 AppleScript uses `on error errMsg` not bare `end try`
- An instruction describes how to handle `BODY_UNAVAILABLE:` responses

**Step 5: Commit**

```bash
git add commands/scan-email.md
git commit -m "fix(C1,I3): fix email index drift, patch 31-40 batch gap, surface body-fetch errors"
```

---

## Domain 2 — Behavioral Consistency

---

### Task 6 (C3): Align `SKILL.md` Q4 description with two-step staging behavior

**Files:**
- Modify: `skills/claude-eisenhower/SKILL.md` — Phase 3 (Schedule) Q4 entry

**Background:** `SKILL.md` says Q4 tasks go directly to `## Done`. `commands/schedule.md` correctly implements a two-step flow: stage in `## Q4 — Defer / Eliminate` first, then move to `## Done` at weekly review. The skill must match the command.

---

**Step 1: Find and update the Q4 entry in SKILL.md Phase 3**

In `skills/claude-eisenhower/SKILL.md`, find this line in the Phase 3 Schedule section:

```markdown
- **Q4** → Eliminate. Move to the `## Done` section with a `Note: Eliminated — Q4 cut {YYYY-MM-DD}` and `Done: {date}`. Do not leave in Inbox — elimination is an active decision, not a deferral.
```

Replace with:

```markdown
- **Q4** → Stage for review. Move to `## Q4 — Defer / Eliminate` with
  `Deferred: {today's date} | Review on: {date 2 weeks out}`. At the weekly review,
  if the task still has no value, move to `## Done` with
  `Note: Eliminated — Q4 cut {date}`. Do not eliminate immediately unless the user
  explicitly confirms — staging keeps the decision visible and reversible.
```

**Step 2: Verify the updated file**

Read `skills/claude-eisenhower/SKILL.md` and confirm:
- Q4 now describes two-step staging, not immediate elimination
- The `## Q4 — Defer / Eliminate` section name matches what `commands/schedule.md` uses
- The "unless the user explicitly confirms" escape hatch is present (preserving the behavior in `schedule.md` Step 3 where immediate elimination is allowed on user request)

**Step 3: Commit**

```bash
git add skills/claude-eisenhower/SKILL.md
git commit -m "fix(C3): align SKILL.md Q4 description with two-step staging behavior in schedule.md"
```

---

### Task 7 (I5): Update `task-prioritizer` agent for four-state section headers

**Files:**
- Modify: `agents/task-prioritizer.md` — Step 5 and output format section

**Background:** The agent's Step 5 moves tasks to `## Q1`, `## Q2`, etc. — sections that do not exist in a four-state TASKS.md. It must write to `## Active`, `## Delegated`, and `## Q4 — Defer / Eliminate` instead.

---

**Step 1: Update Step 5 in `agents/task-prioritizer.md`**

Find:
```markdown
Update TASKS.md: move each task to its confirmed quadrant section, preserve all original fields, add quadrant label and recommended action.
```

Replace with:

```markdown
Update TASKS.md: move each task to the correct four-state section, preserve all
original fields, add Priority and State fields:

- **Q1 tasks** → move to `## Active`. Set `Priority: Q1`, `State: Active`, `Owner: me`.
- **Q2 tasks** → move to `## Active`. Set `Priority: Q2`, `State: Active`, `Owner: me`.
- **Q3 tasks** → move to `## Delegated`. Set `Priority: Q3`, `State: Delegated`.
  A `Check-by:` date is required — prompt for one before saving if not already present.
- **Q4 tasks** → move to `## Q4 — Defer / Eliminate`. Set `Priority: Q4`.
  Add `Deferred: {today's date} | Review on: {date 2 weeks out}`.

Do NOT create `## Q1`, `## Q2`, `## Q3`, or `## Q4` section headers.
The Quadrant column in your output table is for reasoning only — it is not a section name.
```

**Step 2: Verify the updated file**

Read `agents/task-prioritizer.md` and confirm:
- Step 5 maps all four quadrants to the correct four-state sections
- `## Q1`/`## Q2`/`## Q3`/`## Q4` are not mentioned as section names
- Check-by date enforcement is explicit for Q3
- The output table format in the Output Format section still shows Q1/Q2/Q3/Q4 in the Quadrant column (that is correct — the column is for classification, not section names)

**Step 3: Commit**

```bash
git add agents/task-prioritizer.md
git commit -m "fix(I5): update task-prioritizer agent to write four-state section headers"
```

---

## Domain 3 — Structural / DevOps

---

### Task 8 (I2): Fix dual memory system — enforce Option B single-write pattern

**Files:**
- Modify: `commands/schedule.md` — Steps 3b and 7
- Modify: `commands/execute.md` — Mark Done and Delegate sections
- Modify: `commands/delegate.md` — Step 8
- Modify: `skills/claude-eisenhower/SKILL.md` — Stakeholder Memory section
- Create: `integrations/docs/memory-system-adr.md` — decision record

**Background:** All four artifacts write to both `productivity:memory-management` and local `memory/stakeholders-log.md`, regardless of whether the skill is available. This can cause duplicate entries. Decision B: `productivity:memory-management` is the primary write target. Local `memory/` is the fallback used only when the skill is unavailable. Never write to both in the same session.

---

**Step 1: Write the canonical fallback block**

The same fallback text must appear in all four artifacts. Define it here as the canonical form — copy it exactly into each file:

```
If the productivity:memory-management skill is not available:
1. Notify the user: "Note: memory-management skill not found. Logging locally to memory/stakeholders-log.md."
2. Ensure the `memory/` directory exists before writing (create it if absent).
3. Append a line to `memory/stakeholders-log.md`:
   `[YYYY-MM-DD] [alias] | [task title] | check-in: [date] | status: pending`
4. If the write fails: "Could not record this follow-up ([reason]). Track it manually."
Do NOT write to memory/stakeholders-log.md if productivity:memory-management succeeded.
```

The critical addition is the final line: "Do NOT write to memory/stakeholders-log.md if productivity:memory-management succeeded."

**Step 2: Update `commands/schedule.md`**

There are two memory-write blocks in `schedule.md`: Step 3b (delegate flow) and Step 7 (Q3 stakeholder log).

For each block, find the existing fallback text and append the "Do NOT write" line at the end of the fallback block. The primary write to `productivity:memory-management` is already described — only the fallback needs the guard line added.

**Step 3: Update `commands/execute.md`**

There are two memory-write blocks in `execute.md`: the Mark Done section and the Delegate section.

Apply the same change: append the "Do NOT write" guard line to the end of each fallback block.

**Step 4: Update `commands/delegate.md`**

Step 8 has one memory-write block. Append the guard line to its fallback block.

**Step 5: Update `skills/claude-eisenhower/SKILL.md`**

The Stakeholder Memory section describes the fallback. Replace the fallback block in full with the canonical form from Step 1 (which includes the guard line).

**Step 6: Verify all four files**

Read each of the four files and confirm:
- `productivity:memory-management` is still listed as the primary write target
- Each fallback block ends with "Do NOT write to memory/stakeholders-log.md if productivity:memory-management succeeded."
- No file instructs Claude to write to both systems

**Step 7: Write the memory system ADR**

Create `integrations/docs/memory-system-adr.md`:

```markdown
# ADR: Memory System — Single Write Target (Option B)

**Date**: 2026-03-04
**Status**: Accepted
**Scope**: All commands and skills that log stakeholder delegation entries

## Decision

`productivity:memory-management` is the single write target for stakeholder
delegation entries. Local `memory/stakeholders-log.md` is a fallback used only
when the skill is unavailable in the current session.

Commands and skills must never write to both systems in the same session.

## Rationale

The prior pattern (write to skill, then also write to local memory/) created
duplicate entries when both succeeded, and split state when one failed. The
Option B pattern (primary → fallback) preserves offline/no-skill support
while eliminating dual-write.

## Implementation

Each memory-write block in commands and skills follows this pattern:
1. Attempt `productivity:memory-management`
2. If skill succeeds → done. Do not write to `memory/`
3. If skill unavailable → write to `memory/stakeholders-log.md`
4. If both fail → surface non-blocking warning, instruct manual tracking

## Files Updated

- `commands/schedule.md` (Steps 3b, 7)
- `commands/execute.md` (Mark Done, Delegate sections)
- `commands/delegate.md` (Step 8)
- `skills/claude-eisenhower/SKILL.md` (Stakeholder Memory section)
```

**Step 8: Commit**

```bash
git add commands/schedule.md commands/execute.md commands/delegate.md \
        skills/claude-eisenhower/SKILL.md \
        integrations/docs/memory-system-adr.md
git commit -m "fix(I2): enforce Option B single-write memory pattern across all four artifacts; add ADR"
```

---

## Final Verification

**Step 1: Run the full test suite**

```bash
cd scripts && npm test
```

Expected: All tests pass (including new C2 and C4 tests from Tasks 1–2)

**Step 2: Verify gitignore is working**

```bash
git status
```

Expected: `dist/` and `*.plugin` files are not shown as tracked or modified

**Step 3: Confirm all 9 findings are addressed**

| Finding | Task | Commit keyword |
|---------|------|----------------|
| C1 — email index drift + batch gap | 5 | fix(C1,I3) |
| C2 — unguarded YAML parse | 1 | fix(C2) |
| C3 — Q4 staging inconsistency | 6 | fix(C3) |
| C4 — authority flag duplication | 2 | fix(C4) |
| I1 — build artifacts in source control | 4 | fix(I1) |
| I2 — dual memory system | 8 | fix(I2) |
| I3 — silent body-fetch error | 5 | fix(C1,I3) |
| I4 — ASCII-only lower() | 3 | fix(I4) |
| I5 — task-prioritizer four-state | 7 | fix(I5) |

**Step 4: Final commit (version bump + changelog)**

Update `.claude-plugin/plugin.json` version from `0.9.6` to `1.0.0`.

```bash
git add .claude-plugin/plugin.json
git commit -m "chore(release): bump version 0.9.6 → 1.0.0 — SME review remediation complete"
```
