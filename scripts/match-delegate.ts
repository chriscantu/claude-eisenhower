#!/usr/bin/env npx ts-node
/**
 * match-delegate.ts
 *
 * CLI entry point � reads config/stakeholders.yaml and scores
 * each delegate against a task title + description.
 *
 * Scoring logic lives in delegate-core.ts (shared with tests).
 * Algorithm defined in: docs/specs/delegation-spec.md
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
  Stakeholder, StakeholderFile, ScoredCandidate, MatchResult, Relationship,
  CapacitySignal, runMatch, getDisplayAlias, WEIGHTS,
  GLOSSARY_COLUMNS, glossaryColIndex,
} from "./delegate-core";

// Derive validators from WEIGHTS so the WEIGHTS table is the SINGLE source
// of truth for both enums. WEIGHTS uses `satisfies Record<Relationship, …>`
// (see delegate-core.ts), so adding a Relationship/CapacitySignal union
// member without adding the matching weight entry is a COMPILE ERROR.
// `Object.keys` on the satisfies-typed object is sound; no `as` cast needed.
const VALID_RELATIONSHIPS: ReadonlySet<Relationship> = new Set(
  Object.keys(WEIGHTS.relationship) as Array<keyof typeof WEIGHTS.relationship>
);
const VALID_CAPACITY_SIGNALS: ReadonlySet<CapacitySignal> = new Set(
  Object.keys(WEIGHTS.capacity) as Array<keyof typeof WEIGHTS.capacity>
);

/**
 * Error subclass used by loadStakeholders to distinguish schema/validation
 * errors (unknown enum values, etc.) from file-missing or YAML-parse errors.
 * Lets the CLI route these to `status: "invalid_graph"` so prompts can
 * surface "fix the typo" rather than "create the file you already have".
 */
export class StakeholderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StakeholderValidationError";
  }
}

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
 *
 * glossary.md is the single source of truth for pending-count scoring.
 * See `docs/adrs/single-backend-memory.md` for the architectural decision.
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
  return path.join(repoRoot, "config", "stakeholders.yaml");
}

function findGlossaryPath(): string {
  const scriptDir = path.dirname(__filename);
  const repoRoot = path.resolve(scriptDir, "..");
  return path.join(repoRoot, "memory", "glossary.md");
}

/**
 * Validates that every stakeholder's relationship and capacity_signal fields
 * are in the canonical enum. Without this, a typo
 * (e.g., `relationship: direct_repor`) would silently score the stakeholder
 * with a 0-weight relationship axis — they'd lose to peers forever with no
 * surface signal. Throws on the first invalid field, identifying the file,
 * the offending alias, and the unknown value.
 */
function validateStakeholderEnums(graphPath: string, stakeholders: Stakeholder[]): void {
  for (const s of stakeholders) {
    const alias = getDisplayAlias(s);
    if (!VALID_RELATIONSHIPS.has(s.relationship)) {
      throw new StakeholderValidationError(
        `${graphPath}: stakeholder "${alias}" has invalid relationship "${s.relationship}". ` +
        `Valid values: ${Array.from(VALID_RELATIONSHIPS).join(", ")}`
      );
    }
    if (!VALID_CAPACITY_SIGNALS.has(s.capacity_signal)) {
      throw new StakeholderValidationError(
        `${graphPath}: stakeholder "${alias}" has invalid capacity_signal "${s.capacity_signal}". ` +
        `Valid values: ${Array.from(VALID_CAPACITY_SIGNALS).join(", ")}`
      );
    }
  }
}

export function loadStakeholders(graphPath: string): Stakeholder[] | null {
  if (!fs.existsSync(graphPath)) return null;
  const raw = fs.readFileSync(graphPath, "utf8");
  let parsed: StakeholderFile;
  try {
    parsed = yaml.load(raw) as StakeholderFile;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to parse ${graphPath}: ${msg}`);
  }
  if (!parsed?.stakeholders || parsed.stakeholders.length === 0) return [];
  validateStakeholderEnums(graphPath, parsed.stakeholders);
  return parsed.stakeholders;
}

/**
 * Renders a per-axis score breakdown as a one-line scorecard.
 *
 * Every axis with a non-default contribution is rendered explicitly so the
 * user can distinguish "vendor with relationship weight 0 by design" from
 * "stakeholder whose relationship enum is missing from WEIGHTS". The only
 * axis that's omitted is `pending` when there is no penalty — `pending +0`
 * adds noise without information since the penalty exists only on overload.
 *
 * Example (direct_report, two domains, high capacity):
 *   "Alex E. (7): domain +6 (auth, infra), direct_report +2, capacity high +2"
 *
 * Example (vendor, contract match, high capacity, 0-weight relationship):
 *   "Vendor A (5): domain +3 (procurement), vendor 0, capacity high +2"
 */
export function renderScorecard(c: ScoredCandidate): string {
  const parts: string[] = [];
  if (c.breakdown.domain > 0) {
    const dom = c.matched_domains.length > 0 ? ` (${c.matched_domains.join(", ")})` : "";
    parts.push(`domain +${c.breakdown.domain}${dom}`);
  } else {
    parts.push(`domain 0`);
  }
  parts.push(`${c.relationship} ${signedNumber(c.breakdown.relationship)}`);
  parts.push(`capacity ${c.capacity_signal} ${signedNumber(c.breakdown.capacity)}`);
  if (c.breakdown.pending < 0) {
    parts.push(`pending ${c.breakdown.pending}`);
  }
  return `${c.alias} (${c.score}): ${parts.join(", ")}`;
}

function signedNumber(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${n}`;
  return `0`;
}

export function buildMessage(
  status: MatchResult["status"],
  candidates: ScoredCandidate[],
  runnerUpDelta: number | null,
): string {
  switch (status) {
    case "no_graph":
      return "No stakeholder graph found. Copy config/stakeholders.yaml.example " +
             "to stakeholders.yaml and fill in your delegates.";
    case "empty_graph":
      return "Stakeholder graph is empty — no delegates configured.";
    case "no_match":
      return "No clear domain match in your stakeholder graph. Who should own this?";
    case "invalid_graph":
      // Caller (run()) overrides this with the actual validation message
      // from StakeholderValidationError. This fallback exists only for
      // direct in-process callers that didn't supply one.
      return "Stakeholder graph is present but has validation errors. " +
             "Fix the schema before re-running.";
    case "internal_error":
      // Same pattern as invalid_graph — caller overrides with detail.
      return "Internal match-delegate invariant violated. " +
             "See match-delegate logs for details.";
    case "match": {
      const top = candidates[0];
      let msg = `Suggested delegate: ${renderScorecard(top)}`;
      if (candidates.length > 1) {
        // candidates.length > 1 implies runnerUpDelta is a number, never null.
        // Don't `?? 0` — "no runner-up" (null) and "tied runner-up" (0) are
        // semantically distinct; coercing collapses them.
        if (runnerUpDelta === null) {
          throw new Error(
            `runnerUpDelta cannot be null when candidates.length === ${candidates.length}`
          );
        }
        msg += `\nRunner-up: ${renderScorecard(candidates[1])} (delta ${runnerUpDelta})`;
      }
      if (candidates.length > 2) {
        msg += `\nAlso considered: ${renderScorecard(candidates[2])}`;
      }
      if (top.capacity_warning) {
        msg += `\nNote: ${top.alias} is showing low capacity — confirm availability.`;
      }
      return msg;
    }
    default: {
      // Exhaustiveness check: if a new status is added to MatchResult["status"]
      // and a case is forgotten above, TypeScript flags this assignment.
      const _exhaustive: never = status;
      throw new Error(`buildMessage: unhandled status ${_exhaustive}`);
    }
  }
}

function run(): void {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(JSON.stringify({
      status: "no_match", candidates: [], runnerUpDelta: null,
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
    // Route schema/validation errors to `invalid_graph` so the prompt
    // can surface "fix the typo" rather than "create the file you
    // already have". File-missing / YAML-parse errors keep `no_graph`.
    const isValidation = e instanceof StakeholderValidationError;
    const status: MatchResult["status"] = isValidation ? "invalid_graph" : "no_graph";
    const msg = e instanceof Error ? e.message : String(e);
    console.log(JSON.stringify({
      status, candidates: [], runnerUpDelta: null, message: msg,
    }, null, 2));
    process.exit(1);
  }

  if (stakeholders === null) {
    console.log(JSON.stringify({
      status: "no_graph", candidates: [], runnerUpDelta: null,
      message: buildMessage("no_graph", [], null),
    }, null, 2));
    return;
  }
  if (stakeholders.length === 0) {
    console.log(JSON.stringify({
      status: "empty_graph", candidates: [], runnerUpDelta: null,
      message: buildMessage("empty_graph", [], null),
    }, null, 2));
    return;
  }

  // Wrap the scoring + render tail so internal invariant throws
  // (e.g., buildMessage's runnerUpDelta-null guard) surface as a
  // structured JSON envelope on stdout, not as a stack trace on
  // stderr with empty stdout (which the AppleScript caller cannot
  // parse).
  try {
    const pendingCounts = loadPendingCounts(findGlossaryPath());
    const { status, candidates, runnerUpDelta } = runMatch(
      stakeholders, taskTitle, taskDescription, pendingCounts
    );
    console.log(JSON.stringify({
      status,
      candidates,
      runnerUpDelta,
      message: buildMessage(status, candidates, runnerUpDelta),
    }, null, 2));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(JSON.stringify({
      status: "internal_error",
      candidates: [],
      runnerUpDelta: null,
      message: `match-delegate internal error: ${msg}`,
    }, null, 2));
    process.exit(2);
  }
}

// Only execute when run directly (not when imported by tests or other modules)
if (require.main === module) {
  run();
}