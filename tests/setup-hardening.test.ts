/**
 * setup-hardening.test.ts
 *
 * Contract tests for issue #34 — /setup auto-detects plugin_root via env var,
 * previews before write, persists a resume marker, and echoes back validated
 * calendar name.
 *
 * Test IDs follow the TEST-SETUP-HARD-xxx convention.
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("Setup hardening: CLAUDE_PLUGIN_ROOT env var detection (TEST-SETUP-HARD-001)", () => {
  const content = readFile("commands/setup.md");

  test("TEST-SETUP-HARD-001a: setup.md references ${CLAUDE_PLUGIN_ROOT} env var", () => {
    expect(content).toMatch(/\$\{CLAUDE_PLUGIN_ROOT/);
  });

  test("TEST-SETUP-HARD-001b: env var check is ordered before find scan", () => {
    const envIdx = content.search(/\$\{CLAUDE_PLUGIN_ROOT/);
    const findIdx = content.search(/-name plugin\.json/);
    expect(envIdx).toBeGreaterThan(-1);
    expect(findIdx).toBeGreaterThan(-1);
    expect(envIdx).toBeLessThan(findIdx);
  });
});

describe("Setup hardening: preview-before-write gate (TEST-SETUP-HARD-002)", () => {
  const content = readFile("commands/setup.md");

  test("TEST-SETUP-HARD-002a: setup.md defines Step 0.5 preview block", () => {
    expect(content).toMatch(/Step 0\.5: Preview-before-write/);
  });

  test("TEST-SETUP-HARD-002b: preview presents all collected values in one block", () => {
    expect(content).toMatch(/Plugin root:/);
    expect(content).toMatch(/Calendar:/);
    expect(content).toMatch(/Email:/);
    expect(content).toMatch(/Reminders:/);
    expect(content).toMatch(/Stakeholders:/);
  });

  test("TEST-SETUP-HARD-002c: preview requires single confirmation before writing", () => {
    expect(content).toMatch(/Write these\?/);
  });
});

describe("Setup hardening: resumable .setup.partial marker (TEST-SETUP-HARD-003)", () => {
  const content = readFile("commands/setup.md");
  const gitignore = readFile(".gitignore");

  test("TEST-SETUP-HARD-003a: setup.md describes .setup.partial marker", () => {
    expect(content).toMatch(/config\/\.setup\.partial/);
  });

  test("TEST-SETUP-HARD-003b: setup.md writes marker between successful steps", () => {
    expect(content).toMatch(/persist[^.]*\.setup\.partial/i);
  });

  test("TEST-SETUP-HARD-003c: setup.md deletes marker on clean completion", () => {
    expect(content).toMatch(/delete\s+`?config\/\.setup\.partial/i);
  });

  test("TEST-SETUP-HARD-003d: setup.md resumes from marker on re-entry", () => {
    expect(content).toMatch(/resum/i);
  });

  test("TEST-SETUP-HARD-003e: .setup.partial is gitignored", () => {
    expect(gitignore).toMatch(/config\/\.setup\.partial/);
  });
});

describe("Setup hardening: echo-back calendar validation (TEST-SETUP-HARD-004)", () => {
  const content = readFile("commands/setup.md");

  test("TEST-SETUP-HARD-004a: setup.md echoes matched calendar name back to user", () => {
    expect(content).toMatch(/Found calendar named/);
  });

  test("TEST-SETUP-HARD-004b: echo-back step asks for explicit yes/no", () => {
    // Locate the echo line and confirm a yes/no prompt sits with it.
    const echoMatch = content.match(/Found calendar named[^\n]*\n[^\n]*/);
    expect(echoMatch).not.toBeNull();
    expect(echoMatch![0]).toMatch(/yes \/ no/i);
  });
});
