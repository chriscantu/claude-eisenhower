/**
 * scoring-transparency.test.ts
 *
 * Issue #26 — delegation scoring transparency.
 * Validates that ScoredCandidate exposes a per-axis breakdown summing to
 * the total score, that runMatch returns top-3 (not within-2-points cutoff),
 * and that runnerUpDelta is computed.
 *
 * Run: cd scripts && npm test
 */

import {
  Stakeholder,
  scoreDelegate,
  runMatch,
  WEIGHTS,
  breakdownSum,
} from "../scripts/delegate-core";
import { renderScorecard } from "../scripts/match-delegate";

const infraDirect: Stakeholder = {
  name: "FIRST_LAST_1", alias: "Alex E.", role: "Senior Engineer",
  relationship: "direct_report",
  domains: ["infrastructure", "CI/CD", "observability"],
  capacity_signal: "high",
};

const infraPeer: Stakeholder = {
  name: "FIRST_LAST_2", alias: "Sam P.", role: "Senior Engineer",
  relationship: "peer",
  domains: ["infrastructure"],
  capacity_signal: "medium",
};

const lowCapVendor: Stakeholder = {
  name: "VENDOR_1", alias: "Vendor X", role: "Account Manager",
  relationship: "vendor",
  domains: ["contracts"],
  capacity_signal: "low",
};

const vetoed: Stakeholder = {
  name: "FIRST_LAST_3", alias: "Jane V.", role: "Engineer",
  relationship: "direct_report",
  domains: ["frontend"],
  anti_domains: ["compliance"],
  capacity_signal: "high",
};

describe("Issue #26: scoring breakdown is exposed", () => {
  test("breakdownSum equals score (no veto, no pending)", () => {
    const c = scoreDelegate(infraDirect, "Update infrastructure alerting", "");
    const b = c.breakdown;
    expect(b.domain).toBe(WEIGHTS.domain_match); // 1 match
    expect(b.relationship).toBe(WEIGHTS.relationship.direct_report);
    expect(b.capacity).toBe(WEIGHTS.capacity.high);
    expect(b.pending).toBe(0);
    expect(b.vetoed).toBe(false);
    expect(b.domain + b.relationship + b.capacity + b.pending).toBe(c.score);
    expect(breakdownSum(b)).toBe(c.score);
  });

  test("breakdown reflects negative components (peer + medium capacity)", () => {
    const c = scoreDelegate(infraPeer, "Update infrastructure alerting", "");
    expect(c.breakdown.domain).toBe(3);
    expect(c.breakdown.relationship).toBe(1);
    expect(c.breakdown.capacity).toBe(1);
    expect(c.score).toBe(5);
  });

  test("breakdown reports pending penalty separately", () => {
    const c = scoreDelegate(infraDirect, "Infrastructure work", "", 5);
    // overload = max(0, 5-2) = 3; pending = 3 * -2 = -6
    expect(c.breakdown.pending).toBe(-6);
    expect(breakdownSum(c.breakdown)).toBe(c.score);
  });

  test("pending is strict +0 (not -0) when no overload", () => {
    const c = scoreDelegate(infraDirect, "Infrastructure work", "", 0);
    // Object.is differentiates +0 from -0; toBe uses Object.is.
    expect(Object.is(c.breakdown.pending, 0)).toBe(true);
    expect(Object.is(c.breakdown.pending, -0)).toBe(false);
  });

  test("vetoed candidate has -Infinity score, breakdown.vetoed=true", () => {
    const c = scoreDelegate(vetoed, "Frontend compliance dashboard", "");
    expect(c.score).toBe(-Infinity);
    expect(c.breakdown.vetoed).toBe(true);
    expect(breakdownSum(c.breakdown)).toBe(-Infinity);
  });
});

describe("Issue #26: runMatch returns top-3 + runnerUpDelta", () => {
  test("top 3 candidates surfaced even on clear win", () => {
    // direct (high) beats peer (medium) clearly; lowCapVendor scored 0.
    // Previous within-2-points cutoff would have dropped peer; we now always
    // return top 3 viable so the user can calibrate trust.
    const result = runMatch([infraDirect, infraPeer, lowCapVendor],
      "Update infrastructure alerting thresholds");
    expect(result.status).toBe("match");
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.candidates[0].alias).toBe("Alex E.");
    expect(result.candidates[1].alias).toBe("Sam P.");
  });

  test("runnerUpDelta is top.score - runnerUp.score", () => {
    const result = runMatch([infraDirect, infraPeer],
      "Update infrastructure alerting");
    // direct: 3+2+2 = 7; peer: 3+1+1 = 5; delta = 2
    expect(result.runnerUpDelta).toBe(2);
  });

  test("runnerUpDelta is null with single candidate", () => {
    const result = runMatch([infraDirect], "Infrastructure work");
    expect(result.runnerUpDelta).toBeNull();
  });

  test("runnerUpDelta is null on no_match", () => {
    const result = runMatch([lowCapVendor], "Build a React component");
    expect(result.status).toBe("no_match");
    expect(result.runnerUpDelta).toBeNull();
  });
});

describe("Issue #26: renderScorecard produces narrative format", () => {
  test("scorecard includes alias, total, and per-axis components", () => {
    const c = scoreDelegate(infraDirect, "Update infrastructure alerting", "");
    const card = renderScorecard(c);
    expect(card).toContain("Alex E.");
    expect(card).toContain("(7)");
    expect(card).toContain("domain +3");
    expect(card).toContain("infrastructure");
    expect(card).toContain("direct_report +2");
    expect(card).toContain("capacity high +2");
  });

  test("scorecard surfaces negative pending component", () => {
    const c = scoreDelegate(infraDirect, "Infrastructure work", "", 5);
    const card = renderScorecard(c);
    expect(card).toContain("pending -6");
  });

  test("scorecard renders relationship axis even when weight is 0 (vendor)", () => {
    // Vendor relationship weight is 0. Previous behavior silently omitted
    // the axis, making "vendor by design" indistinguishable from "enum
    // missing from WEIGHTS" config bug.
    const card = renderScorecard(
      scoreDelegate(lowCapVendor, "Negotiate contracts renewal", "")
    );
    expect(card).toContain("Vendor X");
    expect(card).toContain("vendor 0"); // axis rendered explicitly
  });

  test("scorecard renders all axes (domain 0 + zero-weight rel) for transparency", () => {
    const peer0: Stakeholder = {
      name: "FIRST_LAST_99", alias: "Generic P.", role: "Peer",
      relationship: "peer", domains: ["something-unrelated"],
      capacity_signal: "medium",
    };
    const card = renderScorecard(
      scoreDelegate(peer0, "Task with no domain match", "")
    );
    expect(card).toContain("domain 0");
    expect(card).toContain("peer +1");
    expect(card).toContain("capacity medium +1");
  });
});

describe("Issue #26: delegate.md prompt requires narrative scorecard", () => {
  const fs = require("fs");
  const path = require("path");
  const delegateMd = fs.readFileSync(
    path.join(__dirname, "..", "commands", "delegate.md"),
    "utf8"
  );

  test("delegate.md references the renderScorecard / breakdown output", () => {
    // Prompt must instruct Claude to show the scorecard, not just the
    // legacy one-line reason. Required tokens:
    expect(delegateMd).toMatch(/scorecard|breakdown/i);
    expect(delegateMd).toMatch(/runner.?up/i);
  });

  test("delegate.md includes override learning loop", () => {
    expect(delegateMd).toMatch(/learn|override.*reason|wrong.*because/i);
  });
});
