/**
 * calendar-query.test.ts
 *
 * Unit tests for the calendar-source dispatcher (scripts/calendar-query.ts).
 * The eventkit adapter is mocked at the module level so no Swift process is
 * spawned. Tests use the registry-reset pattern to ensure isolation.
 *
 * Test IDs:
 *   CALQ-001 — missing config → eventkit default
 *   CALQ-002 — provider: google → stub error ("not yet implemented #64")
 *   CALQ-003 — provider: eventkit → routes to eventkit adapter
 *   CALQ-004 — providerOverride wins over config
 *   CALQ-005 — unknown provider → error result with name in reason
 *   CALQ-006 — case-insensitive provider matching
 *   CALQ-007 — legacy config with only calendar_name → eventkit default
 *
 * Issue: #67
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { CalendarQueryRequest, CalendarQueryResult } from "../scripts/adapter-types";

// ---------------------------------------------------------------------------
// Mock the eventkit adapter BEFORE importing calendar-query so the module-load
// registration picks up the mock.
// ---------------------------------------------------------------------------

const mockEventkitQuery = jest.fn<Promise<CalendarQueryResult>, [CalendarQueryRequest]>();

jest.mock("../scripts/adapters/calendar/eventkit", () => ({
  createEventkitAdapter: () => ({
    query: mockEventkitQuery,
  }),
}));

// Now import the module under test — the mock is in place for module-load
// registration.
import {
  queryCalendar,
  readProviderFromConfig,
  registerAdapter,
  resetRegistryForTests,
} from "../scripts/calendar-query";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sampleRequest(): CalendarQueryRequest {
  return {
    calendar_name: "Work",
    days_ahead: 7,
    format: "full",
  };
}

function successResult(): CalendarQueryResult {
  return {
    status: "success",
    reason: "OK",
    events: [],
  };
}

function tmpConfigFile(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-calq-"));
  const file = path.join(dir, "calendar-config.md");
  fs.writeFileSync(file, contents);
  return file;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Re-register built-in adapters after each reset so the registry is fresh
  // but the mocked eventkit and the google stub are both present.
  resetRegistryForTests();

  // Re-register eventkit with the mock
  registerAdapter({
    name: "eventkit",
    query: async (req) => mockEventkitQuery(req),
  });

  // Re-register google stub (mirrors module-load behavior)
  registerAdapter({
    name: "google",
    query: async (_req) => {
      throw new Error(
        "Google Calendar adapter not yet implemented — see #64 " +
          "(https://github.com/chriscantu/claude-eisenhower/issues/64)"
      );
    },
  });

  mockEventkitQuery.mockReset();
  mockEventkitQuery.mockResolvedValue(successResult());
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("calendar-query dispatcher", () => {
  test("CALQ-001: missing config file → defaults to eventkit provider", async () => {
    const nonexistentPath = "/tmp/ce-calq-does-not-exist-xyz/calendar-config.md";
    const result = await queryCalendar(sampleRequest(), undefined, nonexistentPath);

    expect(result.status).toBe("success");
    expect(mockEventkitQuery).toHaveBeenCalledTimes(1);
    expect(mockEventkitQuery).toHaveBeenCalledWith(sampleRequest());
  });

  test("CALQ-002: config with provider: google → returns stub error with #64 reference", async () => {
    const configFile = tmpConfigFile(
      "# Calendar Configuration\n\nprovider: google\ncalendar_name: Work\n"
    );

    const result = await queryCalendar(sampleRequest(), undefined, configFile);

    expect(result.status).toBe("error");
    expect(result.reason).toMatch(/not yet implemented/);
    expect(result.reason).toMatch(/#64/);
    expect(result.events).toEqual([]);
    // eventkit adapter should NOT have been called
    expect(mockEventkitQuery).not.toHaveBeenCalled();
  });

  test("CALQ-003: config with provider: eventkit → routes to eventkit adapter with correct request", async () => {
    const configFile = tmpConfigFile(
      "# Calendar Configuration\n\nprovider: eventkit\ncalendar_name: Work\n"
    );
    const req = sampleRequest();

    const result = await queryCalendar(req, undefined, configFile);

    expect(result.status).toBe("success");
    expect(mockEventkitQuery).toHaveBeenCalledTimes(1);
    expect(mockEventkitQuery).toHaveBeenCalledWith(req);
  });

  test("CALQ-004: providerOverride wins over config file", async () => {
    // Config says google, but override says eventkit
    const configFile = tmpConfigFile(
      "# Calendar Configuration\n\nprovider: google\ncalendar_name: Work\n"
    );

    const result = await queryCalendar(sampleRequest(), "eventkit", configFile);

    expect(result.status).toBe("success");
    expect(mockEventkitQuery).toHaveBeenCalledTimes(1);
  });

  test("CALQ-005: unknown provider name → returns error result with provider name in reason", async () => {
    const result = await queryCalendar(sampleRequest(), "caldav");

    expect(result.status).toBe("error");
    expect(result.reason).toMatch(/caldav/);
    expect(result.events).toEqual([]);
    expect(mockEventkitQuery).not.toHaveBeenCalled();
  });

  test("CALQ-006: case-insensitive provider matching — provider: Eventkit works", async () => {
    const configFile = tmpConfigFile(
      "# Calendar Configuration\n\nprovider: Eventkit\ncalendar_name: Work\n"
    );

    const result = await queryCalendar(sampleRequest(), undefined, configFile);

    expect(result.status).toBe("success");
    expect(mockEventkitQuery).toHaveBeenCalledTimes(1);
  });

  test("CALQ-007: readProviderFromConfig returns eventkit for a config with only calendar_name", () => {
    const configFile = tmpConfigFile(
      "# Calendar Configuration\n\ncalendar_name: My Work Calendar\n"
    );

    const provider = readProviderFromConfig(configFile);

    expect(provider).toBe("eventkit");
  });
});
