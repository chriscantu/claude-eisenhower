# SessionStart Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the SessionStart prompt hook to output a structured briefing with task-level detail, business day math, icon-coded urgency signals, and a suggested next action.

**Architecture:** Pure prompt rewrite in `hooks/hooks.json` — no new files, no scripts, no platform dependencies. The enhanced prompt instructs Claude to parse TASKS.md sections, compute overdue items using business day math, and format a multi-line briefing. Tests validate the hook structure and add pure-function coverage for business day overdue logic.

**Tech Stack:** Markdown prompt (hooks/hooks.json), Jest + TypeScript (tests/)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `hooks/hooks.json` | Modify | Rewrite SessionStart prompt with structured briefing logic |
| `scripts/date-helpers.ts` | Modify | Add `businessDaysOverdue(scheduledDate, today)` helper and `weekOfOverdueDate(mondayStr)` helper |
| `tests/session-start.test.ts` | Create | Contract tests for hook structure + unit tests for overdue logic |
| `docs/STRUCTURE.md` | Modify | Register `session-start-enhancement-spec.md` in specs listing |
| `docs/PRINCIPLES.md` | No change | SessionStart is already listed; no new command added |
| `CHANGELOG.md` | Modify | Add v1.8.0 entry |

---

### Task 1: Business day overdue helpers

Add two pure functions to `scripts/date-helpers.ts` that compute overdue business days for both `YYYY-MM-DD` and `week of YYYY-MM-DD` scheduled dates. These will be tested in Task 2 and referenced by the prompt instructions (as the canonical algorithm the prompt should replicate).

**Files:**
- Modify: `scripts/date-helpers.ts`

- [ ] **Step 1: Read the existing date-helpers.ts**

Read `scripts/date-helpers.ts` to understand the existing functions and code style. The file currently exports `addBusinessDays`, `addBusinessDaysStr`, and `businessDaysElapsed`.

- [ ] **Step 2: Add `weekOfFriday` helper**

Append this function to `scripts/date-helpers.ts`:

```typescript
/**
 * Given a "week of YYYY-MM-DD" Monday date string, returns the Friday of that
 * week as a Date. A task scheduled with "week of" is overdue only after this
 * Friday has passed.
 *
 * Example: weekOfFriday("2026-03-23") → Date for 2026-03-27 (Friday)
 */
export function weekOfFriday(mondayStr: string): Date {
  const monday = new Date(mondayStr + "T00:00:00Z");
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  return friday;
}
```

- [ ] **Step 3: Add `businessDaysOverdue` helper**

Append this function to `scripts/date-helpers.ts`:

```typescript
/**
 * Returns the number of business days a task is overdue given its scheduled
 * date and today's date. Returns 0 if the task is not overdue (scheduled date
 * is today or in the future, or today is a weekend and the scheduled date was
 * the preceding Friday).
 *
 * For "week of" dates: pass the Saturday after that week's Friday as the
 * start date (use weekOfFriday() + 1 day), since the task is not overdue
 * until the week has fully passed.
 *
 * @param scheduledDate - The date the task was due (or the day after the week ended)
 * @param today - Today's date
 * @returns Number of business days overdue (0 = not overdue)
 */
export function businessDaysOverdue(scheduledDate: Date, today: Date): number {
  // The task becomes overdue on the first business day after scheduledDate.
  // businessDaysElapsed counts business days from scheduledDate (inclusive) to today (exclusive).
  // So a task scheduled for Friday checked on Monday: elapsed = 1 (Friday itself), which is correct.
  return businessDaysElapsed(scheduledDate, today);
}
```

- [ ] **Step 4: Run tests to verify nothing broke**

Run: `cd /Users/chris.cantu/repos/claude-eisenhower/scripts && npx jest --no-coverage --ci`
Expected: All existing tests pass (no regressions).

- [ ] **Step 5: Commit**

```
git add scripts/date-helpers.ts
git commit -m "feat(date-helpers): add weekOfFriday and businessDaysOverdue helpers

Business day overdue computation for SessionStart enhancement (P5).
weekOfFriday converts 'week of' Monday to that week's Friday.
businessDaysOverdue wraps businessDaysElapsed for overdue use case."
```

---

### Task 2: Tests for overdue helpers and hook contract

Write tests that cover the new `weekOfFriday` and `businessDaysOverdue` functions, plus structural contract tests for the hook JSON.

**Files:**
- Create: `tests/session-start.test.ts`

- [ ] **Step 1: Create test file with imports and constants**

Create `tests/session-start.test.ts`:

```typescript
/**
 * session-start.test.ts
 *
 * Tests for the P5 SessionStart enhancement:
 * 1. Hook contract tests — structural validation of hooks/hooks.json
 * 2. Business day overdue logic — weekOfFriday and businessDaysOverdue
 *
 * Spec: docs/specs/session-start-enhancement-spec.md
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";
import { weekOfFriday, businessDaysOverdue, businessDaysElapsed } from "../scripts/date-helpers";

const ROOT = path.resolve(__dirname, "..");

function readJSON(relPath: string): any {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8"));
}

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function utcDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z");
}
```

- [ ] **Step 2: Add hook contract tests**

Append to `tests/session-start.test.ts`:

```typescript
// ── Hook contract tests ──────────────────────────────────────────────────────

describe("SessionStart hook contract (SS-CONT)", () => {
  const hooks = readJSON("hooks/hooks.json");
  const sessionStart = hooks.SessionStart;

  test("SS-CONT-001: SessionStart hook exists and has exactly one entry", () => {
    expect(sessionStart).toBeDefined();
    expect(sessionStart).toHaveLength(1);
  });

  test("SS-CONT-002: hook is type 'prompt' (not 'command')", () => {
    expect(sessionStart[0].hooks[0].type).toBe("prompt");
  });

  test("SS-CONT-003: hook timeout is 15 seconds", () => {
    expect(sessionStart[0].hooks[0].timeout).toBe(15);
  });

  const prompt = sessionStart[0].hooks[0].prompt;

  test("SS-CONT-004: prompt mentions TASKS.md", () => {
    expect(prompt).toContain("TASKS.md");
  });

  test("SS-CONT-005: prompt mentions all four task states", () => {
    expect(prompt).toContain("Inbox");
    expect(prompt).toContain("Active");
    expect(prompt).toContain("Delegated");
    expect(prompt).toContain("Done");
  });

  test("SS-CONT-006: prompt contains overdue active task instructions", () => {
    expect(prompt).toMatch(/overdue/i);
    expect(prompt).toMatch(/Scheduled/);
  });

  test("SS-CONT-007: prompt contains check-in instructions", () => {
    expect(prompt).toMatch(/Check-by/);
  });

  test("SS-CONT-008: prompt contains business day math instructions", () => {
    expect(prompt).toMatch(/business day/i);
  });

  test("SS-CONT-009: prompt contains icon indicators", () => {
    expect(prompt).toContain("🔴");
    expect(prompt).toContain("🟡");
    expect(prompt).toContain("📥");
    expect(prompt).toContain("💤");
    expect(prompt).toContain("💡");
  });

  test("SS-CONT-010: prompt contains quiet mode instruction", () => {
    expect(prompt).toMatch(/quiet/i);
  });

  test("SS-CONT-011: prompt contains 'week of' handling", () => {
    expect(prompt).toMatch(/week of/);
  });

  test("SS-CONT-012: prompt does not contain write instructions (read-only)", () => {
    // Hook should never instruct Claude to write/edit TASKS.md
    expect(prompt).not.toMatch(/[Ww]rite to TASKS\.md/);
    expect(prompt).not.toMatch(/[Ee]dit TASKS\.md/);
    expect(prompt).not.toMatch(/[Uu]pdate TASKS\.md/);
  });

  test("SS-CONT-013: prompt contains inbox threshold of 5", () => {
    expect(prompt).toMatch(/5/);
    expect(prompt).toMatch(/[Ii]nbox/);
  });

  test("SS-CONT-014: prompt contains staleness signal (5 business days)", () => {
    expect(prompt).toMatch(/5 business days/);
  });

  test("SS-CONT-015: prompt contains suggested next action logic", () => {
    expect(prompt).toMatch(/[Ss]uggest/);
  });
});
```

- [ ] **Step 3: Add weekOfFriday tests**

Append to `tests/session-start.test.ts`:

```typescript
// ── weekOfFriday tests ───────────────────────────────────────────────────────

describe("weekOfFriday (SS-WOF)", () => {
  test("SS-WOF-001: Monday 2026-03-23 → Friday 2026-03-27", () => {
    const friday = weekOfFriday("2026-03-23");
    expect(friday.toISOString().split("T")[0]).toBe("2026-03-27");
  });

  test("SS-WOF-002: Monday 2026-03-30 → Friday 2026-04-03", () => {
    const friday = weekOfFriday("2026-03-30");
    expect(friday.toISOString().split("T")[0]).toBe("2026-04-03");
  });

  test("SS-WOF-003: Monday 2026-01-05 → Friday 2026-01-09", () => {
    const friday = weekOfFriday("2026-01-05");
    expect(friday.toISOString().split("T")[0]).toBe("2026-01-09");
  });

  test("SS-WOF-004: handles month boundary (Monday 2026-02-23 → Friday 2026-02-27)", () => {
    const friday = weekOfFriday("2026-02-23");
    expect(friday.toISOString().split("T")[0]).toBe("2026-02-27");
  });
});
```

- [ ] **Step 4: Add businessDaysOverdue tests**

Append to `tests/session-start.test.ts`:

```typescript
// ── businessDaysOverdue tests ────────────────────────────────────────────────

describe("businessDaysOverdue (SS-BDO)", () => {
  test("SS-BDO-001: task scheduled Friday, checked Monday → 1 business day overdue", () => {
    const scheduled = utcDate("2026-03-20"); // Friday
    const today = utcDate("2026-03-23");     // Monday
    expect(businessDaysOverdue(scheduled, today)).toBe(1);
  });

  test("SS-BDO-002: task scheduled Thursday, checked Monday → 2 business days overdue", () => {
    const scheduled = utcDate("2026-03-19"); // Thursday
    const today = utcDate("2026-03-23");     // Monday
    expect(businessDaysOverdue(scheduled, today)).toBe(2);
  });

  test("SS-BDO-003: task scheduled Monday, checked same Monday → 0 (not overdue)", () => {
    const scheduled = utcDate("2026-03-23"); // Monday
    const today = utcDate("2026-03-23");     // Same Monday
    expect(businessDaysOverdue(scheduled, today)).toBe(0);
  });

  test("SS-BDO-004: task scheduled Friday, checked Saturday → 0 (weekend, not yet overdue)", () => {
    const scheduled = utcDate("2026-03-20"); // Friday
    const today = utcDate("2026-03-21");     // Saturday
    expect(businessDaysOverdue(scheduled, today)).toBe(0);
  });

  test("SS-BDO-005: task scheduled Friday, checked Sunday → 0 (weekend, not yet overdue)", () => {
    const scheduled = utcDate("2026-03-20"); // Friday
    const today = utcDate("2026-03-22");     // Sunday
    expect(businessDaysOverdue(scheduled, today)).toBe(0);
  });

  test("SS-BDO-006: task scheduled Monday, checked Friday same week → 4 business days overdue", () => {
    const scheduled = utcDate("2026-03-16"); // Monday
    const today = utcDate("2026-03-20");     // Friday
    expect(businessDaysOverdue(scheduled, today)).toBe(4);
  });

  test("SS-BDO-007: task scheduled future date → 0 (not overdue)", () => {
    const scheduled = utcDate("2026-03-25"); // Wednesday future
    const today = utcDate("2026-03-23");     // Monday
    expect(businessDaysOverdue(scheduled, today)).toBe(0);
  });
});
```

- [ ] **Step 5: Add week-of overdue integration tests**

Append to `tests/session-start.test.ts`:

```typescript
// ── week-of overdue integration tests ────────────────────────────────────────

describe("week-of overdue detection (SS-WKOF)", () => {
  test("SS-WKOF-001: 'week of 2026-03-23' is NOT overdue on Friday 2026-03-27", () => {
    // The week hasn't fully passed yet — Friday is the last day of that week
    const friday = weekOfFriday("2026-03-23");
    // To check overdue, we compute from the day after Friday (Saturday)
    const saturday = new Date(friday);
    saturday.setUTCDate(friday.getUTCDate() + 1); // Saturday 2026-03-28
    const today = utcDate("2026-03-27"); // Friday
    expect(businessDaysOverdue(saturday, today)).toBe(0);
  });

  test("SS-WKOF-002: 'week of 2026-03-23' is NOT overdue on Saturday 2026-03-28", () => {
    const friday = weekOfFriday("2026-03-23");
    const saturday = new Date(friday);
    saturday.setUTCDate(friday.getUTCDate() + 1);
    const today = utcDate("2026-03-28"); // Saturday
    expect(businessDaysOverdue(saturday, today)).toBe(0);
  });

  test("SS-WKOF-003: 'week of 2026-03-23' IS overdue on Monday 2026-03-30 (1 biz day)", () => {
    const friday = weekOfFriday("2026-03-23");
    const saturday = new Date(friday);
    saturday.setUTCDate(friday.getUTCDate() + 1);
    const today = utcDate("2026-03-30"); // Monday
    expect(businessDaysOverdue(saturday, today)).toBe(1);
  });

  test("SS-WKOF-004: 'week of 2026-03-23' is 3 biz days overdue on Wednesday 2026-04-01", () => {
    const friday = weekOfFriday("2026-03-23");
    const saturday = new Date(friday);
    saturday.setUTCDate(friday.getUTCDate() + 1);
    const today = utcDate("2026-04-01"); // Wednesday
    expect(businessDaysOverdue(saturday, today)).toBe(3);
  });
});
```

- [ ] **Step 6: Run tests to verify all pass**

Run: `cd /Users/chris.cantu/repos/claude-eisenhower/scripts && npx jest --no-coverage --ci`
Expected: All new tests FAIL (hook contract tests fail because the prompt hasn't been updated yet, and that's expected). The `weekOfFriday` and `businessDaysOverdue` tests should PASS.

Note: The hook contract tests (SS-CONT-008 through SS-CONT-015) will fail at this point because the hooks.json prompt hasn't been updated yet. That's correct — they'll pass after Task 3.

- [ ] **Step 7: Commit**

```
git add tests/session-start.test.ts
git commit -m "test(session-start): add hook contract and overdue logic tests

SS-CONT-001–015: hook structure contracts (will pass after prompt rewrite)
SS-WOF-001–004: weekOfFriday computation
SS-BDO-001–007: businessDaysOverdue with weekend handling
SS-WKOF-001–004: week-of overdue integration tests"
```

---

### Task 3: Rewrite the SessionStart prompt

Replace the existing single-line summary prompt in `hooks/hooks.json` with the structured briefing prompt defined in the spec.

**Files:**
- Modify: `hooks/hooks.json`

- [ ] **Step 1: Read current hooks.json**

Read `hooks/hooks.json` to see the current structure. The file has two top-level keys: `SessionStart` and `PostToolUse`. Only the `SessionStart` prompt needs to change. The `PostToolUse` hook must remain untouched.

- [ ] **Step 2: Replace the SessionStart prompt**

Replace the `prompt` value in `hooks/hooks.json` → `SessionStart[0].hooks[0].prompt` with the following. Keep `type: "prompt"` and `timeout: 15` unchanged. Keep the entire `PostToolUse` block unchanged.

The new prompt value (this is the JSON string value — escape newlines as `\n` and quotes as `\"`):

```
At the start of this session, check if TASKS.md exists at the root of the user's mounted workspace folder. If it does not exist, say nothing — the user has not started the task board yet.

If it exists, produce a structured briefing following these steps:

## Step 1: Count tasks by state

Count tasks under each section: ## Inbox, ## Active, ## Delegated, ## Done.
Output as the first line: "Task Board: [N] Inbox, [N] Active, [N] Delegated, [N] Done"

## Step 2: Identify overdue Active tasks

Use today's date from your session context (currentDate field).

Scan the ## Active section for tasks with a Scheduled: field. For each:
- If the value is a date (YYYY-MM-DD): the task is overdue if that date is strictly before today.
- If the value starts with "week of " followed by a date (YYYY-MM-DD): compute the Friday of that week (the Monday date + 4 calendar days). The task is overdue only if today is after that Friday AND today is a business day (Monday–Friday). If today is the Saturday or Sunday after that Friday, the task is NOT yet overdue.
- If the value is neither format: skip the task and increment an unparseable date counter.
- If there is no Scheduled: field: skip (not overdue, just unscheduled).

IMPORTANT: If a task is in the ## Delegated section and has BOTH a Check-by date that is due/overdue AND a Scheduled date that is overdue, show it ONLY in the Delegation Check-ins section (Step 3). Do not duplicate it in the overdue section.

For each overdue task, compute business days overdue:
- Count only Monday–Friday days between the scheduled date and today.
- A task scheduled Friday and checked Monday = 1 business day overdue.
- A task scheduled Friday and checked Saturday or Sunday = 0 business days overdue (not yet overdue on weekends).
- For "week of" tasks: count business days from the Monday after that week's Friday.

If any overdue Active tasks exist, output a section:
"🔴 Overdue Active Tasks"
List each task as: "  - {Title} (scheduled {date}, {N} business days overdue)"
Sort most overdue first (highest N at top).

## Step 3: Identify delegation check-ins due

Scan the ## Delegated section for tasks with a Check-by: date that is today or earlier.
- Skip tasks with no Check-by: field.
- If Check-by value is not a valid YYYY-MM-DD: skip and increment unparseable counter.

For overdue check-ins (Check-by strictly before today), compute business days overdue using the same business day math as Step 2.

If any check-ins are due, output a section:
"🟡 Delegation Check-ins Due"
List each as:
- If Check-by is today: "  - {Owner} — {Title} (check-by {date})"
- If Check-by is past: "  - {Owner} — {Title} (check-by {date}, {N} business days overdue)"
Sort overdue items first (most overdue at top), then due-today items.

## Step 4: Inbox gate alert

Count the number of tasks in the ## Inbox section.
If the count is 5 or more, output:
"📥 Inbox has {N} items — consider running /intake before diving in."

## Step 5: Staleness signal

Check the ## Done section. If it has any tasks:
- Scan for Done: date fields (YYYY-MM-DD format).
- If NO task in Done has a Done: date within the last 5 business days (counting back from today), output:
  "💤 No tasks completed in the last 5 business days — board may need attention."
- If the Done section is empty (no tasks at all), skip this check entirely.

## Step 6: Suggested next action

If ANY of the above sections (overdue, check-ins, inbox alert, staleness) were triggered, output exactly one suggestion — the highest priority one:

Priority order:
1. If overdue check-ins exist: "💡 Suggested: Reach out to {owner} about {title}" (use the most overdue check-in)
2. If overdue active tasks exist: "💡 Suggested: Consider rescheduling overdue tasks with /schedule"
3. If inbox alert was triggered: "💡 Suggested: Run /intake to process inbox"
4. If staleness was triggered: "💡 Suggested: Review board — nothing completed recently"

## Step 7: Quiet mode

If NONE of the conditional sections (Steps 2–6) produced output, display ONLY the Task Board counts line from Step 1. Do not add any "all clear" or explanatory text.

## Step 8: Unparseable dates

If any tasks were skipped due to unparseable date values, append at the end:
"Note: {N} task(s) have unparseable date values."

## Important rules

- This hook is READ-ONLY. Never write to, edit, or update TASKS.md or any other file.
- Use business day math (Monday–Friday only) for ALL "days overdue" calculations.
- Output the briefing directly. Do not wrap in code blocks or add commentary.
```

Write the full `hooks/hooks.json` with this new prompt value, preserving the PostToolUse hook exactly as-is.

- [ ] **Step 3: Validate JSON is well-formed**

Run: `cd /Users/chris.cantu/repos/claude-eisenhower && python3 -c "import json; json.load(open('hooks/hooks.json')); print('Valid JSON')"`
Expected: `Valid JSON`

- [ ] **Step 4: Run all tests**

Run: `cd /Users/chris.cantu/repos/claude-eisenhower/scripts && npx jest --no-coverage --ci`
Expected: ALL tests pass, including the new SS-CONT contract tests.

- [ ] **Step 5: Commit**

```
git add hooks/hooks.json
git commit -m "feat(session-start): rewrite prompt with structured briefing (P5)

Replace single-line summary with multi-line briefing:
- 🔴 Overdue Active Tasks (with titles, business days overdue)
- 🟡 Delegation Check-ins Due (with owner, title, dates)
- 📥 Inbox gate alert (≥5 items)
- 💤 Staleness signal (no completions in 5 business days)
- 💡 Suggested next action (priority-ordered)
- Quiet mode when nothing actionable
- Business day math for all overdue calculations
- 'week of' scheduled date handling

Spec: docs/specs/session-start-enhancement-spec.md"
```

---

### Task 4: Documentation updates

Update STRUCTURE.md to register the new spec and plan, and add a CHANGELOG entry for v1.8.0.

**Files:**
- Modify: `docs/STRUCTURE.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Read current STRUCTURE.md specs section**

Read `docs/STRUCTURE.md` and locate the `specs/` listing (around lines 181–203).

- [ ] **Step 2: Add session-start-enhancement-spec.md to specs listing**

In the `specs/` section of `docs/STRUCTURE.md`, add this line in alphabetical position (after `review-week-spec.md` and before `setup-spec.md`, or at the end of the non-date-prefixed specs):

```
    session-start-enhancement-spec.md  -- SessionStart structured briefing enhancement (P5)
```

- [ ] **Step 3: Add plan to superpowers/plans listing**

In the `superpowers/plans/` section, add:

```
    2026-03-27-session-start-enhancement.md
```

- [ ] **Step 4: Read current CHANGELOG.md header**

Read `CHANGELOG.md` lines 1–35 to see the latest entry format.

- [ ] **Step 5: Add v1.8.0 CHANGELOG entry**

Add a new entry at the top of the changelog (after the header, before the v1.7.0 entry):

```markdown
## [v1.8.0] — 2026-03-27 — SessionStart Structured Briefing (P5)

Enhanced SessionStart hook with a structured briefing that surfaces specific
items needing attention, replacing the generic count-only one-liner.

**SessionStart briefing:**
- 🔴 Overdue Active Tasks — lists titles with scheduled dates and business days overdue
- 🟡 Delegation Check-ins Due — lists owner, title, and check-by dates
- 📥 Inbox gate alert when ≥ 5 items in Inbox
- 💤 Staleness signal when no tasks completed in 5 business days
- 💡 Suggested next action (priority: check-ins > overdue > inbox > staleness)
- Quiet mode — only counts line when nothing actionable
- Business day math for all overdue calculations (excludes weekends)
- Handles `Scheduled: week of YYYY-MM-DD` (overdue after Friday of that week)

Spec: `docs/specs/session-start-enhancement-spec.md`

**Other changes:**
- `scripts/date-helpers.ts`: added `weekOfFriday()` and `businessDaysOverdue()` helpers
- `tests/session-start.test.ts`: 26 new tests (hook contracts + overdue logic)

---
```

- [ ] **Step 6: Run all tests one final time**

Run: `cd /Users/chris.cantu/repos/claude-eisenhower/scripts && npx jest --no-coverage --ci`
Expected: ALL tests pass.

- [ ] **Step 7: Commit**

```
git add docs/STRUCTURE.md CHANGELOG.md
git commit -m "docs: register P5 spec/plan in STRUCTURE.md, add v1.8.0 CHANGELOG

SessionStart structured briefing enhancement documentation."
```
