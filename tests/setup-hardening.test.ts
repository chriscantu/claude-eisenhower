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

describe("Setup hardening: echo-back validation (TEST-SETUP-HARD-004)", () => {
  const content = readFile("commands/setup.md");

  test("TEST-SETUP-HARD-004a: setup.md echoes matched calendar name back to user", () => {
    expect(content).toMatch(/Found calendar named/);
  });

  test("TEST-SETUP-HARD-004b: echo-back step asks for explicit yes/no", () => {
    const echoMatch = content.match(/Found calendar named[^\n]*\n[^\n]*/);
    expect(echoMatch).not.toBeNull();
    expect(echoMatch![0]).toMatch(/yes \/ no/i);
  });

  test("TEST-SETUP-HARD-004c: email account also echoed back", () => {
    expect(content).toMatch(/Found account named/);
  });

  test("TEST-SETUP-HARD-004d: plugin_root echo-back labelled as same pattern", () => {
    expect(content).toMatch(/Echo-back[\s\S]{0,80}same pattern as calendar\/email/);
  });
});

describe("Setup hardening: Step 0.5 is the SOLE write gate (TEST-SETUP-HARD-005)", () => {
  const content = readFile("commands/setup.md");

  test("TEST-SETUP-HARD-005a: Step 1 calendar Write is gated on Step 0.5 confirmation", () => {
    expect(content).toMatch(/calendar-config\.md[^\n]*only after Step 0\.5 confirmation/i);
  });

  test("TEST-SETUP-HARD-005b: Step 2 email Write is gated on Step 0.5 confirmation", () => {
    expect(content).toMatch(/email-config\.md[^\n]*only after Step 0\.5 confirmation/i);
  });

  test("TEST-SETUP-HARD-005c: Step 3 task-output Write is gated on Step 0.5 confirmation", () => {
    expect(content).toMatch(/task-output-config\.md[^\n]*only after Step 0\.5 confirmation/i);
  });

  test("TEST-SETUP-HARD-005d: Step 4 stakeholders Write deferred to Step 0.5 commit loop", () => {
    expect(content).toMatch(/Hold its contents for the Step 0\.5 commit loop/);
  });
});

describe("Setup hardening: resume re-validation contract (TEST-SETUP-HARD-006)", () => {
  const content = readFile("commands/setup.md");

  test("TEST-SETUP-HARD-006a: corrupted marker renamed to .broken and fresh start", () => {
    expect(content).toMatch(/\.setup\.partial\.broken/);
  });

  test("TEST-SETUP-HARD-006b: resume vs start-over fork BEFORE consuming values", () => {
    expect(content).toMatch(/resume \/ start over/);
  });

  test("TEST-SETUP-HARD-006c: calendar_name re-validated against current AppleScript list", () => {
    expect(content).toMatch(/calendar_name[\s\S]{0,200}re-run the Step 1 AppleScript/);
  });

  test("TEST-SETUP-HARD-006d: plugin_root re-validated against env var + disk + name check", () => {
    expect(content).toMatch(/plugin_root[\s\S]{0,400}re-check `\$\{CLAUDE_PLUGIN_ROOT/);
  });
});

describe("Setup hardening: env-var verification (TEST-SETUP-HARD-007)", () => {
  const content = readFile("commands/setup.md");

  test("TEST-SETUP-HARD-007a: env-var path verifies plugin.json name field", () => {
    expect(content).toMatch(/plugin\.json[\s\S]{0,80}"name": "claude-eisenhower"/);
  });

  test("TEST-SETUP-HARD-007b: env-var detection falls back to find on verification failure", () => {
    expect(content).toMatch(/fails any of\s+the three verification checks/);
  });
});

describe("Setup hardening: confirmation parsing rule (TEST-SETUP-HARD-008)", () => {
  const content = readFile("commands/setup.md");

  test("TEST-SETUP-HARD-008a: Step 0.4 defines yes/no normalization set", () => {
    expect(content).toMatch(/## Step 0\.4: Confirmation parsing/);
    expect(content).toMatch(/y`, `yes`, `ok/);
  });

  test("TEST-SETUP-HARD-008b: ambiguous input re-prompts, does not silently default", () => {
    expect(content).toMatch(/Do NOT infer\. Do NOT silently default/);
  });
});

describe("Setup hardening: error handling splits TCC from app-not-running (TEST-SETUP-HARD-009)", () => {
  const content = readFile("commands/setup.md");

  test("TEST-SETUP-HARD-009a: TCC permission case names System Settings remediation", () => {
    expect(content).toMatch(/Privacy & Security[\s\S]{0,40}Automation/);
  });

  test("TEST-SETUP-HARD-009b: app-not-running case is distinct from TCC case", () => {
    expect(content).toMatch(/App not running/);
    expect(content).toMatch(/TCC \/ Automation permission denied/);
  });
});

describe("Setup hardening: Step 3b plugin-path promotion (TEST-SETUP-HARD-010)", () => {
  const content = readFile("commands/setup.md");

  test("TEST-SETUP-HARD-010a: plugin install path is its own Step 3b header", () => {
    expect(content).toMatch(/## Step 3b: Plugin install path detection/);
  });
});

describe("Setup hardening: second-pass review fixes (TEST-SETUP-HARD-011)", () => {
  const content = readFile("commands/setup.md");

  test("TEST-SETUP-HARD-011a: resume re-validation is per-field, not abort-all", () => {
    expect(content).toMatch(/Re-validation is per-field/);
    expect(content).toMatch(/Do NOT abort the resume on one\s+stale value/);
  });

  test("TEST-SETUP-HARD-011b: start-over discards in-memory state from parsed marker", () => {
    expect(content).toMatch(/start over[\s\S]{0,200}clear any persisted values held in memory/);
  });

  test("TEST-SETUP-HARD-011c: Step 0.4 covers numbered menus with digit + text accept", () => {
    expect(content).toMatch(/Numbered menus/);
    expect(content).toMatch(/accept the digit \(`1`/);
    expect(content).toMatch(/case-insensitive substring/);
  });

  test("TEST-SETUP-HARD-011d: Step 0.5 write order is explicit 4-step sequence", () => {
    expect(content).toMatch(/calendar-config\.md[\s\S]{0,30}\(Step 1's content\)/);
    expect(content).toMatch(/email-config\.md[\s\S]{0,30}\(Step 2's content\)/);
    expect(content).toMatch(/task-output-config\.md[\s\S]{0,80}\(Step 3 \+ Step 3b's content\)/);
    expect(content).toMatch(/stakeholders\.yaml[\s\S]{0,80}\(Step 4's content/);
  });

  test("TEST-SETUP-HARD-011e: TCC remediation lists Claude.app first for desktop install", () => {
    expect(content).toMatch(/`Claude`[\s\S]{0,40}`Claude\.app`[\s\S]{0,40}for the desktop install/);
  });

  test("TEST-SETUP-HARD-011f: env-var unverified path is excluded from find-scan results", () => {
    expect(content).toMatch(/SKIP it from the find scan results/);
  });

  test("TEST-SETUP-HARD-011g: Step 5 summary template includes Option 1 entries-collected slot", () => {
    expect(content).toMatch(/\[N entries collected \/ placeholder template \/ skipped\]/);
  });

  test("TEST-SETUP-HARD-011h: Step 0.5 write loop names marker-array keywords in order", () => {
    expect(content).toMatch(/`calendar` → `email` →[\s\S]{0,10}`task-output` → `stakeholders`/);
  });
});
