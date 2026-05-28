/**
 * markdown-file.test.ts
 *
 * Cross-platform task-output adapter that writes to a plain markdown file.
 * No external dependencies (no AppleScript, no network) — proves the swap
 * mechanic without macOS specifics.
 *
 * Test IDs:
 *   - MDA-PSH-NNN push (append)
 *   - MDA-CMP-NNN complete (line-prefix swap)
 *   - MDA-IDM-NNN idempotency / dedup
 *
 * Spec: adapters/task-output/markdown-file.md
 * Issue: #27
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { createMarkdownFileAdapter } from "../../scripts/adapters/task-output/markdown-file";
import type { TaskOutputRecord } from "../../scripts/adapter-types";

function tmpfile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-mda-"));
  return path.join(dir, "external-todo.md");
}

function sampleRecord(overrides: Partial<TaskOutputRecord> = {}): TaskOutputRecord {
  return {
    title:       "Fix deploy pipeline issue",
    description: "Investigate failing CI step on main",
    due_date:    "2026-03-02",
    quadrant:    "Q1",
    priority:    "high",
    source:      "Self",
    requester:   null,
    list_name:   "Eisenhower List",
    ...overrides,
  };
}

describe("markdown-file adapter — push", () => {
  test("MDA-PSH-001: appends a checkbox line with title, quadrant, due date", async () => {
    const file = tmpfile();
    const adapter = createMarkdownFileAdapter({ file });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("success");
    expect(result.reason).toBe("Created");
    expect(result.id).toBe(file + ":Fix deploy pipeline issue");
    const content = fs.readFileSync(file, "utf-8");
    expect(content).toContain("- [ ] Fix deploy pipeline issue");
    expect(content).toContain("Q1");
    expect(content).toContain("2026-03-02");
  });

  test("MDA-PSH-002: creates the file (and parent dir) if missing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-mda-"));
    const file = path.join(dir, "nested", "todo.md");
    const adapter = createMarkdownFileAdapter({ file });

    const result = await adapter.pushTask(sampleRecord());

    expect(result.status).toBe("success");
    expect(fs.existsSync(file)).toBe(true);
  });

  test("MDA-PSH-003: due_date null renders as 'no due date' (no crash)", async () => {
    const file = tmpfile();
    const adapter = createMarkdownFileAdapter({ file });

    const result = await adapter.pushTask(sampleRecord({ due_date: null, quadrant: "Q2", priority: "medium" }));

    expect(result.status).toBe("success");
    const content = fs.readFileSync(file, "utf-8");
    expect(content).toContain("no due date");
  });

  test("MDA-PSH-004: appends Q3 'Check in:' prefixed title verbatim", async () => {
    const file = tmpfile();
    const adapter = createMarkdownFileAdapter({ file });

    await adapter.pushTask(sampleRecord({
      title:    "Check in: Sarah E. re: Review dashboards",
      quadrant: "Q3",
      priority: "medium",
      due_date: "2026-03-07",
    }));

    const content = fs.readFileSync(file, "utf-8");
    expect(content).toContain("- [ ] Check in: Sarah E. re: Review dashboards");
  });
});

describe("markdown-file adapter — complete", () => {
  test("MDA-CMP-001: flips '- [ ]' to '- [x]' for matched title", async () => {
    const file = tmpfile();
    const adapter = createMarkdownFileAdapter({ file });

    await adapter.pushTask(sampleRecord());
    const result = await adapter.completeTask("Fix deploy pipeline issue", "Eisenhower List");

    expect(result.status).toBe("success");
    expect(result.reason).toBe("Completed");
    const content = fs.readFileSync(file, "utf-8");
    expect(content).toContain("- [x] Fix deploy pipeline issue");
    expect(content).not.toContain("- [ ] Fix deploy pipeline issue");
  });

  test("MDA-CMP-002: returns skipped when title not found", async () => {
    const file = tmpfile();
    const adapter = createMarkdownFileAdapter({ file });
    fs.writeFileSync(file, "# External Todo\n");

    const result = await adapter.completeTask("Nonexistent task", "Eisenhower List");

    expect(result.status).toBe("skipped");
    expect(result.reason.toLowerCase()).toContain("not found");
  });

  test("MDA-CMP-003: returns skipped when file does not exist", async () => {
    const file = tmpfile();
    const adapter = createMarkdownFileAdapter({ file });

    const result = await adapter.completeTask("Any task", "Eisenhower List");

    expect(result.status).toBe("skipped");
  });

  test("MDA-CMP-004: idempotent — re-completing already-checked line returns success", async () => {
    const file = tmpfile();
    const adapter = createMarkdownFileAdapter({ file });
    await adapter.pushTask(sampleRecord());
    await adapter.completeTask("Fix deploy pipeline issue", "Eisenhower List");

    const result = await adapter.completeTask("Fix deploy pipeline issue", "Eisenhower List");

    expect(result.status).toBe("success");
    expect(result.reason.toLowerCase()).toContain("already");
  });
});

describe("markdown-file adapter — idempotency (push)", () => {
  test("MDA-IDM-001: re-pushing same title returns skipped (no duplicate)", async () => {
    const file = tmpfile();
    const adapter = createMarkdownFileAdapter({ file });

    await adapter.pushTask(sampleRecord());
    const second = await adapter.pushTask(sampleRecord());

    expect(second.status).toBe("skipped");
    expect(second.reason).toBe("Already exists");
    const content = fs.readFileSync(file, "utf-8");
    const occurrences = content.split("Fix deploy pipeline issue").length - 1;
    expect(occurrences).toBe(1);
  });

  test("MDA-IDM-002: case-insensitive dedup match", async () => {
    const file = tmpfile();
    const adapter = createMarkdownFileAdapter({ file });

    await adapter.pushTask(sampleRecord({ title: "Fix Deploy Pipeline Issue" }));
    const second = await adapter.pushTask(sampleRecord({ title: "fix deploy pipeline issue" }));

    expect(second.status).toBe("skipped");
  });
});

describe("markdown-file adapter — name + interface", () => {
  test("MDA-001: adapter exposes name='markdown-file'", () => {
    const adapter = createMarkdownFileAdapter({ file: tmpfile() });
    expect(adapter.name).toBe("markdown-file");
  });
});
