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

// ── Test group 6: /memory + /forget contracts (Q2-006) — issue #42 ───────
//
// /memory is the user-facing inspection surface for everything under
// memory/. /forget is the correction surface that mutates that state.
// Pin: the three /memory show forms, and the three /forget scopes with
// their confirmation gates. Silent erosion of any of these is the failure
// mode issue #42 closes.

describe("Prompt Contracts: /memory + /forget contracts (Q2-006)", () => {
  const memoryPath = path.join(repoRoot, "commands", "memory.md");
  const forgetPath = path.join(repoRoot, "commands", "forget.md");

  test("Q2-006: commands/memory.md exists", () => {
    expect(fs.existsSync(memoryPath)).toBe(true);
  });

  test("Q2-006: commands/forget.md exists", () => {
    expect(fs.existsSync(forgetPath)).toBe(true);
  });

  const memoryTokens: ReadonlyArray<{ name: string; pattern: RegExp }> = [
    { name: "index view (show with no arg)", pattern: /show.*no arg|no arg.*show|Step\s*2A/ },
    { name: "alias detail view", pattern: /Step\s*2B|alias detail/i },
    { name: "analytics view", pattern: /Step\s*2C|analytics view|show analytics/i },
    { name: "reads memory/glossary.md", pattern: /memory\/glossary\.md/ },
    { name: "reads memory/people/", pattern: /memory\/people\// },
    { name: "writes nothing", pattern: /writes nothing|It writes nothing/i },
  ];

  for (const tok of memoryTokens) {
    test(`Q2-006: commands/memory.md mentions "${tok.name}"`, () => {
      const content = readContent(memoryPath);
      if (!tok.pattern.test(content)) {
        throw new Error(
          `commands/memory.md is missing required token "${tok.name}" ` +
            `(pattern ${tok.pattern}). Issue #42: silent state surface ` +
            `requires the three view forms + read-only guarantee.`
        );
      }
      expect(content).toMatch(tok.pattern);
    });
  }

  const forgetTokens: ReadonlyArray<{ name: string; pattern: RegExp }> = [
    { name: "forget alias scope", pattern: /Step\s*2A|Forget alias/i },
    { name: "forget task scope", pattern: /Step\s*2B|Forget task/i },
    { name: "forget all scope", pattern: /Step\s*2C|Forget all|forget all/i },
    { name: "confirmation gate", pattern: /confirmation|confirm/i },
    { name: "TASKS.md not modified", pattern: /TASKS\.md.*(not be touched|was not touched|never modified|is never modified)/i },
    { name: "irreversible warning", pattern: /irreversible/i },
  ];

  for (const tok of forgetTokens) {
    test(`Q2-006: commands/forget.md mentions "${tok.name}"`, () => {
      const content = readContent(forgetPath);
      if (!tok.pattern.test(content)) {
        throw new Error(
          `commands/forget.md is missing required token "${tok.name}" ` +
            `(pattern ${tok.pattern}). Issue #42: correction loop requires ` +
            `all three scopes + confirmation gate + TASKS.md invariant.`
        );
      }
      expect(content).toMatch(tok.pattern);
    });
  }
});
