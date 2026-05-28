#!/usr/bin/env node
/**
 * session-briefing.ts
 *
 * SessionStart hook entry point. Invoked by hooks.json as:
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/session-briefing.ts
 *
 * Behavior:
 *   1. Locate TASKS.md (cwd, else stay silent).
 *   2. Read briefing_mode from config/task-output-config.md (default: full).
 *   3. Dedup-per-day: skip if memory/briefing-events.jsonl shows a
 *      briefing was already shown today.
 *   4. Parse TASKS.md, render briefing, print to stdout.
 *   5. Append briefing_shown event to memory/briefing-events.jsonl.
 *
 * Pure logic (parsing, rendering, hit-rate math) lives in:
 *   - scripts/tasks-parser.ts
 *   - scripts/briefing-render.ts
 *   - scripts/briefing-events.ts
 *
 * This file owns I/O only (SOLID: SRP).
 *
 * Issue: #22
 */

import * as fs from "fs";
import * as path from "path";
import { parseTasks } from "./tasks-parser";
import { renderBriefing, BriefingMode } from "./briefing-render";
import {
  appendEvent,
  readEvents,
  lastBriefingDate,
} from "./briefing-events";

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function todayDateString(): string {
  return todayUTC().toISOString().split("T")[0];
}

/**
 * Reads briefing_mode from config/task-output-config.md.
 * Returns "full" if config missing or field absent.
 */
export function readBriefingMode(configPath: string): BriefingMode {
  if (!fs.existsSync(configPath)) return "full";
  try {
    const contents = fs.readFileSync(configPath, "utf8");
    const m = contents.match(/^briefing_mode:\s*(full|quiet|off)\b/im);
    if (m) return m[1].toLowerCase() as BriefingMode;
  } catch {
    /* fall through */
  }
  return "full";
}

interface RunOptions {
  /** Working directory containing TASKS.md, config/, memory/. */
  cwd: string;
  /** Override today's date (UTC midnight). */
  today?: Date;
  /** Override mode read from config. */
  modeOverride?: BriefingMode;
  /** Skip writing the briefing event (used by hook itself). */
  noWrite?: boolean;
}

export interface RunResult {
  output: string;
  shown: boolean;
  reason?: "no-tasks-file" | "mode-off" | "already-shown-today" | "empty-render";
}

/**
 * Pure-as-possible runner. Returns {output, shown}. Caller decides
 * what to do with output (CLI writes to stdout).
 */
export function runBriefing(opts: RunOptions): RunResult {
  const tasksPath = path.join(opts.cwd, "TASKS.md");
  if (!fs.existsSync(tasksPath)) {
    return { output: "", shown: false, reason: "no-tasks-file" };
  }

  const today = opts.today ?? todayUTC();
  const todayStr = today.toISOString().split("T")[0];

  const configPath = path.join(opts.cwd, "config", "task-output-config.md");
  const mode = opts.modeOverride ?? readBriefingMode(configPath);

  if (mode === "off") {
    return { output: "", shown: false, reason: "mode-off" };
  }

  const eventsPath = path.join(opts.cwd, "memory", "briefing-events.jsonl");

  // Dedup per day
  const existingEvents = readEvents(eventsPath);
  if (lastBriefingDate(existingEvents) === todayStr) {
    return { output: "", shown: false, reason: "already-shown-today" };
  }

  const markdown = fs.readFileSync(tasksPath, "utf8");
  const tasks = parseTasks(markdown);
  const result = renderBriefing(tasks, today, mode);

  if (result.text === "") {
    return { output: "", shown: false, reason: "empty-render" };
  }

  if (!opts.noWrite) {
    appendEvent(eventsPath, {
      kind: "briefing_shown",
      shown_at: new Date().toISOString(),
      suggested_action: result.suggestedAction,
      date: todayStr,
    });
  }

  return { output: result.text, shown: true };
}

// ── CLI entry ──────────────────────────────────────────────────────────────

function main(): void {
  const cwd = process.cwd();
  try {
    const { output } = runBriefing({ cwd });
    if (output) {
      process.stdout.write(output + "\n");
    }
    process.exit(0);
  } catch (err) {
    // Never block a session — log to stderr and exit 0.
    process.stderr.write(`session-briefing: ${(err as Error).message}\n`);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
