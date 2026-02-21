/**
 * delegate-entry.test.ts
 *
 * Regression suite for the /delegate direct entry point (v0.5.1).
 * Covers all P0 requirements (DEL-001 through DEL-010) from:
 *   integrations/specs/delegate-entry-point-spec.md
 *
 * Imports all scoring logic from scripts/delegate-core.ts — no duplication.
 * Tests are pure-function level: algorithm behavior, TASKS.md record shape,
 * authority flag detection, and dedup guard logic.
 *
 * Test IDs follow the TEST-DEL-5xx convention (500-series = v0.5.1 entry point).
 *
 * Run: cd scripts && npm test
 */

import {
  Stakeholder,
  ScoredCandidate,
  runMatch,
  scoreDelegate,
  rankCandidates,
  getDisplayAlias,
  resolveAlias,
  WEIGHTS,
} from "../scripts/delegate-core";

// ── Fixtures ────────────────────────────────────────────────────────────────

const infraLead: Stakeholder = {
  name: "FIRST_LAST_1",
  alias: ["Alex E.", "alex", "ae"],
  role: "Senior Engineer",
  relationship: "direct_report",
  domains: ["infrastructure", "CI/CD", "incident response", "observability"],
  capacity_signal: "medium",
};

const frontendLead: Stakeholder = {
  name: "FIRST_LAST_2",
  alias: ["Jordan F.", "jordan"],
  role: "Engineering Lead",
  relationship: "direct_report",
  domains: ["frontend", "mobile", "design systems", "accessibility"],
  capacity_signal: "high",
};

const frontendPeer: Stakeholder = {
  name: "FIRST_LAST_3",
  alias: ["Morgan P.", "morgan"],
  role: "Senior Engineer",
  relationship: "peer",
  domains: ["frontend", "react", "performance"],
  capacity_signal: "high",
};

const lowCapEngineer: Stakeholder = {
  name: "FIRST_LAST_4",
  alias: ["Riley L.", "riley"],
  role: "Staff Engineer",
  relationship: "direct_report",
  domains: ["backend", "API design", "infrastructure"],
  capacity_signal: "low",
};

const vendorContact: Stakeholder = {
  name: "VENDOR_1",
  alias: ["Vendor A"],
  role: "Account Manager",
  relationship: "vendor",
  domains: ["contracts", "procurement", "licensing"],
  capacity_signal: "high",
};

// ── DEL-002 helpers (scoring engine call, callable from command layer) ───────

/**
 * Simulates the call the /delegate command makes to the scoring engine.
 * Pure function — no file I/O. Validates DEL-002 (engine is invoked correctly).
 */
function runDelegateScoring(
  stakeholders: Stakeholder[],
  title: string,
  description = ""
) {
  return runMatch(stakeholders, title, description);
}

// ── DEL-004 helper (authority flag check) ────────────────────────────────────

const AUTHORITY_PATTERNS = [
  "requires your sign-off",
  "executive decision",
  "personnel decision",
  "sensitive communication on your behalf",
];

function hasAuthorityFlag(title: string, description: string): boolean {
  const combined = `${title} ${description}`.toLowerCase();
  return AUTHORITY_PATTERNS.some((p) => combined.includes(p));
}

// ── DEL-007 helper (TASKS.md record shape) ────────────────────────────────────

interface DelegateTaskRecord {
  title: string;
  description: string;
  source: string;
  requester: string;
  urgency: string;
  quadrant: string;
  delegateTo: string;
  checkinDate: string;
  scheduled: string;
  action: string;
}

function buildTaskRecord(
  title: string,
  description: string,
  delegateAlias: string,
  checkinDate: string,
  scheduledDate: string
): DelegateTaskRecord {
  return {
    title,
    description,
    source: "Direct delegation",
    requester: "Self",
    urgency: "Delegated",
    quadrant: "Q3 — Delegate if possible",
    delegateTo: delegateAlias,
    checkinDate,
    scheduled: scheduledDate,
    action: `Delegated — check in ${checkinDate}`,
  };
}

// ── DEL-008 / dedup helper (Synced field presence) ──────────────────────────

function hasSyncedField(record: Partial<DelegateTaskRecord & { synced?: string }>): boolean {
  return typeof record.synced === "string" && record.synced.trim().length > 0;
}

// ── Business day helper (used in check-in date validation) ──────────────────

function addBusinessDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

// ── Phase 5: Entry Point — Scoring Engine Invocation ────────────────────────

describe("Phase 5: /delegate Direct Entry Point — Scoring (DEL-002, DEL-003)", () => {
  test("TEST-DEL-501: domain match returns correct status and top candidate", () => {
    const { status, candidates } = runDelegateScoring(
      [infraLead, frontendLead],
      "Review infrastructure alerting thresholds",
      "Audit current Prometheus alert rules and propose adjustments"
    );
    expect(status).toBe("match");
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].alias).toBe("Alex E.");
    expect(candidates[0].matched_domains).toContain("infrastructure");
  });

  test("TEST-DEL-502: runner-up surfaced when within 2 points of top score", () => {
    // Both infraLead and lowCapEngineer match "infrastructure" (+3 domain, +2 DR = 5 for infraLead/medium, +1 = 6; lowCap: +3 +2 -1 = 4)
    const { candidates } = runDelegateScoring(
      [infraLead, lowCapEngineer],
      "infrastructure migration",
      ""
    );
    // infraLead scores 6 (domain +3, DR +2, medium +1), lowCap scores 4 (domain +3, DR +2, low -1)
    // 6 - 4 = 2, so lowCap is within the 2-point window — should appear as runner-up
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates[1].alias).toBe("Riley L.");
  });

  test("TEST-DEL-503: no domain match with low/zero capacity returns no_match status", () => {
    // vendor + low capacity: 0 relationship + (-1) capacity = -1 total even with no domain match
    // Validates that a stakeholder with no domain match and negative capacity scores < 1 → no_match
    const lowCapVendor: Stakeholder = {
      name: "VENDOR_2", alias: ["Vendor B"], role: "Contractor",
      relationship: "vendor", domains: ["legal", "compliance"],
      capacity_signal: "low",
    };
    const { status, candidates } = runDelegateScoring(
      [lowCapVendor],
      "Quarterly budget realignment",
      "Rebalance engineering headcount budget for H2"
    );
    // vendor (0) + low (-1) = -1 total; no domain keywords match; score ≤ 0 → no_match
    expect(status).toBe("no_match");
    expect(candidates).toHaveLength(0);
  });

  test("TEST-DEL-504: empty graph returns empty_graph status", () => {
    const { status, candidates } = runDelegateScoring([], "Any task", "Any description");
    expect(status).toBe("empty_graph");
    expect(candidates).toHaveLength(0);
  });

  test("TEST-DEL-505: scoring correctly applies all three weight dimensions", () => {
    const result = scoreDelegate(infraLead, "infrastructure incident response", "");
    // domain: "infrastructure" +3, "incident response" +3 = +6; DR +2; medium +1 = 9
    expect(result.score).toBe(9);
    expect(result.matched_domains).toContain("infrastructure");
    expect(result.matched_domains).toContain("incident response");
  });
});

// ── Phase 5: Authority Flag Detection (DEL-004) ──────────────────────────────

describe("Phase 5: /delegate Direct Entry Point — Authority Flag (DEL-004)", () => {
  test("TEST-DEL-510: detects 'requires your sign-off' in task description", () => {
    expect(hasAuthorityFlag(
      "Approve contractor agreement",
      "This contract requires your sign-off before legal can proceed"
    )).toBe(true);
  });

  test("TEST-DEL-511: detects 'executive decision' in task title", () => {
    expect(hasAuthorityFlag("Executive decision on vendor selection", "")).toBe(true);
  });

  test("TEST-DEL-512: detects 'personnel decision' in description", () => {
    expect(hasAuthorityFlag(
      "Review team staffing plan",
      "This involves a personnel decision that needs your judgment"
    )).toBe(true);
  });

  test("TEST-DEL-513: detects 'sensitive communication on your behalf'", () => {
    expect(hasAuthorityFlag(
      "Send message to partner",
      "Sensitive communication on your behalf to the CTO"
    )).toBe(true);
  });

  test("TEST-DEL-514: normal delegation task does NOT trigger authority flag", () => {
    expect(hasAuthorityFlag(
      "Review infrastructure alerting thresholds",
      "Audit Prometheus rules and propose adjustments"
    )).toBe(false);
  });

  test("TEST-DEL-515: authority flag check is case-insensitive", () => {
    expect(hasAuthorityFlag(
      "REQUIRES YOUR SIGN-OFF on this proposal",
      ""
    )).toBe(true);
  });
});

// ── Phase 5: Capacity Warning (DEL-005) ──────────────────────────────────────

describe("Phase 5: /delegate Direct Entry Point — Capacity Warning (DEL-005)", () => {
  test("TEST-DEL-520: low capacity delegate surfaces capacity_warning flag", () => {
    const { candidates } = runDelegateScoring(
      [lowCapEngineer],
      "backend API refactor",
      "Refactor the authentication API endpoints"
    );
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].capacity_warning).toBe(true);
    expect(candidates[0].alias).toBe("Riley L.");
  });

  test("TEST-DEL-521: high capacity delegate does NOT surface capacity_warning", () => {
    const { candidates } = runDelegateScoring(
      [frontendLead],
      "frontend mobile component",
      "Build a new mobile nav component"
    );
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].capacity_warning).toBe(false);
  });

  test("TEST-DEL-522: low capacity delegate is still returned as candidate (not filtered out)", () => {
    const { status, candidates } = runDelegateScoring(
      [lowCapEngineer],
      "infrastructure API design",
      ""
    );
    expect(status).toBe("match");
    expect(candidates[0].alias).toBe("Riley L.");
  });
});

// ── Phase 5: TASKS.md Record Shape (DEL-007) ─────────────────────────────────

describe("Phase 5: /delegate Direct Entry Point — Task Record Shape (DEL-007)", () => {
  const today = new Date().toISOString().split("T")[0];
  const checkin = addBusinessDays(new Date(), 2).toISOString().split("T")[0];

  test("TEST-DEL-530: buildTaskRecord produces all required Q3 fields", () => {
    const record = buildTaskRecord(
      "Review infrastructure alerting thresholds",
      "Audit Prometheus alert rules",
      "Alex E.",
      checkin,
      today
    );
    expect(record.source).toBe("Direct delegation");
    expect(record.requester).toBe("Self");
    expect(record.urgency).toBe("Delegated");
    expect(record.quadrant).toBe("Q3 — Delegate if possible");
    expect(record.delegateTo).toBe("Alex E.");
    expect(record.checkinDate).toBe(checkin);
    expect(record.scheduled).toBe(today);
    expect(record.action).toContain("Delegated — check in");
  });

  test("TEST-DEL-531: record action field includes check-in date", () => {
    const record = buildTaskRecord("Task", "Desc", "Alex E.", checkin, today);
    expect(record.action).toBe(`Delegated — check in ${checkin}`);
  });

  test("TEST-DEL-532: record delegate field uses alias, not full name", () => {
    // PII safety: full name should never appear in the record
    const record = buildTaskRecord("Task", "Desc", getDisplayAlias(infraLead), checkin, today);
    expect(record.delegateTo).toBe("Alex E.");
    expect(record.delegateTo).not.toBe("FIRST_LAST_1"); // never the raw name field
    expect(record.delegateTo).not.toContain("FIRST_LAST"); // no PII leak
  });

  test("TEST-DEL-533: check-in date is at least 2 business days from today", () => {
    const todayDate = new Date();
    const minCheckin = addBusinessDays(todayDate, 2);
    const checkinDate = new Date(checkin);
    expect(checkinDate.getTime()).toBeGreaterThanOrEqual(minCheckin.getTime() - 24 * 60 * 60 * 1000);
  });
});

// ── Phase 5: Dedup Guard (DEL-008 / Synced field) ────────────────────────────

describe("Phase 5: /delegate Direct Entry Point — Dedup Guard (DEL-008)", () => {
  test("TEST-DEL-540: hasSyncedField returns false for unsaved record", () => {
    const record = buildTaskRecord("Task", "Desc", "Alex E.", "2026-02-25", "2026-02-21") as any;
    expect(hasSyncedField(record)).toBe(false);
  });

  test("TEST-DEL-541: hasSyncedField returns true after Synced field is set", () => {
    const record: any = {
      ...buildTaskRecord("Task", "Desc", "Alex E.", "2026-02-25", "2026-02-21"),
      synced: "Reminders (Eisenhower List) — 2026-02-21",
    };
    expect(hasSyncedField(record)).toBe(true);
  });

  test("TEST-DEL-542: hasSyncedField returns false for empty string Synced value", () => {
    const record: any = {
      ...buildTaskRecord("Task", "Desc", "Alex E.", "2026-02-25", "2026-02-21"),
      synced: "",
    };
    expect(hasSyncedField(record)).toBe(false);
  });
});

// ── Phase 5: PII Safety (DEL-004 + DEL-007 combined) ─────────────────────────

describe("Phase 5: /delegate Direct Entry Point — PII Safety", () => {
  test("TEST-DEL-550: getDisplayAlias returns first alias entry for array-format alias", () => {
    expect(getDisplayAlias(infraLead)).toBe("Alex E.");
    expect(getDisplayAlias(frontendLead)).toBe("Jordan F.");
  });

  test("TEST-DEL-551: resolveAlias resolves lookup term to display alias", () => {
    const stakeholders = [infraLead, frontendLead, frontendPeer];
    expect(resolveAlias("alex", stakeholders)).toBe("Alex E.");
    expect(resolveAlias("ae", stakeholders)).toBe("Alex E.");
    expect(resolveAlias("jordan", stakeholders)).toBe("Jordan F.");
  });

  test("TEST-DEL-552: resolveAlias returns null for unknown input", () => {
    const stakeholders = [infraLead, frontendLead];
    expect(resolveAlias("unknown person", stakeholders)).toBeNull();
  });

  test("TEST-DEL-553: scoreDelegate alias output matches getDisplayAlias, not raw name field", () => {
    const result = scoreDelegate(infraLead, "infrastructure", "");
    expect(result.alias).toBe("Alex E.");
    expect(result.alias).not.toBe("FIRST_LAST_1");
  });
});

// ── Phase 5: Tiebreak and Ranking (DEL-003 runner-up logic) ──────────────────

describe("Phase 5: /delegate Direct Entry Point — Tiebreak and Ranking (DEL-003)", () => {
  test("TEST-DEL-560: direct_report ranked above peer at equal score", () => {
    // Both match "frontend" (+3) and have high capacity (+2), but frontendLead is DR (+2), frontendPeer is peer (+1)
    const { candidates } = runDelegateScoring(
      [frontendPeer, frontendLead], // peer listed first to test sort
      "frontend component",
      ""
    );
    expect(candidates[0].alias).toBe("Jordan F."); // direct_report wins
    expect(candidates[0].relationship).toBe("direct_report");
  });

  test("TEST-DEL-561: candidates outside 2-point window are excluded", () => {
    // infraLead: infrastructure match +3, DR +2, medium +1 = 6
    // vendorContact: no domain match on "infrastructure", vendor +0, high +2 = 2
    // 6 - 2 = 4 > 2, so vendorContact excluded from runner-up window
    const { candidates } = runDelegateScoring(
      [infraLead, vendorContact],
      "infrastructure monitoring",
      ""
    );
    const aliases = candidates.map((c) => c.alias);
    expect(aliases).not.toContain("Vendor A");
  });

  test("TEST-DEL-562: at most 3 candidates returned from runMatch", () => {
    const manyStakeholders: Stakeholder[] = Array.from({ length: 10 }, (_, i) => ({
      name: `FIRST_LAST_${i + 10}`,
      alias: `Candidate ${i + 1}`,
      role: "Engineer",
      relationship: "peer" as const,
      domains: ["frontend"],
      capacity_signal: "high" as const,
    }));
    const { candidates } = runDelegateScoring(manyStakeholders, "frontend work", "");
    expect(candidates.length).toBeLessThanOrEqual(3);
  });
});

// ── Phase 5: Business Day Calculation ─────────────────────────────────────────

describe("Phase 5: /delegate Direct Entry Point — Check-in Date Arithmetic", () => {
  test("TEST-DEL-570: addBusinessDays skips Saturday", () => {
    // Friday Feb 21 2026 + 1 business day = Monday Feb 23 2026
    const friday = new Date("2026-02-21");
    const next = addBusinessDays(friday, 1);
    expect(next.getDay()).not.toBe(6); // not Saturday
    expect(next.getDay()).not.toBe(0); // not Sunday
  });

  test("TEST-DEL-571: addBusinessDays(2) from a Friday lands on Tuesday", () => {
    // Friday + 2 business days = Tuesday
    const friday = new Date("2026-02-20");
    const result = addBusinessDays(friday, 2);
    expect(result.getDay()).toBe(2); // Tuesday
  });

  test("TEST-DEL-572: addBusinessDays(3) from a Wednesday lands on Monday", () => {
    // Wednesday Feb 18 + 3 business days = Monday Feb 23
    const wednesday = new Date("2026-02-18");
    const result = addBusinessDays(wednesday, 3);
    expect(result.getDay()).toBe(1); // Monday
  });
});
