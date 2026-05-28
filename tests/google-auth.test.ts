/**
 * google-auth.test.ts
 *
 * Behavioral tests for scripts/google-auth.ts — the shared Google OAuth2 module.
 *
 * Strategy:
 *   - Mock `googleapis` so no network calls are made.
 *   - Use real fs against tmp dirs (mkdtempSync) for token/credentials files so
 *     persistence behavior is verified without mocking fs.
 *   - The loopback server flow is tested via the injected `codeProvider` callback
 *     accepted by runInitialAuthFlow (second arg).
 *   - In-process cache is reset between tests via _resetCacheForTesting() rather
 *     than jest.resetModules(), so the googleapis mock stays registered.
 *
 * Test IDs: GAUTH-NNN
 *
 * Issue: #67
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ── googleapis mock ───────────────────────────────────────────────────────────
// Must be set up BEFORE the module under test is imported.
// Mocks three methods on the OAuth2 client instance:
//   generateAuthUrl     → returns a deterministic URL string
//   getToken            → returns a fake token exchange result
//   refreshAccessToken  → returns a refreshed token

const mockGenerateAuthUrl = jest.fn().mockReturnValue("https://accounts.google.com/mock-auth-url");
const mockGetToken = jest.fn();
const mockRefreshAccessToken = jest.fn();
const mockSetCredentials = jest.fn();

const MockOAuth2 = jest.fn().mockImplementation(() => ({
  generateAuthUrl: mockGenerateAuthUrl,
  getToken: mockGetToken,
  refreshAccessToken: mockRefreshAccessToken,
  setCredentials: mockSetCredentials,
}));

jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: MockOAuth2,
    },
  },
}));

// ── import module under test ──────────────────────────────────────────────────
// Imported once; in-process cache reset via _resetCacheForTesting() per test.

import {
  getAccessToken,
  runInitialAuthFlow,
  _resetCacheForTesting,
  type GoogleAuthConfig,
} from "../scripts/google-auth";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gauth-test-"));
}

/** Standard Google Cloud Console `installed` credentials shape */
function writeInstalledCredentials(dir: string): string {
  const p = path.join(dir, "client_secret.json");
  fs.writeFileSync(
    p,
    JSON.stringify({
      installed: {
        client_id: "mock-client-id",
        client_secret: "mock-client-secret",
        redirect_uris: ["urn:ietf:wg:oauth:2.0:oob"],
      },
    })
  );
  return p;
}

/** Google Cloud Console `web` credentials shape */
function writeWebCredentials(dir: string): string {
  const p = path.join(dir, "client_secret.json");
  fs.writeFileSync(
    p,
    JSON.stringify({
      web: {
        client_id: "web-client-id",
        client_secret: "web-client-secret",
        redirect_uris: ["http://localhost"],
      },
    })
  );
  return p;
}

/**
 * Write a token file with a refresh token and given expiry.
 * Includes cached_token so getAccessToken can return without a network call.
 */
function writeTokenFile(
  tokenPath: string,
  opts: { scopes: string[]; expires_at?: string }
): void {
  const expires_at = opts.expires_at ?? new Date(Date.now() + 3600 * 1000).toISOString();
  fs.writeFileSync(
    tokenPath,
    JSON.stringify({
      refresh_token: "mock-refresh-token",
      scopes: opts.scopes,
      created_at: new Date().toISOString(),
      cached_token: "mock-cached-token",
      expires_at,
    }),
    { mode: 0o600 }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  _resetCacheForTesting();
  // Restore generateAuthUrl default after clearAllMocks resets it
  mockGenerateAuthUrl.mockReturnValue("https://accounts.google.com/mock-auth-url");
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("getAccessToken", () => {
  test("GAUTH-001: returns cached token when expires_at is far in the future", async () => {
    const dir = makeTmpDir();
    try {
      const credPath = writeInstalledCredentials(dir);
      const tokenPath = path.join(dir, "token.json");
      const farFuture = new Date(Date.now() + 7200 * 1000).toISOString(); // 2 hours out
      writeTokenFile(tokenPath, {
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        expires_at: farFuture,
      });

      const cfg: GoogleAuthConfig = {
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        credentials_path: credPath,
        token_path: tokenPath,
      };

      const result = await getAccessToken(cfg);

      // Token from disk is fresh — no refresh call expected
      expect(result.token).toBe("mock-cached-token");
      expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("GAUTH-002: refreshes token when expires_at is within 60 seconds of now", async () => {
    const dir = makeTmpDir();
    try {
      const credPath = writeInstalledCredentials(dir);
      const tokenPath = path.join(dir, "token.json");
      // Expires in 30 seconds — inside the 60 s refresh window
      const soonExpiry = new Date(Date.now() + 30 * 1000).toISOString();
      writeTokenFile(tokenPath, {
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        expires_at: soonExpiry,
      });

      const newExpiry = Date.now() + 3600 * 1000;
      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: "fresh-access-token",
          expiry_date: newExpiry,
        },
      });

      const cfg: GoogleAuthConfig = {
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        credentials_path: credPath,
        token_path: tokenPath,
      };

      const result = await getAccessToken(cfg);

      expect(result.token).toBe("fresh-access-token");
      expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("GAUTH-003: throws when cfg.scopes requests a scope not in persisted token file", async () => {
    const dir = makeTmpDir();
    try {
      const credPath = writeInstalledCredentials(dir);
      const tokenPath = path.join(dir, "token.json");
      writeTokenFile(tokenPath, {
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      });

      const cfg: GoogleAuthConfig = {
        scopes: [
          "https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/gmail.readonly", // NOT in persisted scopes
        ],
        credentials_path: credPath,
        token_path: tokenPath,
      };

      await expect(getAccessToken(cfg)).rejects.toThrow(/runInitialAuthFlow/);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("GAUTH-004: parses credentials_path with `installed` shape", async () => {
    const dir = makeTmpDir();
    try {
      const credPath = writeInstalledCredentials(dir);
      const tokenPath = path.join(dir, "token.json");
      // Expire within 30 s so the code path calls makeOAuth2Client (for refresh)
      writeTokenFile(tokenPath, {
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        expires_at: new Date(Date.now() + 30 * 1000).toISOString(),
      });

      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: "access-token",
          expiry_date: Date.now() + 3600 * 1000,
        },
      });

      const cfg: GoogleAuthConfig = {
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        credentials_path: credPath,
        token_path: tokenPath,
      };

      await getAccessToken(cfg);

      // OAuth2 constructor must have received the client_id from the `installed` key
      expect(MockOAuth2).toHaveBeenCalledWith(
        "mock-client-id",
        "mock-client-secret",
        expect.any(String)
      );
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("GAUTH-005: parses credentials_path with `web` shape", async () => {
    const dir = makeTmpDir();
    try {
      const credPath = writeWebCredentials(dir);
      const tokenPath = path.join(dir, "token.json");
      writeTokenFile(tokenPath, {
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        expires_at: new Date(Date.now() + 30 * 1000).toISOString(),
      });

      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: "access-token",
          expiry_date: Date.now() + 3600 * 1000,
        },
      });

      const cfg: GoogleAuthConfig = {
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        credentials_path: credPath,
        token_path: tokenPath,
      };

      await getAccessToken(cfg);

      expect(MockOAuth2).toHaveBeenCalledWith(
        "web-client-id",
        "web-client-secret",
        expect.any(String)
      );
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("GAUTH-006: throws clear error naming the file when credentials_path has neither shape", async () => {
    const dir = makeTmpDir();
    try {
      const credPath = path.join(dir, "client_secret.json");
      fs.writeFileSync(credPath, JSON.stringify({ unknown_key: {} }));

      const tokenPath = path.join(dir, "token.json");
      // Expire soon so the code path reads credentials
      writeTokenFile(tokenPath, {
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        expires_at: new Date(Date.now() + 30 * 1000).toISOString(),
      });

      const cfg: GoogleAuthConfig = {
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        credentials_path: credPath,
        token_path: tokenPath,
      };

      await expect(getAccessToken(cfg)).rejects.toThrow(credPath);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

describe("runInitialAuthFlow", () => {
  test("GAUTH-007: rewrites token file with mode 0600 and persists refresh_token + scopes", async () => {
    const dir = makeTmpDir();
    try {
      const credPath = writeInstalledCredentials(dir);
      const tokenPath = path.join(dir, "token.json");

      mockGetToken.mockResolvedValue({
        tokens: {
          refresh_token: "new-refresh-token",
          access_token: "new-access-token",
          expiry_date: Date.now() + 3600 * 1000,
        },
      });

      const cfg: GoogleAuthConfig = {
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        credentials_path: credPath,
        token_path: tokenPath,
      };

      // Inject a synthetic code provider — no real browser or loopback server
      await runInitialAuthFlow(cfg, async (_url: string) => "mock-auth-code");

      expect(fs.existsSync(tokenPath)).toBe(true);

      // Verify permission bits (mask to lower 9 bits)
      const stat = fs.statSync(tokenPath);
      const perm = stat.mode & 0o777;
      expect(perm).toBe(0o600);

      // Verify content
      const stored = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
      expect(stored.refresh_token).toBe("new-refresh-token");
      expect(stored.scopes).toEqual(["https://www.googleapis.com/auth/calendar.readonly"]);
      expect(typeof stored.created_at).toBe("string");
      expect(() => new Date(stored.created_at)).not.toThrow();
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("GAUTH-008: runInitialAuthFlow invalidates the in-process cache", async () => {
    const dir = makeTmpDir();
    try {
      const credPath = writeInstalledCredentials(dir);
      const tokenPath = path.join(dir, "token.json");

      // Step 1: Seed disk + in-process cache with old refresh token
      const farFuture = new Date(Date.now() + 7200 * 1000).toISOString();
      writeTokenFile(tokenPath, {
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        expires_at: farFuture,
      });

      const cfg: GoogleAuthConfig = {
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        credentials_path: credPath,
        token_path: tokenPath,
      };

      // Step 2: Warm the in-process cache with old token
      const oldResult = await getAccessToken(cfg);
      expect(oldResult.token).toBe("mock-cached-token");

      // Step 3: Run initial auth flow with a new authorization code that
      // resolves to a new refresh + access token
      const newExpiryDate = Date.now() + 3600 * 1000;
      mockGetToken.mockResolvedValue({
        tokens: {
          refresh_token: "new-refresh-token",
          access_token: "new-access-token",
          expiry_date: newExpiryDate,
        },
      });

      await runInitialAuthFlow(cfg, async (_url: string) => "mock-auth-code-new");

      // Step 4: Next getAccessToken should return the NEW access token
      // (cache was invalidated by runInitialAuthFlow; disk has fresh token)
      const newResult = await getAccessToken(cfg);
      expect(newResult.token).toBe("new-access-token");
      expect(newResult.token).not.toBe("mock-cached-token");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});
