/**
 * google.test.ts
 *
 * Unit tests for the Gmail stub adapter
 * (scripts/adapters/email/google.ts).
 *
 * Test IDs:
 *   GOOGLEEMAIL-001 — createGoogleGmailAdapter().scan throws with "#65" in the message
 *
 * Issue: #67
 */

import { createGoogleGmailAdapter } from "../../../scripts/adapters/email/google";
import type { EmailScanRequest } from "../../../scripts/adapter-types";

function sampleRequest(): EmailScanRequest {
  return {
    account: "user@gmail.com",
    inbox: "INBOX",
    since: "2026-05-01",
    unread_only: true,
    max_messages: 20,
  };
}

describe("Gmail stub adapter", () => {
  test("GOOGLEEMAIL-001: scan() throws with '#65' and the GitHub issue URL in the message", async () => {
    const adapter = createGoogleGmailAdapter();

    await expect(adapter.scan(sampleRequest())).rejects.toThrow("#65");
    await expect(adapter.scan(sampleRequest())).rejects.toThrow(
      "https://github.com/chriscantu/claude-eisenhower/issues/65"
    );
  });
});
