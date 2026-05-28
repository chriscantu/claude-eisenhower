#!/usr/bin/env npx ts-node
/**
 * memory-analytics.ts
 *
 * Pure analytics aggregator for the three memory/*-log.md files. Used by
 * `/memory show analytics` so the LLM does not compute line counts, sums,
 * and trend deltas by hand — that was identified as a brittle pattern in
 * the PR #91 code review.
 *
 * Output is single-line JSON on stdout so the caller parses with normal
 * JSON handling. Missing files are reported as `present: false` (not an
 * error) so the caller can degrade gracefully per spec.
 *
 * Spec: commands/memory.md Step 2C.
 *
 * Usage:
 *   npx ts-node scripts/memory-analytics.ts <repo_root>
 */

import * as fs from "fs";
import * as path from "path";

interface LogSummary {
  present: boolean;
  entry_count: number;
  date_range: { oldest: string; newest: string } | null;
  /** Sum of named numeric fields over the last N entries (per spec). */
  recent_sums: Record<string, number>;
  /** First→last delta for named fields over the last N entries. */
  recent_trend: Record<string, { first: number; last: number; delta: number }>;
}

interface AnalyticsReport {
  today_log: LogSummary;
  plan_log: LogSummary;
  review_log: LogSummary;
}

const TODAY_LOG_FIELDS = ["overdue", "inbox", "on_plate", "completed"] as const;
const PLAN_LOG_FIELDS = ["committed", "carryover", "deferred"] as const;
const REVIEW_LOG_TREND_FIELDS = ["inbox", "delegated"] as const;

const LINE_RE = /^\[(\d{4}-\d{2}-\d{2})\]\s+(.*)$/;
const FIELD_RE = /(\w+):(\d+)/g;

/**
 * Parse one log line. Returns null if the line does not match the canonical
 * `[YYYY-MM-DD] key:value ...` shape — caller drops it silently.
 */
function parseLine(line: string): { date: string; fields: Record<string, number> } | null {
  const m = LINE_RE.exec(line);
  if (!m) return null;
  const date = m[1];
  const fields: Record<string, number> = {};
  let fm: RegExpExecArray | null;
  const rest = m[2];
  const fieldRe = new RegExp(FIELD_RE.source, "g");
  while ((fm = fieldRe.exec(rest)) !== null) {
    const value = parseInt(fm[2], 10);
    if (!Number.isNaN(value)) fields[fm[1]] = value;
  }
  return { date, fields };
}

function summarize(
  filePath: string,
  sumFields: readonly string[],
  trendFields: readonly string[],
  window: number
): LogSummary {
  if (!fs.existsSync(filePath)) {
    return {
      present: false,
      entry_count: 0,
      date_range: null,
      recent_sums: {},
      recent_trend: {},
    };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const entries = raw
    .split(/\r?\n/)
    .map(parseLine)
    .filter((e): e is { date: string; fields: Record<string, number> } => e !== null);

  if (entries.length === 0) {
    return {
      present: true,
      entry_count: 0,
      date_range: null,
      recent_sums: {},
      recent_trend: {},
    };
  }

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const dateRange = {
    oldest: sorted[0].date,
    newest: sorted[sorted.length - 1].date,
  };

  const recent = sorted.slice(-window);
  const recentSums: Record<string, number> = {};
  for (const field of sumFields) {
    recentSums[field] = recent.reduce((acc, e) => acc + (e.fields[field] ?? 0), 0);
  }

  const recentTrend: Record<string, { first: number; last: number; delta: number }> = {};
  for (const field of trendFields) {
    const first = recent[0]?.fields[field] ?? 0;
    const last = recent[recent.length - 1]?.fields[field] ?? 0;
    recentTrend[field] = { first, last, delta: last - first };
  }

  return {
    present: true,
    entry_count: entries.length,
    date_range: dateRange,
    recent_sums: recentSums,
    recent_trend: recentTrend,
  };
}

export function buildReport(repoRoot: string): AnalyticsReport {
  const memDir = path.join(repoRoot, "memory");
  return {
    today_log: summarize(path.join(memDir, "today-log.md"), TODAY_LOG_FIELDS, [], 14),
    plan_log: summarize(path.join(memDir, "plan-log.md"), PLAN_LOG_FIELDS, [], 4),
    review_log: summarize(path.join(memDir, "review-log.md"), [], REVIEW_LOG_TREND_FIELDS, 4),
  };
}

function main(): void {
  const repoRoot = process.argv[2] ?? process.cwd();
  const report = buildReport(repoRoot);
  process.stdout.write(JSON.stringify(report) + "\n");
}

if (require.main === module) main();
