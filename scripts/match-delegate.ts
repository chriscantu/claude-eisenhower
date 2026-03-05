#!/usr/bin/env npx ts-node
/**
 * match-delegate.ts
 *
 * CLI entry point � reads integrations/config/stakeholders.yaml and scores
 * each delegate against a task title + description.
 *
 * Scoring logic lives in delegate-core.ts (shared with tests).
 * Algorithm defined in: integrations/specs/delegation-spec.md
 *
 * Usage:
 *   npx ts-node scripts/match-delegate.ts "<task title>" "<task description>"
 *
 * Output: JSON to stdout. Claude reads this and formats for the user.
 * Claude never auto-assigns � it always asks for confirmation.
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import {
  Stakeholder, StakeholderFile, ScoredCandidate, MatchResult, runMatch, getDisplayAlias,
  GLOSSARY_COLUMNS, glossaryColIndex,
} from "./delegate-core";

/**
 * Validates that the parsed header row of memory/glossary.md matches GLOSSARY_COLUMNS.
 * Returns { valid: true } on match; { valid: false, warning } on mismatch.
 * The warning is designed to be written to stderr — it describes what was expected
 * vs. found so the user can fix the file.
 */
export function validateGlossaryHeader(
  headerCols: string[],
  expected: readonly string[]
): { valid: boolean; warning?: string } {
  const missing = expected.filter((col) => !headerCols.includes(col));
  if (missing.length === 0) return { valid: true };
  return {
    valid: false,
    warning:
      `[glossary schema warning] memory/glossary.md columns don't match the canonical schema.\n` +
      `  Expected : ${expected.join(" | ")}\n` +
      `  Found    : ${headerCols.join(" | ")}\n` +
      `  Missing  : ${missing.join(", ")}\n` +
      `  Scoring proceeds without live pending-count data. ` +
      `Fix the header or re-run /schedule to rebuild the file.\n`,
  };
}

/**
 * Reads memory/glossary.md and returns a map of { alias → pending task count }.
 * Only "Pending" rows (case-insensitive) in the Stakeholder Follow-ups table count.
 * Column positions are resolved by name via GLOSSARY_COLUMNS — no hardcoded indices.
 * If the file is missing: returns {} silently (offline / first run).
 * If the header doesn't match GLOSSARY_COLUMNS: warns to stderr, returns {} (Option A).
 */
export function loadPendingCounts(glossaryPath: string): Record<string, number> {
  if (!fs.existsSync(glossaryPath)) return {};
  const lines = fs.readFileSync(glossaryPath, "utf8").split("\n");
  const counts: Record<string, number> = {};
  let inTable = false;
  let headerValidated = false;
  let aliasIdx = -1;
  let statusIdx = -1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## Stakeholder Follow-ups")) { inTable = true; continue; }
    if (inTable && trimmed.startsWith("##")) break; // next section — stop
    if (!inTable || !trimmed.startsWith("|")) continue;

    // Separator rows (e.g. |---|---|) — skip regardless of validation state
    if (trimmed.replace(/[|\s-]/g, "").length === 0) continue;

    const cols = trimmed.split("|").map((c) => c.trim()).filter(Boolean);

    // First substantive row in the table is the header — validate before parsing data
    if (!headerValidated) {
      const { valid, warning } = validateGlossaryHeader(cols, GLOSSARY_COLUMNS);
      if (!valid) {
        process.stderr.write(warning!);
        return {};
      }
      aliasIdx  = glossaryColIndex("Alias");
      statusIdx = glossaryColIndex("Status");
      headerValidated = true;
      continue;
    }

    if (cols.length <= Math.max(aliasIdx, statusIdx)) continue;
    const alias  = cols[aliasIdx];
    const status = cols[statusIdx];
    if (status.toLowerCase() === "pending") {
      counts[alias] = (counts[alias] ?? 0) + 1;
    }
  }
  return counts;
}

function findGraphPath(): string {
  const scriptDir = path.dirname(__filename);
  const repoRoot = path.resolve(scriptDir, "..");
  return path.join(repoRoot, "integrations", "config", "stakeholders.yaml");
}

function findGlossaryPath(): string {
  const scriptDir = path.dirname(__filename);
  const repoRoot = path.resolve(scriptDir, "..");
  return path.join(repoRoot, "memory", "glossary.md");
}

export function loadStakeholders(graphPath: string): Stakeholder[] | null {
  if (!fs.existsSync(graphPath)) return null;
  const raw = fs.readFileSync(graphPath, "utf8");
  let parsed: StakeholderFile;
  try {
    parsed = yaml.load(raw) as StakeholderFile;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`stakeholders.yaml parse error: ${msg}`);
  }
  if (!parsed?.stakeholders || parsed.stakeholders.length === 0) return [];
  return parsed.stakeholders;
}

function buildMessage(status: MatchResult["status"], candidates: ScoredCandidate[]): string {
  switch (status) {
    case "no_graph":
      return "No stakeholder graph found. Copy integrations/config/stakeholders.yaml.example " +
             "to stakeholders.yaml and fill in your delegates.";
    case "empty_graph":
      return "Stakeholder graph is empty � no delegates configured.";
    case "no_match":
      return "No clear domain match in your stakeholder graph. Who should own this?";
    case "match": {
      const top = candidates[0];
      const domainStr = top.matched_domains.length > 0
        ? `domain match: ${top.matched_domains.join(", ")}`
        : "relationship fit";
      let msg = `Suggested delegate: ${top.alias} (${top.role}) � ${domainStr}`;
      if (candidates.length > 1) {
        msg += `. Also matched: ${candidates[1].alias} (${candidates[1].role}).`;
      }
      if (top.capacity_warning) {
        msg += ` Note: ${top.alias} is showing low capacity � confirm availability.`;
      }
      return msg;
    }
  }
}

function run(): void {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(JSON.stringify({
      status: "no_match", candidates: [],
      message: "Usage: match-delegate.ts <task-title> [task-description]",
    }, null, 2));
    process.exit(1);
  }

  const taskTitle = args[0] ?? "";
  const taskDescription = args[1] ?? "";
  const graphPath = findGraphPath();
  let stakeholders: Stakeholder[] | null;
  try {
    stakeholders = loadStakeholders(graphPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(JSON.stringify({ status: "no_graph", candidates: [], message: msg }, null, 2));
    process.exit(1);
  }

  if (stakeholders === null) {
    console.log(JSON.stringify({ status: "no_graph", candidates: [], message: buildMessage("no_graph", []) }, null, 2));
    return;
  }
  if (stakeholders.length === 0) {
    console.log(JSON.stringify({ status: "empty_graph", candidates: [], message: buildMessage("empty_graph", []) }, null, 2));
    return;
  }

  const pendingCounts = loadPendingCounts(findGlossaryPath());
  const { status, candidates } = runMatch(stakeholders, taskTitle, taskDescription, pendingCounts);
  console.log(JSON.stringify({ status, candidates, message: buildMessage(status, candidates) }, null, 2));
}

// Only execute when run directly (not when imported by tests or other modules)
if (require.main === module) {
  run();
}