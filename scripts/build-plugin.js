#!/usr/bin/env node
/**
 * build-plugin.js — Package the claude-eisenhower plugin into a distributable .plugin file
 *
 * Usage:   node build-plugin.js [--skip-dirty-check]
 * Output:  ../claude-eisenhower-{version}.plugin  (zip archive)
 *
 * Run via: npm run package       — warns on uncommitted changes
 *          npm run package:dev   — skips dirty tree warning
 *          npm run release       — runs tests first, then packages
 *
 * Uses `git archive` to produce the artifact, which natively respects .gitignore.
 * Personal config files (calendar-config.md, email-config.md, etc.) are gitignored
 * and are therefore never included in the output.
 *
 * See docs/specs/build-spec.md for full specification.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

// ─── Paths ────────────────────────────────────────────────────────────────────

const SCRIPTS_DIR = __dirname;
const REPO_ROOT   = path.resolve(SCRIPTS_DIR, '..');
const PLUGIN_JSON = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fail(msg) {
  console.error(`\n❌ Build failed: ${msg}\n`);
  process.exit(1);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Run a command with args as an array, avoiding shell interpretation.
 * Uses execFileSync to prevent command injection via environment-derived paths.
 */
function runArgs(file, args = [], opts = {}) {
  return execFileSync(file, args, { cwd: REPO_ROOT, stdio: 'pipe', ...opts }).toString().trim();
}

// ─── Step 1: Read version from plugin.json ───────────────────────────────────

if (!fs.existsSync(PLUGIN_JSON)) {
  fail('.claude-plugin/plugin.json not found');
}

let pluginMeta;
try {
  pluginMeta = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8'));
} catch (e) {
  fail(`.claude-plugin/plugin.json is not valid JSON: ${e.message}`);
}

const version = pluginMeta.version;
if (!version || typeof version !== 'string' || version.trim() === '') {
  fail('version not found in .claude-plugin/plugin.json');
}

const pluginName   = pluginMeta.name || 'claude-eisenhower';
const artifactName = `${pluginName}-${version}.plugin`;
const artifactPath = path.join(REPO_ROOT, artifactName);

console.log(`\n📦 Building ${artifactName}...`);

// ─── Step 2: Verify git is available and repo is valid ───────────────────────

try {
  runArgs('git', ['rev-parse', '--git-dir']);
} catch (e) {
  fail('not a git repository — build-plugin.js requires git');
}

// ─── Step 3: Dirty tree check ─────────────────────────────────────────────────

const skipDirtyCheck = process.argv.includes('--skip-dirty-check');

if (!skipDirtyCheck) {
  const status = runArgs('git', ['status', '--porcelain']);
  if (status !== '') {
    console.warn('\n⚠️  Warning: working tree has uncommitted changes.');
    console.warn('   The artifact may not correspond to a known git state.');
    console.warn('   Use `npm run package:dev` to skip this warning,');
    console.warn('   or `npm run release` to run tests + package from a clean state.\n');
    console.warn('Uncommitted changes:');
    status.split('\n').forEach(line => console.warn(`   ${line}`));
    console.warn('');
  }
}

// ─── Step 4: Remove existing artifact ────────────────────────────────────────
//
// If a .plugin file already exists for this version, it was built at a different
// time and may not match the current HEAD. Warn loudly before overwriting it —
// this is the most common source of version drift when installing locally.

if (fs.existsSync(artifactPath)) {
  const existingStat = fs.statSync(artifactPath);
  const ageMinutes = Math.round((Date.now() - existingStat.mtimeMs) / 60000);
  console.warn(`\n⚠️  Warning: ${artifactName} already exists (built ${ageMinutes} minute(s) ago).`);
  console.warn('   This stale artifact may not match the current git HEAD.');
  console.warn('   Deleting it and rebuilding from HEAD now.\n');
  fs.unlinkSync(artifactPath);
}

// ─── Step 5: Package using git archive ───────────────────────────────────────
//
// `git archive HEAD` produces a zip of exactly what is committed — it natively
// excludes everything in .gitignore (personal config, TASKS.md, memory/,
// node_modules/, dist/). No manual exclude patterns needed.
//
// Additionally exclude dev-only directories (tests/, docs/specs/) that
// are committed but not needed at runtime, using pathspec excludes.

const gitArchiveArgs = [
  'archive', 'HEAD',
  '--format=zip',
  `--output=${artifactPath}`,
  '--',          // start pathspecs
  '.',           // include everything...
  ':!tests',                  // ...except tests/
  ':!docs/specs',             // ...and dev specs
];

try {
  runArgs('git', gitArchiveArgs);
} catch (e) {
  fail(`git archive failed: ${e.message}`);
}

// ─── Step 6: Verify and report ───────────────────────────────────────────────

if (!fs.existsSync(artifactPath)) {
  fail('git archive completed but output file not found');
}

const sizeBytes = fs.statSync(artifactPath).size;

// Inspect archive contents
let archiveContents;
try {
  archiveContents = runArgs('unzip', ['-l', artifactPath]);
} catch (e) {
  fail(`could not inspect archive: ${e.message}`);
}

// Spot-check: verify key files ARE present
const mustInclude = [
  '.claude-plugin/plugin.json',
  'commands/scan-email.md',
  'hooks/hooks.json',
  'scripts/cal_query.swift',
  'CLAUDE.md',
  'README.md',
];

const missing = mustInclude.filter(f => !archiveContents.includes(f));
if (missing.length > 0) {
  fs.unlinkSync(artifactPath);
  fail(`archive is missing expected files:\n  ${missing.join('\n  ')}`);
}

// Spot-check: verify personal/gitignored files are NOT present.
// Use regex word-boundary matching so "calendar-config.md" doesn't
// false-positive against "calendar-config.md.example".
const mustExclude = [
  'config/calendar-config.md',
  'config/email-config.md',
  'config/task-output-config.md',
  'config/stakeholders.yaml',
  'TASKS.md',
  'memory/',
  'node_modules/',
  'dist/',
];

const leaked = mustExclude.filter(f => {
  // Match the exact path followed by whitespace or end-of-line (not ".example" etc.)
  const pattern = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)');
  return pattern.test(archiveContents);
});
if (leaked.length > 0) {
  fs.unlinkSync(artifactPath);
  fail(`archive contains files that must be excluded:\n  ${leaked.join('\n  ')}`);
}

console.log(`✅ Built ${artifactName} (${formatBytes(sizeBytes)})`);
console.log(`   Location: ${artifactPath}`);
console.log('');
