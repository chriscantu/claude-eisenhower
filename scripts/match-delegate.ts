#!/usr/bin/env npx ts-node
/**
 * match-delegate.ts
 *
 * CLI entry point Ñ reads integrations/config/stakeholders.yaml and scores
 * each delegate against a task title + description.
 *
 * Scoring logic lives in delegate-core.ts (shared with tests).
 * Algorithm defined in: integrations/specs/delegation-spec.md
 *
 * Usage:
 *   npx ts-node scripts/match-delegate.ts "<task title>" "<task description>"
 *
 * Output: JSON to stdout. Claude reads this and formats for the user.
 * Claude never auto-assigns Ñ it always asks for confirmation.
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import {
  Stakeholder, StakeholderFile, ScoredCandidate, MatchResult, runMatch,
} from "./delegate-core";

function findGraphPath(): string {
  const scriptDir = path.dirname(__filename);
  const repoRoot = path.resolve(scriptDir, "..");
  return path.join(repoRoot, "integrations", "config", "stakeholders.yaml");
}

function loadStakeholders(graphPath: string): Stakeholder[] | null {
  if (!fs.existsSync(graphPath)) return null;
  const raw = fs.readFileSync(graphPath, "utf8");
  const parsed = yaml.load(raw) as StakeholderFile;
  if (!parsed?.stakeholders || parsed.stakeholders.length === 0) return [];
  return parsed.stakeholders;
}

function buildMessage(status: MatchResult["status"], candidates: ScoredCandidate[]): string {
  switch (status) {
    case "no_graph":
      return "No stakeholder graph found. Copy integrations/config/stakeholders.yaml.example " +
             "to stakeholders.yaml and fill in your delegates.";
    case "empty_graph":
      return "Stakeholder graph is empty Ñ no delegates configured.";
    case "no_match":
      return "No clear domain match in your stakeholder graph. Who should own this?";
    case "match": {
      const top = candidates[0];
      const domainStr = top.matched_domains.length > 0
        ? `domain match: ${top.matched_domains.join(", ")}`
        : "relationship fit";
      let msg = `Suggested delegate: ${top.alias} (${top.role}) Ñ ${domainStr}`;
      if (candidates.length > 1) {
        msg += `. Also matched: ${candidates[1].alias} (${candidates[1].role}).`;
      }
      if (top.capacity_warning) {
        msg += ` Note: ${top.alias} is showing low capacity Ñ confirm availability.`;
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
  const stakeholders = loadStakeholders(graphPath);

  if (stakeholders === null) {
    console.log(JSON.stringify({ status: "no_graph", candidates: [], message: buildMessage("no_graph", []) }, null, 2));
    return;
  }
  if (stakeholders.length === 0) {
    console.log(JSON.stringify({ status: "empty_graph", candidates: [], message: buildMessage("empty_graph", []) }, null, 2));
    return;
  }

  const { status, candidates } = runMatch(stakeholders, taskTitle, taskDescription);
  console.log(JSON.stringify({ status, candidates, message: buildMessage(status, candidates) }, null, 2));
}

run();