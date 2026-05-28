/**
 * reminders.ts
 *
 * Mac Reminders task-output adapter. Thin wrapper around the bundled
 * AppleScripts (`scripts/push_reminder.applescript`,
 * `scripts/complete_reminder.applescript`).
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
 * Issue #38: AppleScripts emit single-line JSON on stdout; the adapter parses
 * it deterministically. osascript runs under a 10s timeout so a hung
 * Reminders.app cannot block /schedule indefinitely.
 *
 * SOLID:
 *   - SRP: only Reminders I/O via osascript
 *   - DI:  pluginRoot is injected; child_process is the only side-channel
 *
 * Spec: adapters/reminders.md
 * Issues: #27, #38
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
  /** osascript timeout in milliseconds. Default 10_000. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

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
  timedOut: boolean;
}

function runOsascript(
  script: string,
  args: string[],
  timeoutMs: number
): OsascriptOutcome {
  const res = spawnSync("osascript", [script, ...args], {
    encoding: "buffer",
    timeout: timeoutMs,
    killSignal: "SIGTERM",
  });
  // spawnSync sets `signal` (and clears `status`) when killed by timeout.
  const timedOut =
    res.status === null && (res.signal === "SIGTERM" || res.signal === "SIGKILL");
  return {
    stdout: res.stdout?.toString("utf-8") ?? "",
    stderr: res.stderr?.toString("utf-8") ?? "",
    status: res.status,
    timedOut,
  };
}

interface AppleScriptJson {
  status: "success" | "skipped" | "error";
  title?: string;
  id?: string;
  reason?: string;
  note?: string;
}

function parseScriptJson(stdout: string): AppleScriptJson | null {
  const line = stdout.trim();
  if (!line) return null;
  try {
    const parsed = JSON.parse(line);
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed.status === "success" ||
        parsed.status === "skipped" ||
        parsed.status === "error")
    ) {
      return parsed as AppleScriptJson;
    }
    return null;
  } catch {
    return null;
  }
}

export function createRemindersAdapter(
  opts: RemindersAdapterOptions
): TaskOutputAdapter {
  const pushScript = `${opts.pluginRoot}/scripts/push_reminder.applescript`;
  const completeScript = `${opts.pluginRoot}/scripts/complete_reminder.applescript`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

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
      const out = runOsascript(pushScript, args, timeoutMs);
      if (out.timedOut) {
        return {
          status: "error",
          reason: `osascript timed out after ${timeoutMs}ms`,
          id: "",
        };
      }
      const parsed = parseScriptJson(out.stdout);
      if (!parsed) {
        const reason =
          out.stderr.trim() ||
          out.stdout.trim() ||
          `osascript exited ${out.status} with no parseable output`;
        return { status: "error", reason, id: "" };
      }
      if (parsed.status === "success") {
        return { status: "success", reason: "Created", id: parsed.id ?? "" };
      }
      if (parsed.status === "skipped") {
        return {
          status: "skipped",
          reason: "Already exists",
          id: parsed.id ?? "",
        };
      }
      return {
        status: "error",
        reason: parsed.reason ?? "Unknown osascript error",
        id: "",
      };
    },

    async completeTask(
      title: string,
      list_name: string
    ): Promise<CompleteResult> {
      const out = runOsascript(completeScript, [title, list_name], timeoutMs);
      if (out.timedOut) {
        return {
          status: "error",
          reason: `osascript timed out after ${timeoutMs}ms`,
        };
      }
      const parsed = parseScriptJson(out.stdout);
      if (!parsed) {
        const reason =
          out.stderr.trim() ||
          out.stdout.trim() ||
          `osascript exited ${out.status} with no parseable output`;
        return { status: "error", reason };
      }
      if (parsed.status === "success") {
        return {
          status: "success",
          reason:
            parsed.note === "already_completed" ? "Already completed" : "Completed",
        };
      }
      if (parsed.status === "skipped") {
        return { status: "skipped", reason: parsed.reason ?? "Not found" };
      }
      return { status: "error", reason: parsed.reason ?? "Unknown osascript error" };
    },
  };
}
