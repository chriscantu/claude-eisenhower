/**
 * google.ts — Google Calendar adapter (STUB).
 *
 * Real implementation lands in issue #64 (https://github.com/chriscantu/claude-eisenhower/issues/64).
 * Shares OAuth refresh-token flow via scripts/google-auth.ts.
 *
 * Until #64 ships, calling query() throws a descriptive error pointing at the
 * tracking issue so installs configured with `provider: google` fail loudly,
 * not silently.
 */

import type { CalendarQueryRequest, CalendarQueryResult } from "../../adapter-types";

export interface GoogleCalendarAdapter {
  name: "google";
  query(req: CalendarQueryRequest): Promise<CalendarQueryResult>;
}

export function createGoogleCalendarAdapter(): GoogleCalendarAdapter {
  return {
    name: "google",
    async query(_req) {
      throw new Error(
        "Google Calendar adapter not yet implemented — see #64 (https://github.com/chriscantu/claude-eisenhower/issues/64)",
      );
    },
  };
}
