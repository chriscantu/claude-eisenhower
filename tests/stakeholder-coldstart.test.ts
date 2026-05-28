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
    expect(c).toMatch(/already present[\s\S]{0,80}alias's[\s\S]{0,40}domains/i);
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
    expect(c).toMatch(/extracted list is empty[\s\S]{0,80}skip this step[\s\S]{0,5}silently/i);
  });
});

describe("Stakeholder cold-start: YAML escape contract (TEST-STK-COLD-003)", () => {
  const c = readFile("commands/setup.md");

  test("TEST-STK-COLD-003a: YAML write contract section exists", () => {
    expect(c).toMatch(/YAML write contract \(CRITICAL — escape rules\)/);
  });

  test("TEST-STK-COLD-003b: name, alias, role must be double-quoted", () => {
    expect(c).toMatch(/Always double-quote[\s\S]{0,200}`name`, every element of\s+`alias\[\]`, `role`/);
  });

  test("TEST-STK-COLD-003c: embedded double quotes escape rule present", () => {
    expect(c).toMatch(/Escape embedded double quotes/);
  });

  test("TEST-STK-COLD-003d: smart quotes are rejected and normalized", () => {
    expect(c).toMatch(/Reject smart quotes/);
    expect(c).toMatch(/normalize to/);
  });

  test("TEST-STK-COLD-003e: domains: [] written literally on bootstrap (not omitted)", () => {
    expect(c).toMatch(/`domains` is required by the schema/);
    expect(c).toMatch(/write `domains: \[\]` literally/);
  });

  test("TEST-STK-COLD-003f: capacity_signal writes medium literally when skipped", () => {
    expect(c).toMatch(/`capacity_signal`[\s\S]{0,80}writes `medium` literally/);
  });
});

describe("Stakeholder cold-start: loop normalization + guards (TEST-STK-COLD-004)", () => {
  const c = readFile("commands/setup.md");

  test("TEST-STK-COLD-004a: continue/stop token sets are concrete and case-insensitive", () => {
    expect(c).toMatch(/Continue \(yes\)[\s\S]{0,80}`y`/);
    expect(c).toMatch(/Stop \(done\)[\s\S]{0,80}`done`/);
  });

  test("TEST-STK-COLD-004b: duplicate-alias guard prompts overwrite-or-rename", () => {
    expect(c).toMatch(/Duplicate alias guard/);
    expect(c).toMatch(/Overwrite the previous entry/);
  });

  test("TEST-STK-COLD-004c: empty-name guard re-prompts", () => {
    expect(c).toMatch(/Empty-name guard/);
    expect(c).toMatch(/Need a name to proceed/);
  });
});

describe("Stakeholder cold-start: Step 5c pipe-escape + idempotency (TEST-STK-COLD-005)", () => {
  const c = readFile("commands/delegate.md");

  test("TEST-STK-COLD-005a: pipe characters escape as backslash-pipe in cells", () => {
    expect(c).toMatch(/Replace every `\|`/);
    expect(c).toMatch(/backslash-escaped/);
  });

  test("TEST-STK-COLD-005b: newlines in cell values collapse to single space", () => {
    expect(c).toMatch(/Collapse `\\n`/);
    expect(c).toMatch(/to a single space/);
  });

  test("TEST-STK-COLD-005c: Task cell truncated at 80 chars with ellipsis", () => {
    expect(c).toMatch(/Truncate the `Task` cell to 80 characters/);
  });

  test("TEST-STK-COLD-005d: idempotency check dedupes (Date, Alias, Task) triple", () => {
    expect(c).toMatch(/### Idempotency/);
    expect(c).toMatch(/\(Date, Alias, Task\)/);
    expect(c).toMatch(/same-day re-delegation/);
  });

  test("TEST-STK-COLD-005e: extraction non-determinism explicitly acknowledged", () => {
    expect(c).toMatch(/Determinism note/);
    expect(c).toMatch(/may produce different suggestion sets/);
  });

  test("TEST-STK-COLD-005f: concrete stop-word floor list present", () => {
    expect(c).toMatch(/the, a, an, and, or, but/);
  });
});
