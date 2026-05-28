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

import { google, type gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";

import { getAccessToken, type GoogleAuthConfig } from "../../google-auth";
import type {
  EmailMessage,
  EmailScanRequest,
  EmailScanResult,
} from "../../adapter-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GoogleGmailAdapterConfig {
  /**
   * OAuth config passed through to google-auth.ts. Scope is forced to
   * gmail.readonly regardless of what callers pass in `scopes` — the adapter
   * is read-only by design.
   */
  auth: Omit<GoogleAuthConfig, "scopes"> & { scopes?: string[] };
  /**
   * Test injection: override the gmail client factory. When omitted, the
   * adapter builds a real OAuth2 client + gmail_v1.Gmail.
   */
  gmailClientFactory?: (accessToken: string) => gmail_v1.Gmail;
}

export interface GoogleGmailAdapter {
  name: "google";
  scan(req: EmailScanRequest): Promise<EmailScanResult>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

// ── Private helpers ───────────────────────────────────────────────────────────

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
  const snippet = msg.snippet ?? "";
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

/** Default factory: build a real Gmail client from an access token. */
function defaultGmailClientFactory(accessToken: string): gmail_v1.Gmail {
  const oauth2 = new OAuth2Client();
  oauth2.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

// ── Public factory ────────────────────────────────────────────────────────────

export function createGoogleGmailAdapter(
  cfg?: GoogleGmailAdapterConfig,
): GoogleGmailAdapter {
  return {
    name: "google",
    async scan(req: EmailScanRequest): Promise<EmailScanResult> {
      // Config-required path. When called from the dispatcher without explicit
      // config (the historical stub signature), we cannot proceed because
      // there is no credentials_path to read from. Surface that gracefully.
      if (!cfg) {
        return {
          status: "error",
          reason:
            "Gmail adapter missing config: pass credentials_path and token_path via createGoogleGmailAdapter({ auth: {...} }).",
          messages: [],
        };
      }

      try {
        const authCfg: GoogleAuthConfig = {
          ...cfg.auth,
          scopes: [GMAIL_READONLY_SCOPE],
        };

        const { token } = await getAccessToken(authCfg);
        const factory = cfg.gmailClientFactory ?? defaultGmailClientFactory;
        const gmail = factory(token);

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
          maxResults: Math.max(0, Math.floor(req.max_messages)),
        });
        const ids = (listRes.data.messages ?? [])
          .map((m) => m.id ?? "")
          .filter((id) => id.length > 0);

        if (ids.length === 0) {
          return { status: "success", reason: "OK", messages: [] };
        }

        // 3. Fetch each message in full and map.
        const messages: EmailMessage[] = [];
        for (const id of ids) {
          const getRes = await gmail.users.messages.get({
            userId: "me",
            id,
            format: "full",
          });
          messages.push(mapMessage(getRes.data));
        }

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
