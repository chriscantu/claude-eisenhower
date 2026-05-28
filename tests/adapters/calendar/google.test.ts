/**
 * google.test.ts
 *
 * Unit tests for the Google Calendar stub adapter
 * (scripts/adapters/calendar/google.ts).
 *
 * Test IDs:
 *   GOOGLECAL-001 — createGoogleCalendarAdapter().query throws with "#64" in the message
 *
 * Issue: #67
 */

import { createGoogleCalendarAdapter } from "../../../scripts/adapters/calendar/google";
import type { CalendarQueryRequest } from "../../../scripts/adapter-types";

function sampleRequest(): CalendarQueryRequest {
  return {
    calendar_name: "Work",
    days_ahead: 7,
    format: "full",
  };
}

describe("Google Calendar stub adapter", () => {
  test("GOOGLECAL-001: query() throws with '#64' and the GitHub issue URL in the message", async () => {
    const adapter = createGoogleCalendarAdapter();

    await expect(adapter.query(sampleRequest())).rejects.toThrow("#64");
    await expect(adapter.query(sampleRequest())).rejects.toThrow(
      "https://github.com/chriscantu/claude-eisenhower/issues/64"
    );
  });
});
