/**
 * adapter-types.ts
 *
 * Machine-checkable TypeScript interfaces for all adapter contracts:
 * task-output, calendar-source, and email-source.
 * Formalizes the prose specs in adapters/README.md and the per-family
 * READMEs under scripts/adapters/.
 *
 * These types are the single source of truth for adapter shapes —
 * implementations are validated against them at compile time.
 *
 * Note: Q4 is intentionally absent from the quadrant union — /schedule never
 * pushes Q4 tasks to any external system (they are eliminated, not scheduled).
 */

/** Input passed to every adapter by /schedule before pushing a task. */
export interface TaskOutputRecord {
  /** Short action-oriented label. Max 10 words. Q3 tasks are prefixed: "Check in: [delegate] re: [title]". */
  title: string;
  /** Full task description including context for the assignee. */
  description: string;
  /** ISO date (YYYY-MM-DD). Q1 = today, Q2 = focus block date, Q3 = 3–5 business days. Null if unset. */
  due_date: string | null;
  /** Eisenhower quadrant. Q4 tasks are dropped before adapter call — this union is intentionally Q1–Q3 only. */
  quadrant: "Q1" | "Q2" | "Q3";
  /** Q1 = "high", Q2/Q3 = "medium". */
  priority: "high" | "medium";
  /** Where this task originated, e.g. "Email (Procore)" or "Meeting". */
  source: string;
  /** Person who requested the task (alias). Null if self-generated. */
  requester: string | null;
  /** Target list or project name in the external system, e.g. "Eisenhower List". */
  list_name: string;
}

/** Output returned by every adapter after attempting to push a task. */
export interface PushResult {
  /** Outcome of the push attempt. */
  status: "success" | "skipped" | "error";
  /**
   * Human-readable explanation.
   * Examples: "Created", "Already exists", "Permission denied".
   */
  reason: string;
  /**
   * External system identifier for the created record.
   * Empty string ("") when no record was created (skipped or error).
   * Examples: Reminder x-coredata URI, Jira ticket key, Asana task GID.
   */
  id: string;
}

/** Output returned by every adapter after attempting to complete a task. */
export interface CompleteResult {
  /** Outcome of the complete attempt. */
  status: "success" | "skipped" | "error";
  /**
   * Human-readable explanation.
   * Examples: "Completed", "Not found", "Already completed".
   */
  reason: string;
}

/**
 * The contract every adapter implementation must satisfy.
 *
 * Adapters own their own I/O (AppleScript, file writes, REST calls, …).
 * The dispatcher (`task-output.ts`) only knows about this interface — it
 * never reaches into any adapter's internals. This is the seam that makes
 * adapters swappable.
 */
export interface TaskOutputAdapter {
  /** Stable name matching the value in `config/task-output-config.md ## Active Adapter`. */
  readonly name: string;
  /**
   * Push a single task to the external system.
   * Adapters MUST be idempotent — repeated pushes of the same logical record
   * should return `skipped` rather than creating duplicates.
   */
  pushTask(record: TaskOutputRecord): Promise<PushResult>;
  /**
   * Mark a task complete in the external system.
   *
   * Lookup precedence:
   *   1. If `externalId` is provided and the adapter supports id-based lookup,
   *      match by id. This is the stable path: id survives title changes
   *      (Q3 re-delegation, user renames) which would otherwise orphan the
   *      external record.
   *   2. Fallback to title match scoped by `list_name`. For Q3 tasks the
   *      title is the prefixed form ("Check in: [alias] re: …") matching
   *      what was pushed.
   *
   * `externalId` is the value returned in `PushResult.id` at push time —
   * persisted to TASKS.md as `Reminder-id:` (Reminders adapter) and looked
   * up here. Adapters that don't support id-based lookup (e.g.
   * markdown-file) ignore the parameter and fall through to title match.
   */
  completeTask(
    title: string,
    list_name: string,
    externalId?: string
  ): Promise<CompleteResult>;
}

// ---------------------------------------------------------------------------
// Calendar-source adapter contract
//
// Used by calendar-query dispatchers and adapter implementations under
// scripts/adapters/calendar/*. Mirrors the cal_query.swift surface area so
// that both the Mac-native and future Google Calendar adapters bind to the
// same request/result shapes.
// ---------------------------------------------------------------------------

/** Parameters passed to a calendar-source adapter to retrieve events. */
export interface CalendarQueryRequest {
  /** Calendar to query. Value is provider-specific (e.g. Mac Calendar display name). */
  calendar_name: string;
  /** Query window: now → now + N days (inclusive). */
  days_ahead: number;
  /**
   * Output shape.
   * - "full" → CalendarQueryResult.events populated with one entry per event in the window
   * - "summary" → business-day availability bullets returned in CalendarQueryResult.reason;
   *               events may be empty
   */
  format: "full" | "summary";
}

/** A single calendar event returned by a calendar-source adapter. */
export interface CalendarEvent {
  /** Event title / summary as stored in the calendar. */
  title: string;
  /** Start datetime in ISO 8601 format, including timezone offset or Z (e.g. 2026-05-28T09:00:00-07:00). */
  start: string;
  /** End datetime in ISO 8601 format, including timezone offset or Z. */
  end: string;
  /** True when the event occupies an entire day (no specific start/end time). */
  all_day: boolean;
}

/** Output returned by a calendar-source adapter after a query attempt. */
export interface CalendarQueryResult {
  /** Outcome of the query. */
  status: "success" | "error";
  /**
   * Human-readable explanation.
   * Examples: "OK", "Permission denied", "Calendar not found".
   */
  reason: string;
  /**
   * Events within the requested window, ordered by start time ascending.
   * Empty array when status="error" OR the window contains no events.
   */
  events: CalendarEvent[];
}

// ---------------------------------------------------------------------------
// Email-source adapter contract
//
// Used by email-scan dispatchers and adapter implementations under
// scripts/adapters/email/*. Covers both Apple Mail (account = display name,
// inbox = mailbox name) and Gmail (account = email address, inbox = label).
// ---------------------------------------------------------------------------

/** Parameters passed to an email-source adapter to scan a mailbox. */
export interface EmailScanRequest {
  /**
   * Account name — provider-specific.
   * Apple Mail: account display name as shown in Mail.app.
   * Gmail: account email address (e.g. user@gmail.com).
   */
  account: string;
  /**
   * Mailbox or label name to scan.
   * Apple Mail: mailbox name (e.g. "INBOX").
   * Gmail: label name; use "INBOX" for the default inbox.
   */
  inbox: string;
  /**
   * Inclusive lower bound on received_at, as an ISO date (YYYY-MM-DD).
   * Messages received before this date are excluded.
   */
  since: string;
  /** When true, only unread messages are returned. */
  unread_only: boolean;
  /**
   * Maximum number of messages to return.
   * Adapters MUST honor this cap — callers rely on it for bounded output.
   */
  max_messages: number;
}

/** A single email message returned by an email-source adapter. */
export interface EmailMessage {
  /**
   * Provider-specific stable message identifier.
   * Apple Mail: message id as surfaced by the Mail.app scripting bridge.
   * Gmail: Gmail message id (not thread id).
   */
  id: string;
  /** Sender address in RFC 5322 format, e.g. `"Alice Smith" <alice@example.com>`. */
  from: string;
  /** Message subject line. */
  subject: string;
  /** Time the message was received, in ISO 8601 format including timezone offset or Z. */
  received_at: string;
  /** Short preview of the message body, ≤200 characters. */
  snippet: string;
  /**
   * Full plain-text body of the message.
   * Adapters are responsible for stripping HTML before populating this field.
   */
  body_text: string;
  /**
   * Provider-specific thread identifier grouping related messages.
   * Empty string ("") when the provider has no thread concept (e.g. Apple Mail).
   */
  thread_id: string;
}

/** Output returned by an email-source adapter after a scan attempt. */
export interface EmailScanResult {
  /** Outcome of the scan. */
  status: "success" | "error";
  /**
   * Human-readable explanation.
   * Examples: "OK", "Permission denied", "Account not found".
   */
  reason: string;
  /**
   * Messages matching the request, ordered by received_at descending (newest first).
   * Empty array when status="error" OR no messages matched the filter criteria.
   */
  messages: EmailMessage[];
}

/** Output returned by an email-source adapter after a listMailboxes attempt. */
export interface ListMailboxesResult {
  /** Outcome of the lookup. */
  status: "success" | "error";
  /**
   * Human-readable explanation.
   * Examples: "OK", "Account not found", "Permission denied".
   */
  reason: string;
  /**
   * Mailbox / label names found under the named account.
   * Empty array when status="error" OR the account exposes no mailboxes.
   */
  mailboxes: string[];
}

// ---------------------------------------------------------------------------
// Dispatcher adapter interfaces
//
// These are the contracts that adapter implementations must satisfy.
// Registered with the calendar-query and email-scan dispatchers respectively.
// Mirrors the TaskOutputAdapter pattern above — single source of truth lives
// here, dispatchers import rather than define.
// ---------------------------------------------------------------------------

/**
 * Calendar-source adapter contract. Implemented by adapters/calendar/*.ts and
 * registered with the calendar-query dispatcher.
 */
export interface CalendarSourceAdapter {
  /** Provider name (e.g., "eventkit", "google"). Matches config `provider:`. */
  name: string;
  query(req: CalendarQueryRequest): Promise<CalendarQueryResult>;
}

/**
 * Email-source adapter contract. Implemented by adapters/email/*.ts and
 * registered with the email-scan dispatcher.
 *
 * `listMailboxes` is optional — adapters whose underlying provider does not
 * expose a separate mailbox-listing surface (e.g. stubs, or providers where
 * mailboxes are implicit) may omit it. Callers MUST handle absence.
 */
export interface EmailSourceAdapter {
  /** Provider name (e.g., "apple-mail", "google"). Matches config `provider:`. */
  name: string;
  scan(req: EmailScanRequest): Promise<EmailScanResult>;
  /**
   * Enumerate mailbox / label names under the named account.
   * Apple Mail: returns mailbox display names. Gmail: returns label names.
   */
  listMailboxes?(account: string): Promise<ListMailboxesResult>;
}
