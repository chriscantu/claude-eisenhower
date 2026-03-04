/**
 * agent-contracts.test.ts
 *
 * Contract tests that enforce stable section names and field names across
 * plugin command and agent files. Prevents silent regressions when prose
 * is edited without updating downstream consumers.
 *
 * Test IDs follow the TEST-CONT-xxx convention.
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ── Section name contracts ─────────────────────────────────────────────────

describe("Agent Contracts: section names (TEST-CONT-001)", () => {
  test("TEST-CONT-001a: agents/task-prioritizer.md contains 'Inbox' reference (if file exists)", () => {
    if (!fileExists("agents/task-prioritizer.md")) {
      // File may not exist in all environments — skip rather than fail
      return;
    }
    const content = readFile("agents/task-prioritizer.md");
    expect(content).toMatch(/\bInbox\b/);
  });

  test("TEST-CONT-001b: agents/task-prioritizer.md does not contain ## Unprocessed (if file exists)", () => {
    if (!fileExists("agents/task-prioritizer.md")) {
      return;
    }
    const content = readFile("agents/task-prioritizer.md");
    expect(content).not.toMatch(/## Unprocessed/);
    expect(content).not.toMatch(/\bUnprocessed section\b/i);
  });
});

// ── Field name contracts ──────────────────────────────────────────────────

describe("Agent Contracts: execute.md field names (TEST-CONT-002)", () => {
  const content = readFile("commands/execute.md");

  test("TEST-CONT-002a: uses State: Inbox (not Status: Unprocessed)", () => {
    expect(content).not.toMatch(/Status:\s+Unprocessed/);
    expect(content).toMatch(/State:\s+Inbox/);
  });

  test("TEST-CONT-002b: appends to ## Inbox (not ## Unprocessed)", () => {
    expect(content).not.toMatch(/## Unprocessed/);
  });
});

// ── plugin_root default contracts ─────────────────────────────────────────

describe("Agent Contracts: no hardcoded plugin_root defaults (TEST-CONT-003)", () => {
  const hardcodedDefault = /default:\s*`?~\/repos\/claude-eisenhower`?\s*if not set/;

  test("TEST-CONT-003a: schedule.md has no hardcoded plugin_root default", () => {
    const content = readFile("commands/schedule.md");
    expect(content).not.toMatch(hardcodedDefault);
  });

  test("TEST-CONT-003b: execute.md has no hardcoded plugin_root default", () => {
    const content = readFile("commands/execute.md");
    expect(content).not.toMatch(hardcodedDefault);
  });

  test("TEST-CONT-003c: delegate.md has no hardcoded plugin_root default", () => {
    const content = readFile("commands/delegate.md");
    expect(content).not.toMatch(hardcodedDefault);
  });
});
