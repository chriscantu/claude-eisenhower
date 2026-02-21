/**
 * schedule-capacity.test.ts
 *
 * Regression suite for the Capacity Signal Review Prompt (v0.5.2).
 * Covers the pure logic added to /schedule Step 1b:
 *   - Detecting delegates with 2+ open delegations older than 5 business days
 *   - Correct business day elapsed calculation (weekend-skipping)
 *   - Edge cases: exactly at threshold, just under, aliases with mixed ages
 *
 * Test IDs follow the TEST-CAP-xxx convention (600-series = v0.5.2 capacity check).
 *
 * Run: cd scripts && npm test
 */

import { businessDaysElapsed } from "../scripts/date-helpers";

// ── Pure helper: detect stale delegates ──────────────────────────────────────

export interface ActiveDelegation {
  alias: string;
  taskTitle: string;
  scheduledDate: Date; // date the task was delegated (Scheduled: field in TASKS.md)
}

export interface StaleDelegate {
  alias: string;
  openCount: number;
  oldestDelegationDays: number; // business days since the oldest open delegation
  tasks: string[]; // task titles
}

/**
 * Given a list of open Q3 delegations, returns delegates who have:
 *   - 2 or more active delegations, AND
 *   - at least one delegation open for more than THRESHOLD business days
 *
 * Used by /schedule Step 1b to surface a capacity review prompt.
 */
export function detectStaleDelegates(
  delegations: ActiveDelegation[],
  thresholdDays = 5,
  today: Date = new Date()
): StaleDelegate[] {
  // Group by alias
  const byAlias = new Map<string, ActiveDelegation[]>();
  for (const d of delegations) {
    const existing = byAlias.get(d.alias) ?? [];
    existing.push(d);
    byAlias.set(d.alias, existing);
  }

  const stale: StaleDelegate[] = [];
  for (const [alias, tasks] of byAlias) {
    if (tasks.length < 2) continue; // must have 2+ open delegations

    const ageDays = tasks.map((t) => businessDaysElapsed(t.scheduledDate, today));
    const maxAge = Math.max(...ageDays);

    if (maxAge > thresholdDays) {
      stale.push({
        alias,
        openCount: tasks.length,
        oldestDelegationDays: maxAge,
        tasks: tasks.map((t) => t.taskTitle),
      });
    }
  }

  // Sort by oldest delegation first (most stale at top)
  return stale.sort((a, b) => b.oldestDelegationDays - a.oldestDelegationDays);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

function daysAgo(businessDays: number, from: Date = new Date()): Date {
  const result = new Date(from);
  result.setHours(0, 0, 0, 0);
  let remaining = businessDays;
  while (remaining > 0) {
    result.setDate(result.getDate() - 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return result;
}

// ── Tests: businessDaysElapsed ────────────────────────────────────────────────

describe("Capacity Signal Review — businessDaysElapsed", () => {
  // Use a fixed reference date for deterministic tests
  const monday = new Date("2026-02-23"); // Monday
  const tuesday = new Date("2026-02-24");
  const friday = new Date("2026-02-20");
  const nextMonday = new Date("2026-02-23");

  test("TEST-CAP-601: same day returns 0", () => {
    expect(businessDaysElapsed(monday, monday)).toBe(0);
  });

  test("TEST-CAP-602: Mon → Tue = 1 business day", () => {
    expect(businessDaysElapsed(monday, tuesday)).toBe(1);
  });

  test("TEST-CAP-603: Fri → Mon spans weekend, counts as 1 business day", () => {
    expect(businessDaysElapsed(friday, nextMonday)).toBe(1);
  });

  test("TEST-CAP-604: Mon → Mon+7 = 5 business days (skips one weekend)", () => {
    const start = new Date("2026-02-16"); // Monday
    const end = new Date("2026-02-23");   // Monday+7
    expect(businessDaysElapsed(start, end)).toBe(5);
  });

  test("TEST-CAP-605: end before start returns 0", () => {
    expect(businessDaysElapsed(tuesday, monday)).toBe(0);
  });

  test("TEST-CAP-606: 6 business days crosses a full week boundary", () => {
    const start = new Date("2026-02-16"); // Monday Feb 16
    const end = new Date("2026-02-24");   // Tuesday Feb 24 (+6 biz days)
    expect(businessDaysElapsed(start, end)).toBe(6);
  });
});

// ── Tests: detectStaleDelegates ───────────────────────────────────────────────

describe("Capacity Signal Review — detectStaleDelegates", () => {
  const today = new Date("2026-02-23"); // fixed reference: Monday

  test("TEST-CAP-610: delegate with 2 tasks older than 5 biz days is flagged", () => {
    const delegations: ActiveDelegation[] = [
      { alias: "Alex E.", taskTitle: "Task A", scheduledDate: daysAgo(7, today) },
      { alias: "Alex E.", taskTitle: "Task B", scheduledDate: daysAgo(6, today) },
    ];
    const result = detectStaleDelegates(delegations, 5, today);
    expect(result).toHaveLength(1);
    expect(result[0].alias).toBe("Alex E.");
    expect(result[0].openCount).toBe(2);
    expect(result[0].oldestDelegationDays).toBe(7);
    expect(result[0].tasks).toContain("Task A");
  });

  test("TEST-CAP-611: delegate with 2 tasks but only 5 biz days elapsed is NOT flagged (threshold is strictly greater than)", () => {
    const delegations: ActiveDelegation[] = [
      { alias: "Alex E.", taskTitle: "Task A", scheduledDate: daysAgo(5, today) },
      { alias: "Alex E.", taskTitle: "Task B", scheduledDate: daysAgo(3, today) },
    ];
    const result = detectStaleDelegates(delegations, 5, today);
    expect(result).toHaveLength(0);
  });

  test("TEST-CAP-612: delegate with only 1 open task is NOT flagged, regardless of age", () => {
    const delegations: ActiveDelegation[] = [
      { alias: "Jordan F.", taskTitle: "Solo Task", scheduledDate: daysAgo(10, today) },
    ];
    const result = detectStaleDelegates(delegations, 5, today);
    expect(result).toHaveLength(0);
  });

  test("TEST-CAP-613: delegate with 2 tasks where only one is old is flagged", () => {
    // One task is 6 days old (stale), one is 1 day old — should still flag
    const delegations: ActiveDelegation[] = [
      { alias: "Alex E.", taskTitle: "Old Task", scheduledDate: daysAgo(6, today) },
      { alias: "Alex E.", taskTitle: "New Task", scheduledDate: daysAgo(1, today) },
    ];
    const result = detectStaleDelegates(delegations, 5, today);
    expect(result).toHaveLength(1);
    expect(result[0].oldestDelegationDays).toBe(6);
  });

  test("TEST-CAP-614: multiple stale delegates both surfaced, sorted by oldest first", () => {
    const delegations: ActiveDelegation[] = [
      { alias: "Alex E.", taskTitle: "Task A", scheduledDate: daysAgo(8, today) },
      { alias: "Alex E.", taskTitle: "Task B", scheduledDate: daysAgo(6, today) },
      { alias: "Jordan F.", taskTitle: "Task C", scheduledDate: daysAgo(10, today) },
      { alias: "Jordan F.", taskTitle: "Task D", scheduledDate: daysAgo(7, today) },
    ];
    const result = detectStaleDelegates(delegations, 5, today);
    expect(result).toHaveLength(2);
    // Jordan F. has oldest at 10 days — should be first
    expect(result[0].alias).toBe("Jordan F.");
    expect(result[1].alias).toBe("Alex E.");
  });

  test("TEST-CAP-615: mix of stale and non-stale delegates — only stale surfaced", () => {
    const delegations: ActiveDelegation[] = [
      { alias: "Alex E.", taskTitle: "Task A", scheduledDate: daysAgo(8, today) },
      { alias: "Alex E.", taskTitle: "Task B", scheduledDate: daysAgo(7, today) },
      { alias: "Riley L.", taskTitle: "Task C", scheduledDate: daysAgo(2, today) },
      { alias: "Riley L.", taskTitle: "Task D", scheduledDate: daysAgo(1, today) },
    ];
    const result = detectStaleDelegates(delegations, 5, today);
    expect(result).toHaveLength(1);
    expect(result[0].alias).toBe("Alex E.");
  });

  test("TEST-CAP-618: threshold is configurable — custom 3-day threshold", () => {
    const delegations: ActiveDelegation[] = [
      { alias: "Alex E.", taskTitle: "Task A", scheduledDate: daysAgo(4, today) },
      { alias: "Alex E.", taskTitle: "Task B", scheduledDate: daysAgo(4, today) },
    ];
    // Default threshold 5: NOT flagged (4 < 5)
    expect(detectStaleDelegates(delegations, 5, today)).toHaveLength(0);
    // Custom threshold 3: flagged (4 > 3)
    expect(detectStaleDelegates(delegations, 3, today)).toHaveLength(1);
  });
});
