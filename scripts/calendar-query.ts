/**
 * calendar-query.ts
 *
 * Single dispatcher for calendar-source adapters. Commands and skills call
 * into this module — they never reach into adapter internals.
 *
 * Responsibilities:
 *   - Maintain a registry of CalendarSourceAdapter implementations keyed by
 *     name (default: "eventkit", stub: "google")
 *   - Resolve the active provider from `config/calendar-config.md` (the
 *     `provider:` field) when no override is passed
 *   - Dispatch `query` calls to the named adapter
 *   - Expose a CLI entry point so command prompts can
 *     `node calendar-query.ts query <calendar_name> <days_ahead> <format>`
 *     without spawning ts-node
 *
 * SOLID:
 *   - SRP: dispatch only; no I/O beyond config read + CLI arg parsing
 *   - OCP: register additional adapters without touching this file
 *   - DI:  adapter registry is in-process state, swappable per-call
 *
 * Issue: #67
 */

import * as fs from "fs";
import * as path from "path";

import type {
  CalendarQueryRequest,
  CalendarQueryResult,
  CalendarSourceAdapter,
} from "./adapter-types";
import { createEventkitAdapter } from "./adapters/calendar/eventkit";
import { createGoogleCalendarAdapter } from "./adapters/calendar/google";

export type { CalendarSourceAdapter };

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, CalendarSourceAdapter>();

/** Register an adapter by name. Replaces any existing registration. */
export function registerAdapter(adapter: CalendarSourceAdapter): void {
  registry.set(adapter.name, adapter);
}

/** Currently registered adapter names. */
export function listRegisteredAdapters(): string[] {
  return [...registry.keys()];
}

/** Test-only registry reset. */
export function resetRegistryForTests(): void {
  registry.clear();
}

// ---------------------------------------------------------------------------
// Bootstrap — register built-in adapters on module load
// ---------------------------------------------------------------------------

registerAdapter({
  name: "eventkit",
  query: async (req: CalendarQueryRequest): Promise<CalendarQueryResult> =>
    createEventkitAdapter().query(req),
});

registerAdapter(createGoogleCalendarAdapter());

// ---------------------------------------------------------------------------
// Config reader
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG_PATH = process.env["CLAUDE_PLUGIN_ROOT"]
  ? path.join(process.env["CLAUDE_PLUGIN_ROOT"], "config", "calendar-config.md")
  : path.join(__dirname, "..", "config", "calendar-config.md");

/**
 * Parse `provider:` from the given config file.
 *
 * Returns "eventkit" when:
 *   - the file does not exist (backward compat)
 *   - the file exists but has no `provider:` line
 *
 * Provider names are normalized to lowercase.
 */
export function readProviderFromConfig(configPath: string): string {
  if (!fs.existsSync(configPath)) return "eventkit";
  const raw = fs.readFileSync(configPath, "utf-8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*provider:\s*(.+?)\s*$/);
    if (m) {
      const value = m[1].trim().toLowerCase();
      if (value.length > 0) return value;
    }
  }
  return "eventkit";
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Read config, resolve adapter, dispatch query.
 *
 * @param req              Calendar query parameters.
 * @param providerOverride When provided, bypasses config lookup entirely.
 * @param configPath       Path to calendar-config.md. Defaults to
 *                         `config/calendar-config.md` relative to plugin root.
 */
export async function queryCalendar(
  req: CalendarQueryRequest,
  providerOverride?: string,
  configPath?: string
): Promise<CalendarQueryResult> {
  const resolvedConfigPath = configPath ?? DEFAULT_CONFIG_PATH;
  const provider =
    providerOverride ?? readProviderFromConfig(resolvedConfigPath);

  const adapter = registry.get(provider);
  if (!adapter) {
    return {
      status: "error",
      reason: `Unknown calendar provider: ${provider}`,
      events: [],
    };
  }

  try {
    return await adapter.query(req);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", reason: message, events: [] };
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
//
// Usage (called from command prompts via node):
//   node calendar-query.ts query <calendar_name> <days_ahead> <format>
//
// Result is printed to stdout as a single-line JSON object so the calling
// prompt can parse it deterministically.

interface CliOk {
  ok: true;
  result: CalendarQueryResult;
}
interface CliErr {
  ok: false;
  error: string;
}
type CliOutput = CliOk | CliErr;

async function runCli(argv: string[]): Promise<CliOutput> {
  const [, , mode, calendarName, daysAheadStr, format] = argv;

  if (mode !== "query") {
    return { ok: false, error: `Unknown mode '${mode}'. Use 'query'.` };
  }

  if (!calendarName || !daysAheadStr || !format) {
    return {
      ok: false,
      error: "Usage: calendar-query.ts query <calendar_name> <days_ahead> <format>",
    };
  }

  if (format !== "full" && format !== "summary") {
    return {
      ok: false,
      error: `Invalid format '${format}'. Use 'full' or 'summary'.`,
    };
  }

  const daysAhead = Number(daysAheadStr);
  if (!Number.isFinite(daysAhead) || daysAhead < 0) {
    return {
      ok: false,
      error: `Invalid days_ahead '${daysAheadStr}'. Must be a non-negative integer.`,
    };
  }

  const req: CalendarQueryRequest = {
    calendar_name: calendarName,
    days_ahead: daysAhead,
    format,
  };

  try {
    const result = await queryCalendar(req);
    return { ok: true, result };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

if (require.main === module) {
  runCli(process.argv).then((out) => {
    process.stdout.write(JSON.stringify(out) + "\n");
    process.exit(out.ok ? 0 : 1);
  });
}
