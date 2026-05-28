/**
 * apple-mail.ts
 *
 * Apple Mail email-source adapter.
 * Spawns `osascript -e <script>` to fetch messages from a named mailbox
 * of a named Mail.app account, then parses the pipe-delimited output into
 * EmailMessage[].
 *
 * Output format (one line per message):
 *   id|||from|||subject|||received_at|||snippet|||body_text|||thread_id
 *
 * Pipe characters and newlines inside field values are escaped to ‡ / \n
 * by the AppleScript before output; this adapter reverses them on parse.
 *
 * AppleScript date note: uses "Month D, YYYY" long-form date string which
 * is locale-independent on macOS (AppleScript always accepts this form).
 * "MM/DD/YYYY" works on US locales but silently fails on others, so the
 * long-form is used throughout.
 *
 * min() note: AppleScript lacks a built-in min() on older runtimes.
 * Replaced with an inline conditional in safeSnippet handler.
 *
 * SOLID:
 *   - SRP: only child-process lifecycle + script build + stdout parsing
 *   - DI:  osascript_path and timeout_ms injected via AppleMailAdapterConfig
 *
 * Issue: #67
 */

import * as cp from "child_process";
import type {
  EmailScanRequest,
  EmailScanResult,
  EmailMessage,
} from "../../adapter-types";

export interface AppleMailAdapterConfig {
  /** osascript binary path. Default: "osascript" (PATH lookup). */
  osascript_path?: string;
  /** Per-call timeout in ms. Default: 30000. */
  timeout_ms?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Month names used for locale-safe AppleScript date literals. */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Convert YYYY-MM-DD to "Month D, YYYY" for AppleScript date coercion.
 * E.g. "2026-05-01" → "May 1, 2026"
 */
function toAppleScriptDate(isoDate: string): string {
  const [yearStr, monthStr, dayStr] = isoDate.split("-");
  const month = parseInt(monthStr ?? "1", 10) - 1;
  const day = parseInt(dayStr ?? "1", 10);
  const year = yearStr ?? "1970";
  return `${MONTH_NAMES[month] ?? "January"} ${day}, ${year}`;
}

/**
 * Escape a string for safe embedding in an AppleScript double-quoted string
 * literal.  ORDER MATTERS: backslashes must be escaped first, otherwise the
 * quote-escape's own backslash gets double-escaped on a second pass.
 * AppleScript string literals only need \ and " escaped — newlines cannot
 * appear as literal characters inside double-quoted strings (they would need
 * to come via &-concatenation, which we don't generate here).
 */
function escapeAppleScriptString(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Build the AppleScript text from the scan request. */
function buildScript(req: EmailScanRequest, timeoutSec: number): string {
  const safeAccount = escapeAppleScriptString(req.account);
  const safeInbox = escapeAppleScriptString(req.inbox);
  const sinceDate = toAppleScriptDate(req.since);
  const maxMessages = Math.floor(req.max_messages);
  // Guard: when unread_only, skip already-read messages.
  // Mail's `read status` is true when message HAS been read.
  const unreadGuard = req.unread_only
    ? "if (read status of m) is true then\n            -- skip read messages\n          else"
    : "if false then\n            -- no filter\n          else";

  return `
on replaceText(srcText, findStr, replStr)
  set AppleScript's text item delimiters to findStr
  set tlist to text items of srcText
  set AppleScript's text item delimiters to replStr
  set out to tlist as text
  set AppleScript's text item delimiters to ""
  return out
end replaceText

on safeField(rawText)
  set safe1 to my replaceText(rawText as text, "|", "‡")
  set safe2 to my replaceText(safe1, return, " ")
  set safe3 to my replaceText(safe2, linefeed, " ")
  return safe3
end safeField

tell application "Mail"
  with timeout of ${timeoutSec} seconds
    set acct to first account whose name contains "${safeAccount}"
    set mbox to mailbox "${safeInbox}" of acct
    set sinceDate to date "${sinceDate}"
    set msgs to messages of mbox
    set results to {}
    set msgCount to 0
    repeat with i from 1 to (count of msgs)
      if msgCount >= ${maxMessages} then exit repeat
      set m to item i of msgs
      try
        if (date received of m) < sinceDate then
          -- skip: message predates the since window
        else
          ${unreadGuard}
            set msgId to message id of m
            set fromAddr to sender of m
            set subj to subject of m
            set recAt to (date received of m as \xABclass isot\xBB as string)
            set bodyRaw to ""
            try
              set bodyRaw to (content of m)
            end try
            set bodyLen to length of bodyRaw
            set snipLen to bodyLen
            if snipLen > 200 then set snipLen to 200
            set snip to text 1 thru snipLen of (bodyRaw & "")
            set ln to (my safeField(msgId)) & "|||" & (my safeField(fromAddr)) & "|||" & (my safeField(subj)) & "|||" & recAt & "|||" & (my safeField(snip)) & "|||" & (my safeField(bodyRaw)) & "|||"
            set end of results to ln
            set msgCount to msgCount + 1
          end if
        end if
      end try
    end repeat
    set AppleScript's text item delimiters to linefeed
    return results as text
  end timeout
end tell
`.trim();
}

/** Collect a readable stream into a string. */
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

/** Reverse ‡ escape back to | in a single field value. */
function unescapeField(raw: string): string {
  return raw.replace(/‡/g, "|");
}

/** Parse one pipe-delimited output line into an EmailMessage. */
function parseLine(line: string): EmailMessage | null {
  const parts = line.split("|||");
  // Expect exactly 7 fields (last may be empty string for thread_id).
  if (parts.length < 7) return null;
  const [id, from, subject, received_at, snippet, body_text, thread_id] = parts;
  if (!id || !from || !subject || !received_at) return null;
  return {
    id: unescapeField(id),
    from: unescapeField(from),
    subject: unescapeField(subject),
    received_at: received_at.trim(),
    snippet: unescapeField(snippet ?? ""),
    body_text: unescapeField(body_text ?? ""),
    thread_id: unescapeField((thread_id ?? "").trim()),
  };
}

export function createAppleMailAdapter(cfg?: AppleMailAdapterConfig): {
  scan(req: EmailScanRequest): Promise<EmailScanResult>;
} {
  const osascriptPath = cfg?.osascript_path ?? "osascript";
  const timeoutMs = cfg?.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const timeoutSec = Math.ceil(timeoutMs / 1000);

  return {
    async scan(req: EmailScanRequest): Promise<EmailScanResult> {
      const scriptText = buildScript(req, timeoutSec);

      let child: cp.ChildProcess;
      try {
        child = cp.spawn(osascriptPath, ["-e", scriptText], { shell: false });
      } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === "ENOENT") {
          return { status: "error", reason: "osascript binary not found", messages: [] };
        }
        return { status: "error", reason: String((e as Error).message ?? err), messages: [] };
      }

      // ENOENT can surface as an error event rather than a thrown exception.
      const spawnErrorPromise = new Promise<NodeJS.ErrnoException | null>((resolve) => {
        child.on("error", (err: NodeJS.ErrnoException) => resolve(err));
        child.on("close", () => resolve(null));
      });

      const stdoutPromise = collectStream(child.stdout!);
      const stderrPromise = collectStream(child.stderr!);

      const exitPromise = new Promise<number | null>((resolve) => {
        child.on("close", (code) => resolve(code));
      });

      let timedOut = false;
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);

      const [spawnError, stdout, stderr, exitCode] = await Promise.all([
        spawnErrorPromise.then((err) => { clearTimeout(timeoutHandle); return err; }),
        stdoutPromise,
        stderrPromise,
        exitPromise.then((code) => { clearTimeout(timeoutHandle); return code; }),
      ]);

      if (spawnError !== null) {
        if (spawnError.code === "ENOENT") {
          return { status: "error", reason: "osascript binary not found", messages: [] };
        }
        return { status: "error", reason: spawnError.message, messages: [] };
      }

      if (timedOut) {
        return {
          status: "error",
          reason: `osascript timed out after ${timeoutSec} seconds`,
          messages: [],
        };
      }

      if (exitCode !== 0) {
        const reason = stderr.trim() || `osascript exited ${exitCode ?? "null"}`;
        return { status: "error", reason, messages: [] };
      }

      const messages: EmailMessage[] = [];
      for (const line of stdout.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const msg = parseLine(trimmed);
        if (msg !== null) {
          messages.push(msg);
        }
      }

      return { status: "success", reason: "OK", messages };
    },
  };
}
