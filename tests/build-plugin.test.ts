/**
 * build-plugin.test.ts
 *
 * Contract tests for issue #46 — build manifest hygiene.
 *
 * Runs `scripts/build-plugin.js --skip-dirty-check` and asserts the produced
 * `.plugin` zip:
 *   - includes the runtime files the plugin needs (commands/, hooks/, scripts/, manifest)
 *   - excludes personal/PII files (config/*.md, TASKS.md, memory/, stakeholders.yaml)
 *   - excludes runtime byproducts (*.profraw, *.db, *.log)
 *   - excludes dev-only paths (tests/, docs/specs/, node_modules/, dist/)
 *
 * The script itself enforces these via mustInclude/mustExclude — this test is
 * the external check so an accidental loosening of those lists is caught.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "build-plugin.js");
const PLUGIN_JSON = path.join(ROOT, ".claude-plugin", "plugin.json");

function pluginMeta(): { name: string; version: string } {
  return JSON.parse(fs.readFileSync(PLUGIN_JSON, "utf8"));
}

function buildArtifact(): { artifactPath: string; contents: string } {
  execFileSync("node", [SCRIPT, "--skip-dirty-check"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  const { name, version } = pluginMeta();
  const artifactPath = path.join(ROOT, `${name}-${version}.plugin`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`expected artifact missing: ${artifactPath}`);
  }
  const contents = execFileSync("unzip", ["-l", artifactPath], {
    cwd: ROOT,
    stdio: "pipe",
  }).toString();
  return { artifactPath, contents };
}

describe("build-plugin packager (#46)", () => {
  let artifactPath = "";
  let contents = "";

  beforeAll(() => {
    const out = buildArtifact();
    artifactPath = out.artifactPath;
    contents = out.contents;
  }, 60_000);

  afterAll(() => {
    if (artifactPath && fs.existsSync(artifactPath)) {
      fs.unlinkSync(artifactPath);
    }
  });

  test("TEST-BUILD-PLUGIN-001: includes core runtime files", () => {
    const mustInclude = [
      ".claude-plugin/plugin.json",
      "hooks/hooks.json",
      "scripts/build-plugin.js",
      "CLAUDE.md",
      "README.md",
    ];
    for (const f of mustInclude) {
      expect(contents).toContain(f);
    }
  });

  test("TEST-BUILD-PLUGIN-002: excludes personal/PII files", () => {
    // Anchor each path with a whitespace boundary so e.g.
    // `config/calendar-config.md` does not false-positive against
    // `config/calendar-config.md.example`.
    const mustExclude = [
      "config/calendar-config.md",
      "config/email-config.md",
      "config/task-output-config.md",
      "config/stakeholders.yaml",
      "TASKS.md",
      "memory/",
    ];
    for (const f of mustExclude) {
      const pat = new RegExp(
        f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s|$)",
        "m",
      );
      expect(contents).not.toMatch(pat);
    }
  });

  test("TEST-BUILD-PLUGIN-003: excludes dev-only paths", () => {
    const devOnly = ["tests/", "docs/specs/", "node_modules/", "dist/"];
    for (const f of devOnly) {
      expect(contents).not.toContain(f);
    }
  });

  test("TEST-BUILD-PLUGIN-004: excludes runtime byproducts (*.profraw, *.db, *.log)", () => {
    // git archive HEAD only ships committed paths, so the proof here is that
    // no file with these extensions is present in the archive listing.
    expect(contents).not.toMatch(/\.profraw(\s|$)/m);
    expect(contents).not.toMatch(/\.db(\s|$)/m);
    expect(contents).not.toMatch(/\.log(\s|$)/m);
  });
});
