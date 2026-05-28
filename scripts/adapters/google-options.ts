/**
 * google-options.ts — Shared options shape for Google adapters.
 *
 * One Options convention across Calendar, Gmail, and Tasks. Before this
 * type existed, each adapter shipped its own `*Config` / `*Options` /
 * `*AdapterConfig` shape with inconsistent casing and grouping (issue #76).
 *
 * Conventions enforced here:
 *   - Suffix: `*Options`
 *   - Casing: `snake_case` everywhere (matches config-file key casing and
 *     GoogleAuthConfig's existing `credentials_path` / `token_path`)
 *   - All Google adapter factories accept `GoogleAdapterOptions<TClient> = {}`
 *
 * Adapter-specific options extend this base with their own fields.
 *
 * Issue: #76
 */

import type { GoogleAuthConfig } from "../google-auth";

/**
 * Shared option shape. `TClient` is the adapter's SDK client type
 * (`calendar_v3.Calendar`, `gmail_v1.Gmail`, `tasks_v1.Tasks`, etc.).
 */
export interface GoogleAdapterOptions<TClient> {
  /**
   * Absolute path to the family-specific config md file
   * (`calendar-config.md`, `email-config.md`, `task-output-config.md`).
   * When omitted, defaults to `${CLAUDE_PLUGIN_ROOT}/config/<family>.md`.
   */
  config_path?: string;

  /**
   * Inline credentials override. When supplied, skips reading the config
   * file's `google_credentials_path` / `google_token_path` fields. `scopes`
   * is owned by the adapter and is always forced to the adapter's
   * read-only/read-write scope — that's why it's omitted from the public
   * shape.
   */
  auth?: Omit<GoogleAuthConfig, "scopes">;

  /**
   * Test-only override of the access-token loader. Production code uses
   * the default, which delegates to `getAccessToken`. Tests inject a stub
   * that returns a fixed token without touching disk or network.
   */
  access_token_loader?: (cfg: GoogleAuthConfig) => Promise<string>;

  /**
   * Test-only override of the SDK client factory. Production code uses the
   * default, which composes `buildAuthedClient` with `google.<family>()`.
   * Tests inject a stub that returns a mocked client.
   */
  client_factory?: (accessToken: string) => TClient;
}
