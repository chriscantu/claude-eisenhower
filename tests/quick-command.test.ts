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
    expect(c).toMatch(/Q3[\s\S]{0,200}(SHOULD NOT auto-push|Skip Step 6)/i);
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
});
