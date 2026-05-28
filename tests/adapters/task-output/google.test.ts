/**
 * google.test.ts
 *
 * Unit tests for the Google Tasks stub adapter
 * (scripts/adapters/task-output/google.ts).
 *
 * Test IDs:
 *   GOOGLETASK-001 — createGoogleTasksAdapter().pushTask throws with "#66" in the message
 *   GOOGLETASK-002 — createGoogleTasksAdapter().completeTask throws with "#66" in the message
 *
 * Issue: #67
 */

import { createGoogleTasksAdapter } from "../../../scripts/adapters/task-output/google";
import type { TaskOutputRecord } from "../../../scripts/adapter-types";

function sampleRecord(): TaskOutputRecord {
  return {
    title: "Test task",
    description: "desc",
    due_date: "2026-05-28",
    quadrant: "Q1",
    priority: "high",
    source: "Self",
    requester: null,
    list_name: "Eisenhower List",
  };
}

describe("Google Tasks stub adapter", () => {
  test("GOOGLETASK-001: pushTask() throws with '#66' and the GitHub issue URL in the message", async () => {
    const adapter = createGoogleTasksAdapter();

    await expect(adapter.pushTask(sampleRecord())).rejects.toThrow("#66");
    await expect(adapter.pushTask(sampleRecord())).rejects.toThrow(
      "https://github.com/chriscantu/claude-eisenhower/issues/66"
    );
  });

  test("GOOGLETASK-002: completeTask() throws with '#66' and the GitHub issue URL in the message", async () => {
    const adapter = createGoogleTasksAdapter();

    await expect(adapter.completeTask("Test task", "Eisenhower List")).rejects.toThrow("#66");
    await expect(adapter.completeTask("Test task", "Eisenhower List")).rejects.toThrow(
      "https://github.com/chriscantu/claude-eisenhower/issues/66"
    );
  });
});
