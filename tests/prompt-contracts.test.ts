/**
 * prompt-contracts.test.ts
 *
 * Contract tests that enforce prompt vocabulary consistency across all command,
 * agent, and skill prompt files. Prevents accidental introduction of prohibited
 * section headers (## Q1–Q4 / ## Unprocessed / ## Backlog) and enforces the
 * required memory-management guard line wherever the skill is referenced.
 *
 * Quality gate: Q2 — Prompt Vocabulary Contracts
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";

const repoRoot = path.join(__dirname, "..");

// ── File discovery ─────────────────────────────────────────────────────────

const commandFiles: string[] = fs
  .readdirSync(path.join(repoRoot, "commands"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => path.join(repoRoot, "commands", f));

const agentFiles: string[] = fs
  .readdirSync(path.join(repoRoot, "agents"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => path.join(repoRoot, "agents", f));

// skills/ contains subdirectories; collect SKILL.md from each subdirectory
const skillsDir = path.join(repoRoot, "skills");
const skillFiles: string[] = fs
  .readdirSync(skillsDir)
  .filter((entry) => {
    const fullPath = path.join(skillsDir, entry);
    return fs.statSync(fullPath).isDirectory();
  })
  .map((subdir) => path.join(skillsDir, subdir, "SKILL.md"))
  .filter((f) => fs.existsSync(f));

const allPromptFiles: string[] = [...commandFiles, ...agentFiles, ...skillFiles];

// ── Helpers ────────────────────────────────────────────────────────────────

function readContent(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

/**
 * Return any lines in `content` that are a prohibited bare section header.
 * "## Q4 — Defer / Eliminate" does NOT match "## Q4" exactly and is allowed.
 * Prohibited headers: ## Q1/Q2/Q3/Q4, ## Unprocessed, ## Backlog.
 */
function findProhibitedHeaders(content: string): string[] {
  const lines = content.split("\n");
  return lines.filter((line) => {
    const trimmed = line.trim();
    return (
      trimmed === "## Q1" ||
      trimmed === "## Q2" ||
      trimmed === "## Q3" ||
      trimmed === "## Q4" ||
      trimmed === "## Unprocessed" ||
      trimmed === "## Backlog"
    );
  });
}

// ── Test group 1: Prohibited bare quadrant section headers ────────────────

describe("Prompt Contracts: no prohibited section headers (Q2-001)", () => {
  for (const filePath of allPromptFiles) {
    const relPath = path.relative(repoRoot, filePath);

    test(`Q2-001: ${relPath} must not contain bare ## Q1/Q2/Q3/Q4/Unprocessed/Backlog headers`, () => {
      const content = readContent(filePath);
      const violations = findProhibitedHeaders(content);

      if (violations.length > 0) {
        const detail = violations
          .map((line) => `  offending line: "${line.trim()}"`)
          .join("\n");
        throw new Error(
          `${relPath} contains prohibited bare quadrant header(s):\n${detail}\n` +
            `Tip: Use the full label form, e.g. "## Q4 — Defer / Eliminate".`
        );
      }

      expect(violations).toHaveLength(0);
    });
  }
});

// ── Test group 2: No references to the retired external memory skill ─────
//
// As of v1.9.0 (#28) the plugin owns delegation memory fully — there is no
// productivity:memory-management dependency. Catch regressions where a new
// prompt file accidentally reintroduces the dual-backend illusion.
// See docs/adrs/single-backend-memory.md.

const RETIRED_MEMORY_SKILL_TOKEN = "productivity:memory-management";

describe("Prompt Contracts: no references to retired external memory skill (Q2-002)", () => {
  for (const filePath of [...commandFiles, ...agentFiles, ...skillFiles]) {
    const relPath = path.relative(repoRoot, filePath);

    test(`Q2-002: ${relPath} must not reference ${RETIRED_MEMORY_SKILL_TOKEN}`, () => {
      const content = readContent(filePath);
      if (content.includes(RETIRED_MEMORY_SKILL_TOKEN)) {
        throw new Error(
          `${relPath} references the retired "${RETIRED_MEMORY_SKILL_TOKEN}" skill. ` +
            `Memory is markdown-only as of v1.9.0 — use the memory-manager skill instead. ` +
            `See docs/adrs/single-backend-memory.md.`
        );
      }
      expect(content).not.toContain(RETIRED_MEMORY_SKILL_TOKEN);
    });
  }
});
