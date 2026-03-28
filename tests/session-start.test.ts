/**
 * session-start.test.ts
 *
 * Tests for the P5 SessionStart enhancement:
 * 1. Hook contract tests — structural validation of hooks/hooks.json
 * 2. Business day overdue logic — weekOfFriday and businessDaysOverdue
 *
 * Spec: docs/specs/session-start-enhancement-spec.md
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";
import { weekOfFriday, businessDaysOverdue } from "../scripts/date-helpers";

const ROOT = path.resolve(__dirname, "..");

function readJSON(relPath: string): any {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8"));
}

function utcDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z");
}

// ── Hook contract tests ──────────────────────────────────────────────────────

describe("SessionStart hook contract (SS-CONT)", () => {
  const hooks = readJSON("hooks/hooks.json");
  const sessionStart = hooks.SessionStart;

  test("SS-CONT-001: SessionStart hook exists and has exactly one entry", () => {
    expect(sessionStart).toBeDefined();
    expect(sessionStart).toHaveLength(1);
  });

  test("SS-CONT-002: hook is type 'prompt' (not 'command')", () => {
    expect(sessionStart[0].hooks[0].type).toBe("prompt");
  });

  test("SS-CONT-003: hook timeout is 15 seconds", () => {
    expect(sessionStart[0].hooks[0].timeout).toBe(15);
  });

  const prompt = sessionStart[0].hooks[0].prompt;

  test("SS-CONT-004: prompt mentions TASKS.md", () => {
    expect(prompt).toContain("TASKS.md");
  });

  test("SS-CONT-005: prompt mentions all four task states", () => {
    expect(prompt).toContain("Inbox");
    expect(prompt).toContain("Active");
    expect(prompt).toContain("Delegated");
    expect(prompt).toContain("Done");
  });

  test("SS-CONT-006: prompt contains overdue active task instructions", () => {
    expect(prompt).toMatch(/overdue/i);
    expect(prompt).toMatch(/Scheduled/);
  });

  test("SS-CONT-007: prompt contains check-in instructions", () => {
    expect(prompt).toMatch(/Check-by/);
  });

  test("SS-CONT-008: prompt contains business day math instructions", () => {
    expect(prompt).toMatch(/business day/i);
  });

  test("SS-CONT-009: prompt contains icon indicators", () => {
    expect(prompt).toContain("🔴");
    expect(prompt).toContain("🟡");
    expect(prompt).toContain("📥");
    expect(prompt).toContain("💤");
    expect(prompt).toContain("💡");
  });

  test("SS-CONT-010: prompt contains quiet mode instruction", () => {
    expect(prompt).toMatch(/quiet/i);
  });

  test("SS-CONT-011: prompt contains 'week of' handling", () => {
    expect(prompt).toMatch(/week of/);
  });

  test("SS-CONT-012: prompt does not contain write instructions (read-only)", () => {
    expect(prompt).not.toMatch(/[Ww]rite to TASKS\.md/);
    expect(prompt).not.toMatch(/[Ee]dit TASKS\.md/);
    expect(prompt).not.toMatch(/[Uu]pdate TASKS\.md/);
  });

  test("SS-CONT-013: prompt contains inbox threshold of 5", () => {
    expect(prompt).toMatch(/5/);
    expect(prompt).toMatch(/[Ii]nbox/);
  });

  test("SS-CONT-014: prompt contains staleness signal (5 business days)", () => {
    expect(prompt).toMatch(/5 business days/);
  });

  test("SS-CONT-015: prompt contains suggested next action logic", () => {
    expect(prompt).toMatch(/[Ss]uggest/);
  });

  test("SS-CONT-016: prompt contains delegation dedup instruction", () => {
    expect(prompt).toMatch(/ONLY.*Delegation Check-ins/i);
    expect(prompt).toMatch(/[Dd]o not duplicate/);
  });

  test("SS-CONT-017: prompt instructs silence when TASKS.md is absent", () => {
    expect(prompt).toMatch(/does not exist.*say nothing/i);
  });
});

// ── weekOfFriday tests ───────────────────────────────────────────────────────

describe("weekOfFriday (SS-WOF)", () => {
  test("SS-WOF-001: Monday 2026-03-23 → Friday 2026-03-27", () => {
    const friday = weekOfFriday("2026-03-23");
    expect(friday.toISOString().split("T")[0]).toBe("2026-03-27");
  });

  test("SS-WOF-002: Monday 2026-03-30 → Friday 2026-04-03", () => {
    const friday = weekOfFriday("2026-03-30");
    expect(friday.toISOString().split("T")[0]).toBe("2026-04-03");
  });

  test("SS-WOF-003: Monday 2026-01-05 → Friday 2026-01-09", () => {
    const friday = weekOfFriday("2026-01-05");
    expect(friday.toISOString().split("T")[0]).toBe("2026-01-09");
  });

  test("SS-WOF-004: handles month boundary (Monday 2026-02-23 → Friday 2026-02-27)", () => {
    const friday = weekOfFriday("2026-02-23");
    expect(friday.toISOString().split("T")[0]).toBe("2026-02-27");
  });

  test("SS-WOF-005: handles year boundary (Monday 2025-12-29 → Friday 2026-01-02)", () => {
    const friday = weekOfFriday("2025-12-29");
    expect(friday.toISOString().split("T")[0]).toBe("2026-01-02");
  });
});

// ── businessDaysOverdue tests ────────────────────────────────────────────────

describe("businessDaysOverdue (SS-BDO)", () => {
  test("SS-BDO-001: task scheduled Friday, checked Monday → 1 business day overdue", () => {
    const scheduled = utcDate("2026-03-20"); // Friday
    const today = utcDate("2026-03-23");     // Monday
    expect(businessDaysOverdue(scheduled, today)).toBe(1);
  });

  test("SS-BDO-002: task scheduled Thursday, checked Monday → 2 business days overdue", () => {
    const scheduled = utcDate("2026-03-19"); // Thursday
    const today = utcDate("2026-03-23");     // Monday
    expect(businessDaysOverdue(scheduled, today)).toBe(2);
  });

  test("SS-BDO-003: task scheduled Monday, checked same Monday → 0 (not overdue)", () => {
    const scheduled = utcDate("2026-03-23"); // Monday
    const today = utcDate("2026-03-23");     // Same Monday
    expect(businessDaysOverdue(scheduled, today)).toBe(0);
  });

  test("SS-BDO-004: task scheduled Friday, checked Saturday → 0 (weekend, not yet overdue)", () => {
    const scheduled = utcDate("2026-03-20"); // Friday
    const today = utcDate("2026-03-21");     // Saturday
    expect(businessDaysOverdue(scheduled, today)).toBe(0);
  });

  test("SS-BDO-005: task scheduled Friday, checked Sunday → 0 (weekend, not yet overdue)", () => {
    const scheduled = utcDate("2026-03-20"); // Friday
    const today = utcDate("2026-03-22");     // Sunday
    expect(businessDaysOverdue(scheduled, today)).toBe(0);
  });

  test("SS-BDO-006: task scheduled Monday, checked Friday same week → 4 business days overdue", () => {
    const scheduled = utcDate("2026-03-16"); // Monday
    const today = utcDate("2026-03-20");     // Friday
    expect(businessDaysOverdue(scheduled, today)).toBe(4);
  });

  test("SS-BDO-007: task scheduled future date → 0 (not overdue)", () => {
    const scheduled = utcDate("2026-03-25"); // Wednesday future
    const today = utcDate("2026-03-23");     // Monday
    expect(businessDaysOverdue(scheduled, today)).toBe(0);
  });
});

// ── week-of overdue integration tests ────────────────────────────────────────

describe("week-of overdue detection (SS-WKOF)", () => {
  test("SS-WKOF-001: 'week of 2026-03-23' is NOT overdue on Friday 2026-03-27", () => {
    const friday = weekOfFriday("2026-03-23");
    const saturday = new Date(friday);
    saturday.setUTCDate(friday.getUTCDate() + 1);
    const today = utcDate("2026-03-27");
    expect(businessDaysOverdue(saturday, today)).toBe(0);
  });

  test("SS-WKOF-002: 'week of 2026-03-23' is NOT overdue on Saturday 2026-03-28", () => {
    const friday = weekOfFriday("2026-03-23");
    const saturday = new Date(friday);
    saturday.setUTCDate(friday.getUTCDate() + 1);
    const today = utcDate("2026-03-28");
    expect(businessDaysOverdue(saturday, today)).toBe(0);
  });

  test("SS-WKOF-003: 'week of 2026-03-23' IS overdue on Monday 2026-03-30 (1 biz day)", () => {
    const friday = weekOfFriday("2026-03-23");
    const saturday = new Date(friday);
    saturday.setUTCDate(friday.getUTCDate() + 1);
    const today = utcDate("2026-03-30");
    expect(businessDaysOverdue(saturday, today)).toBe(1);
  });

  test("SS-WKOF-004: 'week of 2026-03-23' is 3 biz days overdue on Wednesday 2026-04-01", () => {
    const friday = weekOfFriday("2026-03-23");
    const saturday = new Date(friday);
    saturday.setUTCDate(friday.getUTCDate() + 1);
    const today = utcDate("2026-04-01");
    expect(businessDaysOverdue(saturday, today)).toBe(3);
  });
});
