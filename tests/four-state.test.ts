/**
 * four-state.test.ts
 *
 * Jest coverage for the Four-State Task Model (Inbox → Active → Delegated → Done).
 * Covers all 10 FOUR-STATE-xxx Gherkin scenarios from the spec.
 *
 * Spec: specs/four-state-task-model-spec.md
 *
 * Pure functions are defined here alongside their tests, following the pattern
 * established in phase2-3.test.ts. No LLM layer required.
 *
 * Run: cd scripts && npm test
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type FourState = "Inbox" | "Active" | "Delegated" | "Done";
export type Quadrant   = "Q1" | "Q2" | "Q3" | "Q4";

/** Minimum fields needed to represent a task record for four-state logic. */
export type TaskRecord = Record<string, string>;

// ── FOUR-STATE-001: Intake creates Inbox state ────────────────────────────────

/**
 * Returns the initial State value for any newly ingested task.
 * Used by /intake to set State on first write to TASKS.md.
 */
export function getIntakeState(): FourState {
  return "Inbox";
}

// ── FOUR-STATE-002, 003, 005: Quadrant → State mapping ───────────────────────

/**
 * Maps an Eisenhower quadrant to the resulting four-state value.
 *
 *   Q1 → Active    (urgent + important — do it yourself)
 *   Q2 → Active    (important, not urgent — schedule it)
 *   Q3 → Delegated (urgent, not important — delegate it, retain accountability)
 *   Q4 → Done      (eliminate — dropped, not scheduled)
 *
 * Defined in: specs/four-state-task-model-spec.md §Four-State Model
 */
export function quadrantToState(quadrant: Quadrant): FourState {
  if (quadrant === "Q1" || quadrant === "Q2") return "Active";
  if (quadrant === "Q3") return "Delegated";
  return "Done"; // Q4 — eliminated
}

// ── FOUR-STATE-004: Delegated tasks must have a Check-by date ────────────────

/**
 * Returns true if a Delegated task record is missing its mandatory Check-by date.
 * Non-Delegated records always return false (Check-by is only required for Delegated).
 *
 * Used by /prioritize and /delegate to gate record writes.
 */
export function isDelegatedMissingCheckBy(record: TaskRecord): boolean {
  if (record["State"] !== "Delegated") return false;
  const checkBy = record["Check-by"];
  return !checkBy || checkBy.trim().length === 0;
}

// ── FOUR-STATE-005: Q4 elimination note ──────────────────────────────────────

/**
 * Builds the standard Note field value for a Q4-eliminated task.
 * Format matches the spec: "Eliminated — Q4 cut {date}"
 */
export function buildEliminationNote(date: string): string {
  return `Eliminated — Q4 cut ${date}`;
}

// ── FOUR-STATE-006, 007: Mark a task as Done ─────────────────────────────────

/**
 * Returns a new task record with State set to "Done" and Done date recorded.
 * Used by /execute for both Active and Delegated task close-out.
 * Does not mutate the original record.
 */
export function buildDoneRecord(record: TaskRecord, doneDate: string): TaskRecord {
  return { ...record, "State": "Done", "Done date": doneDate };
}

// ── FOUR-STATE-008: Surface overdue Delegated tasks at schedule time ──────────

/**
 * Filters a list of task records to those that are Delegated and overdue.
 * A task is overdue when its Check-by date is on or before today.
 * Returns results sorted by Check-by date ascending (most overdue first).
 *
 * Called by /schedule before scheduling new work (Step 1b of schedule.md).
 */
export function getOverdueDelegated(tasks: TaskRecord[], today: string): TaskRecord[] {
  return tasks
    .filter((t) => {
      const state   = t["State"];
      const checkBy = t["Check-by"];
      return state === "Delegated" && typeof checkBy === "string" && checkBy.trim().length > 0 && checkBy <= today;
    })
    .sort((a, b) => a["Check-by"].localeCompare(b["Check-by"]));
}

// ── FOUR-STATE-009: Blocker note on Active task — no state change ─────────────

/**
 * Returns a new task record with a Note field added for a blocker.
 * The State field is deliberately preserved — blocker does NOT change state.
 * If no Check-by date is set and a suggestion is provided, it is added.
 *
 * Enforces the spec rule: "Claude does not move the task to any 'Blocked' state."
 */
export function applyBlockerNote(
  record: TaskRecord,
  note: string,
  suggestedCheckBy?: string
): TaskRecord {
  const result: TaskRecord = { ...record, "Note": note };
  if (suggestedCheckBy && !record["Check-by"]) {
    result["Check-by"] = suggestedCheckBy;
  }
  return result;
}

// ── FOUR-STATE-010: TASKS.md section structure ────────────────────────────────

/** Sections that must appear in order in any TASKS.md. */
export const REQUIRED_SECTIONS = ["## Inbox", "## Active", "## Delegated", "## Done"] as const;

/** Section headers that must NOT appear in TASKS.md under the four-state model. */
export const FORBIDDEN_SECTIONS = ["## Q1", "## Q2", "## Q3", "## Q4", "## Blocked"] as const;

/**
 * Returns true if the TASKS.md content contains all four required sections.
 */
export function hasRequiredSections(content: string): boolean {
  return REQUIRED_SECTIONS.every((s) => content.includes(s));
}

/**
 * Returns true if the TASKS.md content contains any forbidden section headers.
 */
export function hasForbiddenSections(content: string): boolean {
  return FORBIDDEN_SECTIONS.some((s) => content.includes(s));
}

/**
 * Returns true if the required sections appear in the correct order in content.
 */
export function hasCorrectSectionOrder(content: string): boolean {
  const positions = REQUIRED_SECTIONS.map((s) => content.indexOf(s));
  return positions.every((pos, i) => i === 0 || pos > positions[i - 1]);
}

// ── Tests: FOUR-STATE-001 — Intake creates Inbox state ───────────────────────

describe("FOUR-STATE-001: Intake creates Inbox state", () => {
  test("FOUR-STATE-001-a: getIntakeState returns 'Inbox'", () => {
    expect(getIntakeState()).toBe("Inbox");
  });

  test("FOUR-STATE-001-b: intake state is not Active, Delegated, or Done", () => {
    const state = getIntakeState();
    expect(state).not.toBe("Active");
    expect(state).not.toBe("Delegated");
    expect(state).not.toBe("Done");
  });
});

// ── Tests: FOUR-STATE-002 — Prioritize moves Inbox to Active (Q1/Q2) ─────────

describe("FOUR-STATE-002: Prioritize moves Inbox to Active for Q1 and Q2", () => {
  test("FOUR-STATE-002-a: Q1 classification results in Active state", () => {
    expect(quadrantToState("Q1")).toBe("Active");
  });

  test("FOUR-STATE-002-b: Q2 classification results in Active state", () => {
    expect(quadrantToState("Q2")).toBe("Active");
  });

  test("FOUR-STATE-002-c: Active state implies owner is 'me' (not delegate)", () => {
    // Q1/Q2 → Active means the leader does it personally
    const state = quadrantToState("Q1");
    expect(state).toBe("Active");
    // (Owner field assignment is a command-layer concern; quadrantToState encodes the rule)
  });
});

// ── Tests: FOUR-STATE-003 — Prioritize moves Inbox to Delegated (Q3) ─────────

describe("FOUR-STATE-003: Prioritize moves Inbox to Delegated for Q3", () => {
  test("FOUR-STATE-003-a: Q3 classification results in Delegated state", () => {
    expect(quadrantToState("Q3")).toBe("Delegated");
  });

  test("FOUR-STATE-003-b: Delegated state is distinct from Active", () => {
    expect(quadrantToState("Q3")).not.toBe("Active");
  });
});

// ── Tests: FOUR-STATE-004 — Delegated requires Check-by date ─────────────────

describe("FOUR-STATE-004: Delegated task requires Check-by date", () => {
  test("FOUR-STATE-004-a: Delegated record missing Check-by is detected", () => {
    const record: TaskRecord = { "State": "Delegated", "Title": "Deploy new service" };
    expect(isDelegatedMissingCheckBy(record)).toBe(true);
  });

  test("FOUR-STATE-004-b: Delegated record with Check-by is valid (not missing)", () => {
    const record: TaskRecord = {
      "State":    "Delegated",
      "Title":    "Deploy new service",
      "Check-by": "2026-03-07",
    };
    expect(isDelegatedMissingCheckBy(record)).toBe(false);
  });

  test("FOUR-STATE-004-c: Delegated record with empty Check-by is still missing", () => {
    const record: TaskRecord = { "State": "Delegated", "Check-by": "" };
    expect(isDelegatedMissingCheckBy(record)).toBe(true);
  });

  test("FOUR-STATE-004-d: Non-Delegated records are not subject to Check-by enforcement", () => {
    const active: TaskRecord = { "State": "Active", "Title": "Approve vendor contract" };
    expect(isDelegatedMissingCheckBy(active)).toBe(false);
  });
});

// ── Tests: FOUR-STATE-005 — Q4 maps to Done (dropped) ───────────────────────

describe("FOUR-STATE-005: Q4 classification maps to Done (eliminated)", () => {
  test("FOUR-STATE-005-a: Q4 classification results in Done state", () => {
    expect(quadrantToState("Q4")).toBe("Done");
  });

  test("FOUR-STATE-005-b: elimination note contains 'Eliminated' and cut date", () => {
    const note = buildEliminationNote("2026-03-02");
    expect(note).toContain("Eliminated");
    expect(note).toContain("2026-03-02");
  });

  test("FOUR-STATE-005-c: elimination note matches exact spec format", () => {
    expect(buildEliminationNote("2026-03-02")).toBe("Eliminated — Q4 cut 2026-03-02");
  });
});

// ── Tests: FOUR-STATE-006 — Execute marks Active task as Done ─────────────────

describe("FOUR-STATE-006: Execute marks Active task as Done", () => {
  test("FOUR-STATE-006-a: Active task becomes Done after execute", () => {
    const active: TaskRecord = { "State": "Active", "Title": "Approve vendor contract" };
    const done = buildDoneRecord(active, "2026-03-02");
    expect(done["State"]).toBe("Done");
  });

  test("FOUR-STATE-006-b: Done date is recorded on the record", () => {
    const active: TaskRecord = { "State": "Active", "Title": "Approve vendor contract" };
    const done = buildDoneRecord(active, "2026-03-02");
    expect(done["Done date"]).toBe("2026-03-02");
  });

  test("FOUR-STATE-006-c: buildDoneRecord does not mutate the original", () => {
    const original: TaskRecord = { "State": "Active", "Title": "Review alerting" };
    buildDoneRecord(original, "2026-03-02");
    expect(original["State"]).toBe("Active");
    expect(original["Done date"]).toBeUndefined();
  });
});

// ── Tests: FOUR-STATE-007 — Execute marks Delegated task as Done ──────────────

describe("FOUR-STATE-007: Execute marks Delegated task as Done", () => {
  test("FOUR-STATE-007-a: Delegated task becomes Done after delegate confirms completion", () => {
    const delegated: TaskRecord = {
      "State":    "Delegated",
      "Title":    "Deploy new service",
      "Check-by": "2026-03-05",
    };
    const done = buildDoneRecord(delegated, "2026-03-05");
    expect(done["State"]).toBe("Done");
  });

  test("FOUR-STATE-007-b: Done date is recorded even for previously-Delegated tasks", () => {
    const delegated: TaskRecord = { "State": "Delegated", "Title": "Review contracts" };
    const done = buildDoneRecord(delegated, "2026-03-05");
    expect(done["Done date"]).toBe("2026-03-05");
  });
});

// ── Tests: FOUR-STATE-008 — Overdue Delegated tasks surfaced at schedule ──────

describe("FOUR-STATE-008: Overdue Delegated tasks surfaced at schedule time", () => {
  const today = "2026-03-02";

  const tasks: TaskRecord[] = [
    { "State": "Delegated", "Title": "Task A", "Check-by": "2026-02-28" }, // overdue
    { "State": "Delegated", "Title": "Task B", "Check-by": "2026-03-05" }, // future
    { "State": "Delegated", "Title": "Task C", "Check-by": "2026-03-02" }, // today = overdue
    { "State": "Active",    "Title": "Task D", "Check-by": "2026-02-28" }, // Active — excluded
    { "State": "Delegated", "Title": "Task E", "Check-by": "2026-03-01" }, // overdue
  ];

  test("FOUR-STATE-008-a: only Delegated tasks with overdue Check-by are returned", () => {
    const result = getOverdueDelegated(tasks, today);
    const titles = result.map((t) => t["Title"]);
    expect(titles).toContain("Task A");
    expect(titles).toContain("Task C");
    expect(titles).toContain("Task E");
    expect(titles).not.toContain("Task B"); // future
    expect(titles).not.toContain("Task D"); // Active, not Delegated
  });

  test("FOUR-STATE-008-b: Check-by date equal to today is overdue (surface it now)", () => {
    const result = getOverdueDelegated(tasks, today);
    const taskC = result.find((t) => t["Title"] === "Task C");
    expect(taskC).toBeDefined();
  });

  test("FOUR-STATE-008-c: results sorted by Check-by ascending (most overdue first)", () => {
    const result = getOverdueDelegated(tasks, today);
    expect(result[0]["Check-by"]).toBe("2026-02-28"); // oldest first
    expect(result[1]["Check-by"]).toBe("2026-03-01");
    expect(result[2]["Check-by"]).toBe("2026-03-02"); // today
  });

  test("FOUR-STATE-008-d: Active tasks are excluded even if they have an overdue Check-by", () => {
    const result = getOverdueDelegated(tasks, today);
    const titles = result.map((t) => t["Title"]);
    expect(titles).not.toContain("Task D");
  });
});

// ── Tests: FOUR-STATE-009 — Blocker note on Active — no state change ──────────

describe("FOUR-STATE-009: Blocker note on Active task — no state change", () => {
  test("FOUR-STATE-009-a: State remains Active after blocker note is applied", () => {
    const active: TaskRecord = { "State": "Active", "Title": "Launch new feature" };
    const result = applyBlockerNote(active, "Waiting on legal sign-off");
    expect(result["State"]).toBe("Active");
  });

  test("FOUR-STATE-009-b: Note field is set to the blocker description", () => {
    const active: TaskRecord = { "State": "Active", "Title": "Launch new feature" };
    const result = applyBlockerNote(active, "Waiting on legal sign-off");
    expect(result["Note"]).toBe("Waiting on legal sign-off");
  });

  test("FOUR-STATE-009-c: suggested Check-by date is added when not already present", () => {
    const active: TaskRecord = { "State": "Active", "Title": "Launch new feature" };
    const result = applyBlockerNote(active, "Blocked on infra ticket", "2026-03-09");
    expect(result["Check-by"]).toBe("2026-03-09");
  });

  test("FOUR-STATE-009-d: existing Check-by date is not overwritten by suggestion", () => {
    const active: TaskRecord = {
      "State":    "Active",
      "Title":    "Launch new feature",
      "Check-by": "2026-03-05",
    };
    const result = applyBlockerNote(active, "Blocked on infra ticket", "2026-03-09");
    expect(result["Check-by"]).toBe("2026-03-05"); // original preserved
  });

  test("FOUR-STATE-009-e: applyBlockerNote does not mutate the original record", () => {
    const original: TaskRecord = { "State": "Active", "Title": "Review API" };
    applyBlockerNote(original, "Waiting on vendor");
    expect(original["Note"]).toBeUndefined();
  });

  test("FOUR-STATE-009-f: result never has State = 'Blocked' (anti-pattern guard)", () => {
    const active: TaskRecord = { "State": "Active", "Title": "Deploy service" };
    const result = applyBlockerNote(active, "Infra ticket pending");
    expect(result["State"]).not.toBe("Blocked");
  });
});

// ── Tests: FOUR-STATE-010 — TASKS.md section structure ───────────────────────

describe("FOUR-STATE-010: TASKS.md section structure matches four states", () => {
  const validContent = `
# TASKS.md

## Inbox

- Task 1

## Active

- Task 2

## Delegated

- Task 3

## Done

- Task 4
`;

  const invalidContent = `
# TASKS.md

## Q1 — Urgent + Important

- Task 1

## Blocked

- Task 2
`;

  test("FOUR-STATE-010-a: valid TASKS.md has all four required sections", () => {
    expect(hasRequiredSections(validContent)).toBe(true);
  });

  test("FOUR-STATE-010-b: TASKS.md missing any required section fails the check", () => {
    const partial = "## Inbox\n## Active\n## Delegated\n"; // no Done
    expect(hasRequiredSections(partial)).toBe(false);
  });

  test("FOUR-STATE-010-c: valid TASKS.md has no forbidden Q1–Q4 section headers", () => {
    expect(hasForbiddenSections(validContent)).toBe(false);
  });

  test("FOUR-STATE-010-d: TASKS.md with Q1 section header fails the forbidden check", () => {
    expect(hasForbiddenSections(invalidContent)).toBe(true);
  });

  test("FOUR-STATE-010-e: TASKS.md with ## Blocked section fails the forbidden check", () => {
    expect(hasForbiddenSections("## Inbox\n## Active\n## Delegated\n## Done\n## Blocked\n")).toBe(true);
  });

  test("FOUR-STATE-010-f: required sections appear in correct order (Inbox, Active, Delegated, Done)", () => {
    expect(hasCorrectSectionOrder(validContent)).toBe(true);
  });

  test("FOUR-STATE-010-g: sections out of order fail the order check", () => {
    const outOfOrder = "## Active\n## Inbox\n## Done\n## Delegated\n";
    expect(hasCorrectSectionOrder(outOfOrder)).toBe(false);
  });
});
