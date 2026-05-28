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
import {
  buildAuthedClient,
  getAccessToken,
  type GoogleAuthConfig,
} from "../../google-auth";
import type {
  CalendarEvent,
  CalendarQueryRequest,
  CalendarQueryResult,
} from "../../adapter-types";
import type { GoogleAdapterOptions } from "../google-options";

// ── Public types ──────────────────────────────────────────────────────────────

export interface GoogleCalendarAdapter {
  name: "google";
  query(req: CalendarQueryRequest): Promise<CalendarQueryResult>;
}

/** DI / testing options. Production callers pass {} or omit. See `google-options.ts`. */
export type GoogleCalendarOptions = GoogleAdapterOptions<CalendarV3Like>;

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
  cfg: GoogleCalendarOptions = {},
): GoogleCalendarAdapter {
  return {
    name: "google",
    async query(req: CalendarQueryRequest): Promise<CalendarQueryResult> {
      try {
        // Resolve auth. Caller-provided `auth` wins; otherwise read from
        // calendar-config.md so the dispatcher's no-arg path works.
        const configPath = cfg.config_path ?? defaultConfigPath();
        const credsPath =
          cfg.auth?.credentials_path ??
          (() => {
            const v = readConfigField(configPath, "google_credentials_path");
            return v ? expandHome(v) : undefined;
          })();
        const tokenPath =
          cfg.auth?.token_path ??
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

        const authCfg: GoogleAuthConfig = {
          scopes: [SCOPE],
          credentials_path: credsPath,
          token_path: tokenPath,
        };

        // Always resolve the access token first so the same auth path runs
        // in tests (with client_factory) and production (without). Tests
        // bypass disk by injecting access_token_loader.
        const accessToken = cfg.access_token_loader
          ? await cfg.access_token_loader(authCfg)
          : (await getAccessToken(authCfg)).token;

        let calendar: CalendarV3Like;
        if (cfg.client_factory) {
          calendar = cfg.client_factory(accessToken);
        } else {
          // Production: build a real client via the shared OAuth helper
          // (#75). Pass a loader returning the already-resolved token so we
          // don't acquire it twice.
          const oauthClient = await buildAuthedClient(
            authCfg,
            async () => accessToken,
          );
          calendar = google.calendar({
            version: "v3",
            auth: oauthClient,
          }) as unknown as CalendarV3Like;
        }

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
