/**
 * intake-confirmation.test.ts
 *
 * Issue #29 — /intake must surface inferred fields and parse due dates
 * before saving. Validates that commands/intake.md prompt contains the
 * canonical confirmation block language.
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";

const intakeMd = fs.readFileSync(
  path.join(__dirname, "..", "commands", "intake.md"),
  "utf8"
);

describe("Issue #29: /intake surfaces inferences before save", () => {
  test("intake.md requires (inferred)/(stated) markers on extracted fields", () => {
    expect(intakeMd).toMatch(/\(inferred\)/);
    expect(intakeMd).toMatch(/\(stated\)/);
  });

  test("intake.md requires structured confirmation block before save", () => {
    // Must replace the legacy "ask ONE clarifying question" pattern with
    // a structured save/edit/cancel flow.
    expect(intakeMd).toMatch(/save\s*\/\s*edit\s*\/\s*cancel/i);
  });

  test("intake.md no longer relies on legacy ask-ONE-question fallback alone", () => {
    // The previous prompt said "ask ONE clarifying question" — this single
    // sentence let Claude infer Source/Requester silently. The new prompt
    // must explicitly require the confirmation block instead.
    expect(intakeMd).toMatch(/confirmation block|confirmation summary/i);
  });
});

describe("Issue #29: /intake parses temporal phrases to ISO dates", () => {
  test("intake.md instructs parsing 'by Thursday'/'next week'/etc to ISO", () => {
    // Must explicitly direct Claude to convert temporal phrases to ISO
    // dates rather than writing "Not specified" when any date is mentioned.
    expect(intakeMd).toMatch(/ISO|YYYY-MM-DD/);
    expect(intakeMd).toMatch(/parse.*(?:date|temporal|phrase)/i);
  });

  test("intake.md includes example of parsed date output", () => {
    // The prompt should show an example like:
    //   Due date: 2026-06-04 (parsed from "by Thursday")
    expect(intakeMd).toMatch(/parsed from/i);
  });

  test("intake.md preserves 'Not specified' only when no temporal phrase present", () => {
    expect(intakeMd).toMatch(/not specified/i);
    // Must clarify when "Not specified" applies (only when truly absent).
    expect(intakeMd).toMatch(/no (?:date|temporal|due).*(?:mentioned|present|stated)/i);
  });
});
