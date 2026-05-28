/**
 * reminders.test.ts
 *
 * Mac Reminders adapter — thin wrapper around the bundled AppleScripts
 * (push_reminder.applescript, complete_reminder.applescript).
 *
 * Tests mock the osascript boundary (child_process.spawnSync) so they run
 * cross-platform without invoking AppleScript.
 *
 * Test IDs:
 *   - REM-PSH-NNN push behavior
 *   - REM-CMP-NNN complete behavior
 *   - REM-MAP-NNN field mapping (priority, due_date)
 *   - REM-TMO-NNN timeout / hung-osascript behavior
 *
 * Spec: adapters/reminders.md
 * Issues: #27, #38
 */

import type { TaskOutputRecord } from "../../scripts/adapter-types";

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
    signal: null,
  });
}

function mockOsascriptTimeout(): void {
  spawnSyncMock.mockReturnValueOnce({
    status: null,
    stdout: Buffer.from(""),
    stderr: Buffer.from(""),
    signal: "SIGTERM",
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

const FAKE_ID = "x-coredata://CFE1A3F0-0000-0000-0000-000000000000/REMCDReminder/p123";

beforeEach(() => {
  spawnSyncMock.mockReset();
});

describe("reminders adapter — push", () => {
  test("REM-PSH-001: success on JSON status=success, propagates id", async () => {
    mockOsascript(`{"status":"success","title":"Fix deploy pipeline issue","id":"${FAKE_ID}"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("success");
    expect(result.reason).toBe("Created");
    expect(result.id).toBe(FAKE_ID);
  });

  test("REM-PSH-002: skipped on JSON status=skipped", async () => {
    mockOsascript(`{"status":"skipped","title":"Fix deploy pipeline issue","reason":"already_exists","id":"${FAKE_ID}"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("Already exists");
    expect(result.id).toBe(FAKE_ID);
  });

  test("REM-PSH-003: error on JSON status=error preserves reason", async () => {
    mockOsascript(`{"status":"error","title":"Fix deploy pipeline issue","reason":"list_create_failed: permission denied"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("error");
    expect(result.reason).toContain("list_create_failed");
    expect(result.id).toBe("");
  });

  test("REM-PSH-004: error on non-zero exit with no parseable stdout", async () => {
    spawnSyncMock.mockReturnValueOnce({
      status: 1,
      stdout: Buffer.from(""),
      stderr: Buffer.from("osascript failure\n"),
      signal: null,
    });
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("error");
    expect(result.reason).toContain("osascript failure");
  });

  test("REM-PSH-005: error on non-JSON stdout (malformed contract)", async () => {
    mockOsascript("not json at all\n");
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("error");
    expect(result.id).toBe("");
  });
});

describe("reminders adapter — complete", () => {
  test("REM-CMP-001: success on JSON status=success", async () => {
    mockOsascript(`{"status":"success","title":"Fix deploy pipeline issue","id":"${FAKE_ID}"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.completeTask("Fix deploy pipeline issue", "Eisenhower List");

    expect(result.status).toBe("success");
    expect(result.reason).toBe("Completed");
  });

  test("REM-CMP-002: already_completed note maps to 'Already completed' reason", async () => {
    mockOsascript(`{"status":"success","title":"Fix deploy pipeline issue","id":"${FAKE_ID}","note":"already_completed"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.completeTask("Fix deploy pipeline issue", "Eisenhower List");

    expect(result.status).toBe("success");
    expect(result.reason.toLowerCase()).toContain("already");
  });

  test("REM-CMP-003: skipped not_found surfaces reason", async () => {
    mockOsascript(`{"status":"skipped","title":"Unknown task","reason":"not_found"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.completeTask("Unknown task", "Eisenhower List");

    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("not_found");
  });

  test("REM-CMP-004: error list_not_found surfaces reason", async () => {
    mockOsascript(`{"status":"error","title":"x","reason":"list_not_found: Eisenhower"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const result = await adapter.completeTask("x", "Eisenhower");

    expect(result.status).toBe("error");
    expect(result.reason).toContain("list_not_found");
  });
});

describe("reminders adapter — timeout", () => {
  test("REM-TMO-001: push surfaces timeout when osascript killed by SIGTERM", async () => {
    mockOsascriptTimeout();
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root", timeoutMs: 500 });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("error");
    expect(result.reason).toContain("timed out");
    expect(result.id).toBe("");
  });

  test("REM-TMO-002: complete surfaces timeout when osascript killed by SIGTERM", async () => {
    mockOsascriptTimeout();
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root", timeoutMs: 500 });

    const result = await adapter.completeTask("x", "Eisenhower");

    expect(result.status).toBe("error");
    expect(result.reason).toContain("timed out");
  });

  test("REM-TMO-003: default timeout passed to spawnSync as 10_000ms", async () => {
    mockOsascript(`{"status":"success","title":"x","id":"${FAKE_ID}"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    await adapter.pushTask(sampleRecord());
    const [, , opts] = spawnSyncMock.mock.calls[0];
    expect(opts.timeout).toBe(10_000);
  });

  test("REM-TMO-004: custom timeoutMs forwarded to spawnSync", async () => {
    mockOsascript(`{"status":"success","title":"x","id":"${FAKE_ID}"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root", timeoutMs: 2_500 });

    await adapter.pushTask(sampleRecord());
    const [, , opts] = spawnSyncMock.mock.calls[0];
    expect(opts.timeout).toBe(2_500);
  });
});

describe("reminders adapter — field mapping", () => {
  test("REM-MAP-001: priority high maps to '1'", async () => {
    mockOsascript(`{"status":"success","title":"x","id":"${FAKE_ID}"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    await adapter.pushTask(sampleRecord({ priority: "high" }));
    const [, args] = spawnSyncMock.mock.calls[0];
    expect(args).toContain("1");
  });

  test("REM-MAP-002: priority medium maps to '5'", async () => {
    mockOsascript(`{"status":"success","title":"x","id":"${FAKE_ID}"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    await adapter.pushTask(sampleRecord({ priority: "medium" }));
    const [, args] = spawnSyncMock.mock.calls[0];
    expect(args).toContain("5");
  });

  test("REM-MAP-003: null due_date maps to 'none'", async () => {
    mockOsascript(`{"status":"success","title":"x","id":"${FAKE_ID}"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    await adapter.pushTask(sampleRecord({ due_date: null }));
    const [, args] = spawnSyncMock.mock.calls[0];
    expect(args).toContain("none");
  });

  test("REM-MAP-004: invokes push_reminder.applescript with pluginRoot prefix", async () => {
    mockOsascript(`{"status":"success","title":"x","id":"${FAKE_ID}"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    await adapter.pushTask(sampleRecord());
    const [bin, args] = spawnSyncMock.mock.calls[0];
    expect(bin).toBe("osascript");
    expect(args[0]).toBe("/fake/root/scripts/push_reminder.applescript");
  });

  test("REM-MAP-005: invokes complete_reminder.applescript", async () => {
    mockOsascript(`{"status":"success","title":"x","id":"${FAKE_ID}"}\n`);
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
