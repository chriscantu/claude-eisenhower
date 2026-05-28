/**
 * adapter-types.ts
 *
 * Machine-checkable TypeScript interfaces for the task-output adapter contract.
 * Formalizes the prose spec in adapters/README.md.
 *
 * Every adapter (reminders, markdown-file, asana, jira, linear, …) receives a
 * TaskOutputRecord and must return a PushResult for push, and a CompleteResult
 * for completion. These types are the single source of truth for that contract
 * — adapters are validated against them at compile time.
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
