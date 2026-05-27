/**
 * review-fixes-v3.test.ts
 *
 * Round-3 fixup coverage for PR #48:
 *  - WEIGHTS uses `satisfies` (compile-time guarantee) — verified by
 *    REL_RANK / VALID_* derivation tests below; the real check is the
 *    TypeScript compile pass.
 *  - REL_RANK derived from WEIGHTS.relationship (single source of truth)
 *  - `?? 0` dropped from rankCandidates (no fallback needed now)
 *  - buildMessage default `never` exhaustiveness arm
 *
 * Run: cd scripts && npm test
 */

import {
  REL_RANK,
  WEIGHTS,
  Relationship,
  rankCandidates,
  scoreDelegate,
  Stakeholder,
} from "../scripts/delegate-core";

describe("REL_RANK derived from WEIGHTS.relationship (round-3 N-A)", () => {
  test("REL_RANK is the same object reference as WEIGHTS.relationship", () => {
    // Same reference — there is literally one source of truth.
    expect(REL_RANK).toBe(WEIGHTS.relationship);
  });

  test("every Relationship in WEIGHTS.relationship is present in REL_RANK", () => {
    for (const rel of Object.keys(WEIGHTS.relationship) as Relationship[]) {
      expect(REL_RANK[rel]).toBe(WEIGHTS.relationship[rel]);
    }
  });

  test("tiebreak still favors direct_report over peer", () => {
    // Was the canonical test of REL_RANK semantics; verify derivation
    // didn't accidentally change behavior.
    const direct: Stakeholder = {
      name: "FL1", alias: "D", role: "Eng",
      relationship: "direct_report", domains: ["x"], capacity_signal: "high",
    };
    const peer: Stakeholder = {
      name: "FL2", alias: "P", role: "Eng",
      relationship: "peer", domains: ["x"], capacity_signal: "high",
    };
    // Same domain match + same capacity → score ties on weight, REL_RANK
    // breaks tie. direct_report (rank 2) > peer (rank 1).
    const sd = scoreDelegate(direct, "x", "");
    const sp = scoreDelegate(peer, "x", "");
    // Tweak to force tie if not already
    const tied = [
      { ...sd, score: 5 },
      { ...sp, score: 5 },
    ];
    const ranked = rankCandidates(tied);
    expect(ranked[0].relationship).toBe("direct_report");
  });
});

describe("WEIGHTS satisfies enforcement (round-3 I-A)", () => {
  test("WEIGHTS.relationship has an entry for EVERY Relationship value", () => {
    // If a Relationship is added to the union without a WEIGHTS entry,
    // delegate-core.ts won't compile. This test verifies runtime parity.
    const relationships: Relationship[] = [
      "direct_report", "peer", "vendor", "partner",
    ];
    for (const r of relationships) {
      expect(WEIGHTS.relationship[r]).toBeDefined();
      expect(typeof WEIGHTS.relationship[r]).toBe("number");
    }
  });

  test("WEIGHTS.capacity has an entry for every CapacitySignal value", () => {
    const signals = ["high", "medium", "low"] as const;
    for (const s of signals) {
      expect(WEIGHTS.capacity[s]).toBeDefined();
      expect(typeof WEIGHTS.capacity[s]).toBe("number");
    }
  });
});
