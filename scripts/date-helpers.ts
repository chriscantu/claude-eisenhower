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
  const from = new Date(start);
  from.setHours(0, 0, 0, 0);
  const to = new Date(end);
  to.setHours(0, 0, 0, 0);

  if (from >= to) return 0;

  let count = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
