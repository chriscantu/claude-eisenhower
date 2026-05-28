/**
 * email-scan.ts
 *
 * Single dispatcher for email-source adapters. Commands and skills call
 * into this module — they never reach into adapter internals.
 *
 * Responsibilities:
 *   - Maintain a registry of EmailSourceAdapter implementations keyed by
 *     name (default: "apple-mail", stub: "google")
 *   - Resolve the active provider from `config/email-config.md` (the
 *     `provider:` field) when no override is passed
 *   - Dispatch `scan` calls to the named adapter
 *   - Expose a CLI entry point so command prompts can
 *     `node email-scan.ts scan <account> <inbox> <since> <unread_only> <max_messages>`
 *     without spawning ts-node
 *
 * SOLID:
 *   - SRP: dispatch only; no I/O beyond config read + CLI arg parsing
 *   - OCP: register additional adapters without touching this file
 *   - DI:  adapter registry is in-process state, swappable per-call
 *
 * Issue: #67
 */

import * as fs from "fs";
import * as path from "path";

import type {
  EmailScanRequest,
  EmailScanResult,
  EmailSourceAdapter,
  ListMailboxesResult,
} from "./adapter-types";
import { createAppleMailAdapter } from "./adapters/email/apple-mail";
import { createGoogleGmailAdapter } from "./adapters/email/google";

export type { EmailSourceAdapter };

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, EmailSourceAdapter>();

/** Register an adapter by name. Replaces any existing registration. */
export function registerAdapter(adapter: EmailSourceAdapter): void {
  registry.set(adapter.name, adapter);
}

/** Currently registered adapter names. */
export function listRegisteredAdapters(): string[] {
  return [...registry.keys()];
}

/** Test-only registry reset. */
export function resetRegistryForTests(): void {
  registry.clear();
}

// ---------------------------------------------------------------------------
// Bootstrap — register built-in adapters on module load
// ---------------------------------------------------------------------------

registerAdapter({
  name: "apple-mail",
  scan: async (req: EmailScanRequest): Promise<EmailScanResult> =>
    createAppleMailAdapter().scan(req),
  listMailboxes: async (account: string): Promise<ListMailboxesResult> =>
    createAppleMailAdapter().listMailboxes(account),
});

registerAdapter(createGoogleGmailAdapter());

// ---------------------------------------------------------------------------
// Config reader
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG_PATH = process.env["CLAUDE_PLUGIN_ROOT"]
  ? path.join(process.env["CLAUDE_PLUGIN_ROOT"], "config", "email-config.md")
  : path.join(__dirname, "..", "config", "email-config.md");

/**
 * Parse `provider:` from the given config file.
 *
 * Returns "apple-mail" when:
 *   - the file does not exist (backward compat)
 *   - the file exists but has no `provider:` line
 *
 * Provider names are normalized to lowercase.
 */
export function readProviderFromConfig(configPath: string): string {
  if (!fs.existsSync(configPath)) return "apple-mail";
  const raw = fs.readFileSync(configPath, "utf-8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*provider:\s*(.+?)\s*$/);
    if (m) {
      const value = m[1].trim().toLowerCase();
      if (value.length > 0) return value;
    }
  }
  return "apple-mail";
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Read config, resolve adapter, dispatch scan.
 *
 * @param req              Email scan parameters.
 * @param providerOverride When provided, bypasses config lookup entirely.
 * @param configPath       Path to email-config.md. Defaults to
 *                         `config/email-config.md` relative to plugin root.
 */
export async function scanEmail(
  req: EmailScanRequest,
  providerOverride?: string,
  configPath?: string
): Promise<EmailScanResult> {
  const resolvedConfigPath = configPath ?? DEFAULT_CONFIG_PATH;
  const provider =
    providerOverride ?? readProviderFromConfig(resolvedConfigPath);

  const adapter = registry.get(provider);
  if (!adapter) {
    return {
      status: "error",
      reason: `Unknown email provider: ${provider}`,
      messages: [],
    };
  }

  try {
    return await adapter.scan(req);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", reason: message, messages: [] };
  }
}

/**
 * Read config, resolve adapter, dispatch listMailboxes.
 *
 * Adapters whose underlying provider does not expose a mailbox-listing
 * surface (the optional `listMailboxes` field on EmailSourceAdapter) return
 * an error result naming the provider so callers can degrade rather than
 * crash.
 *
 * @param account           Provider-specific account identifier.
 * @param providerOverride  When provided, bypasses config lookup entirely.
 * @param configPath        Path to email-config.md. Defaults to
 *                          `config/email-config.md` relative to plugin root.
 */
export async function listMailboxes(
  account: string,
  providerOverride?: string,
  configPath?: string
): Promise<ListMailboxesResult> {
  const resolvedConfigPath = configPath ?? DEFAULT_CONFIG_PATH;
  const provider =
    providerOverride ?? readProviderFromConfig(resolvedConfigPath);

  const adapter = registry.get(provider);
  if (!adapter) {
    return {
      status: "error",
      reason: `Unknown email provider: ${provider}`,
      mailboxes: [],
    };
  }

  if (!adapter.listMailboxes) {
    return {
      status: "error",
      reason: `Provider '${provider}' does not support listMailboxes`,
      mailboxes: [],
    };
  }

  try {
    return await adapter.listMailboxes(account);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", reason: message, mailboxes: [] };
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
//
// Usage (called from command prompts via node):
//   node email-scan.ts scan <account> <inbox> <since> <unread_only> <max_messages>
//   node email-scan.ts list-mailboxes <account>
//
// Result is printed to stdout as a single-line JSON object so the calling
// prompt can parse it deterministically.

interface CliScanOk {
  ok: true;
  result: EmailScanResult;
}
interface CliListMailboxesOk {
  ok: true;
  result: ListMailboxesResult;
}
interface CliErr {
  ok: false;
  error: string;
}
type CliOutput = CliScanOk | CliListMailboxesOk | CliErr;

async function runScanCli(argv: string[]): Promise<CliOutput> {
  const [, , , account, inbox, since, unreadOnlyStr, maxMessagesStr] = argv;

  if (!account || !inbox || !since || !unreadOnlyStr || !maxMessagesStr) {
    return {
      ok: false,
      error:
        "Usage: email-scan.ts scan <account> <inbox> <since> <unread_only> <max_messages>",
    };
  }

  const unread_only = unreadOnlyStr === "true";
  const max_messages = Number(maxMessagesStr);
  if (!Number.isFinite(max_messages) || max_messages < 0) {
    return {
      ok: false,
      error: `Invalid max_messages '${maxMessagesStr}'. Must be a non-negative integer.`,
    };
  }

  const req: EmailScanRequest = {
    account,
    inbox,
    since,
    unread_only,
    max_messages,
  };

  try {
    const result = await scanEmail(req);
    return { ok: true, result };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runListMailboxesCli(argv: string[]): Promise<CliOutput> {
  const [, , , account] = argv;
  if (!account) {
    return {
      ok: false,
      error: "Usage: email-scan.ts list-mailboxes <account>",
    };
  }
  try {
    const result = await listMailboxes(account);
    return { ok: true, result };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runCli(argv: string[]): Promise<CliOutput> {
  const mode = argv[2];

  if (mode === "scan") {
    return runScanCli(argv);
  }
  if (mode === "list-mailboxes") {
    return runListMailboxesCli(argv);
  }
  return {
    ok: false,
    error: `Unknown mode '${mode ?? ""}'. Use 'scan' or 'list-mailboxes'.`,
  };
}

if (require.main === module) {
  runCli(process.argv).then((out) => {
    process.stdout.write(JSON.stringify(out) + "\n");
    process.exit(out.ok ? 0 : 1);
  });
}
