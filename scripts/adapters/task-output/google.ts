/**
 * google.ts — Google Tasks task-output adapter.
 *
 * Cross-platform write-side adapter for the task-output dispatcher. Pushes
 * Q1/Q2/Q3 tasks to a configured Google Tasks list and marks them complete
 * via the Tasks API. Shares the Google OAuth lifecycle with the Calendar
 * and Gmail adapters via `scripts/google-auth.ts` (issue #67).
 *
 * Field mapping (TaskOutputRecord → Google Tasks `Task` resource):
 *   title       → title, prefixed with `[Q1]`/`[Q2]`/`[Q3]` (Tasks has no
 *                 priority field; quadrant is encoded in the title prefix)
 *   description → notes (with `source` and `requester` appended as labeled
 *                 lines so they survive the round-trip)
 *   due_date    → due (RFC3339 at midnight UTC; Google Tasks ignores the
 *                 time portion and stores due as a date only)
 *   list_name   → resolved to a Google Tasks tasklist ID via tasklists.list,
 *                 matched by title (case-insensitive trim)
 *
 * Q4 invariant: Q4 is excluded by the TaskOutputRecord.quadrant union; the
 * dispatcher never hands a Q4 record to any adapter. This adapter does NOT
 * re-gate Q4 — matches the reminders.ts pattern.
 *
 * Errors NEVER throw to the caller. API failures, missing config, missing
 * list, etc., all return PushResult/CompleteResult with status "error" and
 * a human-readable reason. The dispatcher relies on this for graceful
 * degradation.
 *
 * SOLID:
 *   - SRP: only Google Tasks I/O + config resolution
 *   - DI:  GoogleTasksAdapterOptions lets tests inject paths and a custom
 *          tasks-client factory so no real network call is ever made in tests
 *
 * Spec: adapters/task-output/google.md (planned)
 * Issue: #66
 */

import * as fs from "fs";
import * as path from "path";

import { google, type tasks_v1 } from "googleapis";

import type {
  TaskOutputAdapter,
  TaskOutputRecord,
  PushResult,
  CompleteResult,
} from "../../adapter-types";
import { getAccessToken, type GoogleAuthConfig } from "../../google-auth";

// ── Public types ──────────────────────────────────────────────────────────────

/** The Google Tasks API scope this adapter uses. Read-write on tasks only. */
export const TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";

/** Configuration resolved from `config/task-output-config.md ### google`. */
export interface GoogleTasksResolvedConfig {
  /** Absolute path to OAuth client_secret.json. */
  credentials_path: string;
  /** Absolute path where refresh_token.json is persisted. */
  token_path: string;
  /** Google Tasks list to push to (matched by title). */
  list_name: string;
}

export interface GoogleTasksAdapterOptions {
  /**
   * Override the resolved config entirely. When supplied, no config file is
   * read. Primary injection seam for tests.
   */
  config?: GoogleTasksResolvedConfig;
  /**
   * Path to the task-output-config.md to read when `config` is not supplied.
   * Defaults to `<plugin_root>/config/task-output-config.md`.
   */
  configPath?: string;
  /**
   * Factory for the Tasks API client. Defaults to `google.tasks({version:"v1", auth})`.
   * Tests inject a stub here.
   */
  tasksClientFactory?: (accessToken: string) => tasks_v1.Tasks;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const DEFAULT_CONFIG_PATH = process.env["CLAUDE_PLUGIN_ROOT"]
  ? path.join(process.env["CLAUDE_PLUGIN_ROOT"], "config", "task-output-config.md")
  : path.join(__dirname, "..", "..", "..", "config", "task-output-config.md");

/**
 * Read `### google` block from task-output-config.md. Recognized fields:
 *   credentials_path:
 *   token_path:
 *   list_name:
 *
 * Returns null when the block is missing or a required field is unset.
 */
export function readGoogleTasksConfig(
  configFile: string
): GoogleTasksResolvedConfig | null {
  if (!fs.existsSync(configFile)) return null;
  const raw = fs.readFileSync(configFile, "utf-8");
  const lines = raw.split("\n");
  let inBlock = false;
  let credentials_path = "";
  let token_path = "";
  let list_name = "";
  for (const line of lines) {
    if (/^###\s+google\s*$/i.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock && /^###?\s/.test(line)) break;
    if (!inBlock) continue;
    const m = line.match(/^\s*(credentials_path|token_path|list_name):\s*(.+?)\s*$/);
    if (!m) continue;
    const value = m[2].trim();
    if (value.length === 0 || value.startsWith("~~")) continue;
    if (m[1] === "credentials_path") credentials_path = value;
    if (m[1] === "token_path") token_path = value;
    if (m[1] === "list_name") list_name = value;
  }
  if (!credentials_path || !token_path || !list_name) return null;
  return { credentials_path, token_path, list_name };
}

function quadrantPrefix(q: "Q1" | "Q2" | "Q3"): string {
  return `[${q}]`;
}

/** Strip a leading `[Q1]`/`[Q2]`/`[Q3] ` prefix if present. */
function stripQuadrantPrefix(title: string): string {
  return title.replace(/^\[Q[123]\]\s+/, "");
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Build the `notes` field — description plus labeled source/requester lines.
 * Empty/null fields are omitted to keep notes legible.
 */
function buildNotes(record: TaskOutputRecord): string {
  const parts: string[] = [];
  if (record.description && record.description.trim().length > 0) {
    parts.push(record.description.trim());
  }
  if (record.source && record.source.trim().length > 0) {
    parts.push(`Source: ${record.source.trim()}`);
  }
  if (record.requester && record.requester.trim().length > 0) {
    parts.push(`Requester: ${record.requester.trim()}`);
  }
  return parts.join("\n");
}

/** RFC3339 at midnight UTC for a YYYY-MM-DD date. Returns null for null due. */
function toRfc3339Due(due: string | null): string | null {
  if (due === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  return `${due}T00:00:00.000Z`;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ── Adapter factory ───────────────────────────────────────────────────────────

export function createGoogleTasksAdapter(
  opts: GoogleTasksAdapterOptions = {}
): TaskOutputAdapter {
  const configPath = opts.configPath ?? DEFAULT_CONFIG_PATH;

  function resolveConfig(): GoogleTasksResolvedConfig | { error: string } {
    if (opts.config) return opts.config;
    const cfg = readGoogleTasksConfig(configPath);
    if (!cfg) {
      return {
        error:
          `Google Tasks config missing or incomplete at ${configPath}. ` +
          `Expected ### google block with credentials_path, token_path, list_name.`,
      };
    }
    return cfg;
  }

  async function buildTasksClient(
    cfg: GoogleTasksResolvedConfig
  ): Promise<tasks_v1.Tasks> {
    const authCfg: GoogleAuthConfig = {
      scopes: [TASKS_SCOPE],
      credentials_path: cfg.credentials_path,
      token_path: cfg.token_path,
    };
    const access = await getAccessToken(authCfg);
    if (opts.tasksClientFactory) return opts.tasksClientFactory(access.token);
    const oauth = new google.auth.OAuth2();
    oauth.setCredentials({ access_token: access.token });
    return google.tasks({ version: "v1", auth: oauth });
  }

  /**
   * Resolve a tasklist ID by title (case-insensitive trim).
   * Paginates via pageToken — Google Tasks accounts can exceed the 100-item
   * single-page cap.
   */
  async function resolveListId(
    client: tasks_v1.Tasks,
    list_name: string
  ): Promise<{ id: string } | { error: string }> {
    const target = normalize(list_name);
    let pageToken: string | undefined;
    do {
      const res = await client.tasklists.list({
        maxResults: 100,
        ...(pageToken ? { pageToken } : {}),
      });
      const items = res.data.items ?? [];
      for (const tl of items) {
        if (tl.title && normalize(tl.title) === target && tl.id) {
          return { id: tl.id };
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return { error: `Google Tasks list not found: ${list_name}` };
  }

  /**
   * Scan all tasks in a list for one matching `target` (post-prefix-strip,
   * normalized). Returns the first match including its completion status.
   * Paginates via pageToken — lists can exceed 100 open tasks.
   */
  async function findTaskByTitle(
    client: tasks_v1.Tasks,
    listId: string,
    target: string,
    options: { showCompleted: boolean }
  ): Promise<{ id: string; completed: boolean } | null> {
    let pageToken: string | undefined;
    do {
      const res = await client.tasks.list({
        tasklist: listId,
        maxResults: 100,
        showCompleted: options.showCompleted,
        ...(pageToken ? { pageToken } : {}),
      });
      const items = res.data.items ?? [];
      for (const t of items) {
        if (!t.title || !t.id) continue;
        const stripped = stripQuadrantPrefix(t.title);
        if (normalize(stripped) !== target) continue;
        return { id: t.id, completed: t.status === "completed" };
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return null;
  }

  return {
    name: "google",

    async pushTask(record: TaskOutputRecord): Promise<PushResult> {
      const cfg = resolveConfig();
      if ("error" in cfg) return { status: "error", reason: cfg.error, id: "" };

      // Honor caller-provided list_name (per TaskOutputRecord contract),
      // fall back to configured default only when the record omits it.
      // Mirrors completeTask's resolution rule.
      const resolvedList =
        record.list_name && record.list_name.trim().length > 0
          ? record.list_name
          : cfg.list_name;

      let client: tasks_v1.Tasks;
      try {
        client = await buildTasksClient(cfg);
      } catch (err) {
        return { status: "error", reason: errorMessage(err), id: "" };
      }

      const listResult = await (async () => {
        try {
          return await resolveListId(client, resolvedList);
        } catch (err) {
          return { error: errorMessage(err) };
        }
      })();
      if ("error" in listResult) {
        return { status: "error", reason: listResult.error, id: "" };
      }

      const titleWithPrefix = `${quadrantPrefix(record.quadrant)} ${record.title}`;

      // Idempotency: TaskOutputAdapter contract (adapter-types.ts) requires
      // repeated pushes of the same logical record to return `skipped`
      // rather than create duplicates. Scan the list for a matching title
      // first; if found, no-op.
      const target = normalize(record.title);
      try {
        const existing = await findTaskByTitle(client, listResult.id, target, {
          showCompleted: false,
        });
        if (existing) {
          return {
            status: "skipped",
            reason: "Already exists",
            id: existing.id,
          };
        }
      } catch (err) {
        return { status: "error", reason: errorMessage(err), id: "" };
      }

      const body: tasks_v1.Schema$Task = {
        title: titleWithPrefix,
        notes: buildNotes(record),
      };
      const due = toRfc3339Due(record.due_date);
      if (due !== null) body.due = due;

      try {
        const insertRes = await client.tasks.insert({
          tasklist: listResult.id,
          requestBody: body,
        });
        const id = insertRes.data.id ?? "";
        return { status: "success", reason: "Created", id };
      } catch (err) {
        return { status: "error", reason: errorMessage(err), id: "" };
      }
    },

    async completeTask(
      title: string,
      list_name: string,
      externalId?: string
    ): Promise<CompleteResult> {
      const cfg = resolveConfig();
      if ("error" in cfg) return { status: "error", reason: cfg.error };

      // Honor caller-provided list_name (per contract), but fall back to the
      // configured default if the caller passes an empty string.
      const resolvedList = list_name && list_name.trim().length > 0
        ? list_name
        : cfg.list_name;

      let client: tasks_v1.Tasks;
      try {
        client = await buildTasksClient(cfg);
      } catch (err) {
        return { status: "error", reason: errorMessage(err) };
      }

      let listId: string;
      try {
        const r = await resolveListId(client, resolvedList);
        if ("error" in r) return { status: "error", reason: r.error };
        listId = r.id;
      } catch (err) {
        return { status: "error", reason: errorMessage(err) };
      }

      // ID-based path: patch directly. Title-based path: scan list for match.
      if (externalId && externalId.length > 0) {
        try {
          await client.tasks.patch({
            tasklist: listId,
            task: externalId,
            requestBody: { status: "completed" },
          });
          return { status: "success", reason: "Completed" };
        } catch (err) {
          return { status: "error", reason: errorMessage(err) };
        }
      }

      // Title fallback. Tolerate the `[Qn]` prefix that pushTask added.
      // Paginates via shared helper so lists with >100 tasks are covered.
      const target = normalize(title);
      try {
        const match = await findTaskByTitle(client, listId, target, {
          showCompleted: true,
        });
        if (!match) return { status: "skipped", reason: "Not found" };
        if (match.completed) {
          return { status: "success", reason: "Already completed" };
        }
        await client.tasks.patch({
          tasklist: listId,
          task: match.id,
          requestBody: { status: "completed" },
        });
        return { status: "success", reason: "Completed" };
      } catch (err) {
        return { status: "error", reason: errorMessage(err) };
      }
    },
  };
}
