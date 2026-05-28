/**
 * memory-analytics.test.ts
 *
 * Tests for `scripts/memory-analytics.ts`. Covers the analytics aggregator
 * used by `/memory show analytics` (issue #42).
 *
 * Test IDs:
 *   - MEMAN-PARSE-NNN  line parsing
 *   - MEMAN-SUM-NNN    windowed sums
 *   - MEMAN-TREND-NNN  first→last trend deltas
 *   - MEMAN-EDGE-NNN   missing/empty/malformed inputs
 *
 * Run: cd scripts && npm test -- memory-analytics
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { buildReport } from "../scripts/memory-analytics";

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "meman-"));
  fs.mkdirSync(path.join(root, "memory"));
  return root;
}

function writeLog(root: string, name: string, lines: readonly string[]): void {
  fs.writeFileSync(path.join(root, "memory", name), lines.join("\n") + "\n", "utf8");
}

afterEach(() => {
  // best-effort cleanup; tests use mkdtempSync so collisions are impossible.
});

describe("memory-analytics aggregator", () => {
  test("MEMAN-EDGE-001: all three log files missing → all keys present:false", () => {
    const root = makeWorkspace();
    const report = buildReport(root);
    expect(report.today_log.present).toBe(false);
    expect(report.plan_log.present).toBe(false);
    expect(report.review_log.present).toBe(false);
    expect(report.today_log.entry_count).toBe(0);
  });

  test("MEMAN-SUM-001: today-log sums recent_sums over the last 14 entries", () => {
    const root = makeWorkspace();
    // 16 entries — only last 14 should contribute to recent_sums.
    const lines = Array.from({ length: 16 }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return `[2026-04-${day}] day:Monday overdue:1 inbox:2 on_plate:3 completed:4`;
    });
    writeLog(root, "today-log.md", lines);

    const report = buildReport(root);
    expect(report.today_log.present).toBe(true);
    expect(report.today_log.entry_count).toBe(16);
    expect(report.today_log.recent_sums).toEqual({
      overdue: 14,
      inbox: 28,
      on_plate: 42,
      completed: 56,
    });
  });

  test("MEMAN-SUM-002: plan-log window is 4 entries", () => {
    const root = makeWorkspace();
    const lines = [
      "[2026-04-01] day:Monday committed:5 carryover:1 deferred:2",
      "[2026-04-08] day:Monday committed:6 carryover:0 deferred:1",
      "[2026-04-15] day:Monday committed:4 carryover:2 deferred:0",
      "[2026-04-22] day:Monday committed:5 carryover:1 deferred:3",
      "[2026-04-29] day:Monday committed:7 carryover:0 deferred:1",
    ];
    writeLog(root, "plan-log.md", lines);

    const report = buildReport(root);
    expect(report.plan_log.entry_count).toBe(5);
    // Last 4: committed 6+4+5+7=22, carryover 0+2+1+0=3, deferred 1+0+3+1=5
    expect(report.plan_log.recent_sums).toEqual({
      committed: 22,
      carryover: 3,
      deferred: 5,
    });
  });

  test("MEMAN-TREND-001: review-log reports first→last delta over last 4 entries", () => {
    const root = makeWorkspace();
    const lines = [
      "[2026-04-04] day:Friday inbox:3 active:5 delegated:2 overdue:1",
      "[2026-04-11] day:Friday inbox:5 active:6 delegated:4 overdue:2",
      "[2026-04-18] day:Friday inbox:6 active:7 delegated:5 overdue:1",
      "[2026-04-25] day:Friday inbox:8 active:8 delegated:6 overdue:0",
    ];
    writeLog(root, "review-log.md", lines);

    const report = buildReport(root);
    expect(report.review_log.entry_count).toBe(4);
    expect(report.review_log.recent_trend.inbox).toEqual({ first: 3, last: 8, delta: 5 });
    expect(report.review_log.recent_trend.delegated).toEqual({
      first: 2,
      last: 6,
      delta: 4,
    });
  });

  test("MEMAN-PARSE-001: malformed lines are dropped silently", () => {
    const root = makeWorkspace();
    writeLog(root, "today-log.md", [
      "[2026-04-01] day:Monday overdue:1 inbox:2 on_plate:3 completed:4",
      "this is not a log line",
      "",
      "[2026-04-02] day:Tuesday overdue:0 inbox:3 on_plate:2 completed:1",
    ]);

    const report = buildReport(root);
    expect(report.today_log.entry_count).toBe(2);
    expect(report.today_log.recent_sums.overdue).toBe(1);
  });

  test("MEMAN-EDGE-002: log file present but empty → entry_count 0, date_range null", () => {
    const root = makeWorkspace();
    fs.writeFileSync(path.join(root, "memory", "today-log.md"), "", "utf8");
    const report = buildReport(root);
    expect(report.today_log.present).toBe(true);
    expect(report.today_log.entry_count).toBe(0);
    expect(report.today_log.date_range).toBeNull();
  });
});
