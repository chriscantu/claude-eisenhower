/**
 * google.test.ts
 *
 * Unit tests for the Google Calendar adapter (scripts/adapters/calendar/google.ts).
 *
 * Mocks:
 *   - `googleapis` so no network calls happen and the calendar client is a stub.
 *   - `scripts/google-auth.ts` `getAccessToken` so no token file is required.
 *
 * The adapter exposes injection hooks (`access_token_loader`,
 * `client_factory`, `auth.credentials_path`, `auth.token_path`) — most tests
 * use those directly. A single test exercises the module-level mocks to
 * confirm the default wiring still type-checks and resolves.
 *
 * Test IDs:
 *   GOOGLECAL-001  success path — events mapped, status "success", reason "OK"
 *   GOOGLECAL-002  calendar not found by summary → status "error", helpful reason
 *   GOOGLECAL-003  API error (events.list rejects) → graceful error (no throw)
 *   GOOGLECAL-004  all-day event mapped with all_day=true
 *   GOOGLECAL-005  summary format collapses to DAY_SUMMARY string, events: []
 *   GOOGLECAL-006  missing credentials/token paths → graceful error
 *   GOOGLECAL-007  default wiring uses mocked googleapis + getAccessToken
 *
 * Issue: #64
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared BEFORE importing the module under test.
// ---------------------------------------------------------------------------

const calendarListMock = jest.fn();
const eventsListMock = jest.fn();

const calendarClientStub = {
  calendarList: { list: calendarListMock },
  events: { list: eventsListMock },
};

const googleCalendarFn = jest.fn(
  (_arg?: unknown): typeof calendarClientStub => calendarClientStub,
);

// Capture instances so we can assert setCredentials was called.
const oauth2Instances: Array<{ setCredentials: jest.Mock }> = [];
class FakeOAuth2 {
  setCredentials = jest.fn();
  constructor() {
    oauth2Instances.push(this);
  }
}

jest.mock("googleapis", () => ({
  google: {
    calendar: (arg: unknown) => googleCalendarFn(arg),
    auth: { OAuth2: FakeOAuth2 },
  },
}));

const getAccessTokenMock = jest.fn();
jest.mock("../../../scripts/google-auth", () => ({
  getAccessToken: (arg: unknown) => getAccessTokenMock(arg),
  // Mirror the real buildAuthedClient: pull a token (via injected loader or
  // the mocked getAccessToken), construct a FakeOAuth2, seed the access
  // token, and hand it back. Lets the adapter exercise the shared helper
  // while preserving the existing oauth2Instances/setCredentials asserts.
  buildAuthedClient: async (
    cfg: { scopes: string[]; credentials_path: string; token_path: string },
    loader?: (c: typeof cfg) => Promise<string>,
  ) => {
    const token = loader
      ? await loader(cfg)
      : (await getAccessTokenMock(cfg)).token;
    const oauth = new FakeOAuth2();
    oauth.setCredentials({ access_token: token });
    return oauth;
  },
}));

import { createGoogleCalendarAdapter } from "../../../scripts/adapters/calendar/google";
import type { CalendarQueryRequest } from "../../../scripts/adapter-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reqFull(calendarName = "Work"): CalendarQueryRequest {
  return { calendar_name: calendarName, days_ahead: 7, format: "full" };
}

function reqSummary(calendarName = "Work"): CalendarQueryRequest {
  return { calendar_name: calendarName, days_ahead: 7, format: "summary" };
}

const SAMPLE_CALENDAR_LIST = {
  data: {
    items: [
      { id: "primary", summary: "Personal" },
      { id: "cal-work-1", summary: "Work" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Google Calendar adapter", () => {
  beforeEach(() => {
    calendarListMock.mockReset();
    eventsListMock.mockReset();
    googleCalendarFn.mockClear();
    getAccessTokenMock.mockReset();
    oauth2Instances.length = 0;
  });

  test("GOOGLECAL-001: success path — events mapped from Google → CalendarEvent[]", async () => {
    calendarListMock.mockResolvedValue(SAMPLE_CALENDAR_LIST);
    eventsListMock.mockResolvedValue({
      data: {
        items: [
          {
            summary: "Team Standup",
            start: { dateTime: "2026-05-28T09:00:00-07:00" },
            end: { dateTime: "2026-05-28T10:00:00-07:00" },
          },
          {
            summary: "1:1 with Alice",
            start: { dateTime: "2026-05-28T14:00:00-07:00" },
            end: { dateTime: "2026-05-28T15:00:00-07:00" },
          },
        ],
      },
    });

    const adapter = createGoogleCalendarAdapter({
      auth: {
        credentials_path: "/fake/creds.json",
        token_path: "/fake/token.json",
      },
      access_token_loader: async () => "fake-access-token",
    });

    const result = await adapter.query(reqFull());

    expect(result.status).toBe("success");
    expect(result.reason).toBe("OK");
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toEqual({
      title: "Team Standup",
      start: "2026-05-28T09:00:00-07:00",
      end: "2026-05-28T10:00:00-07:00",
      all_day: false,
    });
    expect(result.events[1].title).toBe("1:1 with Alice");

    // The adapter must scope events.list to the resolved calendar ID.
    expect(eventsListMock).toHaveBeenCalledTimes(1);
    const eventsListArgs = eventsListMock.mock.calls[0][0] as { calendarId: string };
    expect(eventsListArgs.calendarId).toBe("cal-work-1");
  });

  test("GOOGLECAL-002: calendar_name not found by summary → status error, helpful reason", async () => {
    calendarListMock.mockResolvedValue(SAMPLE_CALENDAR_LIST);
    // events.list must NOT be called when the calendar lookup fails.
    eventsListMock.mockRejectedValue(new Error("should-not-be-called"));

    const adapter = createGoogleCalendarAdapter({
      auth: {
        credentials_path: "/fake/creds.json",
        token_path: "/fake/token.json",
      },
      access_token_loader: async () => "fake-access-token",
    });

    const result = await adapter.query(reqFull("NoSuchCalendar"));

    expect(result.status).toBe("error");
    expect(result.reason).toContain("NoSuchCalendar");
    expect(result.reason).toContain("Available calendars");
    expect(result.events).toEqual([]);
    expect(eventsListMock).not.toHaveBeenCalled();
  });

  test("GOOGLECAL-003: API error from events.list → graceful error (no throw)", async () => {
    calendarListMock.mockResolvedValue(SAMPLE_CALENDAR_LIST);
    eventsListMock.mockRejectedValue(new Error("403 Forbidden"));

    const adapter = createGoogleCalendarAdapter({
      auth: {
        credentials_path: "/fake/creds.json",
        token_path: "/fake/token.json",
      },
      access_token_loader: async () => "fake-access-token",
    });

    const result = await adapter.query(reqFull());

    expect(result.status).toBe("error");
    expect(result.reason).toBe("403 Forbidden");
    expect(result.events).toEqual([]);
  });

  test("GOOGLECAL-004: all-day event (start.date present) → all_day=true", async () => {
    calendarListMock.mockResolvedValue(SAMPLE_CALENDAR_LIST);
    eventsListMock.mockResolvedValue({
      data: {
        items: [
          {
            summary: "PTO",
            start: { date: "2026-05-28" },
            end: { date: "2026-05-29" },
          },
          {
            summary: "Meeting",
            start: { dateTime: "2026-05-28T09:00:00-07:00" },
            end: { dateTime: "2026-05-28T09:30:00-07:00" },
          },
        ],
      },
    });

    const adapter = createGoogleCalendarAdapter({
      auth: {
        credentials_path: "/fake/creds.json",
        token_path: "/fake/token.json",
      },
      access_token_loader: async () => "fake-access-token",
    });

    const result = await adapter.query(reqFull());

    expect(result.status).toBe("success");
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toEqual({
      title: "PTO",
      start: "2026-05-28",
      end: "2026-05-29",
      all_day: true,
    });
    expect(result.events[1].all_day).toBe(false);
  });

  test("GOOGLECAL-005: summary format collapses to DAY_SUMMARY reason, events: []", async () => {
    calendarListMock.mockResolvedValue(SAMPLE_CALENDAR_LIST);
    // Pick a known weekday window; the adapter computes business days from
    // wall-clock now(), so the exact bullet count varies — assert structure,
    // not specific day rows.
    eventsListMock.mockResolvedValue({
      data: {
        items: [
          {
            summary: "PTO",
            start: { date: "2026-05-28" },
            end: { date: "2026-05-29" },
          },
        ],
      },
    });

    const adapter = createGoogleCalendarAdapter({
      auth: {
        credentials_path: "/fake/creds.json",
        token_path: "/fake/token.json",
      },
      access_token_loader: async () => "fake-access-token",
    });

    const result = await adapter.query(reqSummary());

    expect(result.status).toBe("success");
    expect(result.events).toEqual([]);
    expect(result.reason).toMatch(/^DAY_SUMMARY:/);
    expect(result.reason).toContain("BUSINESS_DAYS:");
    expect(result.reason).toContain("PTO_DAYS:");
    expect(result.reason).toContain("AVAILABLE_DAYS:");
  });

  test("GOOGLECAL-006: missing credentials/token paths → graceful error (no throw)", async () => {
    const adapter = createGoogleCalendarAdapter({
      // Point at a config path that does not exist; nothing else injected.
      config_path: "/definitely/does/not/exist/calendar-config.md",
    });

    const result = await adapter.query(reqFull());

    expect(result.status).toBe("error");
    expect(result.reason).toMatch(/google_credentials_path|google_token_path/);
    expect(result.events).toEqual([]);
    // The token loader must NOT have been called — no point fetching a token
    // without paths.
    expect(getAccessTokenMock).not.toHaveBeenCalled();
  });

  test("GOOGLECAL-007: default wiring uses mocked googleapis + getAccessToken", async () => {
    // Verify the production wiring path (no overrides) hits the module-level
    // googleapis + google-auth mocks and never throws.
    getAccessTokenMock.mockResolvedValue({
      token: "mock-access-token",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    calendarListMock.mockResolvedValue(SAMPLE_CALENDAR_LIST);
    eventsListMock.mockResolvedValue({ data: { items: [] } });

    const adapter = createGoogleCalendarAdapter({
      auth: {
        credentials_path: "/fake/creds.json",
        token_path: "/fake/token.json",
      },
      // Intentionally NOT overriding access_token_loader — exercises the
      // default getAccessToken path.
    });

    const result = await adapter.query(reqFull());

    expect(getAccessTokenMock).toHaveBeenCalledTimes(1);
    const callArg = getAccessTokenMock.mock.calls[0][0] as {
      scopes: string[];
      credentials_path: string;
      token_path: string;
    };
    expect(callArg.scopes).toEqual([
      "https://www.googleapis.com/auth/calendar.readonly",
    ]);
    expect(callArg.credentials_path).toBe("/fake/creds.json");
    expect(callArg.token_path).toBe("/fake/token.json");

    // A fresh OAuth2 client was created and seeded with the access token.
    expect(oauth2Instances.length).toBeGreaterThan(0);
    const last = oauth2Instances[oauth2Instances.length - 1];
    expect(last.setCredentials).toHaveBeenCalledWith({
      access_token: "mock-access-token",
    });

    // The default calendar client builder was invoked with the OAuth client.
    expect(googleCalendarFn).toHaveBeenCalledTimes(1);
    const builderArg = googleCalendarFn.mock.calls[0][0] as {
      version: string;
      auth: unknown;
    };
    expect(builderArg.version).toBe("v3");
    expect(builderArg.auth).toBe(last);

    expect(result.status).toBe("success");
    expect(result.events).toEqual([]);
  });
});
