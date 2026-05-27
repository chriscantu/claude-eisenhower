/**
 * briefing-events.ts
 *
 * Tracks SessionStart briefing events and follow-up hits for hit-rate
 * measurement. Each briefing logs a {shown_at, suggested_action} record;
 * later events ("intake_run", "schedule_run", etc.) within the 10-minute
 * window count as hits when they match the suggested_action.
 *
 * Storage: memory/briefing-events.jsonl (gitignored, append-only).
 *
 * Pure helpers (computeHitRate, isHit) are exported for tests. File I/O
 * is small and clearly fenced.
 *
 * Issue: #22
 */

import * as fs from "fs";
import * as path from "path";

export type BriefingEventKind = "briefing_shown" | "command_run";

export type SuggestedActionKind =
  | "check-in"
  | "schedule"
  | "intake"
  | "review"
  | "none";

export interface BriefingEvent {
  kind: "briefing_shown";
  shown_at: string; // ISO timestamp
  suggested_action: SuggestedActionKind;
  /** Date in YYYY-MM-DD for dedup-per-day. */
  date: string;
}

export interface CommandEvent {
  kind: "command_run";
  ran_at: string; // ISO
  command: string; // "/intake", "/schedule", "/review-week", etc.
}

export type Event = BriefingEvent | CommandEvent;

const HIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/** Maps a suggested action to the command(s) that count as a hit. */
const ACTION_TO_COMMANDS: Record<SuggestedActionKind, readonly string[]> = {
  "check-in": ["/delegate", "/review-week", "/today"],
  schedule: ["/schedule", "/plan-week"],
  intake: ["/intake", "/prioritize"],
  review: ["/review-week", "/today"],
  none: [],
};

export function isHit(b: BriefingEvent, c: CommandEvent): boolean {
  const shown = new Date(b.shown_at).getTime();
  const ran = new Date(c.ran_at).getTime();
  if (isNaN(shown) || isNaN(ran)) return false;
  if (ran < shown || ran - shown > HIT_WINDOW_MS) return false;
  const expected = ACTION_TO_COMMANDS[b.suggested_action];
  return expected.includes(c.command);
}

export interface HitRateStats {
  totalBriefings: number;
  /** Briefings with a non-"none" suggestion (the denominator for hit rate). */
  briefingsWithSuggestion: number;
  hits: number;
  /** Hits / briefingsWithSuggestion (0–1), 0 if denominator is 0. */
  hitRate: number;
  byAction: Record<SuggestedActionKind, { shown: number; hits: number }>;
}

export function computeHitRate(events: Event[]): HitRateStats {
  const briefings: BriefingEvent[] = [];
  const commands: CommandEvent[] = [];
  for (const e of events) {
    if (e.kind === "briefing_shown") briefings.push(e);
    else if (e.kind === "command_run") commands.push(e);
  }

  const byAction: HitRateStats["byAction"] = {
    "check-in": { shown: 0, hits: 0 },
    schedule: { shown: 0, hits: 0 },
    intake: { shown: 0, hits: 0 },
    review: { shown: 0, hits: 0 },
    none: { shown: 0, hits: 0 },
  };

  let hits = 0;
  for (const b of briefings) {
    byAction[b.suggested_action].shown++;
    if (b.suggested_action === "none") continue;
    const hit = commands.some((c) => isHit(b, c));
    if (hit) {
      hits++;
      byAction[b.suggested_action].hits++;
    }
  }

  const withSuggestion = briefings.filter((b) => b.suggested_action !== "none").length;
  return {
    totalBriefings: briefings.length,
    briefingsWithSuggestion: withSuggestion,
    hits,
    hitRate: withSuggestion === 0 ? 0 : hits / withSuggestion,
    byAction,
  };
}

/**
 * Parses a JSONL events log, ignoring blank lines and malformed entries.
 */
export function parseEventsLog(contents: string): Event[] {
  const out: Event[] = [];
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && (parsed.kind === "briefing_shown" || parsed.kind === "command_run")) {
        out.push(parsed as Event);
      }
    } catch {
      // ignore malformed line
    }
  }
  return out;
}

/** Returns the last briefing_shown event's date, or null. */
export function lastBriefingDate(events: Event[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "briefing_shown") return e.date;
  }
  return null;
}

// ── I/O wrappers ────────────────────────────────────────────────────────────

export function appendEvent(eventsPath: string, event: Event): void {
  const dir = path.dirname(eventsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(eventsPath, JSON.stringify(event) + "\n", "utf8");
}

export function readEvents(eventsPath: string): Event[] {
  if (!fs.existsSync(eventsPath)) return [];
  return parseEventsLog(fs.readFileSync(eventsPath, "utf8"));
}
