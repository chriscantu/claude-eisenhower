/**
 * google-auth.ts
 *
 * Shared Google OAuth2 lifecycle module. Used by calendar, Gmail, and Tasks
 * adapters. Owns credentials parsing, token persistence, refresh, and the
 * initial loopback auth flow.
 *
 * Issue: #67
 */

import * as fs from "fs";
import * as http from "http";
import { randomBytes } from "node:crypto";
import { google } from "googleapis";

// ── Public types ──────────────────────────────────────────────────────────────

export interface GoogleAuthConfig {
  /** OAuth scope URIs, e.g. ["https://www.googleapis.com/auth/calendar.readonly"] */
  scopes: string[];
  /** Absolute path to client_secret.json downloaded from Google Cloud Console (gitignored) */
  credentials_path: string;
  /** Absolute path where refresh_token.json is persisted (gitignored) */
  token_path: string;
}

export interface AccessToken {
  /** Bearer access token */
  token: string;
  /** ISO 8601 expiry timestamp */
  expires_at: string;
}

// ── Internal types ────────────────────────────────────────────────────────────

interface CredentialsShape {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
}

interface CredentialsFile {
  installed?: CredentialsShape;
  web?: CredentialsShape;
}

interface PersistedToken {
  refresh_token: string;
  scopes: string[];
  created_at: string;
  cached_token?: string;
  expires_at?: string;
}

// ── In-process token cache ────────────────────────────────────────────────────

let _cache: AccessToken | null = null;

/** Reset the in-process cache. Exported for testing only — do not call in production. */
/* istanbul ignore next */
export function _resetCacheForTesting(): void {
  _cache = null;
}

/** Seconds before expiry at which we proactively refresh */
const REFRESH_BUFFER_SECONDS = 60;

// ── Private helpers ───────────────────────────────────────────────────────────

function loadCredentials(credentialsPath: string): CredentialsShape {
  const raw = fs.readFileSync(credentialsPath, "utf-8");
  const parsed = JSON.parse(raw) as CredentialsFile;
  const shape = parsed.installed ?? parsed.web;
  if (!shape) {
    throw new Error(
      `credentials_path "${credentialsPath}" must contain an "installed" or "web" key. ` +
        `Download a fresh client_secret.json from the Google Cloud Console.`
    );
  }
  return shape;
}

function loadPersistedToken(tokenPath: string): PersistedToken | null {
  try {
    const raw = fs.readFileSync(tokenPath, "utf-8");
    return JSON.parse(raw) as PersistedToken;
  } catch {
    return null;
  }
}

function assertScopesCompatible(cfg: GoogleAuthConfig, persisted: PersistedToken): void {
  const missing = cfg.scopes.filter((s) => !persisted.scopes.includes(s));
  if (missing.length > 0) {
    throw new Error(
      `Token at "${cfg.token_path}" was issued for scopes:\n` +
        `  ${persisted.scopes.join(", ")}\n` +
        `but the following requested scopes are not covered:\n` +
        `  ${missing.join(", ")}\n` +
        `Call runInitialAuthFlow() with the expanded scopes to re-authorize.`
    );
  }
}

function isFresh(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  const expiryMs = new Date(expiresAt).getTime();
  return expiryMs - Date.now() > REFRESH_BUFFER_SECONDS * 1000;
}

function makeOAuth2Client(creds: CredentialsShape, redirectUri: string) {
  return new google.auth.OAuth2(creds.client_id, creds.client_secret, redirectUri);
}

function persistToken(
  tokenPath: string,
  refreshToken: string,
  scopes: string[],
  cachedToken?: string,
  expiresAt?: string
): void {
  const data: PersistedToken = {
    refresh_token: refreshToken,
    scopes,
    created_at: new Date().toISOString(),
    ...(cachedToken !== undefined && expiresAt !== undefined
      ? { cached_token: cachedToken, expires_at: expiresAt }
      : {}),
  };
  fs.writeFileSync(tokenPath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a valid access token. Performs initial auth flow if no refresh token
 * is present. Refreshes automatically when within 60 s of expiry.
 */
export async function getAccessToken(cfg: GoogleAuthConfig): Promise<AccessToken> {
  // Return in-process cache if still fresh
  if (_cache && isFresh(_cache.expires_at)) {
    return _cache;
  }

  const creds = loadCredentials(cfg.credentials_path);
  const persisted = loadPersistedToken(cfg.token_path);

  if (!persisted) {
    throw new Error(
      `No token found at "${cfg.token_path}". ` +
        `Run runInitialAuthFlow() to authorize first.`
    );
  }

  assertScopesCompatible(cfg, persisted);

  // Return cached token from disk if still fresh
  if (persisted.cached_token && isFresh(persisted.expires_at)) {
    const token: AccessToken = {
      token: persisted.cached_token,
      expires_at: persisted.expires_at!,
    };
    _cache = token;
    return token;
  }

  // Refresh via the OAuth2 client
  const client = makeOAuth2Client(creds, "http://127.0.0.1/oauth2callback");
  client.setCredentials({ refresh_token: persisted.refresh_token });

  const { credentials } = await client.refreshAccessToken();
  const accessToken = credentials.access_token;
  const expiryDate = credentials.expiry_date;

  if (!accessToken) {
    throw new Error("refreshAccessToken returned no access_token");
  }

  const expiresAt = expiryDate
    ? new Date(expiryDate).toISOString()
    : new Date(Date.now() + 3600 * 1000).toISOString();

  persistToken(cfg.token_path, persisted.refresh_token, persisted.scopes, accessToken, expiresAt);

  const token: AccessToken = { token: accessToken, expires_at: expiresAt };
  _cache = token;
  return token;
}

/**
 * Forces the initial auth flow, overwriting any existing refresh token.
 *
 * @param cfg - Auth configuration
 * @param codeProvider - Injectable callback that receives the auth URL and
 *   returns the authorization code. Defaults to a loopback HTTP server that
 *   captures the redirect. Pass a custom function in tests to avoid starting
 *   a real server.
 *
 *   NOTE: When `codeProvider` is injected (test / CLI path), the CSRF `state`
 *   parameter validation is bypassed because the caller supplies the code
 *   directly — there is no OAuth redirect to intercept.
 */
export async function runInitialAuthFlow(
  cfg: GoogleAuthConfig,
  codeProvider?: (authUrl: string) => Promise<string>
): Promise<void> {
  const creds = loadCredentials(cfg.credentials_path);

  // Generate a CSRF state nonce for the loopback flow
  const state = randomBytes(16).toString("hex");

  // Determine redirect URI — loopback unless codeProvider is injected (test mode)
  let redirectUri: string;
  let resolvedCodeProvider: (authUrl: string) => Promise<string>;

  if (codeProvider) {
    // Test / CLI injection: use a placeholder redirect URI; state validation bypassed
    redirectUri = "http://127.0.0.1/oauth2callback";
    resolvedCodeProvider = codeProvider;
  } else {
    // Production: bind an ephemeral loopback server to get the OS-assigned port
    const { port, provider } = await buildLoopbackProvider(state);
    redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
    resolvedCodeProvider = provider;
  }

  const client = makeOAuth2Client(creds, redirectUri);

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: cfg.scopes,
    redirect_uri: redirectUri,
    state,
  });

  process.stdout.write(`Open this URL in your browser to authorize:\n${authUrl}\n`);

  const code = await resolvedCodeProvider(authUrl);
  const { tokens } = await client.getToken(code);

  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    throw new Error(
      "No refresh_token in token exchange response. " +
        "Ensure access_type=offline and prompt=consent were set."
    );
  }

  // If the token exchange did not return an access_token, persist only the
  // refresh_token and skip caching. The next getAccessToken call will refresh.
  if (!tokens.access_token) {
    persistToken(cfg.token_path, refreshToken, cfg.scopes);
    _cache = null;
    return;
  }

  const expiryDate = tokens.expiry_date;
  const expiresAt = expiryDate
    ? new Date(expiryDate).toISOString()
    : new Date(Date.now() + 3600 * 1000).toISOString();

  persistToken(cfg.token_path, refreshToken, cfg.scopes, tokens.access_token, expiresAt);

  // Invalidate in-process cache so next getAccessToken reads fresh token
  _cache = null;
}

// ── Loopback server helper ────────────────────────────────────────────────────

interface LoopbackResult {
  port: number;
  provider: (authUrl: string) => Promise<string>;
}

async function buildLoopbackProvider(expectedState: string): Promise<LoopbackResult> {
  return new Promise((resolve, reject) => {
    let codeResolve: (code: string) => void;
    let codeReject: (err: Error) => void;

    const codePromise = new Promise<string>((res, rej) => {
      codeResolve = res;
      codeReject = rej;
    });

    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");

        // Validate CSRF state parameter
        const returnedState = url.searchParams.get("state");
        if (!returnedState || returnedState !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("OAuth callback rejected: state parameter mismatch (possible CSRF).");
          server.close();
          codeReject(
            new Error("OAuth callback rejected: state parameter mismatch (possible CSRF).")
          );
          return;
        }

        const code = url.searchParams.get("code");
        if (code) {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("Authorization complete. You may close this tab.");
          codeResolve(code);
          server.close();
        } else {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing code parameter.");
        }
      } catch (err) {
        try {
          res.writeHead(500);
          res.end("Internal error.");
        } catch {
          /* ignore */
        }
        server.close();
        codeReject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Could not determine ephemeral port for loopback server"));
        return;
      }
      const port = addr.port;
      const provider = (_authUrl: string): Promise<string> => codePromise;
      resolve({ port, provider });
    });

    server.on("error", (err) => {
      codeReject(err);
      reject(err);
    });
  });
}
