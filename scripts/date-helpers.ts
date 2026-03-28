/**
 * date-helpers.ts
 *
 * Shared business-day arithmetic used across the test suite and command layer.
 * Single source of truth — eliminates the three independent implementations
 * that previously existed in delegate-entry.test.ts, schedule-capacity.test.ts,
 * and phase2-3.test.ts.
 *
 * Exported functions:
 *   addBusinessDays(start, days)    → Date   (used by /delegate, delegate-entry.test.ts)
 *   addBusinessDaysStr(start, days) → string YYYY-MM-DD (used by /schedule, phase2-3.test.ts)
 *   businessDaysElapsed(start, end) → number (used by /schedule Step 1b, schedule-capacity.test.ts)
 */

/**
 * Returns a new Date that is `days` business days (Mon–Fri) after `startDate`.
 * Does not mutate the input.
 */
export function addBusinessDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

/**
 * Returns a YYYY-MM-DD string for `days` business days (Mon–Fri) after `startDate`.
 * Convenience wrapper over addBusinessDays for command-layer date fields.
 */
export function addBusinessDaysStr(startDate: Date, days: number): string {
  return addBusinessDays(startDate, days).toISOString().split("T")[0];
}

/**
 * Returns the number of business days (Mon–Fri) elapsed between `start` and `end`.
 * Start is inclusive if it is a business day; end is exclusive.
 * Returns 0 if end <= start.
 */
export function businessDaysElapsed(start: Date, end: Date = new Date()): number {
  // Use UTC-based normalization to avoid timezone shifts from ISO date strings.
  // new Date("YYYY-MM-DD") parses as UTC midnight; setHours() would shift to local
  // midnight and roll the date back in any UTC-offset timezone (e.g. CST = UTC-6).
  const from = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const to   = Date.UTC(end.getUTCFullYear(),   end.getUTCMonth(),   end.getUTCDate());

  if (from >= to) return 0;

  let count = 0;
  let cursor = from;
  while (cursor < to) {
    const dow = new Date(cursor).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor += 86_400_000; // advance exactly one day in ms
  }
  return count;
}

/**
 * Given a "week of YYYY-MM-DD" Monday date string, returns the Friday of that
 * week as a Date. A task scheduled with "week of" is overdue only after this
 * Friday has passed.
 *
 * Example: weekOfFriday("2026-03-23") → Date for 2026-03-27 (Friday)
 */
export function weekOfFriday(mondayStr: string): Date {
  const monday = new Date(mondayStr + "T00:00:00Z");
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  return friday;
}

/**
 * Returns the number of business days a task is overdue given its scheduled
 * date and today's date. Returns 0 if the task is not overdue (scheduled date
 * is today or in the future, or today is a weekend and the scheduled date was
 * the preceding Friday).
 *
 * For "week of" dates: pass the Saturday after that week's Friday as the
 * start date (use weekOfFriday() + 1 day), since the task is not overdue
 * until the week has fully passed.
 *
 * @param scheduledDate - The date the task was due (or the day after the week ended)
 * @param today - Today's date
 * @returns Number of business days overdue (0 = not overdue)
 */
export function businessDaysOverdue(scheduledDate: Date, today: Date): number {
  return businessDaysElapsed(scheduledDate, today);
}
