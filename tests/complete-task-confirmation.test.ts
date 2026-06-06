/**
 * complete-task-confirmation.test.ts
 *
 * Issue #31 — /complete-task must show the matched record and require explicit
 * confirmation before mutating TASKS.md. On 2+ matches, must force a
 * numbered pick. Prevents silent mis-completion of similarly-named tasks.
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";

const executeMd = fs.readFileSync(
  path.join(__dirname, "..", "commands", "complete-task.md"),
  "utf8"
);

describe("Issue #31: /complete-task requires confirmation before mutation", () => {
  test("complete-task.md mandates matched-record preview before mutating", () => {
    // Must display the matched task record before any write to TASKS.md.
    // Accept either order: "display ... before mutation" or "before ... preview".
    expect(executeMd).toMatch(
      /(?:show|display|preview).{0,80}before.{0,40}(?:mutat|writ|chang)|before.{0,40}(?:mutat|writ).{0,80}(?:show|display|preview)/is
    );
  });

  test("complete-task.md requires explicit confirmation step", () => {
    // Mirror the /delegate Step 5 confirmation pattern.
    expect(executeMd).toMatch(/confirm/i);
    expect(executeMd).toMatch(/yes\s*\/\s*no|confirm\?|"yes"/i);
  });

  test("complete-task.md handles ambiguous matches with numbered pick", () => {
    // When 2+ tasks match the user's free-text, the prompt must force a
    // numbered disambiguation pick rather than silently picking one.
    expect(executeMd).toMatch(/(?:multiple|2\+|more than one|several)\s+match/i);
    expect(executeMd).toMatch(/numbered|number them|1\.\s|pick\s+(?:by\s+)?number/i);
  });

  test("complete-task.md surfaces no-undo warning to user", () => {
    // The mutation moves records between sections, fires AppleScript, and
    // invokes memory-manager — there is no undo. Prompt must mention this
    // so the user is aware that confirmation is the last gate.
    expect(executeMd).toMatch(/no undo|cannot.*undo|irreversible|once confirmed/i);
  });
});
