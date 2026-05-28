/**
 * stakeholder-coldstart.test.ts
 *
 * Contract tests for issue #39 — conversational /setup stakeholders bootstrap
 * + /delegate learn-by-doing log.
 *
 * Test IDs follow the TEST-STK-COLD-xxx convention.
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("Stakeholder cold-start: /setup Step 4 is conversational (TEST-STK-COLD-001)", () => {
  const c = readFile("commands/setup.md");

  test("TEST-STK-COLD-001a: Step 4 header renamed to bootstrap (conversational)", () => {
    expect(c).toMatch(/## Step 4: Stakeholders bootstrap.*conversational/i);
  });

  test("TEST-STK-COLD-001b: three options offered — add now, placeholder, skip", () => {
    expect(c).toMatch(/Add stakeholders now/);
    expect(c).toMatch(/placeholder template/i);
    expect(c).toMatch(/Skip[\s\S]{0,80}no \/delegate/i);
  });

  test("TEST-STK-COLD-001c: loop collects one person at a time", () => {
    expect(c).toMatch(/one person at a time/i);
  });

  test("TEST-STK-COLD-001d: minimum-viable fields named (name, alias, relationship)", () => {
    expect(c).toMatch(/Name and display alias/i);
    expect(c).toMatch(/Relationship/i);
    expect(c).toMatch(/Direct report, peer, vendor, or partner/i);
  });

  test("TEST-STK-COLD-001e: domains left blank on bootstrap, filled via learn-by-doing", () => {
    expect(c).toMatch(/leave domains blank/i);
    expect(c).toMatch(/domain-suggestions\.md/);
  });

  test("TEST-STK-COLD-001f: bootstrap holds writes until user confirms (no mid-loop YAML write)", () => {
    expect(c).toMatch(/Hold the collected list[\s\S]{0,80}do NOT write[\s\S]{0,80}mid-loop/i);
  });
});

describe("Stakeholder cold-start: /delegate Step 5c logs inferred domains (TEST-STK-COLD-002)", () => {
  const c = readFile("commands/delegate.md");

  test("TEST-STK-COLD-002a: Step 5c exists for confirmed-delegation domain logging", () => {
    expect(c).toMatch(/## Step 5c: Inferred-domain suggestion log/);
  });

  test("TEST-STK-COLD-002b: distinguishes confirmed (Step 5 yes) from override (Step 5b)", () => {
    expect(c).toMatch(/Step 5 yes-path[\s\S]{0,80}NOT the[\s\S]{0,40}override/i);
  });

  test("TEST-STK-COLD-002c: defines extraction rule (tokenize, strip, dedupe vs current domains)", () => {
    expect(c).toMatch(/Tokenize task title \+ description/);
    expect(c).toMatch(/already present in the alias's[\s\S]{0,40}domains/i);
  });

  test("TEST-STK-COLD-002d: writes to memory/domain-suggestions.md", () => {
    expect(c).toMatch(/memory\/domain-suggestions\.md/);
  });

  test("TEST-STK-COLD-002e: explicitly does NOT edit stakeholders.yaml", () => {
    expect(c).toMatch(/Do NOT edit `config\/stakeholders\.yaml`/);
  });

  test("TEST-STK-COLD-002f: surfaces the Promoted? checkbox column for user-owned promotion", () => {
    expect(c).toMatch(/Promoted\?/);
    expect(c).toMatch(/never modifies the `Promoted\?` column/i);
  });

  test("TEST-STK-COLD-002g: caps suggestion list to avoid noise", () => {
    expect(c).toMatch(/Cap the suggestion list at \d/i);
  });

  test("TEST-STK-COLD-002h: empty extraction is silent (no spurious log writes)", () => {
    expect(c).toMatch(/extracted list is empty, skip this step silently/i);
  });
});
