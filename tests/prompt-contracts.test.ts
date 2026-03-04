/**
 * prompt-contracts.test.ts
 *
 * Contract tests that enforce prompt vocabulary consistency across all command,
 * agent, and skill prompt files. Prevents accidental introduction of bare
 * quadrant headers (## Q1 / ## Q2 / ## Q3 / ## Q4) and enforces the required
 * memory-management guard line wherever the skill is referenced.
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
 * Return any lines in `content` that are a bare ## Q1/Q2/Q3/Q4 header.
 * "## Q4 — Defer / Eliminate" does NOT match "## Q4" exactly and is allowed.
 */
function findBareQuadrantHeaders(content: string): string[] {
  const lines = content.split("\n");
  return lines.filter((line) => {
    const trimmed = line.trim();
    return (
      trimmed === "## Q1" ||
      trimmed === "## Q2" ||
      trimmed === "## Q3" ||
      trimmed === "## Q4"
    );
  });
}

// ── Test group 1: Prohibited bare quadrant section headers ────────────────

describe("Prompt Contracts: no bare Q1–Q4 section headers (Q2-001)", () => {
  for (const filePath of allPromptFiles) {
    const relPath = path.relative(repoRoot, filePath);

    test(`Q2-001: ${relPath} must not contain bare ## Q1/Q2/Q3/Q4 headers`, () => {
      const content = readContent(filePath);
      const violations = findBareQuadrantHeaders(content);

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

// ── Test group 2: Memory guard line ───────────────────────────────────────

const MEMORY_SKILL_TOKEN = "productivity:memory-management";
const MEMORY_GUARD_LINE =
  "Do NOT write to memory/stakeholders-log.md if productivity:memory-management succeeded.";

describe("Prompt Contracts: memory guard line present (Q2-002)", () => {
  for (const filePath of commandFiles) {
    const relPath = path.relative(repoRoot, filePath);

    test(`Q2-002: ${relPath} — if it mentions ${MEMORY_SKILL_TOKEN}, it must contain the guard line`, () => {
      const content = readContent(filePath);

      if (!content.includes(MEMORY_SKILL_TOKEN)) {
        // File does not reference the skill — guard line is not required.
        return;
      }

      if (!content.includes(MEMORY_GUARD_LINE)) {
        throw new Error(
          `${relPath} references "${MEMORY_SKILL_TOKEN}" but is missing the required guard line:\n` +
            `  "${MEMORY_GUARD_LINE}"`
        );
      }

      expect(content).toContain(MEMORY_GUARD_LINE);
    });
  }
});
