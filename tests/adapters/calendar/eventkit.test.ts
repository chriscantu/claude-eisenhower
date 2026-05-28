/**
 * eventkit.test.ts
 *
 * Unit tests for the EventKit calendar adapter (scripts/adapters/calendar/eventkit.ts).
 * Mocks child_process.spawn so no real swift binary is invoked.
 *
 * Test IDs:
 *   EVENTKIT-001  full format — three events parsed correctly
 *   EVENTKIT-002  full format — empty stdout returns events: []
 *   EVENTKIT-003  full format — ALL_DAY flag parsed correctly
 *   EVENTKIT-004  summary format — raw stdout passed through in reason
 *   EVENTKIT-005  nonzero exit — error status with stderr in reason
 *   EVENTKIT-006  ENOENT on spawn — "swift binary not found" error
 *   EVENTKIT-007  30s timeout — kills child + returns error
 *   EVENTKIT-008  malformed date line — passes raw strings through unchanged
 *   EVENTKIT-009  stdout starts with ERROR: on exit 0 → status error (both formats)
 *
 * Issue: #67
 */

import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Spawn mock setup — must come BEFORE importing the module under test
// ---------------------------------------------------------------------------

const spawnMock = jest.fn();
jest.mock("child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { createEventkitAdapter } from "../../../scripts/adapters/calendar/eventkit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: jest.Mock;
}

/**
 * Creates a fake ChildProcess with controllable stdout/stderr/exit.
 * Call the returned helpers to drive the process lifecycle.
 */
function makeFakeProcess(): {
  child: FakeChild;
  emitStdout(data: string): void;
  emitStderr(data: string): void;
  emitClose(code: number | null): void;
  emitError(err: NodeJS.ErrnoException): void;
} {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();

  return {
    child,
    emitStdout: (data: string) => child.stdout.emit("data", Buffer.from(data)),
    emitStderr: (data: string) => child.stderr.emit("data", Buffer.from(data)),
    emitClose: (code: number | null) => {
      child.stdout.emit("end");
      child.stderr.emit("end");
      child.emit("close", code);
      child.emit("error", null); // resolve spawnErrorPromise
    },
    emitError: (err: NodeJS.ErrnoException) => {
      child.stdout.emit("end");
      child.stderr.emit("end");
      child.emit("error", err);
      child.emit("close", null);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EventKit calendar adapter", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    jest.useRealTimers();
  });

  test("EVENTKIT-001: full format — parses three event lines into CalendarEvent[]", async () => {
    const { child, emitStdout, emitClose } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const adapter = createEventkitAdapter({ swift_script_path: "/fake/cal_query.swift" });
    const promise = adapter.query({
      calendar_name: "Work",
      days_ahead: 7,
      format: "full",
    });

    emitStdout(
      "2026-05-28 09:00|||2026-05-28 10:00|||Team Standup|||\n" +
      "2026-05-28 14:00|||2026-05-28 15:00|||1:1 with Alice|||\n" +
      "2026-05-29 00:00|||2026-05-29 23:59|||All Hands Planning|||ALL_DAY\n" +
      "TOTAL: 3 events\n"
    );
    emitClose(0);

    const result = await promise;

    const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00[+-]\d{2}:\d{2}$/;

    expect(result.status).toBe("success");
    expect(result.events).toHaveLength(3);

    expect(result.events[0].title).toBe("Team Standup");
    expect(result.events[0].all_day).toBe(false);
    expect(result.events[0].start).toMatch(isoRe);
    expect(result.events[0].end).toMatch(isoRe);
    // Preserve the date/time values after conversion
    expect(result.events[0].start).toMatch(/^2026-05-28T09:00:00/);
    expect(result.events[0].end).toMatch(/^2026-05-28T10:00:00/);

    expect(result.events[1].title).toBe("1:1 with Alice");
    expect(result.events[1].all_day).toBe(false);
    expect(result.events[1].start).toMatch(isoRe);
    expect(result.events[1].end).toMatch(isoRe);
    expect(result.events[1].start).toMatch(/^2026-05-28T14:00:00/);
    expect(result.events[1].end).toMatch(/^2026-05-28T15:00:00/);

    expect(result.events[2].title).toBe("All Hands Planning");
    expect(result.events[2].all_day).toBe(true);
    expect(result.events[2].start).toMatch(isoRe);
    expect(result.events[2].end).toMatch(isoRe);
  });

  test("EVENTKIT-002: full format — empty stdout returns events: [] with status success", async () => {
    const { child, emitStdout, emitClose } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const adapter = createEventkitAdapter({ swift_script_path: "/fake/cal_query.swift" });
    const promise = adapter.query({
      calendar_name: "Work",
      days_ahead: 7,
      format: "full",
    });

    emitStdout("TOTAL: 0 events\n");
    emitClose(0);

    const result = await promise;

    expect(result.status).toBe("success");
    expect(result.events).toEqual([]);
  });

  test("EVENTKIT-003: full format — ALL_DAY flag set when field is ALL_DAY", async () => {
    const { child, emitStdout, emitClose } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const adapter = createEventkitAdapter({ swift_script_path: "/fake/cal_query.swift" });
    const promise = adapter.query({
      calendar_name: "Work",
      days_ahead: 1,
      format: "full",
    });

    emitStdout("2026-05-28 00:00|||2026-05-29 00:00|||PTO|||ALL_DAY\nTOTAL: 1 events\n");
    emitClose(0);

    const result = await promise;

    const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00[+-]\d{2}:\d{2}$/;

    expect(result.status).toBe("success");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].all_day).toBe(true);
    expect(result.events[0].title).toBe("PTO");
    expect(result.events[0].start).toMatch(isoRe);
    expect(result.events[0].start).toMatch(/^2026-05-28T00:00:00/);
  });

  test("EVENTKIT-004: summary format — passes raw stdout through in reason, events: []", async () => {
    const { child, emitStdout, emitClose } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const adapter = createEventkitAdapter({ swift_script_path: "/fake/cal_query.swift" });
    const promise = adapter.query({
      calendar_name: "Work",
      days_ahead: 7,
      format: "summary",
    });

    const summaryText =
      "DAY_SUMMARY:\n2026-05-28|2.0h_busy|6.0h_free|available\nBUSINESS_DAYS: 5\nAVAILABLE_DAYS: 4";
    emitStdout(summaryText);
    emitClose(0);

    const result = await promise;

    expect(result.status).toBe("success");
    expect(result.reason).toBe(summaryText.trim());
    expect(result.events).toEqual([]);
  });

  test("EVENTKIT-005: nonzero exit returns status: error with stderr in reason", async () => {
    const { child, emitStdout, emitStderr, emitClose } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const adapter = createEventkitAdapter({ swift_script_path: "/fake/cal_query.swift" });
    const promise = adapter.query({
      calendar_name: "NonExistent",
      days_ahead: 7,
      format: "full",
    });

    emitStdout("");
    emitStderr("ERROR: Calendar 'NonExistent' not found");
    emitClose(1);

    const result = await promise;

    expect(result.status).toBe("error");
    expect(result.reason).toBe("ERROR: Calendar 'NonExistent' not found");
    expect(result.events).toEqual([]);
  });

  test("EVENTKIT-006: ENOENT on spawn returns 'swift binary not found' error", async () => {
    const { child, emitError } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const adapter = createEventkitAdapter({ swift_script_path: "/fake/cal_query.swift" });
    const promise = adapter.query({
      calendar_name: "Work",
      days_ahead: 7,
      format: "full",
    });

    const err = Object.assign(new Error("spawn swift ENOENT"), { code: "ENOENT" });
    emitError(err as NodeJS.ErrnoException);

    const result = await promise;

    expect(result.status).toBe("error");
    expect(result.reason).toBe(
      "swift binary not found — install Xcode command line tools"
    );
    expect(result.events).toEqual([]);
  });

  test("EVENTKIT-007: 30s timeout — kills child process and returns error", async () => {
    jest.useFakeTimers();
    const { child, emitStdout } = makeFakeProcess();
    // Don't call emitClose — process never exits naturally
    spawnMock.mockReturnValue(child);

    const adapter = createEventkitAdapter({ swift_script_path: "/fake/cal_query.swift" });
    const promise = adapter.query({
      calendar_name: "Work",
      days_ahead: 7,
      format: "full",
    });

    // Emit partial stdout but never close
    emitStdout("");

    // Advance timer past 30s — triggers kill and closes the process
    jest.advanceTimersByTime(30_001);

    // After kill, the child emits close
    child.stdout.emit("end");
    child.stderr.emit("end");
    child.emit("close", null);
    child.emit("error", null);

    const result = await promise;

    expect(result.status).toBe("error");
    expect(result.reason).toContain("timed out");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");

    jest.useRealTimers();
  });

  test("EVENTKIT-008: malformed date line — passes raw strings through unchanged in start/end", async () => {
    const { child, emitStdout, emitClose } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const adapter = createEventkitAdapter({ swift_script_path: "/fake/cal_query.swift" });
    const promise = adapter.query({
      calendar_name: "Work",
      days_ahead: 7,
      format: "full",
    });

    emitStdout("not-a-date|||also-bad|||Weird|||false\nTOTAL: 1 events\n");
    emitClose(0);

    const result = await promise;

    expect(result.status).toBe("success");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].title).toBe("Weird");
    expect(result.events[0].start).toBe("not-a-date");
    expect(result.events[0].end).toBe("also-bad");
    expect(result.events[0].all_day).toBe(false);
  });

  test("EVENTKIT-009: stdout starts with ERROR: on exit 0 → status error (full format)", async () => {
    // cal_query.swift exits 0 even when the named calendar does not exist.
    // It prints "ERROR: Calendar '<name>' not found\nAvailable calendars: ..."
    // to stdout. The adapter must detect this and return status: "error".
    const { child, emitStdout, emitClose } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const adapter = createEventkitAdapter({ swift_script_path: "/fake/cal_query.swift" });
    const promise = adapter.query({
      calendar_name: "Foo",
      days_ahead: 1,
      format: "full",
    });

    const errorOutput =
      "ERROR: Calendar 'Foo' not found\nAvailable calendars: Work, Personal";
    emitStdout(errorOutput);
    emitClose(0); // exit 0 — the bug this test guards against

    const result = await promise;

    expect(result.status).toBe("error");
    expect(result.reason).toBe(errorOutput.trim());
    expect(result.events).toEqual([]);
  });

  test("EVENTKIT-009b: stdout starts with ERROR: on exit 0 → status error (summary format)", async () => {
    const { child, emitStdout, emitClose } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const adapter = createEventkitAdapter({ swift_script_path: "/fake/cal_query.swift" });
    const promise = adapter.query({
      calendar_name: "Foo",
      days_ahead: 7,
      format: "summary",
    });

    const errorOutput =
      "ERROR: Calendar 'Foo' not found\nAvailable calendars: Work, Personal";
    emitStdout(errorOutput);
    emitClose(0);

    const result = await promise;

    expect(result.status).toBe("error");
    expect(result.reason).toBe(errorOutput.trim());
    expect(result.events).toEqual([]);
  });
});
