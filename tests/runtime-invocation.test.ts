/**
 * runtime-invocation.test.ts
 *
 * Regression guard for issue #78: TypeScript dispatcher scripts (email-scan,
 * calendar-query, task-output) must be invoked via `npx ts-node`, not bare
 * `node`. Bare `node` on Node v22+ runs `.ts` as ESM, and the dispatcher
 * sources use extension-less imports that ESM cannot resolve, so every
 * dispatcher invocation dies on a fresh install with ERR_MODULE_NOT_FOUND.
 *
 * Two shapes are guarded:
 *   1. Bash/markdown form:   node ${plugin_root}/scripts/<x>.ts
 *   2. AppleScript form:     "node " & quoted form of (pluginRoot & "/scripts/<x>.ts")
 *
 * Test IDs follow the TEST-RUN-xxx convention.
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const COMMANDS_DIR = path.join(ROOT, "commands");

const DISPATCHER_SCRIPTS = [
  "email-scan.ts",
  "calendar-query.ts",
  "task-output.ts",
];

function readAllCommands(): Array<{ name: string; text: string }> {
  return fs
    .readdirSync(COMMANDS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({
      name: f,
      text: fs.readFileSync(path.join(COMMANDS_DIR, f), "utf8"),
    }));
}

// Two distinct invocation shapes that both fail under bare `node`:
//   - Bash / markdown: "node ${plugin_root}/scripts/<x>.ts"
//   - AppleScript    : "\"node \" & quoted form ... <x>.ts"
function bareNodeRegexes(script: string): RegExp[] {
  const esc = script.replace(".", "\\.");
  return [
    // Bash / markdown form (must NOT be preceded by "ts-" or "npx ")
    new RegExp(String.raw`(?<!ts-)(?<!npx\s)\bnode\s+\$\{plugin_root\}[^\s]*${esc}`, "g"),
    // AppleScript form: literal `"node " & ...` followed (somewhere on same line) by the script name
    new RegExp(String.raw`"node "\s*&[^\n]*${esc}`, "g"),
  ];
}

describe("Runtime invocation: dispatchers never invoked via bare `node` (TEST-RUN-001)", () => {
  const commands = readAllCommands();

  for (const script of DISPATCHER_SCRIPTS) {
    test(`TEST-RUN-001 [${script}]: no command file invokes \`node …/${script}\` (bare-node ESM failure mode)`, () => {
      const offenders: string[] = [];
      const regexes = bareNodeRegexes(script);

      for (const { name, text } of commands) {
        for (const re of regexes) {
          const matches = text.match(re);
          if (matches && matches.length > 0) {
            offenders.push(`${name}: ${matches.join(" | ")}`);
          }
        }
      }

      expect(offenders).toEqual([]);
    });
  }

  test("TEST-RUN-001-canary: bash-form regex catches bare-node markdown", () => {
    const sample = "node ${plugin_root}/scripts/email-scan.ts scan";
    const [bashRe] = bareNodeRegexes("email-scan.ts");
    expect(bashRe.test(sample)).toBe(true);
  });

  test("TEST-RUN-001-canary: bash-form regex tolerates `npx ts-node` markdown", () => {
    const sample = "npx ts-node ${plugin_root}/scripts/email-scan.ts scan";
    const [bashRe] = bareNodeRegexes("email-scan.ts");
    expect(bashRe.test(sample)).toBe(false);
  });

  test("TEST-RUN-001-canary: applescript-form regex catches AppleScript bare-node", () => {
    const sample = `do shell script "node " & quoted form of (pluginRoot & "/scripts/task-output.ts") & " push"`;
    const [, asRe] = bareNodeRegexes("task-output.ts");
    expect(asRe.test(sample)).toBe(true);
  });

  test("TEST-RUN-001-canary: applescript-form regex tolerates `npx ts-node` AppleScript", () => {
    const sample = `do shell script "cd " & quoted form of (pluginRoot & "/scripts") & " && npx ts-node task-output.ts push"`;
    const [, asRe] = bareNodeRegexes("task-output.ts");
    expect(asRe.test(sample)).toBe(false);
  });
});
