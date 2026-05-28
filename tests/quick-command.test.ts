/**
 * quick-command.test.ts
 *
 * Contract tests for issue #35 — /quick one-shot collapses
 * /intake → /prioritize → /schedule into a single confirmation.
 *
 * Test IDs follow the TEST-QUICK-xxx convention.
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("Quick command: frontmatter and presence (TEST-QUICK-001)", () => {
  test("TEST-QUICK-001a: commands/quick.md exists", () => {
    expect(fs.existsSync(path.join(ROOT, "commands/quick.md"))).toBe(true);
  });

  test("TEST-QUICK-001b: frontmatter declares description, argument-hint, allowed-tools", () => {
    const c = readFile("commands/quick.md");
    expect(c).toMatch(/^---\n[\s\S]*?\n---/);
    expect(c).toMatch(/^description:/m);
    expect(c).toMatch(/^argument-hint:/m);
    expect(c).toMatch(/^allowed-tools:/m);
  });

  test("TEST-QUICK-001c: command accepts $ARGUMENTS", () => {
    expect(readFile("commands/quick.md")).toMatch(/\$ARGUMENTS/);
  });
});

describe("Quick command: pipeline references existing rules (TEST-QUICK-002)", () => {
  const c = readFile("commands/quick.md");

  test("TEST-QUICK-002a: defers parsing to commands/intake.md rules", () => {
    expect(c).toMatch(/commands\/intake\.md/);
  });

  test("TEST-QUICK-002b: defers Q3 delegate scoring to commands/prioritize.md Step 4b", () => {
    expect(c).toMatch(/prioritize\.md/);
    expect(c).toMatch(/Step 4b/i);
  });

  test("TEST-QUICK-002c: requires # currentDate anchor like intake", () => {
    expect(c).toMatch(/# currentDate/);
  });

  test("TEST-QUICK-002d: references AUTHORITY_PATTERNS / authority flag", () => {
    expect(c).toMatch(/AUTHORITY_PATTERNS|authority/i);
  });
});

describe("Quick command: single-confirmation contract (TEST-QUICK-003)", () => {
  const c = readFile("commands/quick.md");

  test("TEST-QUICK-003a: presents a single confirmation block with Confirm / edit / cancel", () => {
    expect(c).toMatch(/Confirm \/ edit \/ cancel\?/);
  });

  test("TEST-QUICK-003b: confirmation block surfaces Priority + Schedule together", () => {
    expect(c).toMatch(/Priority:[^\n]*Q\[X\]/);
    expect(c).toMatch(/Schedule:/);
  });

  test("TEST-QUICK-003c: surfaces (stated)/(inferred) markers per intake contract", () => {
    expect(c).toMatch(/\(stated\)/);
    expect(c).toMatch(/\(inferred\)/);
  });
});

describe("Quick command: per-Q scheduling defaults (TEST-QUICK-004)", () => {
  const c = readFile("commands/quick.md");

  test("TEST-QUICK-004a: Q1 defaults to TODAY", () => {
    expect(c).toMatch(/Q1[\s\S]{0,80}TODAY/);
  });

  test("TEST-QUICK-004b: Q2 defaults to a focus block this week", () => {
    expect(c).toMatch(/Q2[\s\S]{0,200}(focus|this week|next focus)/i);
  });

  test("TEST-QUICK-004c: Q3 routes through match-delegate.ts CLI", () => {
    expect(c).toMatch(/match-delegate\.ts/);
  });

  test("TEST-QUICK-004d: Q4 eliminates without scheduling", () => {
    expect(c).toMatch(/Q4[\s\S]{0,200}eliminat/i);
  });
});

describe("Quick command: write contract (TEST-QUICK-005)", () => {
  const c = readFile("commands/quick.md");

  test("TEST-QUICK-005a: writes directly to Active/Delegated/Done — bypasses Inbox parking", () => {
    expect(c).toMatch(/do NOT park in[\s\S]{0,40}Inbox|directly[\s\S]{0,80}Active/i);
  });

  test("TEST-QUICK-005b: respects active adapter for push step", () => {
    expect(c).toMatch(/task-output-config\.md/);
  });

  test("TEST-QUICK-005c: Q3 delegated entries do NOT auto-push to adapter", () => {
    expect(c).toMatch(/Q3[\s\S]{0,200}(skip \(Q3|delegate needs visibility)/i);
  });
});

describe("Quick command: multi-task fallback (TEST-QUICK-006)", () => {
  const c = readFile("commands/quick.md");

  test("TEST-QUICK-006a: refuses multi-task input and points back to /intake", () => {
    expect(c).toMatch(/more than one task/i);
    expect(c).toMatch(/\/intake/);
  });

  test("TEST-QUICK-006b: empty $ARGUMENTS prompts the user, does not crash", () => {
    expect(c).toMatch(/Empty `\$ARGUMENTS`|empty arguments/i);
  });

  test("TEST-QUICK-006c: multi-task heuristic is concrete (verbs + joiners + distinct objects)", () => {
    expect(c).toMatch(/≥2 imperative verbs/i);
    expect(c).toMatch(/joined by `and`/);
    expect(c).toMatch(/distinct direct object/i);
  });
});

describe("Quick command: DRY — no AUTHORITY_PATTERNS restatement (TEST-QUICK-007)", () => {
  const c = readFile("commands/quick.md");

  test("TEST-QUICK-007a: does NOT inline the canonical authority phrases", () => {
    expect(c).not.toMatch(/requires your sign-off/);
    expect(c).not.toMatch(/sensitive communication on your behalf/);
  });

  test("TEST-QUICK-007b: cites scripts/delegate-core.ts as canonical source", () => {
    expect(c).toMatch(/scripts\/delegate-core\.ts/);
    expect(c).toMatch(/AUTHORITY_PATTERNS/);
  });
});

describe("Quick command: single-confirmation contract preserved (TEST-QUICK-008)", () => {
  const c = readFile("commands/quick.md");

  test("TEST-QUICK-008a: Step 4 block includes Push to: line (push decision folded in)", () => {
    expect(c).toMatch(/Push to:[\s\S]{0,160}adapter name/i);
  });

  test("TEST-QUICK-008b: Step 6 EXECUTES the declared decision, does NOT re-prompt", () => {
    expect(c).toMatch(/EXECUTES that decision[\s\S]{0,60}does NOT re-prompt/i);
  });

  test("TEST-QUICK-008c: post-write edit requests do NOT unwind the write", () => {
    expect(c).toMatch(/Post-write requests/i);
    expect(c).toMatch(/does NOT retroactively unwind/i);
  });
});

describe("Quick command: failure-mode fallbacks (TEST-QUICK-009)", () => {
  const c = readFile("commands/quick.md");

  test("TEST-QUICK-009a: malformed TASKS.md does NOT silently rewrite", () => {
    expect(c).toMatch(/Malformed `TASKS\.md`[\s\S]{0,200}do NOT silently/i);
  });

  test("TEST-QUICK-009b: match-delegate non-zero exit falls back to manual prompt", () => {
    expect(c).toMatch(/match-delegate\.ts[\s\S]{0,200}fall\s+back to a manual delegate prompt/i);
  });

  test("TEST-QUICK-009c: zero-parsed-fields input re-prompts, does not crash", () => {
    expect(c).toMatch(/parses to zero task fields/i);
  });

  test("TEST-QUICK-009d: invalid_graph status surfaces message + manual fallback", () => {
    expect(c).toMatch(/invalid_graph[\s\S]{0,200}surface[\s\S]{0,40}`message`/i);
  });
});

describe("Quick command: second-pass review fixes (TEST-QUICK-010)", () => {
  const c = readFile("commands/quick.md");

  test("TEST-QUICK-010a: Q assignment is two-pass — tentative at Step 2, confirmed at Step 3", () => {
    expect(c).toMatch(/## Step 2: Tentative Q \(two-pass — confirmed at Step 3\)/);
    expect(c).toMatch(/use the tentative[\s\S]{0,10}value as final/);
  });

  test("TEST-QUICK-010b: authority check runs UNCONDITIONALLY before the Q-table", () => {
    expect(c).toMatch(/runs UNCONDITIONALLY[\s\S]{0,200}before the table/i);
    expect(c).toMatch(/MUST run for Q1\/Q2\/Q4 inputs too/);
  });

  test("TEST-QUICK-010c: Q3 candidate demotes to Q2/Q4 on CLI failure rather than orphan", () => {
    expect(c).toMatch(/DEMOTE the tentative Q3/);
    expect(c).toMatch(/final Q = Q2.*final Q = Q4|final Q = Q4[\s\S]{0,40}final Q = Q2/);
  });

  test("TEST-QUICK-010d: post-write block names completeTask, disclaims missing deleteTask", () => {
    expect(c).toMatch(/`completeTask`/);
    expect(c).toMatch(/does not[\s\S]{0,10}currently expose a `deleteTask`/);
  });

  test("TEST-QUICK-010e: Push to: override grammar generalized away from literal 'push Q3'", () => {
    expect(c).toMatch(/Override grammar for `Push to:`/);
    expect(c).toMatch(/any edit that changes\s+the `Push to:` value away from `skip/);
  });

  test("TEST-QUICK-010f: multi-task verb list excludes command names (schedule/delegate/prioritize)", () => {
    expect(c).toMatch(/Excluded from the verb list on purpose:[\s\S]{0,100}`schedule`/);
    expect(c).toMatch(/`delegate`/);
    expect(c).toMatch(/`prioritize`/);
  });

  test("TEST-QUICK-010g: 'for' and prepositions are not multi-task joiners", () => {
    expect(c).toMatch(/Joiner `for`[\s\S]{0,80}NOT joiners/);
  });
});
