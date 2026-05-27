/**
 * quadrant-labels.test.ts
 *
 * Issue #30 — user-facing surfaces must render Q1-Q4 with verb labels
 * (Do/Schedule/Delegate/Cut) so users don't have to memorize the 2x2.
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";
import {
  QUADRANT_VERBS,
  renderQuadrantLabel,
  type Quadrant,
} from "../scripts/delegate-core";

describe("Issue #30: QUADRANT_VERBS canonical mapping", () => {
  test("Q1 → Do", () => expect(QUADRANT_VERBS.Q1).toBe("Do"));
  test("Q2 → Schedule", () => expect(QUADRANT_VERBS.Q2).toBe("Schedule"));
  test("Q3 → Delegate", () => expect(QUADRANT_VERBS.Q3).toBe("Delegate"));
  test("Q4 → Cut", () => expect(QUADRANT_VERBS.Q4).toBe("Cut"));

  test("all quadrants have non-empty verb labels", () => {
    const quadrants: Quadrant[] = ["Q1", "Q2", "Q3", "Q4"];
    for (const q of quadrants) {
      expect(QUADRANT_VERBS[q]).toBeTruthy();
      expect(QUADRANT_VERBS[q].length).toBeGreaterThan(0);
    }
  });
});

describe("Issue #30: renderQuadrantLabel styles", () => {
  test("default compound: 'Q2 · Schedule'", () => {
    expect(renderQuadrantLabel("Q2")).toBe("Q2 · Schedule");
  });

  test("verb-only: 'Schedule'", () => {
    expect(renderQuadrantLabel("Q2", "verb")).toBe("Schedule");
  });

  test("bracketed: '[Q2 · Schedule]'", () => {
    expect(renderQuadrantLabel("Q2", "bracket")).toBe("[Q2 · Schedule]");
  });

  test("all quadrants render in bracket style", () => {
    expect(renderQuadrantLabel("Q1", "bracket")).toBe("[Q1 · Do]");
    expect(renderQuadrantLabel("Q3", "bracket")).toBe("[Q3 · Delegate]");
    expect(renderQuadrantLabel("Q4", "bracket")).toBe("[Q4 · Cut]");
  });
});

describe("Issue #30: user-facing render templates use verb labels", () => {
  const repoRoot = path.join(__dirname, "..");

  function read(file: string): string {
    return fs.readFileSync(path.join(repoRoot, "commands", file), "utf8");
  }

  test("today.md plate-display uses verb labels not bare [Qx]", () => {
    const today = read("today.md");
    // Old format: `• [Q1] "{task title}"` — bare code
    // New format: must include verb-label render in the plate display.
    // We require at least one of: "Q1 · Do" | "Q2 · Schedule" | "[Q1 · Do]" etc.
    expect(today).toMatch(/Q[12]\s+·\s+(Do|Schedule)/);
  });

  test("review-week.md priority render includes verb label", () => {
    const review = read("review-week.md");
    expect(review).toMatch(/(Do|Schedule|Delegate|Cut)/);
  });

  test("scan-email.md confirmation table includes verb labels", () => {
    const scan = read("scan-email.md");
    expect(scan).toMatch(/Q[1-4]\s+·\s+(Do|Schedule|Delegate)/);
  });
});
