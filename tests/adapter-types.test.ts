/**
 * adapter-types.test.ts
 *
 * Compile-time + runtime contract tests for the adapter interface types.
 * Spec: adapters/README.md
 *
 * These tests serve dual purpose:
 *   1. Fail immediately if scripts/adapter-types.ts doesn't exist (RED phase)
 *   2. Document the exact contract any adapter must satisfy (living spec)
 *
 * Run: cd scripts && npm test
 */

import type { TaskOutputRecord, PushResult } from "../scripts/adapter-types";

// ── TaskOutputRecord ──────────────────────────────────────────────────────────

describe("TaskOutputRecord — adapter input contract", () => {
  test("ADAPTER-001: Q1 record has due_date set to today (high priority)", () => {
    const record: TaskOutputRecord = {
      title:       "Review infrastructure alerts",
      description: "Check threshold settings for all production services",
      due_date:    "2026-03-02",
      quadrant:    "Q1",
      priority:    "high",
      source:      "Email (Procore)",
      requester:   "Alex E.",
      list_name:   "Eisenhower List",
    };
    expect(record.quadrant).toBe("Q1");
    expect(record.priority).toBe("high");
    expect(record.due_date).toBe("2026-03-02");
  });

  test("ADAPTER-002: Q2 record may have null due_date and null requester", () => {
    const record: TaskOutputRecord = {
      title:       "Update onboarding documentation",
      description: "Revise onboarding guide for new process",
      due_date:    null,
      quadrant:    "Q2",
      priority:    "medium",
      source:      "Self",
      requester:   null,
      list_name:   "Eisenhower List",
    };
    expect(record.due_date).toBeNull();
    expect(record.requester).toBeNull();
    expect(record.priority).toBe("medium");
  });

  test("ADAPTER-003: Q3 record gets 'Check in:' prefix on title and medium priority", () => {
    const record: TaskOutputRecord = {
      title:       "Check in: Alex E. re: Deploy new service",
      description: "Follow up on deployment timeline",
      due_date:    "2026-03-07",
      quadrant:    "Q3",
      priority:    "medium",
      source:      "Email (Internal)",
      requester:   "Alex E.",
      list_name:   "Eisenhower List",
    };
    expect(record.quadrant).toBe("Q3");
    expect(record.priority).toBe("medium");
    expect(record.title).toMatch(/^Check in:/);
  });

  test("ADAPTER-004: all required fields are present (no optional fields)", () => {
    const record: TaskOutputRecord = {
      title:       "Approve vendor contract",
      description: "Sign-off required by legal",
      due_date:    "2026-03-10",
      quadrant:    "Q1",
      priority:    "high",
      source:      "Meeting",
      requester:   "Jordan F.",
      list_name:   "Eisenhower List",
    };
    const keys = Object.keys(record);
    expect(keys).toContain("title");
    expect(keys).toContain("description");
    expect(keys).toContain("due_date");
    expect(keys).toContain("quadrant");
    expect(keys).toContain("priority");
    expect(keys).toContain("source");
    expect(keys).toContain("requester");
    expect(keys).toContain("list_name");
  });
});

// ── PushResult ────────────────────────────────────────────────────────────────

describe("PushResult — adapter output contract", () => {
  test("ADAPTER-010: success result carries external system id", () => {
    const result: PushResult = {
      status: "success",
      reason: "Created",
      id:     "x-coredata://ABC123",
    };
    expect(result.status).toBe("success");
    expect(result.id).toBeTruthy();
    expect(result.reason).toBe("Created");
  });

  test("ADAPTER-011: skipped result uses empty string for id (no record created)", () => {
    const result: PushResult = {
      status: "skipped",
      reason: "Already exists",
      id:     "",
    };
    expect(result.status).toBe("skipped");
    expect(result.id).toBe("");
  });

  test("ADAPTER-012: error result has descriptive reason and empty id", () => {
    const result: PushResult = {
      status: "error",
      reason: "Permission denied",
      id:     "",
    };
    expect(result.status).toBe("error");
    expect(result.reason.length).toBeGreaterThan(0);
    expect(result.id).toBe("");
  });

  test("ADAPTER-013: all three status values are distinct (exhaustive union)", () => {
    const statuses: PushResult["status"][] = ["success", "skipped", "error"];
    expect(new Set(statuses).size).toBe(3);
  });
});
