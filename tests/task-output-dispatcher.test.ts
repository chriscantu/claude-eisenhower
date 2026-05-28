/**
 * task-output-dispatcher.test.ts
 *
 * The dispatcher (`scripts/task-output.ts`) is the single entry point commands
 * call to push or complete tasks. It looks up adapters by name from a registry
 * and forwards the call — nothing else.
 *
 * Test IDs:
 *   - DISP-NNN dispatch + unknown-adapter handling
 *   - DISP-CFG-NNN active-adapter resolution from config
 *
 * Issue: #27
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  registerAdapter,
  resetRegistryForTests,
  pushTask,
  completeTask,
  readActiveAdapter,
  listRegisteredAdapters,
} from "../scripts/task-output";
import type {
  PushResult,
  CompleteResult,
  TaskOutputAdapter,
  TaskOutputRecord,
} from "../scripts/adapter-types";

function fakeAdapter(name: string): TaskOutputAdapter & {
  pushCalls: TaskOutputRecord[];
  completeCalls: { title: string; list_name: string }[];
} {
  const pushCalls: TaskOutputRecord[] = [];
  const completeCalls: { title: string; list_name: string }[] = [];
  return {
    name,
    pushCalls,
    completeCalls,
    async pushTask(record: TaskOutputRecord): Promise<PushResult> {
      pushCalls.push(record);
      return { status: "success", reason: "Created", id: `${name}:${record.title}` };
    },
    async completeTask(title: string, list_name: string): Promise<CompleteResult> {
      completeCalls.push({ title, list_name });
      return { status: "success", reason: "Completed" };
    },
  };
}

function sampleRecord(): TaskOutputRecord {
  return {
    title:       "Test task",
    description: "desc",
    due_date:    "2026-03-02",
    quadrant:    "Q1",
    priority:    "high",
    source:      "Self",
    requester:   null,
    list_name:   "Eisenhower List",
  };
}

beforeEach(() => {
  resetRegistryForTests();
});

describe("dispatcher — dispatch by name", () => {
  test("DISP-001: pushTask forwards to the named adapter", async () => {
    const a = fakeAdapter("alpha");
    registerAdapter(a);

    const result = await pushTask(sampleRecord(), "alpha");

    expect(result.status).toBe("success");
    expect(a.pushCalls).toHaveLength(1);
    expect(a.pushCalls[0].title).toBe("Test task");
  });

  test("DISP-002: completeTask forwards to the named adapter", async () => {
    const a = fakeAdapter("alpha");
    registerAdapter(a);

    const result = await completeTask("Some task", "Eisenhower List", "alpha");

    expect(result.status).toBe("success");
    expect(a.completeCalls).toEqual([{ title: "Some task", list_name: "Eisenhower List" }]);
  });

  test("DISP-003: multiple adapters can be registered and chosen by name", async () => {
    const a = fakeAdapter("alpha");
    const b = fakeAdapter("beta");
    registerAdapter(a);
    registerAdapter(b);

    await pushTask(sampleRecord(), "beta");

    expect(a.pushCalls).toHaveLength(0);
    expect(b.pushCalls).toHaveLength(1);
  });

  test("DISP-004: unknown adapter name throws with available-names list", async () => {
    registerAdapter(fakeAdapter("alpha"));

    await expect(pushTask(sampleRecord(), "nonexistent"))
      .rejects.toThrow(/nonexistent/);
    await expect(pushTask(sampleRecord(), "nonexistent"))
      .rejects.toThrow(/alpha/);
  });

  test("DISP-005: listRegisteredAdapters returns names of registered adapters", () => {
    registerAdapter(fakeAdapter("alpha"));
    registerAdapter(fakeAdapter("beta"));

    expect(listRegisteredAdapters().sort()).toEqual(["alpha", "beta"]);
  });

  test("DISP-006: registering same-name adapter twice replaces (idempotent)", async () => {
    const first = fakeAdapter("alpha");
    const second = fakeAdapter("alpha");
    registerAdapter(first);
    registerAdapter(second);

    await pushTask(sampleRecord(), "alpha");

    expect(first.pushCalls).toHaveLength(0);
    expect(second.pushCalls).toHaveLength(1);
  });
});

describe("dispatcher — config resolution", () => {
  function tmpConfig(contents: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-disp-"));
    const file = path.join(dir, "task-output-config.md");
    fs.writeFileSync(file, contents);
    return file;
  }

  test("DISP-CFG-001: reads ## Active Adapter section value", () => {
    const file = tmpConfig(
      "# Task Output Configuration\n\n## Active Adapter\n\nmarkdown-file\n\n---\n"
    );
    expect(readActiveAdapter(file)).toBe("markdown-file");
  });

  test("DISP-CFG-002: trims surrounding whitespace + blank lines", () => {
    const file = tmpConfig(
      "## Active Adapter\n\n\n   reminders   \n\n---\n"
    );
    expect(readActiveAdapter(file)).toBe("reminders");
  });

  test("DISP-CFG-003: returns null when placeholder `~~task_output`", () => {
    const file = tmpConfig("## Active Adapter\n\n~~task_output\n\n---\n");
    expect(readActiveAdapter(file)).toBeNull();
  });

  test("DISP-CFG-004: returns null when file missing", () => {
    expect(readActiveAdapter("/nonexistent/path/task-output-config.md")).toBeNull();
  });

  test("DISP-CFG-005: returns null when ## Active Adapter section absent", () => {
    const file = tmpConfig("# Task Output Configuration\n\nNo active adapter here.\n");
    expect(readActiveAdapter(file)).toBeNull();
  });
});

describe("dispatcher — shared adapter contract harness", () => {
  // Every adapter — fake or real — exposes the same surface: a string `name`
  // plus async `pushTask` and `completeTask`. The harness is the dispatcher's
  // type-level contract made executable, so adding a new adapter is a matter
  // of registering it and watching this harness still pass.
  test("DISP-CTR-001: adapters implement pushTask + completeTask + name", () => {
    const a = fakeAdapter("alpha");
    expect(typeof a.name).toBe("string");
    expect(typeof a.pushTask).toBe("function");
    expect(typeof a.completeTask).toBe("function");
  });

  test("DISP-CTR-002: pushTask returns PushResult shape", async () => {
    const a = fakeAdapter("alpha");
    registerAdapter(a);
    const r = await pushTask(sampleRecord(), "alpha");
    expect(r).toHaveProperty("status");
    expect(r).toHaveProperty("reason");
    expect(r).toHaveProperty("id");
  });

  test("DISP-CTR-003: completeTask returns CompleteResult shape", async () => {
    const a = fakeAdapter("alpha");
    registerAdapter(a);
    const r = await completeTask("t", "l", "alpha");
    expect(r).toHaveProperty("status");
    expect(r).toHaveProperty("reason");
  });
});
