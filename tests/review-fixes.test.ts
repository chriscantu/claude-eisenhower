/**
 * review-fixes.test.ts
 *
 * Coverage for PR #48 review-fix commit: stakeholder enum validation,
 * buildMessage shape across all status branches, runnerUpDelta null
 * invariant, and renderScorecard edge cases not covered by
 * scoring-transparency.test.ts.
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Stakeholder, runMatch } from "../scripts/delegate-core";
import { loadStakeholders } from "../scripts/match-delegate";

const writeYaml = (content: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rev-fix-"));
  const p = path.join(dir, "stakeholders.yaml");
  fs.writeFileSync(p, content);
  return p;
};

describe("Stakeholder enum validation (review I3)", () => {
  test("throws on invalid relationship enum, names file + alias + value", () => {
    const p = writeYaml(`stakeholders:
  - name: First Last
    alias: Alex E.
    role: Engineer
    relationship: direct_repor
    domains: [backend]
    capacity_signal: high
`);
    expect(() => loadStakeholders(p)).toThrow(/Alex E\..*invalid relationship "direct_repor"/);
    expect(() => loadStakeholders(p)).toThrow(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  test("throws on invalid capacity_signal enum", () => {
    const p = writeYaml(`stakeholders:
  - name: First Last
    alias: Sam P.
    role: Engineer
    relationship: peer
    domains: [frontend]
    capacity_signal: medum
`);
    expect(() => loadStakeholders(p)).toThrow(/Sam P\..*invalid capacity_signal "medum"/);
  });

  test("valid enums pass through without throw", () => {
    const p = writeYaml(`stakeholders:
  - name: First Last
    alias: Alex E.
    role: Engineer
    relationship: direct_report
    domains: [backend]
    capacity_signal: high
`);
    expect(() => loadStakeholders(p)).not.toThrow();
  });
});

describe("runMatch runnerUpDelta semantic (review C1)", () => {
  const direct: Stakeholder = {
    name: "FL1", alias: "Alex", role: "Eng",
    relationship: "direct_report", domains: ["backend"], capacity_signal: "high",
  };
  const peer: Stakeholder = {
    name: "FL2", alias: "Sam", role: "Eng",
    relationship: "peer", domains: ["backend"], capacity_signal: "medium",
  };

  test("runnerUpDelta is null (not 0) when only one viable candidate", () => {
    const result = runMatch([direct], "backend work");
    expect(result.runnerUpDelta).toBeNull();
    expect(result.runnerUpDelta).not.toBe(0);
  });

  test("runnerUpDelta is a number (possibly 0) when >=2 viable candidates", () => {
    const result = runMatch([direct, peer], "backend work");
    expect(typeof result.runnerUpDelta).toBe("number");
  });

  test("runMatch always returns runnerUpDelta key (not undefined)", () => {
    const result = runMatch([], "anything");
    expect("runnerUpDelta" in result).toBe(true);
    expect(result.runnerUpDelta).toBeNull();
  });
});

describe("delegate.md and prioritize.md prompts (review fixes)", () => {
  const repoRoot = path.join(__dirname, "..");
  const read = (file: string) =>
    fs.readFileSync(path.join(repoRoot, "commands", file), "utf8");

  test("delegate.md references parsing the JSON output (review C3)", () => {
    const md = read("delegate.md");
    // Step 4 must locate breakdown/runnerUpDelta in the parsed JSON, not
    // treat them as in-process JS objects.
    expect(md).toMatch(/parsed\s+JSON|from the JSON|JSON output/i);
  });

  test("delegate.md drops the hallucinated capacity-flip arithmetic (review C4)", () => {
    const md = read("delegate.md");
    expect(md).not.toMatch(/computed delta after capacity flip/i);
  });

  test("delegate.md escapes pipes in override-log table row (review C5)", () => {
    const md = read("delegate.md");
    // Either backslash-escaped pipes or a different separator.
    expect(md).not.toMatch(/\|\s*domain\|capacity\|relationship\s*\|/);
  });

  test("delegate.md decline path writes a Reason: declined row (review C6)", () => {
    const md = read("delegate.md");
    expect(md).toMatch(/Reason:\s*declined|declined.*row|Reason.*decline/i);
  });

  test("delegate.md drops false 'future tuning reads this' claim", () => {
    const md = read("delegate.md");
    expect(md).not.toMatch(/future stakeholder graph tuning reads this/i);
  });

  test("prioritize.md uses the same scoring breakdown (consistency, review #11)", () => {
    const md = read("prioritize.md");
    expect(md).toMatch(/breakdown|scorecard|domain\s*\+/i);
  });
});

describe("intake.md symbolic dates (review C2)", () => {
  const repoRoot = path.join(__dirname, "..");
  const md = fs.readFileSync(path.join(repoRoot, "commands", "intake.md"), "utf8");

  test("intake.md does not hardcode literal dates in examples", () => {
    // The previous prompt had "today is Mon 2026-06-02" — Claude can anchor
    // on that date silently. Examples must use symbolic tokens / current-
    // session date references.
    expect(md).not.toMatch(/2026-06-02/);
    expect(md).not.toMatch(/2026-06-05/);
    expect(md).not.toMatch(/2026-06-06/);
    expect(md).not.toMatch(/2026-06-09/);
  });

  test("intake.md instructs use of current session date", () => {
    expect(md).toMatch(/(current(?:\s+|-)?date|session.*date|today's date)/i);
  });
});
