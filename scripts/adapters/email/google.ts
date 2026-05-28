/**
 * google.ts — Gmail email-source adapter.
 *
 * Read-only Gmail scan via the official `googleapis` SDK. Shares the OAuth
 * refresh-token lifecycle with the Calendar and Tasks adapters via
 * `scripts/google-auth.ts`.
 *
 * Scope: https://www.googleapis.com/auth/gmail.readonly
 *
 * Flow:
 *   1. Resolve an access token via google-auth.ts.
 *   2. Resolve the inbox label name → label ID via users.labels.list.
 *   3. Build a Gmail search query from the request (after:, is:unread).
 *   4. users.messages.list → IDs.
 *   5. users.messages.get per ID (format=full) → map → EmailMessage[].
 *
 * PII posture:
 *   - Never logs sender addresses, subjects, snippets, or message bodies.
 *   - Errors return generic provider messages — no payload content.
 *   - All filtering happens in-process; raw responses are not persisted.
 *
 * SOLID:
 *   - SRP: only Gmail API I/O + response mapping.
 *   - DI:  google-auth config + gmail-client factory injected via
 *          GoogleGmailAdapterConfig for testability.
 *
 * Issue: #65
 */

import * as fs from "fs";
import * as path from "path";

import { google, type gmail_v1 } from "googleapis";

import {
  buildAuthedClient,
  getAccessToken,
  type GoogleAuthConfig,
} from "../../google-auth";
import type {
  EmailMessage,
  EmailScanRequest,
  EmailScanResult,
} from "../../adapter-types";
import type { GoogleAdapterOptions } from "../google-options";

// ── Types ─────────────────────────────────────────────────────────────────────

/** DI / testing options. Production callers pass {} or omit. See `google-options.ts`. */
export type GoogleGmailOptions = GoogleAdapterOptions<gmail_v1.Gmail>;

export interface GoogleGmailAdapter {
  name: "google";
  scan(req: EmailScanRequest): Promise<EmailScanResult>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const MAX_PARALLEL_FETCHES = 5;
const SNIPPET_MAX_LEN = 200;

// ── Private helpers ───────────────────────────────────────────────────────────

function defaultConfigPath(): string {
  const root = process.env["CLAUDE_PLUGIN_ROOT"];
  if (root) return path.join(root, "config", "email-config.md");
  return path.join(__dirname, "..", "..", "..", "config", "email-config.md");
}

/**
 * Parse a `key: value` style line out of email-config.md. Returns undefined
 * when the key is absent. Lines beginning with `#` (commented examples) are
 * ignored.
 */
function readConfigField(configPath: string, key: string): string | undefined {
  if (!fs.existsSync(configPath)) return undefined;
  const raw = fs.readFileSync(configPath, "utf-8");
  const pattern = new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`);
  for (const line of raw.split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(pattern);
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}

function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    const home = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";
    return path.join(home, p.slice(1));
  }
  return p;
}

/**
 * Resolve OAuth paths from email-config.md when caller did not pass `auth`.
 * Returns null when the config file or required fields are missing.
 */
function readAuthFromConfig(
  configPath: string,
): { credentials_path: string; token_path: string } | null {
  const creds = readConfigField(configPath, "google_credentials_path");
  const token = readConfigField(configPath, "google_token_path");
  if (!creds || !token) return null;
  return {
    credentials_path: expandHome(creds),
    token_path: expandHome(token),
  };
}

/** YYYY-MM-DD → YYYY/MM/DD (Gmail search query date format). */
function isoDateToGmailQueryDate(iso: string): string {
  // Gmail's `after:` accepts YYYY/MM/DD (slash-delimited). Pass-through if the
  // caller already gave us that form; otherwise convert.
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(iso)) return iso;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[1]}/${m[2]}/${m[3]}`;
}

/** Build the Gmail `q:` search string from request filters. */
function buildQueryString(req: EmailScanRequest): string {
  const parts: string[] = [];
  parts.push(`after:${isoDateToGmailQueryDate(req.since)}`);
  if (req.unread_only) parts.push("is:unread");
  return parts.join(" ");
}

/**
 * Look up a label ID by case-insensitive name match. Returns null when the
 * label is not present on the account.
 */
async function resolveLabelId(
  gmail: gmail_v1.Gmail,
  labelName: string,
): Promise<string | null> {
  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels ?? [];
  const wanted = labelName.toUpperCase();
  for (const lbl of labels) {
    if ((lbl.name ?? "").toUpperCase() === wanted) {
      return lbl.id ?? null;
    }
  }
  return null;
}

/** Header lookup with case-insensitive match. */
function headerValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  if (!headers) return "";
  const target = name.toLowerCase();
  for (const h of headers) {
    if ((h.name ?? "").toLowerCase() === target) return h.value ?? "";
  }
  return "";
}

/** Decode a base64url-encoded string (Gmail payload encoding) to UTF-8 text. */
function decodeBase64Url(data: string): string {
  // base64url → base64
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  // Buffer tolerates missing padding.
  return Buffer.from(b64, "base64").toString("utf-8");
}

/**
 * Walk a Gmail message payload tree and return the first text/plain body
 * found. Returns "" when no text/plain part exists.
 */
function extractTextBody(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string {
  if (!payload) return "";

  // Single-part message at the root.
  if (
    (payload.mimeType ?? "").toLowerCase() === "text/plain" &&
    payload.body?.data
  ) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart: depth-first search for the first text/plain leaf.
  const parts = payload.parts ?? [];
  for (const part of parts) {
    const found = extractTextBody(part);
    if (found) return found;
  }
  return "";
}

/** Convert internalDate (ms epoch string) → ISO 8601. */
function internalDateToIso(internalDate: string | null | undefined): string {
  if (!internalDate) return "";
  const ms = Number(internalDate);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString();
}

/** Map a Gmail Message → EmailMessage. */
function mapMessage(msg: gmail_v1.Schema$Message): EmailMessage {
  const headers = msg.payload?.headers ?? [];
  const from = headerValue(headers, "From");
  const subject = headerValue(headers, "Subject");
  const received_at = internalDateToIso(msg.internalDate);
  // Contract: EmailMessage.snippet ≤ 200 chars. Gmail returns variable length.
  const snippet = (msg.snippet ?? "").slice(0, SNIPPET_MAX_LEN);
  const body_text = extractTextBody(msg.payload ?? undefined);
  const thread_id = msg.threadId ?? "";
  return {
    id: msg.id ?? "",
    from,
    subject,
    received_at,
    snippet,
    body_text,
    thread_id,
  };
}

/** Bounded parallel map. Runs at most `limit` promises in flight at once. */
async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      // Non-null: i is bounded by items.length above.
      out[i] = await fn(items[i] as T, i);
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return out;
}

// ── Public factory ────────────────────────────────────────────────────────────

export function createGoogleGmailAdapter(
  cfg?: GoogleGmailOptions,
): GoogleGmailAdapter {
  return {
    name: "google",
    async scan(req: EmailScanRequest): Promise<EmailScanResult> {
      try {
        // Resolve auth. Caller-provided `auth` wins; otherwise read from
        // config/email-config.md so the dispatcher's no-arg registration
        // path works for end users with a populated config.
        let auth = cfg?.auth;
        if (!auth) {
          const configPath = cfg?.config_path ?? defaultConfigPath();
          const fromFile = readAuthFromConfig(configPath);
          if (!fromFile) {
            return {
              status: "error",
              reason: `Gmail adapter missing config: set google_credentials_path and google_token_path in ${configPath}, or pass auth to createGoogleGmailAdapter().`,
              messages: [],
            };
          }
          auth = fromFile;
        }

        // max_messages = 0 → caller wants nothing back; short-circuit before
        // the API call. (Gmail's maxResults: 0 returns the default page size.)
        if (Math.floor(req.max_messages) <= 0) {
          return { status: "success", reason: "OK", messages: [] };
        }

        const authCfg: GoogleAuthConfig = {
          ...auth,
          scopes: [GMAIL_READONLY_SCOPE],
        };

        // Always resolve the access token first so the same auth path runs
        // in tests (with client_factory) and production (without). Tests can
        // bypass disk by injecting access_token_loader.
        const token = cfg?.access_token_loader
          ? await cfg.access_token_loader(authCfg)
          : (await getAccessToken(authCfg)).token;

        let gmail: gmail_v1.Gmail;
        if (cfg?.client_factory) {
          gmail = cfg.client_factory(token);
        } else {
          // Production: build a real Gmail client via the shared OAuth
          // helper (#75). Pass a loader that returns the already-resolved
          // token so we don't acquire it twice.
          const oauth = await buildAuthedClient(authCfg, async () => token);
          gmail = google.gmail({ version: "v1", auth: oauth });
        }

        // 1. Resolve label name → label ID.
        const labelId = await resolveLabelId(gmail, req.inbox);
        if (labelId === null) {
          return {
            status: "error",
            reason: `Gmail label not found: ${req.inbox}`,
            messages: [],
          };
        }

        // 2. List message IDs matching the query.
        const q = buildQueryString(req);
        const listRes = await gmail.users.messages.list({
          userId: "me",
          labelIds: [labelId],
          q,
          maxResults: Math.floor(req.max_messages),
        });
        const ids = (listRes.data.messages ?? [])
          .map((m) => m.id ?? "")
          .filter((id) => id.length > 0);

        if (ids.length === 0) {
          return { status: "success", reason: "OK", messages: [] };
        }

        // 3. Fetch each message in full and map (bounded parallel).
        const messages = await mapWithConcurrency(
          ids,
          MAX_PARALLEL_FETCHES,
          async (id) => {
            const getRes = await gmail.users.messages.get({
              userId: "me",
              id,
              format: "full",
            });
            return mapMessage(getRes.data);
          },
        );

        // 4. Sort newest-first per contract.
        messages.sort((a, b) =>
          a.received_at < b.received_at ? 1 : a.received_at > b.received_at ? -1 : 0,
        );

        return { status: "success", reason: "OK", messages };
      } catch (err: unknown) {
        // Generic message only — no payload echo, no sender / subject content.
        const message = err instanceof Error ? err.message : String(err);
        return {
          status: "error",
          reason: `Gmail API error: ${message}`,
          messages: [],
        };
      }
    },
  };
}
