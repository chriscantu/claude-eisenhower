/**
 * execute-confirmation.test.ts
 *
 * Issue #31 — /done must show the matched record and require explicit
 * confirmation before mutating TASKS.md. On 2+ matches, must force a
 * numbered pick. Prevents silent mis-completion of similarly-named tasks.
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";

const executeMd = fs.readFileSync(
  path.join(__dirname, "..", "commands", "done.md"),
  "utf8"
);

describe("Issue #31: /done requires confirmation before mutation", () => {
  test("done.md mandates matched-record preview before mutating", () => {
    // Must display the matched task record before any write to TASKS.md.
    // Accept either order: "display ... before mutation" or "before ... preview".
    expect(executeMd).toMatch(
      /(?:show|display|preview).{0,80}before.{0,40}(?:mutat|writ|chang)|before.{0,40}(?:mutat|writ).{0,80}(?:show|display|preview)/is
    );
  });

  test("done.md requires explicit confirmation step", () => {
    // Mirror the /delegate Step 5 confirmation pattern.
    expect(executeMd).toMatch(/confirm/i);
    expect(executeMd).toMatch(/yes\s*\/\s*no|confirm\?|"yes"/i);
  });

  test("done.md handles ambiguous matches with numbered pick", () => {
    // When 2+ tasks match the user's free-text, the prompt must force a
    // numbered disambiguation pick rather than silently picking one.
    expect(executeMd).toMatch(/(?:multiple|2\+|more than one|several)\s+match/i);
    expect(executeMd).toMatch(/numbered|number them|1\.\s|pick\s+(?:by\s+)?number/i);
  });

  test("done.md surfaces no-undo warning to user", () => {
    // The mutation moves records between sections, fires AppleScript, and
    // invokes memory-manager — there is no undo. Prompt must mention this
    // so the user is aware that confirmation is the last gate.
    expect(executeMd).toMatch(/no undo|cannot.*undo|irreversible|once confirmed/i);
  });
});
