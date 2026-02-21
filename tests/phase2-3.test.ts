/**
 * phase2-3.test.ts
 *
 * Automated Jest coverage for Phase 2 (/schedule) and Phase 3 (/execute)
 * command-layer logic — extracted as pure functions for testability.
 *
 * Replaces the manual/behavioral-only test coverage documented in
 * tests/delegation-regression.md (TEST-DEL-020 through TEST-DEL-032).
 *
 * Each pure function is defined here alongside its tests, following the
 * pattern established in schedule-capacity.test.ts. No LLM layer required.
 *
 * Test IDs follow the TEST-DEL-7xx convention (700-series = Phase 2–3 coverage).
 *
 * Run: cd scripts && npm test
 */

// ── Phase 2: Dedup guard (TEST-DEL-024) ──────────────────────────────────────

/**
 * Returns true if the task record already has a Synced: field — meaning
 * the delegation was confirmed and pushed in a prior session.
 *
 * This is the single source of truth for dedup, as defined in schedule.md
 * Step 3b and schedule.md Step 7.
 */
export function isAlreadySynced(taskRecord: Record<string, string>): boolean {
  const synced = taskRecord["Synced"];
  return typeof synced === "string" && synced.trim().length > 0;
}

/**
 * Returns true if the task record has a confirmed delegate assigned
 * (Delegate to: field is set and is not the placeholder value).
 */
export function hasConfirmedDelegate(taskRecord: Record<string, string>): boolean {
  const delegate = taskRecord["Delegate to"];
  if (!delegate || delegate.trim().length === 0) return false;
  return !delegate.includes("not yet assigned");
}

// ── Phase 2: Delegate field state machine (schedule.md Step 3b) ──────────────

export type DelegateState =
  | "suggested"       // Suggested delegate: [alias] — set at prioritize, not yet confirmed
  | "confirmed"       // Delegate to: [alias] — confirmed, Synced: not present (push pending)
  | "synced"          // Delegate to: [alias] + Synced: present — skip entirely
  | "unassigned"      // Delegate to: [not yet assigned...]
  | "none";           // No delegate field at all

/**
 * Determines the delegate state of a task record.
 * Used by /schedule Step 3b to decide what action to take.
 */
export function getDelegateState(taskRecord: Record<string, string>): DelegateState {
  if (isAlreadySynced(taskRecord)) return "synced";

  const delegate = taskRecord["Delegate to"];
  const suggested = taskRecord["Suggested delegate"];

  if (delegate) {
    if (delegate.includes("not yet assigned")) return "unassigned";
    return "confirmed";
  }

  if (suggested && suggested.trim().length > 0) return "suggested";

  return "none";
}

// ── Phase 3: Follow-up title format (execute.md Step 3 Log Progress) ─────────

/**
 * Builds the follow-up task title for a missed check-in.
 * Format: "Follow up: [original title] with [alias]"
 * Defined in execute.md Step 3 (Log Progress → missed check-in branch).
 */
export function buildFollowUpTitle(originalTitle: string, alias: string): string {
  return `Follow up: ${originalTitle} with ${alias}`;
}

/**
 * Builds the follow-up task description for a missed check-in.
 */
export function buildFollowUpDescription(
  alias: string,
  today: string,
  originalCheckinDate: string
): string {
  return (
    `Delegation follow-up — ${alias} reported still in progress as of ${today}. ` +
    `Original check-in was ${originalCheckinDate}.`
  );
}

/**
 * Builds the complete follow-up intake record to append to ## Unprocessed.
 * Field names and values match execute.md Step 3 spec exactly.
 */
export function buildFollowUpRecord(
  originalTitle: string,
  alias: string,
  today: string,
  originalCheckinDate: string
): Record<string, string> {
  return {
    "Title": buildFollowUpTitle(originalTitle, alias),
    "Description": buildFollowUpDescription(alias, today, originalCheckinDate),
    "Source": "Delegation follow-up",
    "Requester": alias,
    "Urgency": "Check-in overdue",
    "Due date": "Not specified",
    "Status": "Unprocessed",
  };
}

// ── Phase 3: Overdue detection (schedule.md Step 1b, execute.md Step 3) ──────

/**
 * Returns true if the check-in date is today or in the past.
 * Used by /schedule Step 1b (Part A) to surface overdue delegations,
 * and by /execute Step 3 to detect missed check-ins on Log Progress.
 *
 * Dates are compared as YYYY-MM-DD strings — no timezone conversion needed
 * since both values come from the same local machine.
 */
export function isOverdue(checkinDateStr: string, today: string): boolean {
  return checkinDateStr <= today;
}

/**
 * Filters a list of open delegations to those that are overdue.
 * Returns them sorted by check-in date ascending (most overdue first).
 */
export interface OpenDelegation {
  alias: string;
  taskTitle: string;
  checkinDate: string; // YYYY-MM-DD
}

export function getOverdueDelegations(
  delegations: OpenDelegation[],
  today: string
): OpenDelegation[] {
  return delegations
    .filter((d) => isOverdue(d.checkinDate, today))
    .sort((a, b) => a.checkinDate.localeCompare(b.checkinDate));
}

// ── Tests: Dedup guard (TEST-DEL-024) ────────────────────────────────────────

describe("Phase 2: Dedup Guard — isAlreadySynced (TEST-DEL-024)", () => {
  test("TEST-DEL-701: task with Synced field is already synced", () => {
    expect(isAlreadySynced({
      "Delegate to": "Alex E.",
      "Synced": "Reminders (Eisenhower List) — 2026-02-21",
    })).toBe(true);
  });

  test("TEST-DEL-702: task without Synced field is not synced", () => {
    expect(isAlreadySynced({
      "Delegate to": "Alex E.",
    })).toBe(false);
  });

  test("TEST-DEL-703: task with empty Synced field is not synced", () => {
    expect(isAlreadySynced({ "Synced": "" })).toBe(false);
  });

});

// ── Tests: Delegate state machine (schedule.md Step 3b) ──────────────────────

describe("Phase 2: Delegate State — getDelegateState", () => {
  test("TEST-DEL-710: synced task returns 'synced'", () => {
    expect(getDelegateState({
      "Delegate to": "Alex E.",
      "Synced": "Reminders — 2026-02-21",
    })).toBe("synced");
  });

  test("TEST-DEL-711: confirmed delegate without Synced returns 'confirmed'", () => {
    expect(getDelegateState({
      "Delegate to": "Alex E.",
    })).toBe("confirmed");
  });

  test("TEST-DEL-712: unassigned placeholder returns 'unassigned'", () => {
    expect(getDelegateState({
      "Delegate to": "[not yet assigned — see stakeholders.yaml]",
    })).toBe("unassigned");
  });

  test("TEST-DEL-713: suggested delegate (not yet confirmed) returns 'suggested'", () => {
    expect(getDelegateState({
      "Suggested delegate": "Jordan F.",
    })).toBe("suggested");
  });

  test("TEST-DEL-714: no delegate fields at all returns 'none'", () => {
    expect(getDelegateState({
      "Title": "Some task",
      "Quadrant": "Q3",
    })).toBe("none");
  });

  test("TEST-DEL-715: Synced takes precedence over Suggested delegate", () => {
    // If somehow both exist, synced wins
    expect(getDelegateState({
      "Suggested delegate": "Jordan F.",
      "Delegate to": "Alex E.",
      "Synced": "Reminders — 2026-02-21",
    })).toBe("synced");
  });
});

// ── Tests: Follow-up title format (TEST-DEL-032) ─────────────────────────────

describe("Phase 3: Follow-up Title Format — buildFollowUpTitle (TEST-DEL-032)", () => {
  test("TEST-DEL-720: standard follow-up title format", () => {
    expect(buildFollowUpTitle(
      "Review infrastructure alerting thresholds",
      "Alex E."
    )).toBe("Follow up: Review infrastructure alerting thresholds with Alex E.");
  });

  test("TEST-DEL-722: alias used in title, not full name (PII safety)", () => {
    const result = buildFollowUpTitle("Deploy new service", "Alex E.");
    expect(result).toContain("Alex E.");
    expect(result).not.toContain("FIRST_LAST"); // no raw name field
  });
});

describe("Phase 3: Follow-up Record — buildFollowUpRecord (TEST-DEL-032)", () => {
  const record = buildFollowUpRecord(
    "Review alerting thresholds",
    "Alex E.",
    "2026-02-23",
    "2026-02-20"
  );

  test("TEST-DEL-723: Source field is 'Delegation follow-up'", () => {
    expect(record["Source"]).toBe("Delegation follow-up");
  });

  test("TEST-DEL-724: Requester field is the delegate alias", () => {
    expect(record["Requester"]).toBe("Alex E.");
  });

  test("TEST-DEL-725: Urgency field is 'Check-in overdue'", () => {
    expect(record["Urgency"]).toBe("Check-in overdue");
  });

  test("TEST-DEL-726: Status field is 'Unprocessed'", () => {
    expect(record["Status"]).toBe("Unprocessed");
  });

  test("TEST-DEL-728: Description references alias, today's date, and original check-in", () => {
    expect(record["Description"]).toContain("Alex E.");
    expect(record["Description"]).toContain("2026-02-23");
    expect(record["Description"]).toContain("2026-02-20");
  });
});

// ── Tests: Overdue detection (TEST-DEL-030, TEST-DEL-032) ────────────────────

describe("Phase 2+3: Overdue Detection — isOverdue (TEST-DEL-030, TEST-DEL-032)", () => {
  test("TEST-DEL-730: check-in date in the past is overdue", () => {
    expect(isOverdue("2026-02-18", "2026-02-23")).toBe(true);
  });

  test("TEST-DEL-731: check-in date today is overdue (due today = surface it)", () => {
    expect(isOverdue("2026-02-23", "2026-02-23")).toBe(true);
  });

  test("TEST-DEL-732: check-in date in the future is NOT overdue", () => {
    expect(isOverdue("2026-02-25", "2026-02-23")).toBe(false);
  });

});

describe("Phase 2: Overdue Delegation List — getOverdueDelegations (TEST-DEL-030)", () => {
  const today = "2026-02-23";

  const delegations: OpenDelegation[] = [
    { alias: "Alex E.", taskTitle: "Task A", checkinDate: "2026-02-20" },   // overdue
    { alias: "Jordan F.", taskTitle: "Task B", checkinDate: "2026-02-25" }, // future
    { alias: "Riley L.", taskTitle: "Task C", checkinDate: "2026-02-23" },  // today = overdue
    { alias: "Morgan P.", taskTitle: "Task D", checkinDate: "2026-02-22" }, // overdue
  ];

  test("TEST-DEL-734: only overdue delegations returned", () => {
    const result = getOverdueDelegations(delegations, today);
    const titles = result.map((d) => d.taskTitle);
    expect(titles).toContain("Task A");
    expect(titles).toContain("Task C");
    expect(titles).toContain("Task D");
    expect(titles).not.toContain("Task B");
  });

  test("TEST-DEL-735: result sorted by check-in date ascending (most overdue first)", () => {
    const result = getOverdueDelegations(delegations, today);
    expect(result[0].checkinDate).toBe("2026-02-20"); // oldest first
    expect(result[1].checkinDate).toBe("2026-02-22");
    expect(result[2].checkinDate).toBe("2026-02-23");
  });

});

