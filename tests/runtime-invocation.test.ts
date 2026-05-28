/**
 * runtime-invocation.test.ts
 *
 * Regression guard for issue #78. Modern Node runs `.ts` files through the
 * type-stripping ESM loader, which rejects the extension-less relative
 * imports the dispatcher sources use (`./adapters/...`). Bare `node X.ts`
 * therefore dies with ERR_MODULE_NOT_FOUND on a fresh install. ts-node
 * resolves the same imports via CommonJS per `scripts/tsconfig.json`.
 *
 * Layered coverage:
 *   1. Runtime smoke — spawn each dispatcher via `npx ts-node` and assert
 *      stderr is free of module-resolution failure markers. Proves the
 *      runtime path actually works on this host.
 *   2. Doc-shape grep — scan `commands/*.md` for bare-node invocations of
 *      each dispatcher in the two surface forms (Bash code blocks and
 *      AppleScript `do shell script`). Catches command-file regressions
 *      before they reach a user.
 *   3. Dependency guard — assert `ts-node` stays declared in
 *      `scripts/package.json` devDependencies.
 *
 * Test IDs follow the TEST-RUN-xxx convention.
 *
 * Run: cd scripts && npm test
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const COMMANDS_DIR = path.join(ROOT, "commands");
const SCRIPTS_DIR = path.join(ROOT, "scripts");

const DISPATCHER_SCRIPTS = [
  "email-scan.ts",
  "calendar-query.ts",
  "task-output.ts",
];

// Strings that indicate the bare-node ESM failure mode the PR fixes.
const ESM_FAILURE_MARKERS = [
  "ERR_MODULE_NOT_FOUND",
  "Cannot find module",
  "Cannot use import statement outside a module",
  "Unexpected token",
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

// Strip AppleScript line-continuations (`¬` followed by newline + leading
// whitespace) so multi-line `do shell script` statements collapse to a
// single line for matching.
function stripAppleScriptContinuations(text: string): string {
  return text.replace(/¬\s*\n\s*/g, " ");
}

// Two distinct bare-node invocation surfaces; both fail under modern Node
// because of extension-less ESM imports in dispatcher sources.
//
//   Bash / markdown  →  `node <some-path-token>/<dispatcher>.ts`
//                       (allows ${plugin_root}, $PLUGIN_ROOT, "$VAR", etc.)
//   AppleScript      →  `"node " & <concatenation> <dispatcher>.ts`
//
// Negative lookbehinds let `npx ts-node` and `ts-node` through.
function bareNodeRegexes(script: string): {
  bash: RegExp;
  applescript: RegExp;
} {
  const esc = script.replace(/\./g, "\\.");
  return {
    // Match bare `node` followed by any non-whitespace path token ending in
    // <dispatcher>.ts. The path token may contain shell vars, quotes, slashes.
    bash: new RegExp(
      String.raw`(?<!ts-)(?<!npx\s)\bnode\s+\S*${esc}`,
      "g",
    ),
    applescript: new RegExp(
      String.raw`"node "\s*&[^\n]*${esc}`,
      "g",
    ),
  };
}

describe("Runtime invocation (TEST-RUN-001): dispatchers never invoked via bare `node`", () => {
  const commands = readAllCommands();

  for (const script of DISPATCHER_SCRIPTS) {
    test(`TEST-RUN-001 [${script}]: no command file invokes \`node …/${script}\``, () => {
      const offenders: string[] = [];
      const res = bareNodeRegexes(script);

      for (const { name, text } of commands) {
        const collapsed = stripAppleScriptContinuations(text);
        for (const re of [res.bash, res.applescript]) {
          const matches = collapsed.match(re);
          if (matches && matches.length > 0) {
            offenders.push(`${name}: ${matches.join(" | ")}`);
          }
        }
      }

      expect(offenders).toEqual([]);
    });
  }

  test("TEST-RUN-001-canary: bash regex catches `node ${plugin_root}/…`", () => {
    const sample = "node ${plugin_root}/scripts/email-scan.ts scan";
    expect(bareNodeRegexes("email-scan.ts").bash.test(sample)).toBe(true);
  });

  test("TEST-RUN-001-canary: bash regex catches `node \"$PLUGIN_ROOT/…\"` quoted-var form", () => {
    const sample = `node "$PLUGIN_ROOT/scripts/email-scan.ts" scan`;
    expect(bareNodeRegexes("email-scan.ts").bash.test(sample)).toBe(true);
  });

  test("TEST-RUN-001-canary: bash regex tolerates `npx ts-node`", () => {
    const sample = "npx ts-node ${plugin_root}/scripts/email-scan.ts scan";
    expect(bareNodeRegexes("email-scan.ts").bash.test(sample)).toBe(false);
  });

  test("TEST-RUN-001-canary: applescript regex catches `\"node \" & …`", () => {
    const sample = `do shell script "node " & quoted form of (pluginRoot & "/scripts/task-output.ts") & " push"`;
    expect(bareNodeRegexes("task-output.ts").applescript.test(sample)).toBe(
      true,
    );
  });

  test("TEST-RUN-001-canary: applescript regex tolerates `cd … && npx ts-node`", () => {
    const sample = `do shell script "cd " & quoted form of (pluginRoot & "/scripts") & " && npx ts-node task-output.ts push"`;
    expect(bareNodeRegexes("task-output.ts").applescript.test(sample)).toBe(
      false,
    );
  });

  test("TEST-RUN-001-canary: continuation-stripper collapses `¬\\n` AppleScript", () => {
    const sample = `do shell script "node " & ¬\n    quoted form of (pluginRoot & "/scripts/task-output.ts") & " push"`;
    const collapsed = stripAppleScriptContinuations(sample);
    expect(
      bareNodeRegexes("task-output.ts").applescript.test(collapsed),
    ).toBe(true);
  });
});

describe("Runtime invocation (TEST-RUN-002): live ts-node smoke test", () => {
  // Each dispatcher prints `{"ok":false,"error":"Unknown mode …"}` when
  // invoked with no args. A clean exit + no ESM-failure markers in stderr
  // proves extension-less imports resolve under the current runtime path.
  for (const script of DISPATCHER_SCRIPTS) {
    test(`TEST-RUN-002 [${script}]: \`npx ts-node ${script}\` resolves without ERR_MODULE_NOT_FOUND`, () => {
      const res = spawnSync(
        "npx",
        ["--no-install", "ts-node", script],
        {
          cwd: SCRIPTS_DIR,
          encoding: "utf8",
          timeout: 60_000,
        },
      );

      const stderr = res.stderr ?? "";
      for (const marker of ESM_FAILURE_MARKERS) {
        expect(stderr).not.toContain(marker);
      }
      // Either the dispatcher exited cleanly OR it printed a structured
      // JSON error to stdout — both indicate the runtime path is intact.
      const stdout = res.stdout ?? "";
      const reachedHandler =
        stdout.includes(`"ok":false`) || stdout.includes(`"ok": false`);
      expect(reachedHandler).toBe(true);
    }, 65_000);
  }
});

describe("Runtime invocation (TEST-RUN-003): ts-node dependency guard", () => {
  test("TEST-RUN-003: scripts/package.json declares `ts-node` in devDependencies", () => {
    const pkgPath = path.join(SCRIPTS_DIR, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    expect(pkg.devDependencies?.["ts-node"]).toBeDefined();
  });
});
