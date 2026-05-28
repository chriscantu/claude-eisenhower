/**
 * eventkit.ts
 *
 * Mac-native calendar adapter wrapping the bundled cal_query.swift script.
 * Spawns `swift <script_path> <calendar_name> <days_ahead> <format>` as a
 * child process (no shell injection risk — args passed as array).
 *
 * Full-format line structure (4 fields separated by |||):
 *   <start>|||<end>|||<title>|||<ALL_DAY|"">
 * where start/end are "yyyy-MM-dd HH:mm".
 * Trailing "TOTAL: N events" line is silently ignored.
 *
 * Summary format: raw stdout passed through in reason, events: [].
 *
 * SOLID:
 *   - SRP: only child-process lifecycle + stdout parsing
 *   - DI:  swift_script_path injected via EventkitAdapterConfig
 *
 * Issue: #67
 */

import * as cp from "child_process";
import * as path from "path";
import type {
  CalendarQueryRequest,
  CalendarQueryResult,
  CalendarEvent,
} from "../../adapter-types";

export interface EventkitAdapterConfig {
  /**
   * Absolute path to cal_query.swift.
   * Default: resolved from CLAUDE_PLUGIN_ROOT env var, falling back to
   * path.join(__dirname, "../../cal_query.swift").
   */
  swift_script_path?: string;
}

const TIMEOUT_MS = 30_000;

/**
 * Convert a raw swift date string ("yyyy-MM-dd HH:mm") to ISO 8601 with the
 * local timezone offset (e.g. "2026-05-28T09:00:00-07:00").
 *
 * Parsing as "yyyy-MM-ddTHH:mm:00" (no offset) is interpreted as local time
 * by V8/Node — which is what we want.  If the input is malformed we pass it
 * through unchanged so callers degrade gracefully.
 */
function toIsoWithLocalOffset(raw: string): string {
  const [datePart, timePart] = raw.split(" ");
  if (!datePart || !timePart) return raw;
  const d = new Date(`${datePart}T${timePart}:00`);
  if (isNaN(d.getTime())) return raw;
  const tzMin = -d.getTimezoneOffset();
  const sign = tzMin >= 0 ? "+" : "-";
  const absMin = Math.abs(tzMin);
  const hh = String(Math.floor(absMin / 60)).padStart(2, "0");
  const mm = String(absMin % 60).padStart(2, "0");
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${hh}:${mm}`
  );
}

function defaultScriptPath(): string {
  const root = process.env["CLAUDE_PLUGIN_ROOT"];
  if (root) {
    return path.join(root, "scripts", "cal_query.swift");
  }
  return path.join(__dirname, "../../cal_query.swift");
}

/**
 * Parse a full-format line: "start|||end|||title|||ALL_DAY"
 * Returns null for lines that don't match (e.g. the trailing TOTAL line).
 */
function parseLine(line: string): CalendarEvent | null {
  const parts = line.split("|||");
  if (parts.length < 3) return null;
  const [start, end, title, allDayFlag] = parts;
  if (!start || !end || !title) return null;
  // Skip the TOTAL summary line emitted by swift
  if (start.startsWith("TOTAL:")) return null;
  const all_day = (allDayFlag ?? "").trim() === "ALL_DAY";
  return {
    title: title.trim(),
    start: toIsoWithLocalOffset(start.trim()),
    end: toIsoWithLocalOffset(end.trim()),
    all_day,
  };
}

/**
 * Collect data from a Readable stream into a string.
 */
function collectStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    stream.on("error", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

export function createEventkitAdapter(cfg?: EventkitAdapterConfig): {
  query(req: CalendarQueryRequest): Promise<CalendarQueryResult>;
} {
  const scriptPath = cfg?.swift_script_path ?? defaultScriptPath();

  return {
    async query(req: CalendarQueryRequest): Promise<CalendarQueryResult> {
      const args = [scriptPath, req.calendar_name, String(req.days_ahead), req.format];

      let child: cp.ChildProcess;
      try {
        child = cp.spawn("swift", args, { shell: false });
      } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === "ENOENT") {
          return {
            status: "error",
            reason: "swift binary not found — install Xcode command line tools",
            events: [],
          };
        }
        return { status: "error", reason: String(e.message ?? err), events: [] };
      }

      // ENOENT surfaces as an error event, not a throw, when shell:false
      const spawnErrorPromise = new Promise<NodeJS.ErrnoException | null>((resolve) => {
        child.on("error", (err: NodeJS.ErrnoException) => resolve(err));
        child.on("close", () => resolve(null));
      });

      const stdoutPromise = collectStream(child.stdout!);
      const stderrPromise = collectStream(child.stderr!);

      const exitPromise = new Promise<number | null>((resolve) => {
        child.on("close", (code) => resolve(code));
      });

      // Race: normal completion vs 30-second timeout
      let timedOut = false;
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, TIMEOUT_MS);

      // Wait for either spawn error or process exit
      const [spawnError, stdout, stderr, exitCode] = await Promise.all([
        spawnErrorPromise.then((err) => { clearTimeout(timeoutHandle); return err; }),
        stdoutPromise,
        stderrPromise,
        exitPromise.then((code) => { clearTimeout(timeoutHandle); return code; }),
      ]);

      // Handle ENOENT / spawn failure
      if (spawnError !== null) {
        if (spawnError.code === "ENOENT") {
          return {
            status: "error",
            reason: "swift binary not found — install Xcode command line tools",
            events: [],
          };
        }
        return { status: "error", reason: spawnError.message, events: [] };
      }

      if (timedOut) {
        return {
          status: "error",
          reason: "swift cal_query timed out after 30 seconds",
          events: [],
        };
      }

      if (exitCode !== 0) {
        const reason =
          stderr.trim() || `swift cal_query exited ${exitCode ?? "null"}`;
        return { status: "error", reason, events: [] };
      }

      // Exit 0 — success
      if (req.format === "summary") {
        return { status: "success", reason: stdout.trim(), events: [] };
      }

      // Parse full format
      const events: CalendarEvent[] = [];
      for (const line of stdout.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const event = parseLine(trimmed);
        if (event !== null) {
          events.push(event);
        }
      }

      return { status: "success", reason: "OK", events };
    },
  };
}
