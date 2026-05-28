/**
 * google.ts — Gmail adapter (STUB).
 *
 * Real implementation lands in issue #65 (https://github.com/chriscantu/claude-eisenhower/issues/65).
 * Shares OAuth refresh-token flow via scripts/google-auth.ts.
 *
 * Until #65 ships, calling scan() throws a descriptive error pointing at the
 * tracking issue so installs configured with `provider: google` fail loudly,
 * not silently.
 */

import type { EmailScanRequest, EmailScanResult } from "../../adapter-types";

export interface GoogleGmailAdapter {
  name: "google";
  scan(req: EmailScanRequest): Promise<EmailScanResult>;
}

export function createGoogleGmailAdapter(): GoogleGmailAdapter {
  return {
    name: "google",
    async scan(_req) {
      throw new Error(
        "Gmail adapter not yet implemented — see #65 (https://github.com/chriscantu/claude-eisenhower/issues/65)",
      );
    },
  };
}
