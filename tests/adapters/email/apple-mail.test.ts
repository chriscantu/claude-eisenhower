/**
 * apple-mail.test.ts
 *
 * Unit tests for the Apple Mail email-source adapter.
 * Mocks child_process.spawn so no real osascript binary is invoked.
 *
 * Test IDs:
 *   APPLEMAIL-001  success path — 2 message lines parsed into EmailMessage[]
 *   APPLEMAIL-002  empty stdout — returns messages: [] with status success
 *   APPLEMAIL-003  ‡ placeholder in fields is converted back to |
 *   APPLEMAIL-004  nonzero exit — status error with stderr in reason
 *   APPLEMAIL-005  ENOENT on spawn — "osascript binary not found" error
 *   APPLEMAIL-006  timeout fires — kills child + returns error
 *   APPLEMAIL-007  script substitution — spawned args contain account and inbox
 *
 * Issue: #67
 */

import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Spawn mock — must come BEFORE importing the module under test
// ---------------------------------------------------------------------------

const spawnMock = jest.fn();
jest.mock("child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { createAppleMailAdapter } from "../../../scripts/adapters/email/apple-mail";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: jest.Mock;
}

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

/** Minimal valid EmailScanRequest for test reuse. */
const BASE_REQ = {
  account: "iCloud",
  inbox: "INBOX",
  since: "2026-05-01",
  unread_only: false,
  max_messages: 50,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Apple Mail email adapter", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    jest.useRealTimers();
  });

  test("APPLEMAIL-001: success path — 2 message lines parsed into EmailMessage[]", async () => {
    const { child, emitStdout, emitClose } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const adapter = createAppleMailAdapter();
    const promise = adapter.scan(BASE_REQ);

    // Two pipe-delimited lines: id|||from|||subject|||received_at|||snippet|||body_text|||thread_id
    emitStdout(
      "<msg001@mail.example.com>|||Alice Smith <alice@example.com>|||Q2 planning|||2026-05-15T09:00:00Z|||Short preview|||Full body text|||\n" +
      "<msg002@mail.example.com>|||Bob Jones <bob@example.com>|||Re: Q2 planning|||2026-05-16T10:00:00Z|||Another preview|||Another full body|||\n"
    );
    emitClose(0);

    const result = await promise;

    expect(result.status).toBe("success");
    expect(result.reason).toBe("OK");
    expect(result.messages).toHaveLength(2);

    const m1 = result.messages[0];
    expect(m1.id).toBe("<msg001@mail.example.com>");
    expect(m1.from).toBe("Alice Smith <alice@example.com>");
    expect(m1.subject).toBe("Q2 planning");
    expect(m1.received_at).toBe("2026-05-15T09:00:00Z");
    expect(m1.snippet).toBe("Short preview");
    expect(m1.body_text).toBe("Full body text");
    expect(m1.thread_id).toBe("");

    const m2 = result.messages[1];
    expect(m2.id).toBe("<msg002@mail.example.com>");
    expect(m2.subject).toBe("Re: Q2 planning");
  });

  test("APPLEMAIL-002: empty stdout returns messages: [] with status success", async () => {
    const { child, emitStdout, emitClose } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const adapter = createAppleMailAdapter();
    const promise = adapter.scan(BASE_REQ);

    emitStdout("");
    emitClose(0);

    const result = await promise;

    expect(result.status).toBe("success");
    expect(result.messages).toEqual([]);
  });

  test("APPLEMAIL-003: ‡ placeholders in fields are converted back to |", async () => {
    const { child, emitStdout, emitClose } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const adapter = createAppleMailAdapter();
    const promise = adapter.scan(BASE_REQ);

    // from field contains ‡ which should be converted back to |
    emitStdout(
      "<msg003@mail.example.com>|||Alice‡Bob <alice‡bob@example.com>|||Subject with ‡ pipe|||2026-05-17T08:00:00Z|||Snippet ‡ here|||Body ‡ text|||\n"
    );
    emitClose(0);

    const result = await promise;

    expect(result.status).toBe("success");
    expect(result.messages).toHaveLength(1);

    const m = result.messages[0];
    expect(m.from).toBe("Alice|Bob <alice|bob@example.com>");
    expect(m.subject).toBe("Subject with | pipe");
    expect(m.snippet).toBe("Snippet | here");
    expect(m.body_text).toBe("Body | text");
  });

  test("APPLEMAIL-004: nonzero exit returns status error with stderr in reason", async () => {
    const { child, emitStdout, emitStderr, emitClose } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const adapter = createAppleMailAdapter();
    const promise = adapter.scan(BASE_REQ);

    emitStdout("");
    emitStderr("Mail got an error: Account \"iCloud\" not found.");
    emitClose(1);

    const result = await promise;

    expect(result.status).toBe("error");
    expect(result.reason).toBe('Mail got an error: Account "iCloud" not found.');
    expect(result.messages).toEqual([]);
  });

  test("APPLEMAIL-005: ENOENT on spawn returns 'osascript binary not found' error", async () => {
    const { child, emitError } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const adapter = createAppleMailAdapter({ osascript_path: "/nonexistent/osascript" });
    const promise = adapter.scan(BASE_REQ);

    const err = Object.assign(new Error("spawn osascript ENOENT"), { code: "ENOENT" });
    emitError(err as NodeJS.ErrnoException);

    const result = await promise;

    expect(result.status).toBe("error");
    expect(result.reason).toBe("osascript binary not found");
    expect(result.messages).toEqual([]);
  });

  test("APPLEMAIL-006: timeout fires — kills child process and returns error", async () => {
    jest.useFakeTimers();
    const { child, emitStdout } = makeFakeProcess();
    // Never call emitClose — process hangs indefinitely
    spawnMock.mockReturnValue(child);

    const adapter = createAppleMailAdapter({ timeout_ms: 5_000 });
    const promise = adapter.scan(BASE_REQ);

    emitStdout(""); // partial — never finishes

    // Advance past the 5-second timeout
    jest.advanceTimersByTime(5_001);

    // After kill, child emits close
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

  test("APPLEMAIL-007: script substitution — spawned args contain account and inbox", async () => {
    const { child, emitStdout, emitClose } = makeFakeProcess();
    spawnMock.mockReturnValue(child);

    const req = {
      ...BASE_REQ,
      account: "MyGmailAccount",
      inbox: "Promotions",
    };

    const adapter = createAppleMailAdapter();
    const promise = adapter.scan(req);

    emitStdout("");
    emitClose(0);

    await promise;

    // spawn should have been called with osascript and ["-e", <scriptText>]
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [binary, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(binary).toBe("osascript");
    expect(args[0]).toBe("-e");

    const scriptText = args[1];
    expect(scriptText).toContain("MyGmailAccount");
    expect(scriptText).toContain("Promotions");
  });
});
