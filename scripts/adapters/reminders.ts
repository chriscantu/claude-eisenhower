/**
 * reminders.ts
 *
 * Mac Reminders task-output adapter. Thin wrapper around the existing
 * AppleScripts (`scripts/push_reminder.applescript`,
 * `scripts/complete_reminder.applescript`) — no behavior change for current
 * users; only the dispatch path changes.
 *
 * Adapter contract:
 *   - `pushTask(record)` → osascript push_reminder.applescript
 *   - `completeTask(title, list_name)` → osascript complete_reminder.applescript
 *
 * Priority mapping (high|medium → Reminders integer):
 *   high → 1, medium → 5. (The Reminders priority-integer leak is honest:
 *   it lives only inside this adapter, not in TaskOutputRecord.)
 *
 * `due_date: null` is passed to AppleScript as the literal string "none",
 * matching the existing AppleScript contract.
 *
 * SOLID:
 *   - SRP: only Reminders I/O via osascript
 *   - DI:  pluginRoot is injected; child_process is the only side-channel
 *
 * Spec: adapters/reminders.md
 * Issue: #27
 */

import { spawnSync } from "child_process";

import type {
  TaskOutputRecord,
  PushResult,
  CompleteResult,
  TaskOutputAdapter,
} from "../adapter-types";

export interface RemindersAdapterOptions {
  /** Plugin install root — used to locate the bundled AppleScripts. */
  pluginRoot: string;
}

function priorityToInt(priority: "high" | "medium"): string {
  return priority === "high" ? "1" : "5";
}

function dueDateArg(due: string | null): string {
  return due === null ? "none" : due;
}

interface OsascriptOutcome {
  stdout: string;
  stderr: string;
  status: number | null;
}

function runOsascript(script: string, args: string[]): OsascriptOutcome {
  const res = spawnSync("osascript", [script, ...args], { encoding: "buffer" });
  return {
    stdout: res.stdout?.toString("utf-8") ?? "",
    stderr: res.stderr?.toString("utf-8") ?? "",
    status: res.status,
  };
}

/**
 * Parse the conventional `<status>: <message>` prefix used by both bundled
 * AppleScripts. Returns `{ kind, message }` with kind ∈ success|skipped|error.
 */
function parseScriptStdout(stdout: string): {
  kind: "success" | "skipped" | "error";
  message: string;
} {
  const line = stdout.trim();
  if (line.startsWith("success:")) {
    return { kind: "success", message: line.slice("success:".length).trim() };
  }
  if (line.startsWith("skipped:")) {
    return { kind: "skipped", message: line.slice("skipped:".length).trim() };
  }
  if (line.startsWith("error:")) {
    return { kind: "error", message: line.slice("error:".length).trim() };
  }
  return { kind: "error", message: line || "Unknown osascript outcome" };
}

export function createRemindersAdapter(
  opts: RemindersAdapterOptions
): TaskOutputAdapter {
  const pushScript = `${opts.pluginRoot}/scripts/push_reminder.applescript`;
  const completeScript = `${opts.pluginRoot}/scripts/complete_reminder.applescript`;

  return {
    name: "reminders",

    async pushTask(record: TaskOutputRecord): Promise<PushResult> {
      const args = [
        record.title,
        record.description,
        dueDateArg(record.due_date),
        priorityToInt(record.priority),
        record.list_name,
      ];
      const out = runOsascript(pushScript, args);
      if (out.status !== 0 && out.stdout.trim().length === 0) {
        return {
          status: "error",
          reason: out.stderr.trim() || `osascript exited ${out.status}`,
          id: "",
        };
      }
      const parsed = parseScriptStdout(out.stdout);
      if (parsed.kind === "success") {
        return { status: "success", reason: "Created", id: parsed.message };
      }
      if (parsed.kind === "skipped") {
        return { status: "skipped", reason: "Already exists", id: "" };
      }
      return { status: "error", reason: parsed.message, id: "" };
    },

    async completeTask(
      title: string,
      list_name: string
    ): Promise<CompleteResult> {
      const out = runOsascript(completeScript, [title, list_name]);
      if (out.status !== 0 && out.stdout.trim().length === 0) {
        return {
          status: "error",
          reason: out.stderr.trim() || `osascript exited ${out.status}`,
        };
      }
      const parsed = parseScriptStdout(out.stdout);
      if (parsed.kind === "success") {
        const alreadyCompleted = /\(already completed\)/i.test(parsed.message);
        return {
          status: "success",
          reason: alreadyCompleted ? "Already completed" : "Completed",
        };
      }
      if (parsed.kind === "skipped") {
        return { status: "skipped", reason: parsed.message || "Not found" };
      }
      return { status: "error", reason: parsed.message };
    },
  };
}
