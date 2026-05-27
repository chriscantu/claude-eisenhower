/**
 * briefing-render.ts
 *
 * Pure briefing renderer. Takes parsed TASKS.md + today's date + mode,
 * returns a BriefingResult { text, suggestedAction, trigger }. No I/O.
 *
 * All business-day math delegates to scripts/date-helpers.ts — this
 * module owns formatting and trigger logic only.
 *
 * SOLID: rendering is decoupled from I/O so it can be tested with
 * fixture data. session-briefing.ts is the I/O wrapper.
 *
 * Issue: #22
 */

import { ParsedTasks, TaskRecord } from "./tasks-parser";
import { businessDaysOverdue, weekOfFriday, businessDaysElapsed } from "./date-helpers";

export type BriefingMode = "full" | "quiet" | "off";

export type SuggestedActionKind =
  | "check-in"
  | "schedule"
  | "intake"
  | "review"
  | "none";

export interface BriefingResult {
  /** The rendered text — empty string when mode === "off". */
  text: string;
  /** Which suggested action (if any) was emitted. */
  suggestedAction: SuggestedActionKind;
  /** True when any of the conditional sections fired. */
  triggered: boolean;
  /** Counts for the one-liner / hit-rate analytics. */
  counts: {
    inbox: number;
    active: number;
    delegated: number;
    done: number;
  };
}

interface OverdueActive {
  title: string;
  scheduledDisplay: string;
  daysOverdue: number;
}

interface CheckIn {
  owner: string;
  title: string;
  checkBy: string;
  daysOverdue: number; // 0 means due today
}

function parseDateUTC(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  return isNaN(d.getTime()) ? null : d;
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? singular + "s");
}

/**
 * For an Active task's Scheduled value, return the "effective overdue
 * start" date (the Date used as input to businessDaysOverdue), the
 * display string for the briefing, or null if not parseable / not
 * overdue-eligible.
 */
function resolveScheduled(value: string, today: Date): {
  startDate: Date;
  display: string;
  unparseable: false;
} | { unparseable: true } | null {
  if (!value) return null;

  // Plain date
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = parseDateUTC(value);
    if (!d) return { unparseable: true };
    return { startDate: d, display: value, unparseable: false };
  }

  // "week of YYYY-MM-DD"
  const weekMatch = value.match(/^week of (\d{4}-\d{2}-\d{2})$/);
  if (weekMatch) {
    const monday = parseDateUTC(weekMatch[1]);
    if (!monday) return { unparseable: true };
    const friday = weekOfFriday(weekMatch[1]);
    const saturday = new Date(friday);
    saturday.setUTCDate(friday.getUTCDate() + 1);
    return { startDate: saturday, display: `week of ${weekMatch[1]}`, unparseable: false };
  }

  return { unparseable: true };
}

/**
 * Renders the SessionStart briefing.
 *
 * @param tasks    parsed TASKS.md
 * @param today    today's date (UTC midnight, e.g. new Date("2026-05-27T00:00:00Z"))
 * @param mode     briefing mode: full (default), quiet (collapsed one-liner), off (no output)
 */
export function renderBriefing(
  tasks: ParsedTasks,
  today: Date,
  mode: BriefingMode = "full"
): BriefingResult {
  const counts = {
    inbox: tasks.Inbox.length,
    active: tasks.Active.length,
    delegated: tasks.Delegated.length,
    done: tasks.Done.length,
  };

  if (mode === "off") {
    return { text: "", suggestedAction: "none", triggered: false, counts };
  }

  // ── Collect overdue Active and check-ins ────────────────────────────
  const overdueActive: OverdueActive[] = [];
  const checkIns: CheckIn[] = []; // due today OR overdue
  const unparseable: string[] = [];

  // Set of "Delegated" task titles that should be deduped out of the
  // overdue-Active section (per spec, delegations with both an overdue
  // Check-by and overdue Scheduled appear only in check-ins).
  const delegatedTitlesWithOverdueCheckBy = new Set<string>();

  // Pass 1: check-ins (Delegated)
  for (const t of tasks.Delegated) {
    const checkBy = t.fields["Check-by"];
    const title = t.fields["Title"] ?? "(untitled)";
    if (!checkBy) continue;

    const checkByDate = parseDateUTC(checkBy);
    if (!checkByDate) {
      unparseable.push(title);
      continue;
    }

    // Today or earlier → render
    if (checkByDate.getTime() <= today.getTime()) {
      const overdue = businessDaysOverdue(checkByDate, today);
      checkIns.push({
        owner: t.fields["Owner"] ?? "(unowned)",
        title,
        checkBy,
        daysOverdue: overdue,
      });
      delegatedTitlesWithOverdueCheckBy.add(title);
    }
  }

  // Pass 2: overdue Active
  for (const t of tasks.Active) {
    const scheduled = t.fields["Scheduled"];
    const title = t.fields["Title"] ?? "(untitled)";
    if (!scheduled) continue;

    const resolved = resolveScheduled(scheduled, today);
    if (!resolved) continue;
    if ("unparseable" in resolved && resolved.unparseable) {
      unparseable.push(title);
      continue;
    }

    const overdue = businessDaysOverdue(resolved.startDate, today);
    if (overdue > 0) {
      // Dedup against delegations surfaced via Check-by.
      if (delegatedTitlesWithOverdueCheckBy.has(title)) continue;
      overdueActive.push({
        title,
        scheduledDisplay: resolved.display,
        daysOverdue: overdue,
      });
    }
  }

  overdueActive.sort((a, b) => b.daysOverdue - a.daysOverdue);
  checkIns.sort((a, b) => b.daysOverdue - a.daysOverdue);

  // ── Inbox gate ──────────────────────────────────────────────────────
  const inboxAlert = counts.inbox >= 5;

  // ── Staleness ───────────────────────────────────────────────────────
  let staleness = false;
  if (tasks.Done.length > 0) {
    let mostRecentDone: Date | null = null;
    for (const t of tasks.Done) {
      const d = t.fields["Done"];
      if (!d) continue;
      const parsed = parseDateUTC(d);
      if (!parsed) continue;
      if (!mostRecentDone || parsed.getTime() > mostRecentDone.getTime()) {
        mostRecentDone = parsed;
      }
    }
    if (mostRecentDone) {
      // businessDaysElapsed: 0 if mostRecentDone is today or future
      const elapsed = businessDaysElapsed(mostRecentDone, today);
      if (elapsed > 5) staleness = true;
    } else {
      // Done tasks exist but none have a Done date — treat as stale
      staleness = true;
    }
  }

  // ── Suggested action priority ladder ────────────────────────────────
  let suggestedAction: SuggestedActionKind = "none";
  let suggestionLine = "";
  if (checkIns.length > 0) {
    suggestedAction = "check-in";
    const top = checkIns[0];
    suggestionLine = `💡 Suggested: Reach out to ${top.owner} about ${top.title}`;
  } else if (overdueActive.length > 0) {
    suggestedAction = "schedule";
    suggestionLine = `💡 Suggested: Consider rescheduling overdue tasks with /schedule`;
  } else if (inboxAlert) {
    suggestedAction = "intake";
    suggestionLine = `💡 Suggested: Run /intake to process inbox`;
  } else if (staleness) {
    suggestedAction = "review";
    suggestionLine = `💡 Suggested: Review board — nothing completed recently`;
  }

  const triggered =
    overdueActive.length > 0 || checkIns.length > 0 || inboxAlert || staleness;

  // ── Build text ──────────────────────────────────────────────────────
  const lines: string[] = [];

  const countsLine = `Task Board: ${counts.inbox} Inbox, ${counts.active} Active, ${counts.delegated} Delegated, ${counts.done} Done`;

  // Mode: quiet collapses to a one-liner when nothing fires
  if (mode === "quiet" && !triggered) {
    lines.push(
      `Task Board: ${counts.inbox} Inbox, ${counts.active} Active, ${counts.delegated} Delegated — run /today for briefing`
    );
    return { text: lines.join("\n"), suggestedAction: "none", triggered: false, counts };
  }

  // Mode: full or quiet+triggered — full briefing
  lines.push(countsLine);

  if (overdueActive.length > 0) {
    lines.push("");
    lines.push("🔴 Overdue Active Tasks");
    for (const t of overdueActive) {
      lines.push(
        `  - ${t.title} (scheduled ${t.scheduledDisplay}, ${t.daysOverdue} business ${pluralize(t.daysOverdue, "day")} overdue)`
      );
    }
  }

  if (checkIns.length > 0) {
    lines.push("");
    lines.push("🟡 Delegation Check-ins Due");
    // Sort: overdue first (already done above by daysOverdue desc), but
    // ensure due-today (0) comes after any overdue ones — already true.
    for (const c of checkIns) {
      if (c.daysOverdue === 0) {
        lines.push(`  - ${c.owner} — ${c.title} (check-by ${c.checkBy})`);
      } else {
        lines.push(
          `  - ${c.owner} — ${c.title} (check-by ${c.checkBy}, ${c.daysOverdue} business ${pluralize(c.daysOverdue, "day")} overdue)`
        );
      }
    }
  }

  if (inboxAlert) {
    lines.push("");
    lines.push(`📥 Inbox has ${counts.inbox} items — consider running /intake before diving in.`);
  }

  if (staleness) {
    lines.push("");
    lines.push("💤 No tasks completed in the last 5 business days — board may need attention.");
  }

  if (suggestionLine) {
    lines.push("");
    lines.push(suggestionLine);
  }

  if (unparseable.length > 0) {
    lines.push("");
    lines.push(
      `Note: ${unparseable.length} ${pluralize(unparseable.length, "task")} have unparseable date values: ${unparseable.join(", ")}`
    );
  }

  return {
    text: lines.join("\n"),
    suggestedAction,
    triggered,
    counts,
  };
}
