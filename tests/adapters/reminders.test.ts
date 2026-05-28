/**
 * reminders.test.ts
 *
 * Mac Reminders adapter — thin wrapper around the existing AppleScripts
 * (push_reminder.applescript, complete_reminder.applescript).
 *
 * Tests mock the osascript boundary (child_process.spawnSync) so they run
 * cross-platform without invoking AppleScript.
 *
 * Test IDs:
 *   - REM-PSH-NNN push behavior
 *   - REM-CMP-NNN complete behavior
 *   - REM-MAP-NNN field mapping (priority, due_date)
 *
 * Spec: adapters/reminders.md
 * Issue: #27
 */

import type { TaskOutputRecord } from "../../scripts/adapter-types";

// Mock child_process BEFORE importing the adapter.
const spawnSyncMock = jest.fn();
jest.mock("child_process", () => ({
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

import { createRemindersAdapter } from "../../scripts/adapters/reminders";

function mockOsascript(stdout: string, status = 0): void {
  spawnSyncMock.mockReturnValueOnce({
    status,
    stdout: Buffer.from(stdout),
    stderr: Buffer.from(""),
  });
}

function sampleRecord(overrides: Partial<TaskOutputRecord> = {}): TaskOutputRecord {
  return {
    title:       "Fix deploy pipeline issue",
    description: "Investigate failing CI step on main",
    due_date:    "2026-03-02",
    quadrant:    "Q1",
    priority:    "high",
    source:      "Self",
    requester:   null,
    list_name:   "Eisenhower List",
    ...overrides,
  };
}

beforeEach(() => {
  spawnSyncMock.mockReset();
});

describe("reminders adapter — push", () => {
  test("REM-PSH-001: success result on osascript 'success:' stdout", async () => {
    mockOsascript("success: Fix deploy pipeline issue\n");
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("success");
    expect(result.reason).toBe("Created");
  });

  test("REM-PSH-002: skipped result on 'skipped:' stdout", async () => {
    mockOsascript("skipped: Fix deploy pipeline issue\n");
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("Already exists");
    expect(result.id).toBe("");
  });

  test("REM-PSH-003: error result on 'error:' stdout", async () => {
    mockOsascript("error: List 'Eisenhower' not found\n");
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("error");
    expect(result.reason).toContain("List");
    expect(result.id).toBe("");
  });

  test("REM-PSH-004: error result on non-zero exit code", async () => {
    spawnSyncMock.mockReturnValueOnce({
      status: 1,
      stdout: Buffer.from(""),
      stderr: Buffer.from("osascript failure\n"),
    });
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("error");
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

describe("reminders adapter — complete", () => {
  test("REM-CMP-001: success on osascript 'success:' stdout", async () => {
    mockOsascript("success: Fix deploy pipeline issue\n");
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.completeTask("Fix deploy pipeline issue", "Eisenhower List");

    expect(result.status).toBe("success");
  });

  test("REM-CMP-002: success (already completed) preserves marker", async () => {
    mockOsascript("success: Fix deploy pipeline issue (already completed)\n");
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.completeTask("Fix deploy pipeline issue", "Eisenhower List");

    expect(result.status).toBe("success");
    expect(result.reason.toLowerCase()).toContain("already");
  });

  test("REM-CMP-003: skipped on 'skipped:' stdout (not found)", async () => {
    mockOsascript("skipped: Unknown task — not found in 'Eisenhower List'\n");
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.completeTask("Unknown task", "Eisenhower List");

    expect(result.status).toBe("skipped");
    expect(result.reason.toLowerCase()).toContain("not found");
  });
});

describe("reminders adapter — field mapping", () => {
  test("REM-MAP-001: priority high maps to 1, medium maps to 5 on osascript args", async () => {
    mockOsascript("success: x\n");
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    await adapter.pushTask(sampleRecord({ priority: "high" }));
    const [, args] = spawnSyncMock.mock.calls[0];
    expect(args).toContain("1");
  });

  test("REM-MAP-002: priority medium passes '5' to osascript", async () => {
    mockOsascript("success: x\n");
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    await adapter.pushTask(sampleRecord({ priority: "medium" }));
    const [, args] = spawnSyncMock.mock.calls[0];
    expect(args).toContain("5");
  });

  test("REM-MAP-003: null due_date passes 'none' to osascript", async () => {
    mockOsascript("success: x\n");
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    await adapter.pushTask(sampleRecord({ due_date: null }));
    const [, args] = spawnSyncMock.mock.calls[0];
    expect(args).toContain("none");
  });

  test("REM-MAP-004: invokes push_reminder.applescript with pluginRoot prefix", async () => {
    mockOsascript("success: x\n");
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    await adapter.pushTask(sampleRecord());
    const [bin, args] = spawnSyncMock.mock.calls[0];
    expect(bin).toBe("osascript");
    expect(args[0]).toBe("/fake/root/scripts/push_reminder.applescript");
  });

  test("REM-MAP-005: invokes complete_reminder.applescript for completeTask", async () => {
    mockOsascript("success: x\n");
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    await adapter.completeTask("Some task", "Eisenhower List");
    const [bin, args] = spawnSyncMock.mock.calls[0];
    expect(bin).toBe("osascript");
    expect(args[0]).toBe("/fake/root/scripts/complete_reminder.applescript");
    expect(args).toContain("Some task");
    expect(args).toContain("Eisenhower List");
  });
});

describe("reminders adapter — name", () => {
  test("REM-001: adapter exposes name='reminders'", () => {
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });
    expect(adapter.name).toBe("reminders");
  });
});
