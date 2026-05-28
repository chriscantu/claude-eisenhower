/**
 * task-output.ts
 *
 * Single dispatcher for task-output adapters. Commands (schedule, execute,
 * delegate) call into this module — they never reach into adapter internals.
 *
 * Responsibilities:
 *   - Maintain a registry of adapter implementations keyed by name
 *   - Resolve the active adapter from `config/task-output-config.md` (the
 *     `## Active Adapter` section) when no override is passed
 *   - Dispatch `pushTask` / `completeTask` calls to the named adapter
 *   - Expose a CLI entry point so command prompts can `node task-output.ts
 *     push|complete …` without spawning ts-node
 *
 * SOLID:
 *   - SRP: dispatch only; no I/O beyond config read
 *   - OCP: register additional adapters without touching this file
 *   - DI:  adapter registry is in-process state, swappable per-call
 *
 * Issue: #27
 */

import * as fs from "fs";
import * as path from "path";

import type {
  TaskOutputAdapter,
  TaskOutputRecord,
  PushResult,
  CompleteResult,
} from "./adapter-types";

import { createMarkdownFileAdapter } from "./adapters/task-output/markdown-file";
import { createRemindersAdapter } from "./adapters/task-output/reminders";
import { createGoogleTasksAdapter } from "./adapters/task-output/google";

const registry = new Map<string, TaskOutputAdapter>();

/** Register an adapter by name. Replaces any existing registration. */
export function registerAdapter(adapter: TaskOutputAdapter): void {
  registry.set(adapter.name, adapter);
}

/** Names of currently-registered adapters. */
export function listRegisteredAdapters(): string[] {
  return [...registry.keys()];
}

/** Reset the registry (test hook only). */
export function resetRegistryForTests(): void {
  registry.clear();
}

function lookupOrThrow(name: string): TaskOutputAdapter {
  const adapter = registry.get(name);
  if (!adapter) {
    const known = listRegisteredAdapters().join(", ") || "(none registered)";
    throw new Error(
      `Unknown task-output adapter '${name}'. Registered adapters: ${known}.`
    );
  }
  return adapter;
}

/** Dispatch a push to the named adapter. */
export async function pushTask(
  record: TaskOutputRecord,
  adapterName: string
): Promise<PushResult> {
  return lookupOrThrow(adapterName).pushTask(record);
}

/** Dispatch a completion to the named adapter. */
export async function completeTask(
  title: string,
  list_name: string,
  adapterName: string,
  externalId?: string
): Promise<CompleteResult> {
  return lookupOrThrow(adapterName).completeTask(title, list_name, externalId);
}

/**
 * Read the active adapter name from `config/task-output-config.md`.
 *
 * Returns null when:
 *   - the file does not exist
 *   - the `## Active Adapter` section is absent
 *   - the value is the placeholder `~~task_output`
 *
 * Null means "no adapter configured" — callers should treat this as a
 * silent skip per the existing schedule/execute semantics.
 */
export function readActiveAdapter(configFile: string): string | null {
  if (!fs.existsSync(configFile)) return null;
  const raw = fs.readFileSync(configFile, "utf-8");
  const lines = raw.split("\n");
  let inSection = false;
  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headerMatch) {
      if (inSection) break; // next H2 ends the section
      inSection = headerMatch[1].trim().toLowerCase() === "active adapter";
      continue;
    }
    if (!inSection) continue;
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed === "---") break;
    if (trimmed === "~~task_output") return null;
    return trimmed;
  }
  return null;
}

/**
 * Bootstrap the built-in adapter set. Idempotent — safe to call multiple
 * times; latest registration wins per `registerAdapter` semantics.
 *
 * Markdown-file requires its target path from config; the bootstrap reads
 * `config/task-output-config.md` for the `### markdown-file` block when
 * present. Absent block → use `./external-todo.md` next to the config file.
 */
export function bootstrapBuiltInAdapters(pluginRoot: string, configFile?: string): void {
  registerAdapter(createRemindersAdapter({ pluginRoot }));
  const mdFile = resolveMarkdownFilePath(configFile);
  registerAdapter(createMarkdownFileAdapter({ file: mdFile }));
  registerAdapter(createGoogleTasksAdapter());
}

function resolveMarkdownFilePath(configFile?: string): string {
  const fallback = path.resolve(process.cwd(), "external-todo.md");
  if (!configFile || !fs.existsSync(configFile)) return fallback;
  const raw = fs.readFileSync(configFile, "utf-8");
  const lines = raw.split("\n");
  let inBlock = false;
  for (const line of lines) {
    if (/^###\s+markdown-file\s*$/.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock && /^###?\s/.test(line)) break;
    if (!inBlock) continue;
    const m = line.match(/^\s*file:\s*(.+?)\s*$/);
    if (m) {
      const value = m[1].trim();
      if (value === "" || value.startsWith("~~")) return fallback;
      return path.isAbsolute(value)
        ? value
        : path.resolve(path.dirname(configFile), value);
    }
  }
  return fallback;
}

// ── CLI entry point ──────────────────────────────────────────────────────────
//
// Usage (called from command prompts via node):
//   node task-output.ts push <pluginRoot> <configFile> <recordJsonPath> [adapterOverride]
//   node task-output.ts complete <pluginRoot> <configFile> <title> <list_name> [externalId] [adapterOverride]
//
// `externalId` is the value previously returned in PushResult.id (issue #36).
// Pass "" when the task record has no Reminder-id field — the adapter falls
// back to title-based lookup. Adapters that don't support id-based lookup
// (e.g. markdown-file) ignore the value.
//
// recordJsonPath is a path to a JSON file containing a TaskOutputRecord —
// passing it on argv would explode on quoting for descriptions. Result is
// printed to stdout as a single-line JSON object so the calling prompt can
// parse it deterministically.

interface CliPushOk { ok: true; mode: "push"; result: PushResult }
interface CliCompleteOk { ok: true; mode: "complete"; result: CompleteResult }
interface CliErr { ok: false; error: string }
type CliOutput = CliPushOk | CliCompleteOk | CliErr;

async function runCli(argv: string[]): Promise<CliOutput> {
  const [, , mode, pluginRoot, configFile, ...rest] = argv;
  if (mode !== "push" && mode !== "complete") {
    return { ok: false, error: `Unknown mode '${mode}'. Use 'push' or 'complete'.` };
  }
  if (!pluginRoot || !configFile) {
    return { ok: false, error: "Missing required args: pluginRoot configFile." };
  }
  bootstrapBuiltInAdapters(pluginRoot, configFile);
  const explicit = mode === "push" ? rest[1] : rest[3];
  const adapterName = explicit ?? readActiveAdapter(configFile);
  if (!adapterName) {
    return { ok: false, error: "No active adapter configured and no override provided." };
  }

  try {
    if (mode === "push") {
      const recordPath = rest[0];
      if (!recordPath) return { ok: false, error: "push: missing recordJsonPath." };
      const record = JSON.parse(fs.readFileSync(recordPath, "utf-8")) as TaskOutputRecord;
      const result = await pushTask(record, adapterName);
      return { ok: true, mode: "push", result };
    }
    const title = rest[0];
    const list_name = rest[1];
    const externalId = rest[2] ?? "";
    if (!title || !list_name) {
      return { ok: false, error: "complete: missing title or list_name." };
    }
    const result = await completeTask(
      title,
      list_name,
      adapterName,
      externalId === "" ? undefined : externalId
    );
    return { ok: true, mode: "complete", result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

if (require.main === module) {
  runCli(process.argv).then((out) => {
    process.stdout.write(JSON.stringify(out) + "\n");
    process.exit(out.ok ? 0 : 1);
  });
}
