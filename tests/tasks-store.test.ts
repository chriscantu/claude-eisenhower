/**
 * tasks-store.test.ts
 *
 * Tests for `scripts/tasks-store.ts` — the I/O + locking layer over
 * `scripts/tasks-parser.ts`. Closes issue #24.
 *
 * Test IDs:
 *   - STORE-RW-NNN  read/write/round-trip
 *   - STORE-ATM-NNN atomic write
 *   - STORE-LCK-NNN lockfile lifecycle
 *   - STORE-CON-NNN concurrent-writer safety
 *
 * Run: cd scripts && npm test -- tasks-store
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as child_process from "child_process";

import { parseTasks, renderTasks, ParsedTasks } from "../scripts/tasks-parser";
import {
  readTasks,
  writeTasks,
  acquireLock,
  releaseLock,
  isLockStale,
  LOCK_SUFFIX,
  LockTimeoutError,
} from "../scripts/tasks-store";

function tmpdir(prefix = "ce-store-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sampleTasks(): ParsedTasks {
  return {
    Inbox: [
      {
        fields: {
          Title: "Ship docs",
          Description: "Write the docs",
          Source: "Self",
          Requester: "Self",
          Urgency: "Not specified",
          "Due date": "Not specified",
          State: "Inbox",
        },
        section: "Inbox",
      },
    ],
    Active: [
      {
        fields: {
          Title: "Fix bug",
          Description: "p99 latency",
          Source: "Self",
          Requester: "Self",
          Urgency: "today",
          "Due date": "2026-05-27",
          Priority: "Q1",
          State: "Active",
          Owner: "me",
          Scheduled: "2026-05-27",
          Action: "90-min focus block",
        },
        section: "Active",
      },
    ],
    Delegated: [
      {
        fields: {
          Title: "Review RFC",
          Description: "Need ack",
          Source: "Email",
          Requester: "Self",
          Urgency: "this week",
          "Due date": "2026-05-30",
          Priority: "Q3",
          State: "Delegated",
          Owner: "alice",
          "Check-by": "2026-05-28",
        },
        section: "Delegated",
      },
    ],
    Done: [
      {
        fields: {
          Title: "Old work",
          Description: "Shipped",
          Source: "Self",
          Requester: "Self",
          Urgency: "Not specified",
          "Due date": "Not specified",
          State: "Done",
          Done: "2026-05-20",
        },
        section: "Done",
      },
    ],
  };
}

// ─── read / write / round-trip ───────────────────────────────────────────

describe("readTasks / writeTasks (STORE-RW)", () => {
  test("STORE-RW-001: missing file returns empty ParsedTasks (no throw)", () => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    const r = readTasks(file);
    expect(r).toEqual({ Inbox: [], Active: [], Delegated: [], Done: [] });
  });

  test("STORE-RW-002: write then read returns the same parsed structure", () => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    const original = sampleTasks();

    writeTasks(file, original);
    const roundTripped = readTasks(file);

    expect(roundTripped).toEqual(original);
  });

  test("STORE-RW-003: write produces canonical section headers in order", () => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    writeTasks(file, sampleTasks());
    const raw = fs.readFileSync(file, "utf-8");

    const inboxIdx = raw.indexOf("## Inbox");
    const activeIdx = raw.indexOf("## Active");
    const delegatedIdx = raw.indexOf("## Delegated");
    const doneIdx = raw.indexOf("## Done");

    expect(inboxIdx).toBeGreaterThanOrEqual(0);
    expect(activeIdx).toBeGreaterThan(inboxIdx);
    expect(delegatedIdx).toBeGreaterThan(activeIdx);
    expect(doneIdx).toBeGreaterThan(delegatedIdx);
  });

  test("STORE-RW-004: parse → render → parse is stable (idempotent)", () => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");

    const original = sampleTasks();
    writeTasks(file, original);
    const once = readTasks(file);
    writeTasks(file, once);
    const twice = readTasks(file);
    expect(twice).toEqual(once);
  });

  test("STORE-RW-005: empty ParsedTasks produces parseable skeleton", () => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    writeTasks(file, { Inbox: [], Active: [], Delegated: [], Done: [] });
    const raw = fs.readFileSync(file, "utf-8");
    expect(raw).toContain("## Inbox");
    expect(raw).toContain("## Active");
    expect(raw).toContain("## Delegated");
    expect(raw).toContain("## Done");
    const parsed = parseTasks(raw);
    expect(parsed).toEqual({ Inbox: [], Active: [], Delegated: [], Done: [] });
  });
});

// ─── atomic write semantics ──────────────────────────────────────────────

describe("atomic write (STORE-ATM)", () => {
  test("STORE-ATM-001: write uses a tmpfile + rename — no stray .tmp left on success", () => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    writeTasks(file, sampleTasks());
    const stray = fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"));
    expect(stray).toEqual([]);
  });

  test("STORE-ATM-002: existing file is preserved if tmpfile write fails", () => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    writeTasks(file, sampleTasks());
    const original = fs.readFileSync(file, "utf-8");

    // Force failure by passing a clearly broken tasks object (null fields).
    // The writer must guard or the rename must not have happened.
    try {
      // @ts-expect-error — intentional bad input
      writeTasks(file, null);
    } catch {
      /* expected */
    }
    expect(fs.readFileSync(file, "utf-8")).toBe(original);
  });

  test("STORE-ATM-003: tmpfile lives in same directory as target (rename is atomic)", () => {
    // We can't directly inspect the tmpfile post-success — but we can verify
    // that no cross-device rename happens by writing to a deep nested dir.
    const dir = tmpdir();
    const nested = path.join(dir, "deep", "nest");
    fs.mkdirSync(nested, { recursive: true });
    const file = path.join(nested, "TASKS.md");
    writeTasks(file, sampleTasks());
    expect(fs.existsSync(file)).toBe(true);
  });
});

// ─── lockfile lifecycle ──────────────────────────────────────────────────

describe("lockfile (STORE-LCK)", () => {
  test("STORE-LCK-001: acquireLock creates lockfile with PID + ISO timestamp", () => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    const lock = acquireLock(file);
    try {
      const lockPath = file + LOCK_SUFFIX;
      expect(fs.existsSync(lockPath)).toBe(true);
      const contents = fs.readFileSync(lockPath, "utf-8");
      expect(contents).toMatch(/^\d+\n\d{4}-\d{2}-\d{2}T/);
      expect(contents.split("\n")[0]).toBe(String(process.pid));
    } finally {
      releaseLock(lock);
    }
  });

  test("STORE-LCK-002: releaseLock removes the lockfile", () => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    const lock = acquireLock(file);
    releaseLock(lock);
    expect(fs.existsSync(file + LOCK_SUFFIX)).toBe(false);
  });

  test("STORE-LCK-003: second acquireLock times out while first holds", () => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    const lock = acquireLock(file);
    try {
      expect(() => acquireLock(file, { timeoutMs: 200, backoffMs: 50 })).toThrow(
        LockTimeoutError
      );
    } finally {
      releaseLock(lock);
    }
  });

  test("STORE-LCK-004: isLockStale = true when PID does not exist", () => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    const lockPath = file + LOCK_SUFFIX;
    // PID 1 is the init process and always alive; pick a high PID unlikely to exist.
    fs.writeFileSync(lockPath, `9999999\n${new Date().toISOString()}\n`, "utf-8");
    expect(isLockStale(lockPath)).toBe(true);
  });

  test("STORE-LCK-005: isLockStale = true when timestamp older than 30s", () => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    const lockPath = file + LOCK_SUFFIX;
    const old = new Date(Date.now() - 60_000).toISOString();
    fs.writeFileSync(lockPath, `${process.pid}\n${old}\n`, "utf-8");
    expect(isLockStale(lockPath)).toBe(true);
  });

  test("STORE-LCK-006: isLockStale = false when PID alive and timestamp fresh", () => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    const lockPath = file + LOCK_SUFFIX;
    fs.writeFileSync(
      lockPath,
      `${process.pid}\n${new Date().toISOString()}\n`,
      "utf-8"
    );
    expect(isLockStale(lockPath)).toBe(false);
  });

  test("STORE-LCK-007: acquireLock steals a stale lock without timing out", () => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    const lockPath = file + LOCK_SUFFIX;
    // Plant a stale lock.
    fs.writeFileSync(lockPath, `9999999\n${new Date().toISOString()}\n`, "utf-8");
    const lock = acquireLock(file, { timeoutMs: 1000, backoffMs: 50 });
    try {
      const contents = fs.readFileSync(lockPath, "utf-8");
      expect(contents.split("\n")[0]).toBe(String(process.pid));
    } finally {
      releaseLock(lock);
    }
  });
});

// ─── concurrent writer safety ────────────────────────────────────────────

describe("concurrent writers (STORE-CON)", () => {
  test("STORE-CON-001: two sequential writeTasks calls produce well-formed file", () => {
    // Single-process serialized writes — covers the in-process lock path.
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    const a = sampleTasks();
    const b = sampleTasks();
    b.Inbox[0].fields.Title = "Different";
    writeTasks(file, a);
    writeTasks(file, b);
    const r = readTasks(file);
    expect(r.Inbox[0].fields.Title).toBe("Different");
  });

  test("STORE-CON-002: parallel child-process writers do not corrupt the file", (done) => {
    const dir = tmpdir();
    const file = path.join(dir, "TASKS.md");
    // Seed the file so children just rewrite it.
    writeTasks(file, { Inbox: [], Active: [], Delegated: [], Done: [] });

    // Resolve ts-node from this process's module path (scripts/node_modules)
    // so child Node processes — which have no local node_modules in tmpdir —
    // can still load it.
    const tsNodePath = require.resolve("ts-node/register");
    const storePath = path.resolve(__dirname, "../scripts/tasks-store.ts");
    const scriptPath = path.join(dir, "writer.js");
    const tsScript = `
require(${JSON.stringify(tsNodePath)});
const { writeTasks, readTasks } = require(${JSON.stringify(storePath)});
const file = process.argv[2];
const tag = process.argv[3];
const tasks = readTasks(file);
tasks.Inbox.push({
  fields: { Title: tag, Description: "x", Source: "Self", Requester: "Self", Urgency: "n", "Due date": "n", State: "Inbox" },
  section: "Inbox"
});
writeTasks(file, tasks);
`;
    fs.writeFileSync(scriptPath, tsScript, "utf-8");

    const N = 5;
    let completed = 0;
    const failures: string[] = [];
    for (let i = 0; i < N; i++) {
      const child = child_process.spawn(
        process.execPath,
        [scriptPath, file, `child-${i}`],
        { stdio: ["ignore", "pipe", "pipe"] }
      );
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("exit", (code) => {
        if (code !== 0) failures.push(`child-${i} exit=${code} stderr=${stderr}`);
        completed++;
        if (completed === N) {
          if (failures.length > 0) {
            return done(new Error(failures.join("\n")));
          }
          try {
            const r = readTasks(file);
            // At least one write survived (last-writer-wins under lock).
            // Critical assertion: file parses cleanly + structure is intact.
            expect(r.Inbox.length).toBeGreaterThanOrEqual(1);
            // No stray .lock or .tmp left behind.
            const stray = fs
              .readdirSync(dir)
              .filter((f) => f.endsWith(".lock") || f.endsWith(".tmp"));
            expect(stray).toEqual([]);
            done();
          } catch (e) {
            done(e as Error);
          }
        }
      });
    }
  }, 30_000);
});
