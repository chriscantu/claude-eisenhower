/**
 * email-scan.test.ts
 *
 * Unit tests for the email-source dispatcher (scripts/email-scan.ts).
 * The apple-mail adapter is mocked at the module level so no osascript
 * process is spawned. Tests use the registry-reset pattern to ensure isolation.
 *
 * Test IDs:
 *   EMAIL-001 — missing config → apple-mail default
 *   EMAIL-002 — provider: google → stub error mentioning #65
 *   EMAIL-003 — provider: apple-mail → routes to apple-mail adapter
 *   EMAIL-004 — providerOverride wins over config
 *   EMAIL-005 — unknown provider → error result with name
 *   EMAIL-006 — case-insensitive provider matching
 *   EMAIL-007 — legacy config with only account_name/inbox_name → defaults to apple-mail
 *
 * Issue: #67
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { EmailScanRequest, EmailScanResult } from "../scripts/adapter-types";

// ---------------------------------------------------------------------------
// Mock the apple-mail adapter BEFORE importing email-scan so the module-load
// registration picks up the mock.
// ---------------------------------------------------------------------------

const mockAppleMailScan = jest.fn<Promise<EmailScanResult>, [EmailScanRequest]>();

jest.mock("../scripts/adapters/email/apple-mail", () => ({
  createAppleMailAdapter: () => ({
    scan: mockAppleMailScan,
  }),
}));

// Now import the module under test — the mock is in place for module-load
// registration.
import {
  scanEmail,
  readProviderFromConfig,
  registerAdapter,
  resetRegistryForTests,
} from "../scripts/email-scan";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sampleRequest(): EmailScanRequest {
  return {
    account: "Work Account",
    inbox: "INBOX",
    since: "2026-05-01",
    unread_only: true,
    max_messages: 20,
  };
}

function successResult(): EmailScanResult {
  return {
    status: "success",
    reason: "OK",
    messages: [],
  };
}

function tmpConfigFile(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-email-"));
  const file = path.join(dir, "email-config.md");
  fs.writeFileSync(file, contents);
  return file;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Re-register built-in adapters after each reset so the registry is fresh
  // but the mocked apple-mail and the google stub are both present.
  resetRegistryForTests();

  // Re-register apple-mail with the mock
  registerAdapter({
    name: "apple-mail",
    scan: async (req) => mockAppleMailScan(req),
  });

  // Re-register google stub (mirrors module-load behavior)
  registerAdapter({
    name: "google",
    scan: async (_req) => {
      throw new Error(
        "Gmail adapter not yet implemented — see #65 " +
          "(https://github.com/chriscantu/claude-eisenhower/issues/65)"
      );
    },
  });

  mockAppleMailScan.mockReset();
  mockAppleMailScan.mockResolvedValue(successResult());
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("email-scan dispatcher", () => {
  test("EMAIL-001: missing config file → defaults to apple-mail provider", async () => {
    const nonexistentPath = "/tmp/ce-email-does-not-exist-xyz/email-config.md";
    const result = await scanEmail(sampleRequest(), undefined, nonexistentPath);

    expect(result.status).toBe("success");
    expect(mockAppleMailScan).toHaveBeenCalledTimes(1);
    expect(mockAppleMailScan).toHaveBeenCalledWith(sampleRequest());
  });

  test("EMAIL-002: config with provider: google → returns stub error with #65 reference", async () => {
    const configFile = tmpConfigFile(
      "# Email Configuration\n\nprovider: google\naccount_name: Work\n"
    );

    const result = await scanEmail(sampleRequest(), undefined, configFile);

    expect(result.status).toBe("error");
    expect(result.reason).toMatch(/not yet implemented/);
    expect(result.reason).toMatch(/#65/);
    expect(result.messages).toEqual([]);
    // apple-mail adapter should NOT have been called
    expect(mockAppleMailScan).not.toHaveBeenCalled();
  });

  test("EMAIL-003: config with provider: apple-mail → routes to apple-mail adapter with correct request", async () => {
    const configFile = tmpConfigFile(
      "# Email Configuration\n\nprovider: apple-mail\naccount_name: Work\n"
    );
    const req = sampleRequest();

    const result = await scanEmail(req, undefined, configFile);

    expect(result.status).toBe("success");
    expect(mockAppleMailScan).toHaveBeenCalledTimes(1);
    expect(mockAppleMailScan).toHaveBeenCalledWith(req);
  });

  test("EMAIL-004: providerOverride wins over config file", async () => {
    // Config says google, but override says apple-mail
    const configFile = tmpConfigFile(
      "# Email Configuration\n\nprovider: google\naccount_name: Work\n"
    );

    const result = await scanEmail(sampleRequest(), "apple-mail", configFile);

    expect(result.status).toBe("success");
    expect(mockAppleMailScan).toHaveBeenCalledTimes(1);
  });

  test("EMAIL-005: unknown provider name → returns error result with provider name in reason", async () => {
    const result = await scanEmail(sampleRequest(), "imap-generic");

    expect(result.status).toBe("error");
    expect(result.reason).toMatch(/imap-generic/);
    expect(result.messages).toEqual([]);
    expect(mockAppleMailScan).not.toHaveBeenCalled();
  });

  test("EMAIL-006: case-insensitive provider matching — provider: Apple-Mail works", async () => {
    const configFile = tmpConfigFile(
      "# Email Configuration\n\nprovider: Apple-Mail\naccount_name: Work\n"
    );

    const result = await scanEmail(sampleRequest(), undefined, configFile);

    expect(result.status).toBe("success");
    expect(mockAppleMailScan).toHaveBeenCalledTimes(1);
  });

  test("EMAIL-007: readProviderFromConfig returns apple-mail for a config with only account_name and inbox_name", () => {
    const configFile = tmpConfigFile(
      "# Email Configuration\n\naccount_name: My Work Account\ninbox_name: INBOX\n"
    );

    const provider = readProviderFromConfig(configFile);

    expect(provider).toBe("apple-mail");
  });
});
