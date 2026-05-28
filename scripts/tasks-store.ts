/**
 * tasks-store.ts
 *
 * I/O + locking layer for TASKS.md. Pure parse / render lives in
 * `tasks-parser.ts`; this module owns:
 *
 *   - `readTasks(file)`         — read + parse, missing-file safe
 *   - `writeTasks(file, tasks)` — render + atomic write (tmpfile + fsync + rename)
 *   - `acquireLock` / `releaseLock` — advisory PID/timestamp lockfile with
 *     stale detection (>30s OR dead PID) and bounded retry/backoff
 *
 * SOLID:
 *   - SRP: parsing is parser's job; this file is filesystem + concurrency
 *   - DI:  pure helpers (`parseTasks`, `renderTasks`) imported, not duplicated
 *
 * Single chokepoint that commands will migrate to in a follow-up issue —
 * #24 ships only the seam.
 *
 * Spec: docs/specs/tasks-schema-spec.md
 * Issue: #24
 */

import * as fs from "fs";
import * as path from "path";

import {
  parseTasks,
  renderTasks,
  ParsedTasks,
  TaskRecord,
  FourState,
} from "./tasks-parser";

/** Public Task alias — single source of truth for callers. */
export type Task = TaskRecord;
export type { FourState, ParsedTasks } from "./tasks-parser";

/** Lock filename suffix appended to the target path. */
export const LOCK_SUFFIX = ".lock";

/** Stale-lock threshold. Lockfiles older than this are stealable. */
const STALE_AFTER_MS = 30_000;

/** Default acquire timeout — bounded retry per issue #24. */
const DEFAULT_TIMEOUT_MS = 5_000;

/** Default backoff between retry attempts. */
const DEFAULT_BACKOFF_MS = 100;

export class LockTimeoutError extends Error {
  constructor(lockPath: string, timeoutMs: number) {
    super(
      `tasks-store: failed to acquire lock ${lockPath} within ${timeoutMs}ms`
    );
    this.name = "LockTimeoutError";
  }
}

export interface AcquireOptions {
  timeoutMs?: number;
  backoffMs?: number;
}

/** Handle returned by `acquireLock`. Pass to `releaseLock`. */
export interface LockHandle {
  lockPath: string;
  acquiredAt: number;
}

/**
 * Archive file lives next to TASKS.md. Hard-coded suffix — issue #25
 * gitignores `TASKS-archive.md` specifically.
 */
const ARCHIVE_SUFFIX = "-archive.md";

/**
 * Compute the archive path for a given TASKS.md path.
 *
 *   /foo/bar/TASKS.md → /foo/bar/TASKS-archive.md
 *
 * Exported so callers (and tests) do not duplicate the naming rule.
 */
export function archivePathFor(file: string): string {
  const dir = path.dirname(file);
  const base = path.basename(file, ".md");
  return path.join(dir, `${base}${ARCHIVE_SUFFIX}`);
}

// ─── public API ──────────────────────────────────────────────────────────

/**
 * Read TASKS.md from disk and parse. Missing file returns the empty
 * four-section structure — callers do not need to special-case first-run.
 *
 * Does NOT acquire the lock — reads are advisory-free. Writes that depend
 * on a read-modify-write cycle should wrap both in `acquireLock`.
 */
export function readTasks(file: string): ParsedTasks {
  if (!fs.existsSync(file)) {
    return { Inbox: [], Active: [], Delegated: [], Done: [] };
  }
  const raw = fs.readFileSync(file, "utf-8");
  return parseTasks(raw);
}

/**
 * Atomically write `tasks` to `file`. Acquires the advisory lock for the
 * duration of the write. Throws `LockTimeoutError` if the lock cannot be
 * obtained within `timeoutMs`.
 *
 * Atomicity contract:
 *   1. Render to string (may throw — caught before we touch disk).
 *   2. Write to `<file>.tmp.<pid>` in the same directory as `file`.
 *   3. `fsync` the tmpfile.
 *   4. `rename` tmpfile → file. POSIX rename is atomic within a filesystem.
 *
 * On any error after step 1, the tmpfile is cleaned up best-effort and the
 * original `file` is left untouched.
 */
export function writeTasks(
  file: string,
  tasks: ParsedTasks,
  opts: AcquireOptions = {}
): void {
  // Guard against bad input BEFORE acquiring the lock or touching disk.
  if (tasks == null || typeof tasks !== "object") {
    throw new TypeError("tasks-store: writeTasks expects a ParsedTasks object");
  }

  const rendered = renderTasks(tasks);

  // Ensure the parent dir exists — first-run convenience.
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lock = acquireLock(file, opts);
  const tmpPath = `${file}.tmp.${process.pid}`;
  try {
    const fd = fs.openSync(tmpPath, "w");
    try {
      fs.writeSync(fd, rendered);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, file);
  } catch (err) {
    // Best-effort cleanup; ignore if tmpfile never made it to disk.
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      /* swallow */
    }
    throw err;
  } finally {
    releaseLock(lock);
  }
}

/**
 * Move Done records older than `thresholdDays` from `file` into the sibling
 * archive file (`TASKS-archive.md` by default). Returns the number of records
 * moved. Zero-eligible is a no-op — no archive file is created.
 *
 * Eligibility rule:
 *   - Record must be in the Done section.
 *   - Record must have a `Done:` field that parses as `YYYY-MM-DD`.
 *   - `(now - Done) / 86400000 > thresholdDays` (strictly greater than).
 *
 * Records without a parseable Done date are kept in the main file — silent
 * drops would be worse than a small operational annoyance.
 *
 * Atomicity contract (issue #25):
 *   1. Render BOTH new files in memory first. Any render error aborts before
 *      either file is touched.
 *   2. Write archive tmpfile + fsync, then main tmpfile + fsync. Either tmp
 *      failure cleans both tmpfiles and throws — originals untouched.
 *   3. Rename archive tmpfile → archive (atomic). If this fails, the main
 *      tmpfile is cleaned up and the original main is untouched.
 *   4. Rename main tmpfile → main (atomic). If THIS fails after the archive
 *      rename succeeded, the archive now contains the moved records and the
 *      main file is unchanged — same records will appear in both on next
 *      read. Surface the error; caller decides whether to retry. (Better
 *      than losing records.)
 *
 * Lock contract:
 *   - Holds the main TASKS.md lock for the duration. Archive file has no
 *     separate lock — the main lock covers both writes.
 */
export function archiveOldDone(
  file: string,
  thresholdDays: number,
  opts: AcquireOptions = {}
): number {
  if (!Number.isFinite(thresholdDays) || thresholdDays < 0) {
    throw new RangeError(
      `tasks-store: archiveOldDone thresholdDays must be a non-negative finite number, got ${thresholdDays}`
    );
  }

  const archivePath = archivePathFor(file);
  const lock = acquireLock(file, opts);
  try {
    const main = readTasks(file);
    const archive = readTasks(archivePath);

    const cutoffMs = Date.now() - thresholdDays * 86_400_000;
    const keep: TaskRecord[] = [];
    const move: TaskRecord[] = [];

    for (const rec of main.Done) {
      const doneStr = rec.fields.Done;
      if (!doneStr || !/^\d{4}-\d{2}-\d{2}$/.test(doneStr)) {
        keep.push(rec);
        continue;
      }
      const ts = Date.parse(doneStr + "T00:00:00Z");
      if (Number.isNaN(ts)) {
        keep.push(rec);
        continue;
      }
      if (ts < cutoffMs) {
        move.push(rec);
      } else {
        keep.push(rec);
      }
    }

    if (move.length === 0) return 0;

    const newMain: ParsedTasks = { ...main, Done: keep };
    const newArchive: ParsedTasks = {
      Inbox: archive.Inbox,
      Active: archive.Active,
      Delegated: archive.Delegated,
      Done: [...archive.Done, ...move],
    };

    // Pre-flight: render BOTH first so a render error aborts before any
    // disk write.
    const renderedMain = renderTasks(newMain);
    const renderedArchive = renderTasks(newArchive);

    // Ensure parent dir exists for archive.
    const archDir = path.dirname(archivePath);
    if (!fs.existsSync(archDir)) {
      fs.mkdirSync(archDir, { recursive: true });
    }

    const mainTmp = `${file}.tmp.${process.pid}`;
    const archiveTmp = `${archivePath}.tmp.${process.pid}`;

    const cleanupTmp = () => {
      for (const p of [mainTmp, archiveTmp]) {
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {
          /* swallow */
        }
      }
    };

    try {
      writeAtomicNoRename(archiveTmp, renderedArchive);
      writeAtomicNoRename(mainTmp, renderedMain);
    } catch (err) {
      cleanupTmp();
      throw err;
    }

    // Rename archive first — if the main rename fails after this, records
    // are duplicated (in both files) rather than lost.
    try {
      fs.renameSync(archiveTmp, archivePath);
    } catch (err) {
      cleanupTmp();
      throw err;
    }
    try {
      fs.renameSync(mainTmp, file);
    } catch (err) {
      // Archive write already landed; main rename failed. Clean main tmp
      // and surface — caller will see duplicate records on retry and can
      // decide how to recover.
      try {
        if (fs.existsSync(mainTmp)) fs.unlinkSync(mainTmp);
      } catch {
        /* swallow */
      }
      throw err;
    }

    return move.length;
  } finally {
    releaseLock(lock);
  }
}

/**
 * Write `body` to `tmpPath` with fsync. Caller is responsible for the
 * rename step. Used by `archiveOldDone` so two tmpfiles can be staged
 * before either rename lands.
 */
function writeAtomicNoRename(tmpPath: string, body: string): void {
  const fd = fs.openSync(tmpPath, "w");
  try {
    fs.writeSync(fd, body);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// ─── lockfile primitives ─────────────────────────────────────────────────

/**
 * Acquire an advisory PID/timestamp lock for `file`.
 *
 * Retries with backoff until either:
 *   - The lockfile is created (success).
 *   - The existing lockfile is detected as stale (>30s OR dead PID) and
 *     stolen by removing + re-creating it.
 *   - `timeoutMs` elapses (throws `LockTimeoutError`).
 *
 * The lockfile contents are `<pid>\n<ISO timestamp>\n` so any other
 * process can introspect ownership.
 */
export function acquireLock(
  file: string,
  opts: AcquireOptions = {}
): LockHandle {
  const lockPath = file + LOCK_SUFFIX;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const deadline = Date.now() + timeoutMs;

  // Ensure parent dir exists so we can write the lockfile.
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  for (;;) {
    if (tryCreateLock(lockPath)) {
      return { lockPath, acquiredAt: Date.now() };
    }

    // Existing lock — steal if stale.
    if (fs.existsSync(lockPath) && isLockStale(lockPath)) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        /* race: another process stole it; loop and retry */
      }
      continue;
    }

    if (Date.now() >= deadline) {
      throw new LockTimeoutError(lockPath, timeoutMs);
    }

    // Busy-wait backoff. Synchronous because we have no event loop to share
    // with the lock owner — they're a separate process.
    sleepSync(backoffMs);
  }
}

/**
 * Release a previously-acquired lock. Idempotent — missing lockfile is OK
 * (it may have been cleaned up by `writeTasks` already or stolen by a
 * later process if we exceeded the stale threshold).
 */
export function releaseLock(handle: LockHandle): void {
  try {
    fs.unlinkSync(handle.lockPath);
  } catch (err: any) {
    if (err && err.code !== "ENOENT") throw err;
  }
}

/**
 * Return true if `lockPath` either:
 *   - is older than `STALE_AFTER_MS`, OR
 *   - names a PID that no longer exists.
 *
 * Missing lockfile is NOT stale (it's absent — there's nothing to be stale).
 */
export function isLockStale(lockPath: string): boolean {
  if (!fs.existsSync(lockPath)) return false;
  let contents: string;
  try {
    contents = fs.readFileSync(lockPath, "utf-8");
  } catch {
    // Unreadable lockfile — treat as stale so it gets cleaned up.
    return true;
  }
  const [pidStr, isoStr] = contents.split("\n", 2);
  const pid = Number(pidStr);
  if (!Number.isInteger(pid) || pid <= 0) return true;

  // PID liveness — `kill -0` semantics via `process.kill(pid, 0)`.
  if (!isPidAlive(pid)) return true;

  if (!isoStr) return true;
  const ts = Date.parse(isoStr);
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > STALE_AFTER_MS;
}

// ─── internals ───────────────────────────────────────────────────────────

function tryCreateLock(lockPath: string): boolean {
  try {
    // O_EXCL guarantees we fail if another process already created the file.
    const fd = fs.openSync(lockPath, "wx");
    try {
      const body = `${process.pid}\n${new Date().toISOString()}\n`;
      fs.writeSync(fd, body);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch (err: any) {
    if (err && err.code === "EEXIST") return false;
    throw err;
  }
}

function isPidAlive(pid: number): boolean {
  try {
    // Signal 0 = liveness probe, never delivered.
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    if (err && err.code === "EPERM") return true; // exists, we just can't signal
    return false;
  }
}

/**
 * Synchronous sleep — used during lock backoff. `Atomics.wait` on a fresh
 * SharedArrayBuffer is the standard Node-builtin way to sleep without
 * a busy loop or adding dependencies.
 */
function sleepSync(ms: number): void {
  const sab = new SharedArrayBuffer(4);
  const ia = new Int32Array(sab);
  Atomics.wait(ia, 0, 0, ms);
}
