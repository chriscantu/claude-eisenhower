/**
 * review-fixes-v2.test.ts
 *
 * Round-2 fixup coverage for PR #48:
 *  - buildMessage direct coverage across all 6 status branches + the
 *    runnerUpDelta null-invariant throw
 *  - invalid_graph status routing for stakeholder validation errors
 *  - intake.md mutually-exclusive Due-date origin markers
 *  - VALID_RELATIONSHIPS/VALID_CAPACITY_SIGNALS derive from WEIGHTS
 *  - /complete-task warning splits side-effect recoverability
 *  - delegate.md placeholder is a concrete value, not a value-set token
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  Stakeholder,
  ScoredCandidate,
  WEIGHTS,
  scoreDelegate,
  runMatch,
} from "../scripts/delegate-core";
import {
  buildMessage,
  loadStakeholders,
  StakeholderValidationError,
} from "../scripts/match-delegate";

const writeYaml = (content: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rev2-"));
  const p = path.join(dir, "stakeholders.yaml");
  fs.writeFileSync(p, content);
  return p;
};

const repoRoot = path.join(__dirname, "..");
const readMd = (file: string) =>
  fs.readFileSync(path.join(repoRoot, "commands", file), "utf8");

// ── buildMessage direct coverage (round-1 #1 still-open gap) ─────────────

describe("buildMessage — direct coverage across all status branches", () => {
  test("no_graph branch", () => {
    const msg = buildMessage("no_graph", [], null);
    expect(msg).toMatch(/No stakeholder graph/);
    expect(msg).toMatch(/stakeholders\.yaml\.example/);
  });

  test("empty_graph branch", () => {
    const msg = buildMessage("empty_graph", [], null);
    expect(msg).toMatch(/empty/);
    expect(msg).toMatch(/no delegates configured/);
  });

  test("no_match branch", () => {
    const msg = buildMessage("no_match", [], null);
    expect(msg).toMatch(/No clear domain match/);
  });

  test("invalid_graph branch (new in round-2)", () => {
    const msg = buildMessage("invalid_graph", [], null);
    expect(msg).toMatch(/validation/i);
  });

  test("internal_error branch (new in round-2)", () => {
    const msg = buildMessage("internal_error", [], null);
    expect(msg).toMatch(/invariant|internal/i);
  });

  const direct: Stakeholder = {
    name: "FL1", alias: "Alex", role: "Eng",
    relationship: "direct_report", domains: ["backend"], capacity_signal: "high",
  };
  const peer: Stakeholder = {
    name: "FL2", alias: "Sam", role: "Eng",
    relationship: "peer", domains: ["backend"], capacity_signal: "medium",
  };

  test("match branch — single candidate (no runner-up line)", () => {
    const { candidates, runnerUpDelta } = runMatch([direct], "backend work");
    const msg = buildMessage("match", candidates, runnerUpDelta);
    expect(msg).toMatch(/Suggested delegate: Alex/);
    expect(msg).not.toMatch(/Runner-up/);
    expect(msg).not.toMatch(/Also considered/);
  });

  test("match branch — 2 candidates renders runner-up with delta", () => {
    const { candidates, runnerUpDelta } = runMatch([direct, peer], "backend work");
    const msg = buildMessage("match", candidates, runnerUpDelta);
    expect(msg).toMatch(/Suggested delegate: Alex/);
    expect(msg).toMatch(/Runner-up: Sam/);
    expect(msg).toMatch(/\(delta \d+\)/);
  });

  test("match branch — 3 candidates renders 'Also considered'", () => {
    const third: Stakeholder = {
      name: "FL3", alias: "Casey", role: "Eng",
      relationship: "peer", domains: ["backend"], capacity_signal: "low",
    };
    const { candidates, runnerUpDelta } = runMatch(
      [direct, peer, third], "backend work"
    );
    const msg = buildMessage("match", candidates, runnerUpDelta);
    expect(msg).toMatch(/Also considered: Casey/);
  });

  test("match branch — capacity warning appends note for top candidate", () => {
    const lowCap: Stakeholder = {
      name: "FL_LC", alias: "Tired", role: "Eng",
      relationship: "direct_report", domains: ["backend"], capacity_signal: "low",
    };
    const { candidates, runnerUpDelta } = runMatch([lowCap], "backend work");
    const msg = buildMessage("match", candidates, runnerUpDelta);
    expect(msg).toMatch(/showing low capacity/);
  });

  test("match branch — throws when runnerUpDelta is null but 2+ candidates", () => {
    // Synthesize the illegal state directly (runMatch never produces this).
    const fakeCandidates: ScoredCandidate[] = [
      { ...scoreDelegate(direct, "x", ""), alias: "A" },
      { ...scoreDelegate(peer, "x", ""), alias: "B" },
    ];
    expect(() => buildMessage("match", fakeCandidates, null))
      .toThrow(/runnerUpDelta cannot be null when candidates\.length === 2/);
  });
});

// ── invalid_graph routing (round-2 critical N4) ──────────────────────────

describe("Stakeholder validation routes to invalid_graph (not no_graph)", () => {
  test("loadStakeholders throws StakeholderValidationError on bad enum", () => {
    const p = writeYaml(`stakeholders:
  - name: First Last
    alias: Alex E.
    role: Engineer
    relationship: contractor
    domains: [backend]
    capacity_signal: high
`);
    expect(() => loadStakeholders(p)).toThrow(StakeholderValidationError);
  });

  test("StakeholderValidationError carries identifying detail", () => {
    const p = writeYaml(`stakeholders:
  - name: First Last
    alias: Alex E.
    role: Engineer
    relationship: contractor
    domains: [backend]
    capacity_signal: high
`);
    try {
      loadStakeholders(p);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(StakeholderValidationError);
      expect((e as Error).message).toMatch(/Alex E\..*contractor/);
    }
  });

  test("YAML parse error is NOT a StakeholderValidationError (still no_graph)", () => {
    const p = writeYaml(`bad: yaml: :\n  - [invalid\n`);
    try {
      loadStakeholders(p);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).not.toBeInstanceOf(StakeholderValidationError);
      expect((e as Error).message).toMatch(/Failed to parse/);
    }
  });
});

// ── VALID_* derived from WEIGHTS (round-2 important N5) ──────────────────

describe("Stakeholder enum validators derive from WEIGHTS", () => {
  test("every Object.keys(WEIGHTS.relationship) accepted by loadStakeholders", () => {
    for (const rel of Object.keys(WEIGHTS.relationship)) {
      const p = writeYaml(`stakeholders:
  - name: First Last
    alias: Tester
    role: Eng
    relationship: ${rel}
    domains: [backend]
    capacity_signal: high
`);
      expect(() => loadStakeholders(p)).not.toThrow();
    }
  });

  test("every Object.keys(WEIGHTS.capacity) accepted by loadStakeholders", () => {
    for (const cap of Object.keys(WEIGHTS.capacity)) {
      const p = writeYaml(`stakeholders:
  - name: First Last
    alias: Tester
    role: Eng
    relationship: peer
    domains: [backend]
    capacity_signal: ${cap}
`);
      expect(() => loadStakeholders(p)).not.toThrow();
    }
  });
});

// ── intake.md mutually-exclusive markers (round-2 critical N1+N2) ────────

describe("intake.md — Due date markers + template anchor consistency", () => {
  const md = readMd("intake.md");

  test("Due date origin markers are mutually exclusive (verbatim | parsed | not mentioned)", () => {
    // Old Due-date marker was `(parsed from "[phrase]" | stated | not mentioned)`
    // where "stated" overlapped both verbatim and parsed cases. New marker
    // is `(verbatim | parsed from "..." | not mentioned)`.
    expect(md).toMatch(/verbatim/i);
    expect(md).toMatch(/parsed from/i);
    // Specifically: the Due-date confirmation-block line must NOT use the
    // legacy "stated | not mentioned" markers.
    const dueDateMarkerLine = md.match(/Due date:.*\(.*\)/g) ?? [];
    for (const line of dueDateMarkerLine) {
      expect(line).not.toMatch(/\bstated\b/);
    }
  });

  test("template no longer uses legacy {raw due date}", () => {
    // Round-1 fixup added new format but left the canonical template
    // emitting "{raw due date}" — anchor stripped on persisted record.
    expect(md).not.toMatch(/\{raw due date\}/);
  });

  test("template uses {TODAY-ISO} token (consistent with anchor section)", () => {
    expect(md).toMatch(/\{TODAY-ISO\}/);
  });

  test("anchor-missing fallback instruction present", () => {
    // If `# currentDate` is absent, prompt must instruct asking the user
    // rather than silently using a prompt-internal example as anchor.
    expect(md).toMatch(/(STOP|ask the user).*today/i);
  });
});

// ── /complete-task warning splits side-effect class (round-2 important N7) ────

describe("complete-task.md — no-undo warning split by side-effect class", () => {
  const md = readMd("complete-task.md");

  test("warning distinguishes TASKS.md (reversible) from Reminders (not)", () => {
    expect(md).toMatch(/Reminders.*(cannot|does NOT) undo|cannot be auto-undone/i);
    expect(md).toMatch(/reversible|hand.?edit/i);
  });
});

// ── delegate.md placeholder is concrete, not value-set (round-2 N11) ─────

describe("delegate.md — learnings example uses concrete Reason value", () => {
  const md = readMd("delegate.md");

  test("example row uses ONE concrete Reason value (not the alternatives list)", () => {
    // Old example had `domain / capacity / relationship` literal in the
    // Reason cell — Claude could pattern-match the example and write the
    // literal string. New example must use ONE of the values.
    expect(md).not.toMatch(/\|\s*domain\s*\/\s*capacity\s*\/\s*relationship\s*\|/);
  });

  test("prompt explicitly forbids writing the alternatives list verbatim", () => {
    // Pattern may span a line break.
    expect(md).toMatch(/Do NOT write the literal string\s+"domain \/ capacity \/ relationship"/s);
  });

  test("Reason allowed-set is explicit (includes declined)", () => {
    // Use s-flag so `.` crosses newlines.
    expect(md).toMatch(/EXACTLY ONE of:[\s\S]*declined/);
  });
});

// ── delegate.md and prioritize.md handle invalid_graph (round-2 N4) ──────

describe("Prompts handle invalid_graph + internal_error status", () => {
  const delegateMd = readMd("delegate.md");
  const prioritizeMd = readMd("prioritize.md");

  test("delegate.md routes invalid_graph distinctly (do NOT 'create file')", () => {
    expect(delegateMd).toMatch(/invalid_graph/);
    expect(delegateMd).toMatch(/do NOT.*create the file|already have/i);
  });

  test("delegate.md handles internal_error", () => {
    expect(delegateMd).toMatch(/internal_error/);
  });

  test("prioritize.md routes invalid_graph", () => {
    expect(prioritizeMd).toMatch(/invalid_graph/);
  });
});
