/**
 * google.ts — Google Calendar adapter.
 *
 * Cross-platform calendar adapter implemented against Google Calendar API v3.
 * Shares OAuth refresh-token lifecycle via scripts/google-auth.ts (#67).
 *
 * Responsibilities:
 *   - Resolve credentials/token paths from config/calendar-config.md (or
 *     injected GoogleCalendarAdapterConfig for tests).
 *   - Obtain an access token via getAccessToken(); never re-implement OAuth.
 *   - Resolve calendar_name → calendar ID via calendarList.list (match by
 *     `summary` field).
 *   - Query events via events.list with timeMin/timeMax derived from
 *     days_ahead, single-event expansion (singleEvents=true, orderBy=startTime).
 *   - Map each google calendar Event → CalendarEvent. all_day = true when
 *     start.date is present (date-only) and start.dateTime is absent.
 *   - Mirror eventkit's `summary` format — collapse events into DAY_SUMMARY
 *     lines with busy/free hours, PTO_DAYS, AVAILABLE_DAYS counters.
 *   - Never throw to the caller — every failure path returns
 *     {status: "error", reason, events: []}.
 *
 * SOLID:
 *   - SRP: dispatch Google Calendar API calls + map to CalendarEvent
 *   - DI:  GoogleCalendarAdapterConfig overrides config-file read; oauth and
 *          calendar client builders are injectable for tests
 *
 * Issue: #64
 */

import * as fs from "fs";
import * as path from "path";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { getAccessToken } from "../../google-auth";
import type {
  CalendarEvent,
  CalendarQueryRequest,
  CalendarQueryResult,
} from "../../adapter-types";

// ── Public types ──────────────────────────────────────────────────────────────

export interface GoogleCalendarAdapter {
  name: "google";
  query(req: CalendarQueryRequest): Promise<CalendarQueryResult>;
}

/** Hooks for DI / testing. Production callers pass {} or omit. */
export interface GoogleCalendarAdapterConfig {
  /**
   * Absolute path to calendar-config.md (the file that holds provider +
   * google_credentials_path + google_token_path). Defaults to
   * CLAUDE_PLUGIN_ROOT/config/calendar-config.md when omitted.
   */
  config_path?: string;
  /**
   * Pre-resolved credentials path. When set, skips reading config_path's
   * google_credentials_path field. Used by tests.
   */
  credentials_path?: string;
  /**
   * Pre-resolved token path. When set, skips reading config_path's
   * google_token_path field. Used by tests.
   */
  token_path?: string;
  /**
   * Override the access-token loader. Defaults to google-auth#getAccessToken.
   * Tests inject a stub that returns a fixed string without disk I/O.
   */
  access_token_loader?: (cfg: {
    scopes: string[];
    credentials_path: string;
    token_path: string;
  }) => Promise<string>;
  /**
   * Override the calendar client builder. Defaults to google.calendar({v:'v3', auth}).
   * Tests inject a stub that returns a mocked client.
   */
  calendar_client_builder?: (auth: OAuth2Client) => CalendarV3Like;
}

/**
 * Narrow shape of the googleapis calendar.v3 client used by this adapter.
 * Keeps the test surface small (no need to mock the whole calendar_v3.Calendar).
 */
export interface CalendarV3Like {
  calendarList: {
    list: (params: object) => Promise<{
      data: { items?: Array<{ id?: string | null; summary?: string | null }> };
    }>;
  };
  events: {
    list: (params: object) => Promise<{
      data: { items?: Array<GoogleEventLike> };
    }>;
  };
}

/** Subset of the google calendar_v3.Schema$Event fields this adapter consumes. */
export interface GoogleEventLike {
  summary?: string | null;
  start?: { dateTime?: string | null; date?: string | null; timeZone?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null; timeZone?: string | null } | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

const PTO_KEYWORDS = [
  "pto",
  "ooo",
  "out of office",
  "vacation",
  "time off",
  "holiday",
];

// ── Private helpers ──────────────────────────────────────────────────────────

function defaultConfigPath(): string {
  const root = process.env["CLAUDE_PLUGIN_ROOT"];
  if (root) return path.join(root, "config", "calendar-config.md");
  return path.join(__dirname, "..", "..", "..", "config", "calendar-config.md");
}

/**
 * Parse a `key: value` style line out of calendar-config.md. Returns undefined
 * when the key is absent. Lines beginning with `#` (commented-out examples)
 * are ignored.
 */
function readConfigField(configPath: string, key: string): string | undefined {
  if (!fs.existsSync(configPath)) return undefined;
  const raw = fs.readFileSync(configPath, "utf-8");
  const pattern = new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`);
  for (const line of raw.split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(pattern);
    if (m && m[1]) {
      return m[1].trim();
    }
  }
  return undefined;
}

/**
 * Expand a leading `~/` to the user's home directory. No-op for absolute or
 * relative paths without the tilde prefix.
 */
function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    const home = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";
    return path.join(home, p.slice(1));
  }
  return p;
}

/**
 * Map a Google calendar Event → CalendarEvent.
 * all_day = true iff the event uses `start.date` (date-only, no dateTime).
 * Returns null when the event lacks usable start/end data.
 */
function mapEvent(ev: GoogleEventLike): CalendarEvent | null {
  const title = (ev.summary ?? "").trim() || "(no title)";
  const startRaw = ev.start?.dateTime ?? ev.start?.date ?? null;
  const endRaw = ev.end?.dateTime ?? ev.end?.date ?? null;
  if (!startRaw || !endRaw) return null;
  const all_day = !!ev.start?.date && !ev.start?.dateTime;
  return { title, start: startRaw, end: endRaw, all_day };
}

/** YYYY-MM-DD slice from any ISO-ish string. */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function isWeekend(yyyyMmDd: string): boolean {
  // Parse as UTC midnight to avoid TZ-dependent weekday rolls.
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  if (isNaN(d.getTime())) return false;
  const dow = d.getUTCDay(); // 0 = Sun, 6 = Sat
  return dow === 0 || dow === 6;
}

function hoursBetween(startIso: string, endIso: string): number {
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return (e - s) / 3600_000;
}

/**
 * Build the multi-line summary string mirroring cal_query.swift's `summary`
 * output. The dispatcher and consumers parse this directly — keep the shape
 * (DAY_SUMMARY: header, day|busy|free|state lines, trailing BUSINESS_DAYS /
 * PTO_DAYS / AVAILABLE_DAYS counters) identical.
 */
function buildSummary(
  events: CalendarEvent[],
  daysAhead: number,
  nowMs: number,
): string {
  const workdayHours = 8.0;
  const dayBusy = new Map<string, number>();
  const ptoDays = new Set<string>();

  // Seed business days for the window [today, today+daysAhead).
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(start.getTime());
    d.setDate(d.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const key = `${yyyy}-${mm}-${dd}`;
    if (!isWeekend(key)) {
      dayBusy.set(key, 0);
    }
  }
  const totalBusinessDays = dayBusy.size;

  for (const ev of events) {
    const key = dayKey(ev.start);
    if (!dayBusy.has(key)) continue;
    if (ev.all_day) {
      const t = (ev.title ?? "").toLowerCase();
      if (PTO_KEYWORDS.some((kw) => t.includes(kw))) {
        ptoDays.add(key);
      }
      // Non-PTO all-day events do not contribute hours (mirrors swift).
      continue;
    }
    const dur = hoursBetween(ev.start, ev.end);
    dayBusy.set(key, (dayBusy.get(key) ?? 0) + dur);
  }

  const lines: string[] = ["DAY_SUMMARY:"];
  let availableDays = 0;
  const sortedDays = [...dayBusy.keys()].sort();
  for (const day of sortedDays) {
    const busy = dayBusy.get(day) ?? 0;
    const free = workdayHours - busy;
    const isPto = ptoDays.has(day);
    const isAvailable = !isPto && free >= 2.0 && busy < 7.0;
    if (isAvailable) availableDays += 1;
    lines.push(
      `${day}|${busy.toFixed(1)}h_busy|${free.toFixed(1)}h_free|${isPto ? "PTO" : "available"}`,
    );
  }
  lines.push(`BUSINESS_DAYS: ${totalBusinessDays}`);
  lines.push(`PTO_DAYS: ${ptoDays.size}`);
  lines.push(`AVAILABLE_DAYS: ${availableDays}`);
  return lines.join("\n");
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createGoogleCalendarAdapter(
  cfg: GoogleCalendarAdapterConfig = {},
): GoogleCalendarAdapter {
  const accessTokenLoader =
    cfg.access_token_loader ??
    (async (c): Promise<string> => {
      const t = await getAccessToken(c);
      return t.token;
    });

  const clientBuilder =
    cfg.calendar_client_builder ??
    ((auth: OAuth2Client): CalendarV3Like => {
      return google.calendar({ version: "v3", auth }) as unknown as CalendarV3Like;
    });

  return {
    name: "google",
    async query(req: CalendarQueryRequest): Promise<CalendarQueryResult> {
      try {
        const configPath = cfg.config_path ?? defaultConfigPath();
        const credsPath =
          cfg.credentials_path ??
          (() => {
            const v = readConfigField(configPath, "google_credentials_path");
            return v ? expandHome(v) : undefined;
          })();
        const tokenPath =
          cfg.token_path ??
          (() => {
            const v = readConfigField(configPath, "google_token_path");
            return v ? expandHome(v) : undefined;
          })();

        if (!credsPath || !tokenPath) {
          return {
            status: "error",
            reason:
              "google_credentials_path or google_token_path missing from " +
              `${configPath}. See config/calendar-config.md.example.`,
            events: [],
          };
        }

        // Acquire access token (refreshes if expired, throws on missing token).
        const accessToken = await accessTokenLoader({
          scopes: [SCOPE],
          credentials_path: credsPath,
          token_path: tokenPath,
        });

        // Build a per-call OAuth2 client carrying just the access token.
        // We do not need client_id/client_secret here — googleapis will use
        // the bearer access_token directly. Refresh is owned by google-auth.ts.
        const oauthClient = new google.auth.OAuth2();
        oauthClient.setCredentials({ access_token: accessToken });

        const calendar = clientBuilder(oauthClient as unknown as OAuth2Client);

        // Resolve calendar_name → calendar ID via calendarList.list (match by
        // `summary`). The user-facing name in Google Calendar UI is `summary`.
        const listResp = await calendar.calendarList.list({});
        const items = listResp.data.items ?? [];
        const match = items.find((c) => (c.summary ?? "") === req.calendar_name);
        if (!match || !match.id) {
          const available = items
            .map((c) => c.summary ?? "")
            .filter((s) => s.length > 0)
            .join(", ");
          return {
            status: "error",
            reason:
              `ERROR: Calendar '${req.calendar_name}' not found` +
              (available ? `\nAvailable calendars: ${available}` : ""),
            events: [],
          };
        }

        // Window: [now, now + days_ahead).
        const now = new Date();
        const timeMin = now.toISOString();
        const end = new Date(now.getTime() + req.days_ahead * 86_400_000);
        const timeMax = end.toISOString();

        const eventsResp = await calendar.events.list({
          calendarId: match.id,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 2500,
        });
        const googleEvents = eventsResp.data.items ?? [];

        const mapped: CalendarEvent[] = [];
        for (const ev of googleEvents) {
          const m = mapEvent(ev);
          if (m !== null) mapped.push(m);
        }

        if (req.format === "summary") {
          const reason = buildSummary(mapped, req.days_ahead, now.getTime());
          return { status: "success", reason, events: [] };
        }

        return { status: "success", reason: "OK", events: mapped };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { status: "error", reason: message, events: [] };
      }
    },
  };
}
