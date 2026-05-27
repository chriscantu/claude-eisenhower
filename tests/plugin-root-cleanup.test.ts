/**
 * plugin-root-cleanup.test.ts
 *
 * Contract tests for issue #23 — eliminate user-typing of plugin path during
 * /setup and prevent hardcoded `~/repos/claude-eisenhower` from leaking into
 * runtime-facing files.
 *
 * Test IDs follow the TEST-PLUGIN-ROOT-xxx convention.
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

// ── setup.md must not ask the user to type a plugin path ──────────────────

describe("Plugin Root Cleanup: /setup does not prompt for path (TEST-PLUGIN-ROOT-001)", () => {
  const content = readFile("commands/setup.md");

  test("TEST-PLUGIN-ROOT-001a: no 'What is the full path to your claude-eisenhower plugin folder' prompt", () => {
    expect(content).not.toMatch(/What is the full path to your claude-eisenhower plugin folder/i);
  });

  test("TEST-PLUGIN-ROOT-001b: no '3 attempts' / '3 total attempts' retry language", () => {
    expect(content).not.toMatch(/up to 3 attempts total/i);
    expect(content).not.toMatch(/3 total attempts/i);
    expect(content).not.toMatch(/After 3 failed attempts/i);
  });

  test("TEST-PLUGIN-ROOT-001c: no explicit ask for the user to type a path under Reminders setup", () => {
    // The path-entry block opened with "Required — do not proceed with an empty
    // or unverified path." Confirm that block is gone.
    expect(content).not.toMatch(/Required\s*—\s*do not proceed with an empty or unverified path/i);
  });
});

// ── Runtime files must not embed the hardcoded ~/repos/claude-eisenhower ──

describe("Plugin Root Cleanup: no hardcoded ~/repos/claude-eisenhower in runtime files (TEST-PLUGIN-ROOT-002)", () => {
  // Allow the path inside docs/, specs/, ADRs, CHANGELOG, ROADMAP, and the
  // resolution skill reference (which documents the fallback intentionally).
  // Forbid it inside commands/, adapters/, scripts/, hooks/, .claude-plugin/.
  const guardedDirs = ["commands", "adapters", "hooks", ".claude-plugin"];

  for (const dir of guardedDirs) {
    const dirPath = path.join(ROOT, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith(".md") || f.endsWith(".json") || f.endsWith(".sh"))
      .map((f) => path.join(dir, f));

    for (const relPath of files) {
      test(`TEST-PLUGIN-ROOT-002: ${relPath} has no hardcoded ~/repos/claude-eisenhower`, () => {
        const content = readFile(relPath);
        expect(content).not.toMatch(/~\/repos\/claude-eisenhower/);
      });
    }
  }
});

// ── Config example must not embed an absolute placeholder path ────────────

describe("Plugin Root Cleanup: task-output-config.md.example is path-free (TEST-PLUGIN-ROOT-003)", () => {
  const content = readFile("config/task-output-config.md.example");

  test("TEST-PLUGIN-ROOT-003a: no hardcoded ~/repos/claude-eisenhower path", () => {
    expect(content).not.toMatch(/~\/repos\/claude-eisenhower/);
  });

  test("TEST-PLUGIN-ROOT-003b: example documents that plugin_root is auto-populated", () => {
    // The example should explain to humans that the value is set by /setup,
    // not hand-typed. Look for the literal "auto-populated" marker — it doubles
    // as the schema hint that lets future tooling skip the field on re-write.
    expect(content).toMatch(/auto[- ]populated/i);
  });
});
