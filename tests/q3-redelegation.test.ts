/**
 * q3-redelegation.test.ts
 *
 * Regression for the silent-orphan bug fixed in issue #36.
 *
 * Bug shape (pre-fix):
 *   1. /schedule pushes Q3 task as "Check in: alex re: API contract review"
 *      → Reminder created in macOS Reminders with that exact title.
 *   2. /execute re-delegates the task; TASKS.md Owner becomes 'jordan' and the
 *      title becomes "Check in: jordan re: API contract review".
 *   3. /execute done later → lookup uses the NEW title → AppleScript returns
 *      "skipped: not found" → the original "Check in: alex re: ..." reminder
 *      is orphaned forever, and TASKS.md silently writes a misleading
 *      `Synced: skipped` line.
 *
 * Fix (issue #36):
 *   - push_reminder.applescript returns the Reminder id (x-coredata URI).
 *   - schedule.md / delegate.md persist it as `Reminder-id:` on the task record.
 *   - complete_reminder.applescript accepts the id as a 3rd argv and looks the
 *     reminder up by id first, falling back to title.
 *   - execute.md forwards `Reminder-id` to the dispatcher, so the original
 *     Reminder is closed even though the title changed mid-flight.
 *
 * This test exercises the adapter contract end-to-end via mocked osascript:
 * push → record id → re-delegate (change title) → complete with stored id →
 * assert AppleScript received the id and reported `matched_by: id`.
 */

import type { TaskOutputRecord } from "../scripts/adapter-types";

const spawnSyncMock = jest.fn();
jest.mock("child_process", () => ({
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

import { createRemindersAdapter } from "../scripts/adapters/reminders";

function mockOsascript(stdout: string, status = 0): void {
  spawnSyncMock.mockReturnValueOnce({
    status,
    stdout: Buffer.from(stdout),
    stderr: Buffer.from(""),
    signal: null,
  });
}

function q3Record(overrides: Partial<TaskOutputRecord> = {}): TaskOutputRecord {
  return {
    title:       "Check in: alex re: API contract review",
    description: "Quarterly API contract review delegated to Alex.",
    due_date:    "2026-03-10",
    quadrant:    "Q3",
    priority:    "medium",
    source:      "Conversation",
    requester:   "self",
    list_name:   "Eisenhower List",
    ...overrides,
  };
}

const ORIGINAL_ID = "x-coredata://AB-CD-EF/REMCDReminder/p7777";

beforeEach(() => {
  spawnSyncMock.mockReset();
});

describe("Q3 re-delegation regression (issue #36)", () => {
  test("Q3RD-001: push captures Reminder-id; complete uses it after title change", async () => {
    // ── 1. Push the initial Q3 reminder. AppleScript returns the new id. ──
    mockOsascript(`{"status":"success","title":"Check in: alex re: API contract review","id":"${ORIGINAL_ID}"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const pushResult = await adapter.pushTask(q3Record());

    expect(pushResult.status).toBe("success");
    expect(pushResult.id).toBe(ORIGINAL_ID);

    // ── 2. Simulate /execute re-delegation: the task's Check-in title in
    //       TASKS.md changes from alex → jordan. The Reminder in macOS still
    //       has the old title (Reminders.app does NOT auto-rename — the
    //       silent-orphan bug). The stored Reminder-id is what binds the
    //       record to the right Reminder. ──
    const newTitle = "Check in: jordan re: API contract review";
    const storedReminderId = pushResult.id;

    // AppleScript will receive the new title BUT also the id; it matches by
    // id and reports matched_by: "id". This is the fix.
    mockOsascript(`{"status":"success","title":"${newTitle}","id":"${ORIGINAL_ID}","matched_by":"id"}\n`);

    const completeResult = await adapter.completeTask(
      newTitle,
      "Eisenhower List",
      storedReminderId
    );

    expect(completeResult.status).toBe("success");
    expect(completeResult.reason).toBe("Completed");

    // The adapter forwarded the id as the 4th positional osascript arg
    // (after scriptPath, title, list_name).
    const [, args] = spawnSyncMock.mock.calls[1];
    expect(args[1]).toBe(newTitle);
    expect(args[2]).toBe("Eisenhower List");
    expect(args[3]).toBe(ORIGINAL_ID);
  });

  test("Q3RD-002: complete without Reminder-id falls back to title-only lookup", async () => {
    // Legacy task records (created before #36 landed) have no Reminder-id
    // field. The adapter should pass empty string and let the AppleScript
    // perform title-only matching. This guards backward compatibility.
    mockOsascript(`{"status":"success","title":"Check in: alex re: API contract review","id":"${ORIGINAL_ID}","matched_by":"title"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const completeResult = await adapter.completeTask(
      "Check in: alex re: API contract review",
      "Eisenhower List"
    );

    expect(completeResult.status).toBe("success");

    const [, args] = spawnSyncMock.mock.calls[0];
    expect(args[3]).toBe("");
  });

  test("Q3RD-003: stale Reminder-id (deleted reminder) still surfaces not_found via title fallback", async () => {
    // If the user manually deleted the Reminder out-of-band, the id no
    // longer matches anything; AppleScript also fails the title fallback
    // and returns not_found. The adapter surfaces this as `skipped` so the
    // user sees a clear message instead of a hung sync.
    mockOsascript(`{"status":"skipped","title":"Check in: alex re: API contract review","reason":"not_found"}\n`);
    const adapter = createRemindersAdapter({ pluginRoot: "/fake/root" });

    const completeResult = await adapter.completeTask(
      "Check in: alex re: API contract review",
      "Eisenhower List",
      ORIGINAL_ID
    );

    expect(completeResult.status).toBe("skipped");
    expect(completeResult.reason).toContain("not_found");
  });
});
