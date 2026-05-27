/**
 * quadrant-labels.test.ts
 *
 * Issue #30 — user-facing surfaces must render Q1-Q4 with verb labels
 * (Do/Schedule/Delegate/Cut) so users don't have to memorize the 2x2.
 *
 * Drift alarm only: these tests assert markdown prompt text still
 * contains the verb-label format. They do NOT prove an LLM follows the
 * prompt at runtime — that requires manual smoke testing.
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";

const repoRoot = path.join(__dirname, "..");

function read(file: string): string {
  return fs.readFileSync(path.join(repoRoot, "commands", file), "utf8");
}

describe("Issue #30: user-facing render templates use verb labels", () => {
  test("today.md plate-display has BOTH Q1 · Do AND Q2 · Schedule", () => {
    const today = read("today.md");
    // Tightened from `/Q[12]\s+·\s+(Do|Schedule)/` — require both lines,
    // not either-or. Catches a regression that drops one of the two.
    expect(today).toMatch(/Q1\s+·\s+Do/);
    expect(today).toMatch(/Q2\s+·\s+Schedule/);
  });

  test("review-week.md priority render includes verb label format", () => {
    const review = read("review-week.md");
    // Expect at least one of the four verb labels in the priority render.
    expect(review).toMatch(/Q[1-4]\s+·\s+(Do|Schedule|Delegate|Cut)/);
  });

  test("scan-email.md confirmation table includes verb labels", () => {
    const scan = read("scan-email.md");
    expect(scan).toMatch(/Q1\s+·\s+Do/);
    expect(scan).toMatch(/Q2\s+·\s+Schedule/);
    expect(scan).toMatch(/Q3\s+·\s+Delegate/);
  });
});
