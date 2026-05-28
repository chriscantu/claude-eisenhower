/**
 * google.test.ts
 *
 * Unit tests for the Gmail email-source adapter
 * (scripts/adapters/email/google.ts).
 *
 * Mocks both `googleapis` (so the test never reaches the network) and the
 * shared google-auth.ts module (so no OAuth state is required on disk).
 *
 * Test IDs:
 *   GMAIL-001  success path — 2 messages parsed into EmailMessage[] (newest first)
 *   GMAIL-002  label not found — returns error with INBOX in reason
 *   GMAIL-003  empty messages list — success with messages: []
 *   GMAIL-004  unread_only true → query includes "is:unread"
 *   GMAIL-005  multipart payload — text/plain extracted from nested parts
 *   GMAIL-006  no text/plain part — body_text falls back to ""
 *   GMAIL-007  Gmail API error — returns status="error", messages: []
 *   GMAIL-008  base64url decode round-trip — handles - and _ replacements
 *   GMAIL-009  missing config — returns graceful error, never throws
 *   GMAIL-010  PII safety — adapter does not log sender / subject / body
 *
 * Issue: #65
 */

// ---------------------------------------------------------------------------
// Module mocks — MUST come before importing the module under test
// ---------------------------------------------------------------------------

const labelsListMock = jest.fn();
const messagesListMock = jest.fn();
const messagesGetMock = jest.fn();

const fakeGmailClient = {
  users: {
    labels: { list: labelsListMock },
    messages: { list: messagesListMock, get: messagesGetMock },
  },
};

jest.mock("googleapis", () => ({
  google: {
    gmail: jest.fn(() => fakeGmailClient),
  },
}));

jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    setCredentials: jest.fn(),
  })),
}));

const getAccessTokenMock = jest.fn();
jest.mock("../../../scripts/google-auth", () => ({
  getAccessToken: (...args: unknown[]) => getAccessTokenMock(...args),
}));

import { createGoogleGmailAdapter } from "../../../scripts/adapters/email/google";
import type { EmailScanRequest } from "../../../scripts/adapter-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64Url(s: string): string {
  return Buffer.from(s, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const BASE_REQ: EmailScanRequest = {
  account: "user@gmail.com",
  inbox: "INBOX",
  since: "2026-05-01",
  unread_only: false,
  max_messages: 50,
};

const VALID_CONFIG = {
  auth: {
    credentials_path: "/tmp/test-credentials.json",
    token_path: "/tmp/test-token.json",
  },
  gmailClientFactory: () => fakeGmailClient as unknown as never,
};

function setupAuthMock(): void {
  getAccessTokenMock.mockResolvedValue({
    token: "fake-access-token",
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setupAuthMock();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gmail adapter — success paths", () => {
  test("GMAIL-001: parses 2 messages, sorted newest-first", async () => {
    labelsListMock.mockResolvedValue({
      data: { labels: [{ id: "INBOX", name: "INBOX" }] },
    });
    messagesListMock.mockResolvedValue({
      data: { messages: [{ id: "msg-old" }, { id: "msg-new" }] },
    });

    const olderInternal = String(new Date("2026-05-10T08:00:00Z").getTime());
    const newerInternal = String(new Date("2026-05-12T08:00:00Z").getTime());

    messagesGetMock.mockImplementation(async (args: { id: string }) => {
      if (args.id === "msg-old") {
        return {
          data: {
            id: "msg-old",
            threadId: "thr-1",
            internalDate: olderInternal,
            snippet: "old snippet",
            payload: {
              headers: [
                { name: "From", value: "Alice <a@example.com>" },
                { name: "Subject", value: "Older message" },
              ],
              mimeType: "text/plain",
              body: { data: base64Url("Older body content") },
            },
          },
        };
      }
      return {
        data: {
          id: "msg-new",
          threadId: "thr-2",
          internalDate: newerInternal,
          snippet: "new snippet",
          payload: {
            headers: [
              { name: "From", value: "Bob <b@example.com>" },
              { name: "Subject", value: "Newer message" },
            ],
            mimeType: "text/plain",
            body: { data: base64Url("Newer body content") },
          },
        },
      };
    });

    const adapter = createGoogleGmailAdapter(VALID_CONFIG);
    const res = await adapter.scan(BASE_REQ);

    expect(res.status).toBe("success");
    expect(res.messages).toHaveLength(2);
    expect(res.messages[0].id).toBe("msg-new");
    expect(res.messages[1].id).toBe("msg-old");
    expect(res.messages[0].subject).toBe("Newer message");
    expect(res.messages[0].body_text).toBe("Newer body content");
    expect(res.messages[0].thread_id).toBe("thr-2");
    expect(res.messages[0].received_at).toBe("2026-05-12T08:00:00.000Z");
  });

  test("GMAIL-003: empty messages list returns success + []", async () => {
    labelsListMock.mockResolvedValue({
      data: { labels: [{ id: "INBOX", name: "INBOX" }] },
    });
    messagesListMock.mockResolvedValue({ data: {} });

    const adapter = createGoogleGmailAdapter(VALID_CONFIG);
    const res = await adapter.scan(BASE_REQ);

    expect(res.status).toBe("success");
    expect(res.messages).toEqual([]);
    expect(messagesGetMock).not.toHaveBeenCalled();
  });

  test("GMAIL-004: unread_only true adds is:unread to query", async () => {
    labelsListMock.mockResolvedValue({
      data: { labels: [{ id: "INBOX", name: "INBOX" }] },
    });
    messagesListMock.mockResolvedValue({ data: { messages: [] } });

    const adapter = createGoogleGmailAdapter(VALID_CONFIG);
    await adapter.scan({ ...BASE_REQ, unread_only: true });

    const callArg = messagesListMock.mock.calls[0][0];
    expect(callArg.q).toContain("is:unread");
    expect(callArg.q).toContain("after:2026/05/01");
    expect(callArg.labelIds).toEqual(["INBOX"]);
    expect(callArg.maxResults).toBe(50);
  });
});

describe("Gmail adapter — payload extraction", () => {
  test("GMAIL-005: walks multipart payload to find text/plain", async () => {
    labelsListMock.mockResolvedValue({
      data: { labels: [{ id: "INBOX", name: "INBOX" }] },
    });
    messagesListMock.mockResolvedValue({
      data: { messages: [{ id: "msg-mp" }] },
    });
    messagesGetMock.mockResolvedValue({
      data: {
        id: "msg-mp",
        threadId: "thr",
        internalDate: String(Date.UTC(2026, 4, 15)),
        snippet: "...",
        payload: {
          headers: [
            { name: "From", value: "x@example.com" },
            { name: "Subject", value: "Multipart" },
          ],
          mimeType: "multipart/alternative",
          parts: [
            {
              mimeType: "text/html",
              body: { data: base64Url("<p>html content</p>") },
            },
            {
              mimeType: "multipart/related",
              parts: [
                {
                  mimeType: "text/plain",
                  body: { data: base64Url("plain content from nested part") },
                },
              ],
            },
          ],
        },
      },
    });

    const adapter = createGoogleGmailAdapter(VALID_CONFIG);
    const res = await adapter.scan(BASE_REQ);

    expect(res.status).toBe("success");
    expect(res.messages[0].body_text).toBe("plain content from nested part");
  });

  test("GMAIL-006: no text/plain part → body_text is empty string", async () => {
    labelsListMock.mockResolvedValue({
      data: { labels: [{ id: "INBOX", name: "INBOX" }] },
    });
    messagesListMock.mockResolvedValue({
      data: { messages: [{ id: "msg-html" }] },
    });
    messagesGetMock.mockResolvedValue({
      data: {
        id: "msg-html",
        threadId: "thr",
        internalDate: String(Date.UTC(2026, 4, 15)),
        snippet: "...",
        payload: {
          headers: [
            { name: "From", value: "x@example.com" },
            { name: "Subject", value: "HTML only" },
          ],
          mimeType: "multipart/alternative",
          parts: [
            {
              mimeType: "text/html",
              body: { data: base64Url("<p>only html</p>") },
            },
          ],
        },
      },
    });

    const adapter = createGoogleGmailAdapter(VALID_CONFIG);
    const res = await adapter.scan(BASE_REQ);

    expect(res.status).toBe("success");
    expect(res.messages[0].body_text).toBe("");
  });

  test("GMAIL-008: base64url decode handles - and _ characters", async () => {
    const tricky = "<<??>>";
    labelsListMock.mockResolvedValue({
      data: { labels: [{ id: "INBOX", name: "INBOX" }] },
    });
    messagesListMock.mockResolvedValue({
      data: { messages: [{ id: "msg-b64" }] },
    });
    messagesGetMock.mockResolvedValue({
      data: {
        id: "msg-b64",
        threadId: "thr",
        internalDate: String(Date.UTC(2026, 4, 15)),
        snippet: "...",
        payload: {
          headers: [{ name: "From", value: "x@example.com" }],
          mimeType: "text/plain",
          body: { data: base64Url(tricky) },
        },
      },
    });

    const adapter = createGoogleGmailAdapter(VALID_CONFIG);
    const res = await adapter.scan(BASE_REQ);

    expect(res.messages[0].body_text).toBe(tricky);
  });
});

describe("Gmail adapter — error paths", () => {
  test("GMAIL-002: label not found returns error", async () => {
    labelsListMock.mockResolvedValue({
      data: { labels: [{ id: "SPAM", name: "SPAM" }] },
    });

    const adapter = createGoogleGmailAdapter(VALID_CONFIG);
    const res = await adapter.scan(BASE_REQ);

    expect(res.status).toBe("error");
    expect(res.reason).toContain("INBOX");
    expect(res.messages).toEqual([]);
    expect(messagesListMock).not.toHaveBeenCalled();
  });

  test("GMAIL-007: Gmail API error → graceful error, never throws", async () => {
    labelsListMock.mockResolvedValue({
      data: { labels: [{ id: "INBOX", name: "INBOX" }] },
    });
    messagesListMock.mockRejectedValue(new Error("rate limited"));

    const adapter = createGoogleGmailAdapter(VALID_CONFIG);
    const res = await adapter.scan(BASE_REQ);

    expect(res.status).toBe("error");
    expect(res.reason).toContain("Gmail API error");
    expect(res.messages).toEqual([]);
  });

  test("GMAIL-009: missing config returns graceful error", async () => {
    const adapter = createGoogleGmailAdapter();
    const res = await adapter.scan(BASE_REQ);

    expect(res.status).toBe("error");
    expect(res.reason).toContain("missing config");
    expect(res.messages).toEqual([]);
  });
});

describe("Gmail adapter — PII safety", () => {
  test("GMAIL-010: does not log sender / subject / body to stdout or stderr", async () => {
    const stdoutSpy = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    labelsListMock.mockResolvedValue({
      data: { labels: [{ id: "INBOX", name: "INBOX" }] },
    });
    messagesListMock.mockResolvedValue({
      data: { messages: [{ id: "msg-pii" }] },
    });
    const piiFrom = "Sensitive Person <secret@example.com>";
    const piiSubject = "Confidential subject line";
    const piiBody = "Highly confidential body content with PII";
    messagesGetMock.mockResolvedValue({
      data: {
        id: "msg-pii",
        threadId: "thr",
        internalDate: String(Date.UTC(2026, 4, 15)),
        snippet: "snippet",
        payload: {
          headers: [
            { name: "From", value: piiFrom },
            { name: "Subject", value: piiSubject },
          ],
          mimeType: "text/plain",
          body: { data: base64Url(piiBody) },
        },
      },
    });

    const adapter = createGoogleGmailAdapter(VALID_CONFIG);
    await adapter.scan(BASE_REQ);

    const allWrites = [
      ...stdoutSpy.mock.calls,
      ...stderrSpy.mock.calls,
      ...consoleLogSpy.mock.calls,
      ...consoleErrorSpy.mock.calls,
    ]
      .flat()
      .map((x) => String(x))
      .join("\n");

    expect(allWrites).not.toContain(piiFrom);
    expect(allWrites).not.toContain("secret@example.com");
    expect(allWrites).not.toContain(piiSubject);
    expect(allWrites).not.toContain(piiBody);

    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
