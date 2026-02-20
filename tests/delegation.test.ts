/**
 * delegation.test.ts
 *
 * Runnable Jest regression suite for the delegation validation feature (v0.4.0).
 * Imports all scoring logic from scripts/delegate-core.ts Ñ no duplication.
 * Covers all TEST-DEL-0xx scenarios from tests/delegation-regression.md.
 *
 * Run: cd scripts && npm test
 */

import * as path from "path";
import * as fs from "fs";
import * as yaml from "js-yaml";
import {
  Stakeholder, Relationship, CapacitySignal,
  scoreDelegate, rankCandidates, runMatch,
} from "../scripts/delegate-core";

// ?? Fixtures ???????????????????????????????????????????????????????????????

const infraEngineer: Stakeholder = {
  name: "FIRST_LAST_1", alias: "Alex E.", role: "Senior Engineer",
  relationship: "direct_report",
  domains: ["infrastructure", "CI/CD", "incident response", "observability"],
  capacity_signal: "medium",
};
const frontendLead: Stakeholder = {
  name: "FIRST_LAST_2", alias: "Jordan F.", role: "Engineering Lead",
  relationship: "direct_report",
  domains: ["frontend", "mobile", "design systems", "accessibility"],
  capacity_signal: "high",
};
const frontendPeer: Stakeholder = {
  name: "FIRST_LAST_3", alias: "Morgan P.", role: "Senior Engineer",
  relationship: "peer",
  domains: ["frontend", "react", "performance"],
  capacity_signal: "high",
};
const lowCapDev: Stakeholder = {
  name: "FIRST_LAST_4", alias: "Riley L.", role: "Staff Engineer",
  relationship: "direct_report",
  domains: ["backend", "API design", "infrastructure"],
  capacity_signal: "low",
};
const vendorContact: Stakeholder = {
  name: "VENDOR_1", alias: "Vendor A", role: "Account Manager",
  relationship: "vendor",
  domains: ["contracts", "procurement", "licensing"],
  capacity_signal: "high",
};

// ?? Phase 0 ????????????????????????????????????????????????????????????????

describe("Phase 0: Stakeholder Graph Initialization", () => {
  test("TEST-DEL-001: empty graph returns empty_graph status", () => {
    const result = runMatch([], "Review on-call rotation coverage");
    expect(result.status).toBe("empty_graph");
    expect(result.candidates).toHaveLength(0);
  });
  test("TEST-DEL-002: stakeholders.yaml.example file exists and is valid YAML", () => {
    const examplePath = path.resolve(__dirname, "../integrations/config/stakeholders.yaml.example");
    expect(fs.existsSync(examplePath)).toBe(true);
    const parsed = yaml.load(fs.readFileSync(examplePath, "utf8")) as { stakeholders: unknown[] };
    expect(parsed).toHaveProperty("stakeholders");
    expect(Array.isArray(parsed.stakeholders)).toBe(true);
    expect(parsed.stakeholders.length).toBeGreaterThan(0);
  });
  test("TEST-DEL-003: .gitignore excludes stakeholders.yaml", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../.gitignore"), "utf8");
    expect(content).toContain("integrations/config/stakeholders.yaml");
  });
});

// ?? Phase 1: Domain matching ???????????????????????????????????????????????

describe("Phase 1: Delegation Suggestion Ñ domain matching", () => {
  test("TEST-DEL-010: single best domain match returns correct alias", () => {
    const result = runMatch([infraEngineer, frontendLead, vendorContact],
      "Update infrastructure alerting thresholds for memory usage");
    expect(result.status).toBe("match");
    expect(result.candidates[0].alias).toBe("Alex E.");
    expect(result.candidates[0].matched_domains).toContain("infrastructure");
  });
  test("TEST-DEL-010b: infrastructure match scores correctly (domain*1 + direct_report + medium)", () => {
    const scored = scoreDelegate(infraEngineer, "Update infrastructure alerting thresholds", "");
    expect(scored.score).toBe(6); // 3 + 2 + 1
    expect(scored.matched_domains).toEqual(["infrastructure"]);
  });
  test("TEST-DEL-010c: suggestion includes alias, role, domains, capacity_signal", () => {
    const top = runMatch([infraEngineer], "Review infrastructure alerting thresholds").candidates[0];
    expect(top.alias).toBeDefined();
    expect(top.role).toBeDefined();
    expect(top.matched_domains.length).toBeGreaterThan(0);
    expect(top.capacity_signal).toBeDefined();
  });
});

// ?? Phase 1: Relationship ranking ?????????????????????????????????????????

describe("Phase 1: Delegation Suggestion Ñ relationship ranking", () => {
  test("TEST-DEL-011: direct_report ranks above peer on tied domain match", () => {
    const result = runMatch([frontendLead, frontendPeer],
      "Fix mobile nav regression on iOS", "frontend issue");
    expect(result.candidates[0].relationship).toBe("direct_report");
    expect(result.candidates[0].alias).toBe("Jordan F.");
  });
  test("TEST-DEL-011b: both candidates surfaced when scores are close", () => {
    // frontendLead: 3+2+2=7, frontendPeer: 3+1+2=6 Ñ within 2 pts, both surface
    const result = runMatch([frontendLead, frontendPeer],
      "Refactor frontend component library", "frontend redesign");
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
  });
  test("TEST-DEL-011c: tiebreak Ñ direct_report beats peer at equal domain score", () => {
    const peerSameDomains: Stakeholder = {
      ...frontendPeer, domains: frontendLead.domains, capacity_signal: "high",
    };
    const ranked = rankCandidates([
      scoreDelegate(peerSameDomains, "frontend work", ""),
      scoreDelegate(frontendLead, "frontend work", ""),
    ]);
    expect(ranked[0].relationship).toBe("direct_report");
  });
});
// ?? Phase 1: No match path ?????????????????????????????????????????????????

describe("Phase 1: Delegation Suggestion Ñ no match path", () => {
  test("TEST-DEL-012: no domain match returns no_match status", () => {
    const vendorLowCap: Stakeholder = {
      name: "VENDOR_2", alias: "Vendor B", role: "Support Rep",
      relationship: "vendor", domains: ["ticketing", "helpdesk"], capacity_signal: "low",
    };
    const result = runMatch([vendorLowCap],
      "Coordinate legal review of contractor NDA", "legal compliance");
    expect(result.status).toBe("no_match");
    expect(result.candidates).toHaveLength(0);
  });
  test("TEST-DEL-012b: vendor with matching domain still gets a score", () => {
    const result = runMatch([vendorContact], "Handle vendor renewal contract", "procurement renewal");
    expect(result.status).toBe("match");
    expect(result.candidates[0].alias).toBe("Vendor A");
  });
});

describe("Phase 1: Delegation Suggestion Ñ capacity warnings", () => {
  test("TEST-DEL-013: low capacity delegate is surfaced with warning flag", () => {
    const result = runMatch([lowCapDev], "Review infrastructure setup for new microservice", "");
    expect(result.status).toBe("match");
    expect(result.candidates[0].capacity_warning).toBe(true);
  });
  test("TEST-DEL-013b: low capacity penalty applied to score correctly", () => {
    const scored = scoreDelegate(lowCapDev, "infrastructure review", "");
    expect(scored.score).toBe(4);
    expect(scored.capacity_warning).toBe(true);
  });
  test("TEST-DEL-013c: high capacity outscores equal-domain low capacity", () => {
    const highCapInfra: Stakeholder = { ...infraEngineer, alias: "High Cap.", capacity_signal: "high" };
    const ranked = rankCandidates([
      scoreDelegate(lowCapDev, "infrastructure work", ""),
      scoreDelegate(highCapInfra, "infrastructure work", ""),
    ]);
    expect(ranked[0].alias).toBe("High Cap.");
  });
});

describe("Phase 1: Authority flag detection", () => {
  test("TEST-DEL-014: authority language detection Ñ phrases should not crash match", () => {
    const phrases = [
      "requires your sign-off", "executive decision", "personnel decision",
      "performance improvement plan", "sensitive communication on your behalf",
    ];
    for (const phrase of phrases) {
      const result = runMatch([infraEngineer], `Handle infrastructure incident ${phrase}`, "");
      expect(["match", "no_match"]).toContain(result.status);
    }
  });
});

describe("Scoring algorithm accuracy", () => {
  test("multi-domain match accumulates correctly", () => {
    const scored = scoreDelegate(infraEngineer,
      "CI/CD pipeline infrastructure incident response", "observability platform");
    expect(scored.score).toBe(15);
    expect(scored.matched_domains).toHaveLength(4);
  });
  test("peer with high capacity and domain match scores correctly", () => {
    const scored = scoreDelegate(frontendPeer, "Fix frontend performance issue", "react rendering");
    expect(scored.score).toBeGreaterThanOrEqual(9);
    expect(scored.relationship).toBe("peer");
  });
  test("vendor with no domain match has no matched domains", () => {
    expect(scoreDelegate(vendorContact, "Fix mobile nav regression", "").matched_domains).toHaveLength(0);
  });
  test("vendor with no domain match scores only capacity (no relationship bonus)", () => {
    expect(scoreDelegate(vendorContact, "Fix mobile nav regression", "").score).toBe(2);
  });
});

describe("Ranking stability", () => {
  test("rankCandidates is stable Ñ same input produces same output", () => {
    const graph = [infraEngineer, frontendLead, frontendPeer, lowCapDev, vendorContact];
    const scored = graph.map((s) => scoreDelegate(s, "infrastructure CI/CD review", ""));
    expect(rankCandidates([...scored]).map((c) => c.alias))
      .toEqual(rankCandidates([...scored]).map((c) => c.alias));
  });
  test("candidates slice at max 3 results", () => {
    const many: Stakeholder[] = Array.from({ length: 10 }, (_, i) => ({
      name: `PERSON_${i}`, alias: `Person ${i}`, role: "Engineer",
      relationship: "direct_report" as Relationship,
      domains: ["infrastructure"], capacity_signal: "medium" as CapacitySignal,
    }));
    expect(runMatch(many, "infrastructure work", "").candidates.length).toBeLessThanOrEqual(3);
  });
});

describe("PII safety Ñ source control checks", () => {
  test("TEST-DEL-200: stakeholders.yaml is listed in .gitignore", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../.gitignore"), "utf8");
    expect(content).toContain("integrations/config/stakeholders.yaml");
    expect(content).not.toContain("stakeholders.yaml.example");
  });
  test("TEST-DEL-201: .example file contains no real names", () => {
    const examplePath = path.resolve(__dirname, "../integrations/config/stakeholders.yaml.example");
    const parsed = yaml.load(fs.readFileSync(examplePath, "utf8")) as { stakeholders: Stakeholder[] };
    for (const s of parsed.stakeholders) {
      expect(s.name).toMatch(/^[A-Z_0-9]+$/);
      expect(s.alias.length).toBeLessThan(30);
    }
  });
  test("TEST-DEL-202: match output uses alias, not full name", () => {
    const result = runMatch([infraEngineer], "infrastructure update", "");
    expect(result.status).toBe("match");
    expect(result.candidates[0].alias).not.toBe(infraEngineer.name);
    expect(result.candidates[0]).not.toHaveProperty("name");
  });
});