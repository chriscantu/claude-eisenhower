/**
 * session-briefing.golden.test.ts
 *
 * Tier 1 — golden-file (snapshot) tests for the SessionStart briefing.
 *
 * Issue #37 calls for "feed a known TASKS.md to the SessionStart hook prompt
 * via a test harness, snapshot the output." This file does exactly that:
 * three frozen TASKS.md fixtures under `fixtures/` feed `renderBriefing` at a
 * frozen "today" date, and the full rendered text is asserted with jest
 * snapshots.
 *
 * Why snapshots:
 *   - Render output is multi-line prose; assertion-per-line tests would be
 *     tedious AND would not flag accidental whitespace / phrasing drift.
 *   - Snapshots are reviewed in PR diffs — any change to wording, ordering,
 *     or which sections fire shows up as a structured diff against the
 *     committed `.snap` file.
 *
 * Frozen "today":
 *   2026-02-26T00:00:00Z. Picked so the `overdue-checkins.md` fixture is
 *   meaningfully overdue (Feb-12 / Feb-18) and `active-delegated-mixed.md`
 *   has at least one active task scheduled for today.
 *
 * Bar (per issue #37): if `parseTasks` stops recognizing the four-state
 * section names (Inbox / Active / Delegated / Done), the
 * `active-delegated-mixed` and `overdue-checkins` snapshots immediately
 * mismatch — the rendered briefing collapses to the empty-state path.
 */

import * as fs from "fs";
import * as path from "path";

import { parseTasks } from "../../scripts/tasks-parser";
import { renderBriefing } from "../../scripts/briefing-render";

const FIXTURES_DIR = path.join(__dirname, "fixtures");
const TODAY = new Date("2026-02-26T00:00:00Z");

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

function renderFromFixture(name: string): string {
  const md = loadFixture(name);
  const parsed = parseTasks(md);
  const result = renderBriefing(parsed, TODAY, "full");
  // Snapshot the rendered text and the trigger/counts envelope so callers
  // catch both wording drift AND envelope drift.
  return [
    `─── text ───`,
    result.text,
    `─── envelope ───`,
    `suggestedAction: ${result.suggestedAction}`,
    `triggered: ${result.triggered}`,
    `counts: inbox=${result.counts.inbox} active=${result.counts.active} delegated=${result.counts.delegated} done=${result.counts.done}`,
  ].join("\n");
}

describe("session-briefing golden snapshots (GOLDEN-SB)", () => {
  test("GOLDEN-SB-001: empty board renders the no-task path", () => {
    expect(renderFromFixture("empty-board.md")).toMatchSnapshot();
  });

  test("GOLDEN-SB-002: mixed Active + Delegated + Done board", () => {
    expect(renderFromFixture("active-delegated-mixed.md")).toMatchSnapshot();
  });

  test("GOLDEN-SB-003: multiple overdue Q3 check-ins surface in briefing", () => {
    expect(renderFromFixture("overdue-checkins.md")).toMatchSnapshot();
  });
});
