/**
 * push_reminder.test.ts — integration suite (opt-in)
 *
 * Tier 2 per issue #37. Drives the real bundled AppleScripts through the
 * Reminders adapter against a disposable Reminders.app list on macOS. Skipped
 * by default; runs only when `RUN_INTEGRATION=1` is set.
 *
 * Coverage:
 *   - push_reminder.applescript emits parseable JSON with a non-empty id
 *   - dedup path returns `skipped` with the existing reminder's id
 *   - complete_reminder.applescript closes the reminder by id (issue #36),
 *     even after the reminder's title has been changed out-of-band
 *   - The disposable list and any orphaned reminders are cleaned up at the
 *     end of the suite (best-effort)
 *
 * Why not always-on:
 *   - macOS-only (osascript)
 *   - Mutates real Reminders.app state
 *   - Slow (per-call ~0.5-2s)
 *
 * See tests/integration/README.md for the env-var contract and rationale.
 */

import { spawnSync } from "child_process";
import * as path from "path";

import { createRemindersAdapter } from "../../scripts/adapters/reminders";
import type { TaskOutputRecord } from "../../scripts/adapter-types";

const RUN = process.env.RUN_INTEGRATION === "1";
const runOrSkip = RUN ? describe : describe.skip;

const PLUGIN_ROOT = path.resolve(__dirname, "..", "..");
const TEST_LIST = `Eisenhower Integration Test ${process.pid}-${Date.now()}`;

function osascriptCleanupList(list: string): void {
  // Best-effort: delete the disposable list. Ignore errors — the test list
  // may already be gone if a case threw before reaching cleanup.
  spawnSync(
    "osascript",
    [
      "-e",
      `tell application "Reminders"
         try
           delete (first list whose name is "${list}")
         end try
       end tell`,
    ],
    { encoding: "utf-8", timeout: 10_000 }
  );
}

function sampleRecord(overrides: Partial<TaskOutputRecord> = {}): TaskOutputRecord {
  return {
    title:       "Integration test reminder",
    description: "Created by tests/integration/push_reminder.test.ts",
    due_date:    null,
    quadrant:    "Q2",
    priority:    "medium",
    source:      "Self",
    requester:   null,
    list_name:   TEST_LIST,
    ...overrides,
  };
}

runOrSkip("push_reminder + complete_reminder against real Reminders.app (INT-REM)", () => {
  afterAll(() => {
    osascriptCleanupList(TEST_LIST);
  });

  test("INT-REM-001: push then complete by id round-trips against the live AppleScripts", async () => {
    const adapter = createRemindersAdapter({ pluginRoot: PLUGIN_ROOT });

    const push = await adapter.pushTask(sampleRecord());
    expect(push.status).toBe("success");
    expect(push.id).toMatch(/^x-coredata:\/\//);

    const dedup = await adapter.pushTask(sampleRecord());
    expect(dedup.status).toBe("skipped");
    // Dedup path returns the existing reminder's id so callers can persist
    // it on the Already-existed branch.
    expect(dedup.id).toBe(push.id);

    const complete = await adapter.completeTask(
      sampleRecord().title,
      TEST_LIST,
      push.id
    );
    expect(complete.status).toBe("success");
    expect(complete.reason).toMatch(/^Completed$|^Already completed$/);
  });

  test("INT-REM-002: complete by id wins when title has changed out-of-band (issue #36)", async () => {
    const adapter = createRemindersAdapter({ pluginRoot: PLUGIN_ROOT });

    const renamedTitle = `Integration test reminder — renamed ${Date.now()}`;
    const originalTitle = `Original title for rename test ${Date.now()}`;
    const push = await adapter.pushTask(sampleRecord({ title: originalTitle }));
    expect(push.status).toBe("success");

    // Rename the reminder out-of-band, then complete by id with the new
    // title and the stored id. The id path must win — title fallback would
    // miss because the reminder no longer matches `originalTitle`.
    const renameResult = spawnSync(
      "osascript",
      [
        "-e",
        `tell application "Reminders"
           set targetList to first list whose name is "${TEST_LIST}"
           set targetReminder to first reminder of targetList whose id is "${push.id}"
           set name of targetReminder to "${renamedTitle}"
         end tell`,
      ],
      { encoding: "utf-8", timeout: 10_000 }
    );
    expect(renameResult.status).toBe(0);

    const complete = await adapter.completeTask(renamedTitle, TEST_LIST, push.id);
    expect(complete.status).toBe("success");
  });
});
