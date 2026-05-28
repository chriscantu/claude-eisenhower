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

// ── Test group 3: Canonical field mentions per command (Q2-003) ──────────
//
// Issue #37 calls for "command-prompt contract tests — assert each
// `commands/*.md` mentions the required canonical fields." Each command in
// the table below MUST mention every field its spec says it writes to
// TASKS.md. The check is a literal string-includes match against the
// command prompt file — when a maintainer rewrites a command and drops the
// `State: Delegated` write step, the contract surface fails CI.
//
// Field tokens anchor on the colon-prefixed write form (`Synced:`,
// `Reminder-id:`, `State:`) so the contract checks the actual field-write
// step in the prompt — not stray prose mentions like
// "we no longer write Synced fields". The bar (per #37) is "changing the
// four-state model breaks at least one test" — the State-line tokens below
// pin all four section names, so a State enum rename surfaces here too.
//
// To add a new command:
//   1. Append a row to `CANONICAL_FIELDS_BY_COMMAND`.
//   2. List only the fields that command writes (not what it reads).
//   3. Use the spec wording from `docs/specs/tasks-schema-spec.md`.

/**
 * A canonical-field contract pins a regex per command. Each regex must match
 * at least once in the command prompt body. Regexes (rather than plain
 * strings) tolerate the padded field formatting some prompts use
 * (e.g., `State:       Delegated` in delegate.md's intake-style block).
 */
interface CommandFieldContract {
  /** Basename of the file under `commands/`. */
  file: string;
  /** Regexes that MUST each match at least once. The map key is the
   *  human-readable name used in the test title. */
  mustMention: Readonly<Record<string, RegExp>>;
}

/**
 * Field tokens reflect what each command writes to TASKS.md, per
 * `docs/specs/tasks-schema-spec.md`. Adding a new command? List only the
 * fields it WRITES, not the ones it reads.
 */
const CANONICAL_FIELDS_BY_COMMAND: readonly CommandFieldContract[] = [
  {
    file: "intake.md",
    mustMention: {
      Title: /\bTitle:/,
      Description: /\bDescription:/,
      Source: /\bSource:/,
      "State: Inbox": /\bState:\s+Inbox\b/,
    },
  },
  {
    file: "prioritize.md",
    mustMention: {
      Priority: /\bPriority:/,
      State: /\bState:/,
      Owner: /\bOwner:/,
    },
  },
  {
    file: "schedule.md",
    mustMention: {
      Scheduled: /\bScheduled:/,
      Action: /\bAction:/,
      Synced: /\bSynced:/,
      "Reminder-id": /\bReminder-id:/,
      "State: Delegated": /\bState:\s+Delegated\b/,
    },
  },
  {
    file: "delegate.md",
    mustMention: {
      "Delegate to": /\bDelegate to:/,
      "State: Delegated": /\bState:\s+Delegated\b/,
      "Check-by": /\bCheck-by:/,
      Synced: /\bSynced:/,
      "Reminder-id": /\bReminder-id:/,
    },
  },
  {
    file: "execute.md",
    mustMention: {
      State: /\bState:/,
      Done: /\bDone:/,
      Synced: /\bSynced:/,
      "Reminder-id": /\bReminder-id:/,
    },
  },
];

describe("Prompt Contracts: command files mention canonical fields (Q2-003)", () => {
  for (const contract of CANONICAL_FIELDS_BY_COMMAND) {
    const filePath = path.join(repoRoot, "commands", contract.file);
    const relPath = path.relative(repoRoot, filePath);

    test(`Q2-003: ${relPath} exists`, () => {
      expect(fs.existsSync(filePath)).toBe(true);
    });

    for (const [name, pattern] of Object.entries(contract.mustMention)) {
      test(`Q2-003: ${relPath} mentions "${name}"`, () => {
        const content = readContent(filePath);
        if (!pattern.test(content)) {
          throw new Error(
            `${relPath} is missing the canonical token "${name}" (pattern ${pattern}). ` +
              `If you intentionally removed it, update CANONICAL_FIELDS_BY_COMMAND ` +
              `in tests/prompt-contracts.test.ts AND docs/specs/tasks-schema-spec.md ` +
              `in the same commit.`
          );
        }
        expect(content).toMatch(pattern);
      });
    }
  }
});

// ── Test group 5: /help first-run contract (Q2-005) — issue #41 ──────────
//
// /help is the first-run entry point. It MUST walk a new user through the
// full intake → prioritize → schedule → execute loop on synthetic data so
// they form a mental model before live use. A contract pins those four
// commands so a future rewrite cannot silently drop a lifecycle step from
// the walkthrough.

describe("Prompt Contracts: /help first-run contract (Q2-005)", () => {
  const helpPath = path.join(repoRoot, "commands", "help.md");

  test("Q2-005: commands/help.md exists", () => {
    expect(fs.existsSync(helpPath)).toBe(true);
  });

  const requiredTokens: ReadonlyArray<{ name: string; pattern: RegExp }> = [
    { name: "/intake step", pattern: /\/intake\s+"/ },
    { name: "/prioritize step", pattern: /\/prioritize\b/ },
    { name: "/schedule step", pattern: /\/schedule\b/ },
    { name: "/execute step", pattern: /\/execute\s+done/ },
    { name: "first-run detection branch", pattern: /first-run|First-run/ },
    { name: "command index section", pattern: /Command\s+index/i },
  ];

  for (const tok of requiredTokens) {
    test(`Q2-005: commands/help.md references "${tok.name}"`, () => {
      const content = readContent(helpPath);
      if (!tok.pattern.test(content)) {
        throw new Error(
          `commands/help.md is missing the required walkthrough token ` +
            `"${tok.name}" (pattern ${tok.pattern}). The first-run ` +
            `walkthrough depends on showing the full lifecycle loop. If ` +
            `you intentionally removed it, update requiredTokens in ` +
            `tests/prompt-contracts.test.ts AND docs/empty-states.md.`
        );
      }
      expect(content).toMatch(tok.pattern);
    });
  }
});

// ── Test group 7: /help index ↔ commands/ bijection (Q2-007) — issue #41 ─
//
// /help is the canonical command discovery surface. The Step 3 index hardcodes
// a list of /command rows; if a new command ships without an index update, it
// is silently undiscoverable. Conversely, if the index lists a command that
// doesn't exist on disk, first-run users hit "command not found." This contract
// enforces a bidirectional match between commands/*.md and /help's index.
//
// Allowlist captures arg-form variants (e.g., "/status awaiting" is the
// `awaiting` keyword arg on /status, not a separate command file) so the
// bidirection check doesn't flag legitimate sub-commands.

const HELP_INDEX_ARG_FORM_ALLOWLIST: ReadonlyArray<string> = [
  "status awaiting",
];

describe("Prompt Contracts: /help index ↔ commands/ bijection (Q2-007)", () => {
  const helpPath = path.join(repoRoot, "commands", "help.md");
  const helpContent = fs.existsSync(helpPath) ? readContent(helpPath) : "";

  // Discover the Command index block — anchor on the Step 3 heading so casual
  // prose mentions of "command index" elsewhere don't match. The fenced block
  // immediately follows the step heading; capture between the opening and
  // closing ``` markers.
  const indexBlockMatch = helpContent.match(
    /^##\s+Step\s+3:\s+Command\s+index[\s\S]*?```([\s\S]*?)```/im
  );
  const indexBlock = indexBlockMatch?.[1] ?? "";

  // Extract every /token from index block. Token = leading slash + name +
  // optional space-separated arg word(s).
  const indexedSlashes = new Set(
    Array.from(indexBlock.matchAll(/\s\/([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*)?)\b/g))
      .map((m) => m[1])
  );

  // Discover all commands/*.md basenames except help.md itself.
  const commandBasenames = fs
    .readdirSync(path.join(repoRoot, "commands"))
    .filter((f) => f.endsWith(".md") && f !== "help.md")
    .map((f) => f.replace(/\.md$/, ""));

  test("Q2-007: every commands/*.md appears in /help index", () => {
    const missing = commandBasenames.filter((cmd) => !indexedSlashes.has(cmd));
    if (missing.length > 0) {
      throw new Error(
        `commands/help.md Step 3 index is missing these commands: ${missing.join(", ")}. ` +
          `Add a row under the appropriate lifecycle section. Without it, new users ` +
          `cannot discover the command from /help.`
      );
    }
    expect(missing).toEqual([]);
  });

  test("Q2-007: every command listed in /help resolves to a commands/*.md file or allowlisted arg form", () => {
    const dangling = Array.from(indexedSlashes).filter((slash) => {
      // Direct command file?
      if (commandBasenames.includes(slash) || slash === "help") return false;
      // Allowlisted arg-form (e.g., "status awaiting" is /status with arg)
      if (HELP_INDEX_ARG_FORM_ALLOWLIST.includes(slash)) return false;
      return true;
    });
    if (dangling.length > 0) {
      throw new Error(
        `commands/help.md Step 3 index lists commands that don't exist on disk: ${dangling.join(", ")}. ` +
          `Either add the missing commands/<name>.md file, or remove the rows from /help. ` +
          `Allowlist arg-form variants in HELP_INDEX_ARG_FORM_ALLOWLIST if intentional.`
      );
    }
    expect(dangling).toEqual([]);
  });

  test("Q2-007: docs/empty-states.md audit table has a row per commands/*.md", () => {
    const auditPath = path.join(repoRoot, "docs", "empty-states.md");
    if (!fs.existsSync(auditPath)) {
      throw new Error(`docs/empty-states.md is missing — empty-state audit registry not found.`);
    }
    const audit = readContent(auditPath);
    // Match `/<name>` cell in the table. Strip arg forms; only count base commands.
    const auditedSlashes = new Set(
      Array.from(audit.matchAll(/\|\s*`\/([a-z][a-z0-9-]*)/g)).map((m) => m[1])
    );
    const missing = commandBasenames.filter(
      (cmd) => !auditedSlashes.has(cmd) && cmd !== "help"
    );
    // help.md is allowed to be self-referential (the audit IS its surface).
    if (missing.length > 0) {
      throw new Error(
        `docs/empty-states.md audit table is missing rows for: ${missing.join(", ")}. ` +
          `Per the "Adding a new command" checklist, each commands/*.md needs a row.`
      );
    }
    expect(missing).toEqual([]);
  });
});
