/**
 * google.test.ts
 *
 * Unit tests for the Google Tasks task-output adapter
 * (scripts/adapters/task-output/google.ts).
 *
 * Strategy:
 *   - Mock `googleapis` so no network call is ever made.
 *   - Mock `scripts/google-auth.ts` to short-circuit OAuth lifecycle.
 *   - Inject a `client_factory` returning a stub Tasks client whose
 *     `tasklists.list`, `tasks.insert`, `tasks.list`, and `tasks.patch`
 *     methods are jest.fn()s so we can assert call args / sequencing.
 *
 * Test IDs:
 *   - GTASK-PSH-NNN push behavior (quadrant prefix, list resolution, notes)
 *   - GTASK-CMP-NNN complete behavior (id-based, title fallback, not_found)
 *   - GTASK-ERR-NNN API error / graceful-failure surface
 *   - GTASK-MAP-NNN field mapping (due, source/requester notes block)
 *   - GTASK-CFG-NNN config resolution
 *   - GTASK-IDM-NNN idempotency (Already exists on duplicate push)
 *   - GTASK-PAG-NNN pagination (tasklists + tasks beyond 100 entries)
 *
 * Spec: adapters/task-output/google.md
 * Issue: #66
 */

import type { TaskOutputRecord } from "../../../scripts/adapter-types";

// ── googleapis mock ───────────────────────────────────────────────────────────
// Mock BEFORE importing the module under test.

jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    tasks: jest.fn().mockImplementation(() => ({})),
  },
}));

// ── google-auth mock ──────────────────────────────────────────────────────────

const mockGetAccessToken = jest.fn();
jest.mock("../../../scripts/google-auth", () => ({
  getAccessToken: (...args: unknown[]) => mockGetAccessToken(...args),
  // Mirror real buildAuthedClient — adapter only forwards to the mocked
  // google.tasks(), so the returned client is never dereferenced.
  buildAuthedClient: async (
    cfg: { credentials_path: string; token_path: string; scopes: string[] },
    loader?: (c: typeof cfg) => Promise<string>,
  ) => {
    if (loader) {
      await loader(cfg);
    } else {
      await mockGetAccessToken(cfg);
    }
    return { setCredentials: jest.fn() } as unknown;
  },
}));

// ── module under test ─────────────────────────────────────────────────────────

import {
  createGoogleTasksAdapter,
  readGoogleTasksConfig,
  type GoogleTasksResolvedConfig,
} from "../../../scripts/adapters/task-output/google";

// ── helpers ───────────────────────────────────────────────────────────────────

interface TaskListsApi {
  list: jest.Mock;
}
interface TasksApi {
  insert: jest.Mock;
  list: jest.Mock;
  patch: jest.Mock;
}
interface StubClient {
  tasklists: TaskListsApi;
  tasks: TasksApi;
}

function makeStubClient(overrides: Partial<{
  taskListsResponse: unknown;
  tasksListResponse: unknown;
  tasksInsertResponse: unknown;
  tasksPatchResponse: unknown;
  taskListsThrow: Error;
  tasksInsertThrow: Error;
  tasksListThrow: Error;
  tasksPatchThrow: Error;
}> = {}): StubClient {
  const taskListsList = overrides.taskListsThrow
    ? jest.fn().mockRejectedValue(overrides.taskListsThrow)
    : jest.fn().mockResolvedValue(overrides.taskListsResponse ?? {
        data: {
          items: [
            { id: "list-eisenhower", title: "Eisenhower List" },
            { id: "list-other", title: "Other List" },
          ],
        },
      });

  const tasksInsert = overrides.tasksInsertThrow
    ? jest.fn().mockRejectedValue(overrides.tasksInsertThrow)
    : jest.fn().mockResolvedValue(overrides.tasksInsertResponse ?? {
        data: { id: "task-fake-id-001" },
      });

  const tasksList = overrides.tasksListThrow
    ? jest.fn().mockRejectedValue(overrides.tasksListThrow)
    : jest.fn().mockResolvedValue(overrides.tasksListResponse ?? {
        data: { items: [] },
      });

  const tasksPatch = overrides.tasksPatchThrow
    ? jest.fn().mockRejectedValue(overrides.tasksPatchThrow)
    : jest.fn().mockResolvedValue(overrides.tasksPatchResponse ?? {
        data: { id: "patched-task", status: "completed" },
      });

  return {
    tasklists: { list: taskListsList },
    tasks: { insert: tasksInsert, list: tasksList, patch: tasksPatch },
  };
}

function fakeConfig(): GoogleTasksResolvedConfig {
  return {
    credentials_path: "/fake/client_secret.json",
    token_path: "/fake/token.json",
    list_name: "Eisenhower List",
  };
}

/**
 * Return the unified Options-shape fields equivalent to the legacy
 * `{config: fakeConfig()}` form so test sites can spread it inline.
 */
function fakeOpts(): { auth: { credentials_path: string; token_path: string }; list_name: string } {
  const c = fakeConfig();
  return {
    auth: { credentials_path: c.credentials_path, token_path: c.token_path },
    list_name: c.list_name,
  };
}

function sampleRecord(
  overrides: Partial<TaskOutputRecord> = {}
): TaskOutputRecord {
  return {
    title: "Fix deploy pipeline issue",
    description: "Investigate failing CI step on main",
    due_date: "2026-03-02",
    quadrant: "Q1",
    priority: "high",
    source: "Self",
    requester: null,
    list_name: "Eisenhower List",
    ...overrides,
  };
}

beforeEach(() => {
  mockGetAccessToken.mockReset();
  mockGetAccessToken.mockResolvedValue({
    token: "fake-access-token",
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
  });
});

// ── pushTask ──────────────────────────────────────────────────────────────────

describe("Google Tasks adapter — pushTask", () => {
  test("GTASK-PSH-001: success returns id and 'Created' reason", async () => {
    const stub = makeStubClient();
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("success");
    expect(result.reason).toBe("Created");
    expect(result.id).toBe("task-fake-id-001");
    expect(stub.tasks.insert).toHaveBeenCalledTimes(1);
  });

  test("GTASK-PSH-002: Q1 record gets '[Q1] ' title prefix", async () => {
    const stub = makeStubClient();
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    await adapter.pushTask(sampleRecord({ quadrant: "Q1", title: "X task" }));
    const arg = stub.tasks.insert.mock.calls[0][0];
    expect(arg.requestBody.title).toBe("[Q1] X task");
  });

  test("GTASK-PSH-003: Q2 record gets '[Q2] ' title prefix", async () => {
    const stub = makeStubClient();
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    await adapter.pushTask(sampleRecord({ quadrant: "Q2", priority: "medium", title: "Plan Q3" }));
    const arg = stub.tasks.insert.mock.calls[0][0];
    expect(arg.requestBody.title).toBe("[Q2] Plan Q3");
  });

  test("GTASK-PSH-004: Q3 record gets '[Q3] ' title prefix", async () => {
    const stub = makeStubClient();
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    await adapter.pushTask(sampleRecord({ quadrant: "Q3", priority: "medium", title: "Check in: Alice re: budget" }));
    const arg = stub.tasks.insert.mock.calls[0][0];
    expect(arg.requestBody.title).toBe("[Q3] Check in: Alice re: budget");
  });

  test("GTASK-PSH-005: resolves list_name to tasklist id", async () => {
    const stub = makeStubClient();
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    await adapter.pushTask(sampleRecord());
    const arg = stub.tasks.insert.mock.calls[0][0];
    expect(arg.tasklist).toBe("list-eisenhower");
  });

  test("GTASK-PSH-006: list resolution failure returns error, never throws", async () => {
    const stub = makeStubClient({
      taskListsResponse: { data: { items: [{ id: "x", title: "Other" }] } },
    });
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("error");
    expect(result.reason).toContain("not found");
    expect(result.id).toBe("");
    expect(stub.tasks.insert).not.toHaveBeenCalled();
  });
});

// ── completeTask ──────────────────────────────────────────────────────────────

describe("Google Tasks adapter — completeTask", () => {
  test("GTASK-CMP-001: externalId path patches by id, skips title scan", async () => {
    const stub = makeStubClient();
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.completeTask(
      "Fix deploy pipeline issue",
      "Eisenhower List",
      "ext-id-42"
    );

    expect(result.status).toBe("success");
    expect(result.reason).toBe("Completed");
    expect(stub.tasks.patch).toHaveBeenCalledWith({
      tasklist: "list-eisenhower",
      task: "ext-id-42",
      requestBody: { status: "completed" },
    });
    expect(stub.tasks.list).not.toHaveBeenCalled();
  });

  test("GTASK-CMP-002: title-match path tolerates [Q1] prefix", async () => {
    const stub = makeStubClient({
      tasksListResponse: {
        data: {
          items: [
            { id: "t-1", title: "[Q1] Fix deploy pipeline issue", status: "needsAction" },
            { id: "t-2", title: "[Q2] Plan Q3", status: "needsAction" },
          ],
        },
      },
    });
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.completeTask(
      "Fix deploy pipeline issue",
      "Eisenhower List"
    );

    expect(result.status).toBe("success");
    expect(result.reason).toBe("Completed");
    expect(stub.tasks.patch).toHaveBeenCalledWith({
      tasklist: "list-eisenhower",
      task: "t-1",
      requestBody: { status: "completed" },
    });
  });

  test("GTASK-CMP-003: title-match returns not_found when no item matches", async () => {
    const stub = makeStubClient({
      tasksListResponse: {
        data: {
          items: [{ id: "t-1", title: "[Q2] Some other task", status: "needsAction" }],
        },
      },
    });
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.completeTask(
      "Unknown task",
      "Eisenhower List"
    );

    expect(result.status).toBe("skipped");
    expect(result.reason.toLowerCase()).toContain("not found");
    expect(stub.tasks.patch).not.toHaveBeenCalled();
  });

  test("GTASK-CMP-004: already-completed task returns 'Already completed' without patching", async () => {
    const stub = makeStubClient({
      tasksListResponse: {
        data: {
          items: [
            { id: "t-1", title: "[Q1] Fix deploy pipeline issue", status: "completed" },
          ],
        },
      },
    });
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.completeTask(
      "Fix deploy pipeline issue",
      "Eisenhower List"
    );

    expect(result.status).toBe("success");
    expect(result.reason.toLowerCase()).toContain("already");
    expect(stub.tasks.patch).not.toHaveBeenCalled();
  });

  test("GTASK-CMP-005: empty list_name falls back to configured default", async () => {
    const stub = makeStubClient();
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.completeTask("Fix deploy pipeline issue", "", "ext-id-7");

    expect(result.status).toBe("success");
    expect(stub.tasks.patch).toHaveBeenCalledWith({
      tasklist: "list-eisenhower",
      task: "ext-id-7",
      requestBody: { status: "completed" },
    });
  });
});

// ── API error surface ─────────────────────────────────────────────────────────

describe("Google Tasks adapter — API error surface", () => {
  test("GTASK-ERR-001: tasks.insert throws → status=error, no throw to caller", async () => {
    const stub = makeStubClient({
      tasksInsertThrow: new Error("Rate limit exceeded"),
    });
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("error");
    expect(result.reason).toContain("Rate limit");
    expect(result.id).toBe("");
  });

  test("GTASK-ERR-002: tasks.patch throws (id path) → status=error", async () => {
    const stub = makeStubClient({
      tasksPatchThrow: new Error("403 forbidden"),
    });
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.completeTask("any", "Eisenhower List", "ext-1");

    expect(result.status).toBe("error");
    expect(result.reason).toContain("403");
  });

  test("GTASK-ERR-003: tasklists.list throws → status=error from pushTask", async () => {
    const stub = makeStubClient({
      taskListsThrow: new Error("Network unreachable"),
    });
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("error");
    expect(result.reason).toContain("Network unreachable");
  });

  test("GTASK-ERR-004: getAccessToken throws → status=error, no throw to caller", async () => {
    mockGetAccessToken.mockRejectedValueOnce(new Error("Token refresh failed"));
    const stub = makeStubClient();
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("error");
    expect(result.reason).toContain("Token refresh failed");
    expect(result.id).toBe("");
  });
});

// ── Field mapping ─────────────────────────────────────────────────────────────

describe("Google Tasks adapter — field mapping", () => {
  test("GTASK-MAP-001: notes block includes description, source, requester (labeled)", async () => {
    const stub = makeStubClient();
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    await adapter.pushTask(
      sampleRecord({
        description: "Run migration before noon",
        source: "Email (Procore)",
        requester: "Alice",
      })
    );
    const arg = stub.tasks.insert.mock.calls[0][0];
    const notes: string = arg.requestBody.notes;
    expect(notes).toContain("Run migration before noon");
    expect(notes).toContain("Source: Email (Procore)");
    expect(notes).toContain("Requester: Alice");
  });

  test("GTASK-MAP-002: null requester omitted from notes (no orphan 'Requester:' line)", async () => {
    const stub = makeStubClient();
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    await adapter.pushTask(sampleRecord({ requester: null }));
    const arg = stub.tasks.insert.mock.calls[0][0];
    expect(arg.requestBody.notes).not.toContain("Requester:");
  });

  test("GTASK-MAP-003: due_date maps to RFC3339 midnight UTC", async () => {
    const stub = makeStubClient();
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    await adapter.pushTask(sampleRecord({ due_date: "2026-03-02" }));
    const arg = stub.tasks.insert.mock.calls[0][0];
    expect(arg.requestBody.due).toBe("2026-03-02T00:00:00.000Z");
  });

  test("GTASK-MAP-004: null due_date omits 'due' from request body", async () => {
    const stub = makeStubClient();
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    await adapter.pushTask(sampleRecord({ due_date: null }));
    const arg = stub.tasks.insert.mock.calls[0][0];
    expect(arg.requestBody.due).toBeUndefined();
  });

  test("GTASK-MAP-005: list match is case-insensitive (trim)", async () => {
    const stub = makeStubClient({
      taskListsResponse: {
        data: { items: [{ id: "list-x", title: "  EISENHOWER LIST  " }] },
      },
    });
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.pushTask(sampleRecord());
    expect(result.status).toBe("success");
    const arg = stub.tasks.insert.mock.calls[0][0];
    expect(arg.tasklist).toBe("list-x");
  });
});

// ── Config resolution ─────────────────────────────────────────────────────────

describe("Google Tasks adapter — config resolution", () => {
  test("GTASK-CFG-001: adapter name is 'google'", () => {
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => makeStubClient() as never,
    });
    expect(adapter.name).toBe("google");
  });

  test("GTASK-CFG-002: pushTask returns error when config file missing AND no inline config", async () => {
    const adapter = createGoogleTasksAdapter({
      config_path: "/path/that/does/not/exist.md",
      client_factory: () => makeStubClient() as never,
    });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("error");
    expect(result.reason).toContain("Google Tasks config");
    expect(result.id).toBe("");
  });

  test("GTASK-CFG-003: completeTask returns error when config file missing", async () => {
    const adapter = createGoogleTasksAdapter({
      config_path: "/path/that/does/not/exist.md",
      client_factory: () => makeStubClient() as never,
    });

    const result = await adapter.completeTask("x", "Eisenhower List", "ext-1");

    expect(result.status).toBe("error");
    expect(result.reason).toContain("Google Tasks config");
  });

  test("GTASK-CFG-004: readGoogleTasksConfig parses ### google block", () => {
    const tmp = require("os").tmpdir();
    const fs = require("fs");
    const path = require("path");
    const file = path.join(tmp, `gtask-cfg-${Date.now()}.md`);
    fs.writeFileSync(
      file,
      [
        "# Task Output Config",
        "",
        "## Active Adapter",
        "google",
        "",
        "### google",
        "credentials_path: /abs/client_secret.json",
        "token_path: /abs/token.json",
        "list_name: My List",
        "",
        "### reminders",
        "list_name: Other",
      ].join("\n")
    );

    const cfg = readGoogleTasksConfig(file);
    expect(cfg).not.toBeNull();
    expect(cfg!.credentials_path).toBe("/abs/client_secret.json");
    expect(cfg!.token_path).toBe("/abs/token.json");
    expect(cfg!.list_name).toBe("My List");
  });

  test("GTASK-CFG-005: readGoogleTasksConfig returns null on missing fields", () => {
    const tmp = require("os").tmpdir();
    const fs = require("fs");
    const path = require("path");
    const file = path.join(tmp, `gtask-cfg-partial-${Date.now()}.md`);
    fs.writeFileSync(
      file,
      ["### google", "credentials_path: /abs/x.json", ""].join("\n")
    );

    expect(readGoogleTasksConfig(file)).toBeNull();
  });

  test("GTASK-CFG-006: readGoogleTasksConfig returns null for nonexistent file", () => {
    expect(readGoogleTasksConfig("/no/such/file.md")).toBeNull();
  });
});

// ── per-record list_name routing + idempotency ───────────────────────────────

describe("Google Tasks adapter — per-record list_name routing", () => {
  test("GTASK-PSH-007: pushTask uses record.list_name (not cfg.list_name)", async () => {
    const stub = makeStubClient({
      taskListsResponse: {
        data: {
          items: [
            { id: "list-eisenhower", title: "Eisenhower List" },
            { id: "list-other", title: "Backlog" },
          ],
        },
      },
    });
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    // record.list_name overrides cfg.list_name (Eisenhower List).
    const result = await adapter.pushTask(
      sampleRecord({ list_name: "Backlog" })
    );

    expect(result.status).toBe("success");
    const arg = stub.tasks.insert.mock.calls[0][0];
    expect(arg.tasklist).toBe("list-other");
  });

  test("GTASK-PSH-008: empty record.list_name falls back to cfg.list_name", async () => {
    const stub = makeStubClient();
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    await adapter.pushTask(sampleRecord({ list_name: "" }));

    const arg = stub.tasks.insert.mock.calls[0][0];
    expect(arg.tasklist).toBe("list-eisenhower");
  });
});

describe("Google Tasks adapter — idempotency", () => {
  test("GTASK-IDM-001: duplicate push returns 'skipped' / 'Already exists' with existing id", async () => {
    const stub = makeStubClient({
      tasksListResponse: {
        data: {
          items: [
            {
              id: "existing-task-007",
              title: "[Q1] Fix deploy pipeline issue",
              status: "needsAction",
            },
          ],
        },
      },
    });
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("Already exists");
    expect(result.id).toBe("existing-task-007");
    expect(stub.tasks.insert).not.toHaveBeenCalled();
  });

  test("GTASK-IDM-002: idempotency lookup tolerates [Qn] prefix on stored task", async () => {
    const stub = makeStubClient({
      tasksListResponse: {
        data: {
          items: [
            { id: "dup-1", title: "[Q3] Check in: Bob re: rollout", status: "needsAction" },
          ],
        },
      },
    });
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.pushTask(
      sampleRecord({ quadrant: "Q3", title: "Check in: Bob re: rollout" })
    );

    expect(result.status).toBe("skipped");
    expect(result.id).toBe("dup-1");
    expect(stub.tasks.insert).not.toHaveBeenCalled();
  });

  test("GTASK-IDM-003: idempotency check failure surfaces as error, not duplicate insert", async () => {
    const stub = makeStubClient({
      tasksListThrow: new Error("Tasks API temporarily unavailable"),
    });
    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("error");
    expect(stub.tasks.insert).not.toHaveBeenCalled();
  });
});

describe("Google Tasks adapter — pagination", () => {
  test("GTASK-PAG-001: tasklists.list paginates via nextPageToken to find target list", async () => {
    const taskListsListFn = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          items: [{ id: "wrong-1", title: "Wrong A" }],
          nextPageToken: "tok-page-2",
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [{ id: "list-eisenhower", title: "Eisenhower List" }],
        },
      });

    const stub = {
      tasklists: { list: taskListsListFn },
      tasks: {
        insert: jest.fn().mockResolvedValue({ data: { id: "new-id" } }),
        list: jest.fn().mockResolvedValue({ data: { items: [] } }),
        patch: jest.fn().mockResolvedValue({ data: {} }),
      },
    };

    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("success");
    expect(taskListsListFn).toHaveBeenCalledTimes(2);
    expect(taskListsListFn.mock.calls[1][0]).toMatchObject({
      pageToken: "tok-page-2",
    });
  });

  test("GTASK-PAG-002: completeTask title-scan paginates tasks.list to find target", async () => {
    const tasksListFn = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          items: [{ id: "other-1", title: "[Q2] Unrelated", status: "needsAction" }],
          nextPageToken: "tok-tasks-2",
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            { id: "match-99", title: "[Q1] Fix deploy pipeline issue", status: "needsAction" },
          ],
        },
      });

    const stub = {
      tasklists: {
        list: jest.fn().mockResolvedValue({
          data: { items: [{ id: "list-eisenhower", title: "Eisenhower List" }] },
        }),
      },
      tasks: {
        insert: jest.fn(),
        list: tasksListFn,
        patch: jest.fn().mockResolvedValue({ data: {} }),
      },
    };

    const adapter = createGoogleTasksAdapter({
      ...fakeOpts(),
      client_factory: () => stub as never,
    });

    const result = await adapter.completeTask(
      "Fix deploy pipeline issue",
      "Eisenhower List"
    );

    expect(result.status).toBe("success");
    expect(result.reason).toBe("Completed");
    expect(tasksListFn).toHaveBeenCalledTimes(2);
    expect(tasksListFn.mock.calls[1][0]).toMatchObject({
      pageToken: "tok-tasks-2",
    });
    expect(stub.tasks.patch).toHaveBeenCalledWith({
      tasklist: "list-eisenhower",
      task: "match-99",
      requestBody: { status: "completed" },
    });
  });
});
