/**
 * session-briefing.test.ts
 *
 * Tests for the SessionStart hook overhaul (issue #22).
 *
 * Covers:
 *   - tasks-parser: parses TASKS.md sections + fields
 *   - briefing-render: full / quiet / off modes, trigger logic,
 *     dedup of delegations with overdue Check-by + overdue Scheduled,
 *     suggested action priority ladder, staleness, inbox gate.
 *   - briefing-events: hit-rate computation, isHit window, dedup-per-day
 *   - session-briefing runBriefing: end-to-end via temp fixtures
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { parseTasks } from "../scripts/tasks-parser";
import { renderBriefing } from "../scripts/briefing-render";
import {
  computeHitRate,
  isHit,
  parseEventsLog,
  lastBriefingDate,
  BriefingEvent,
  CommandEvent,
} from "../scripts/briefing-events";
import { runBriefing, readBriefingMode } from "../scripts/session-briefing";

function utcDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

function tmpdir(prefix = "ce-sb-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ── parseTasks (SB-PARSE) ─────────────────────────────────────────────────

describe("parseTasks (SB-PARSE)", () => {
  test("SB-PARSE-001: empty file → empty sections", () => {
    const r = parseTasks("");
    expect(r).toEqual({ Inbox: [], Active: [], Delegated: [], Done: [] });
  });

  test("SB-PARSE-002: single Inbox record parses", () => {
    const md = `# Task Board

## Inbox

Title: Test
Description: A task
State: Inbox

## Active

## Delegated

## Done
`;
    const r = parseTasks(md);
    expect(r.Inbox).toHaveLength(1);
    expect(r.Inbox[0].fields["Title"]).toBe("Test");
    expect(r.Inbox[0].fields["State"]).toBe("Inbox");
  });

  test("SB-PARSE-003: records split on blank lines", () => {
    const md = `## Active

Title: A
State: Active

Title: B
State: Active
`;
    const r = parseTasks(md);
    expect(r.Active).toHaveLength(2);
    expect(r.Active.map((t) => t.fields["Title"])).toEqual(["A", "B"]);
  });

  test("SB-PARSE-004: records split on --- and [ INTAKE headers", () => {
    const md = `## Inbox

---
[ INTAKE — 2026-05-20 ]
Title: A
State: Inbox
---
[ INTAKE — 2026-05-21 ]
Title: B
State: Inbox
`;
    const r = parseTasks(md);
    expect(r.Inbox.map((t) => t.fields["Title"])).toEqual(["A", "B"]);
  });

  test("SB-PARSE-005: parses fields with hyphens (Check-by, Due date)", () => {
    const md = `## Delegated

Title: T
Owner: alice
Check-by: 2026-05-27
State: Delegated
`;
    const r = parseTasks(md);
    expect(r.Delegated[0].fields["Check-by"]).toBe("2026-05-27");
    expect(r.Delegated[0].fields["Owner"]).toBe("alice");
  });
});

// ── renderBriefing (SB-REND) ──────────────────────────────────────────────

describe("renderBriefing (SB-REND)", () => {
  const empty = { Inbox: [], Active: [], Delegated: [], Done: [] };

  test("SB-REND-001: mode=off returns empty text and no trigger", () => {
    const r = renderBriefing(empty, utcDate("2026-05-27"), "off");
    expect(r.text).toBe("");
    expect(r.triggered).toBe(false);
    expect(r.suggestedAction).toBe("none");
  });

  test("SB-REND-002: mode=full with empty board emits counts line only", () => {
    const r = renderBriefing(empty, utcDate("2026-05-27"), "full");
    expect(r.text).toBe("Task Board: 0 Inbox, 0 Active, 0 Delegated, 0 Done");
    expect(r.triggered).toBe(false);
    expect(r.suggestedAction).toBe("none");
  });

  test("SB-REND-003: mode=quiet untriggered collapses to one-liner", () => {
    const r = renderBriefing(
      { Inbox: [{ fields: { Title: "x" }, section: "Inbox" }], Active: [], Delegated: [], Done: [] },
      utcDate("2026-05-27"),
      "quiet"
    );
    expect(r.text).toBe("Task Board: 1 Inbox, 0 Active, 0 Delegated — run /today for briefing");
    expect(r.triggered).toBe(false);
  });

  test("SB-REND-004: overdue Active surfaces 🔴 section and schedule suggestion", () => {
    const tasks = {
      Inbox: [],
      Active: [{ fields: { Title: "Ship report", Scheduled: "2026-05-20" }, section: "Active" as const }],
      Delegated: [],
      Done: [],
    };
    const r = renderBriefing(tasks, utcDate("2026-05-27"), "full");
    expect(r.text).toContain("🔴 Overdue Active Tasks");
    expect(r.text).toContain("Ship report");
    expect(r.text).toContain("5 business days overdue");
    expect(r.suggestedAction).toBe("schedule");
  });

  test("SB-REND-005: 'week of' Active is not overdue Friday, is overdue Monday", () => {
    const tasks = {
      Inbox: [],
      Active: [{ fields: { Title: "Weekly thing", Scheduled: "week of 2026-05-18" }, section: "Active" as const }],
      Delegated: [],
      Done: [],
    };
    const onFri = renderBriefing(tasks, utcDate("2026-05-22"), "full"); // Friday end-of-week
    expect(onFri.text).not.toContain("🔴 Overdue Active Tasks");
    const onMon = renderBriefing(tasks, utcDate("2026-05-25"), "full"); // following Monday
    expect(onMon.text).toContain("🔴 Overdue Active Tasks");
    expect(onMon.text).toContain("week of 2026-05-18");
  });

  test("SB-REND-006: overdue Check-by surfaces 🟡 and check-in suggestion (priority over schedule)", () => {
    const tasks = {
      Inbox: [],
      Active: [{ fields: { Title: "A", Scheduled: "2026-05-20" }, section: "Active" as const }],
      Delegated: [
        { fields: { Title: "Deleg", Owner: "alice", "Check-by": "2026-05-25" }, section: "Delegated" as const },
      ],
      Done: [],
    };
    const r = renderBriefing(tasks, utcDate("2026-05-27"), "full");
    expect(r.text).toContain("🟡 Delegation Check-ins Due");
    expect(r.text).toContain("alice — Deleg");
    expect(r.suggestedAction).toBe("check-in");
    expect(r.text).toContain("Reach out to alice about Deleg");
  });

  test("SB-REND-007: due-today Check-by renders without 'overdue' suffix", () => {
    const tasks = {
      Inbox: [],
      Active: [],
      Delegated: [
        { fields: { Title: "T", Owner: "bob", "Check-by": "2026-05-27" }, section: "Delegated" as const },
      ],
      Done: [],
    };
    const r = renderBriefing(tasks, utcDate("2026-05-27"), "full");
    expect(r.text).toContain("bob — T (check-by 2026-05-27)");
    expect(r.text).not.toMatch(/check-by 2026-05-27,.*overdue/);
  });

  test("SB-REND-008: inbox >= 5 triggers 📥 and intake suggestion when nothing higher", () => {
    const tasks = {
      Inbox: Array.from({ length: 5 }, (_, i) => ({ fields: { Title: `i${i}` }, section: "Inbox" as const })),
      Active: [],
      Delegated: [],
      Done: [],
    };
    const r = renderBriefing(tasks, utcDate("2026-05-27"), "full");
    expect(r.text).toContain("📥 Inbox has 5 items");
    expect(r.suggestedAction).toBe("intake");
  });

  test("SB-REND-009: inbox < 5 does NOT trigger 📥", () => {
    const tasks = {
      Inbox: [{ fields: { Title: "x" }, section: "Inbox" as const }],
      Active: [],
      Delegated: [],
      Done: [],
    };
    const r = renderBriefing(tasks, utcDate("2026-05-27"), "full");
    expect(r.text).not.toContain("📥");
    expect(r.suggestedAction).toBe("none");
  });

  test("SB-REND-010: staleness triggers 💤 when last Done > 5 business days ago", () => {
    const tasks = {
      Inbox: [],
      Active: [],
      Delegated: [],
      Done: [{ fields: { Title: "Old", Done: "2026-05-15" }, section: "Done" as const }],
    };
    // 2026-05-27 is Wed; 2026-05-15 was Fri, 8 business days ago
    const r = renderBriefing(tasks, utcDate("2026-05-27"), "full");
    expect(r.text).toContain("💤 No tasks completed in the last 5 business days");
    expect(r.suggestedAction).toBe("review");
  });

  test("SB-REND-011: recent Done within 5 business days does NOT trigger 💤", () => {
    const tasks = {
      Inbox: [],
      Active: [],
      Delegated: [],
      Done: [{ fields: { Title: "Recent", Done: "2026-05-26" }, section: "Done" as const }],
    };
    const r = renderBriefing(tasks, utcDate("2026-05-27"), "full");
    expect(r.text).not.toContain("💤");
  });

  test("SB-REND-012: priority ladder — check-in beats schedule beats intake beats review", () => {
    const tasks = {
      Inbox: Array.from({ length: 5 }, (_, i) => ({ fields: { Title: `i${i}` }, section: "Inbox" as const })),
      Active: [{ fields: { Title: "A", Scheduled: "2026-05-20" }, section: "Active" as const }],
      Delegated: [
        { fields: { Title: "D", Owner: "alice", "Check-by": "2026-05-25" }, section: "Delegated" as const },
      ],
      Done: [{ fields: { Title: "Old", Done: "2026-05-10" }, section: "Done" as const }],
    };
    const r = renderBriefing(tasks, utcDate("2026-05-27"), "full");
    expect(r.suggestedAction).toBe("check-in");
  });

  test("SB-REND-013: delegated task with same title is NOT duplicated in overdue Active", () => {
    const tasks = {
      Inbox: [],
      Active: [{ fields: { Title: "Shared", Scheduled: "2026-05-20" }, section: "Active" as const }],
      Delegated: [
        { fields: { Title: "Shared", Owner: "alice", "Check-by": "2026-05-20" }, section: "Delegated" as const },
      ],
      Done: [],
    };
    const r = renderBriefing(tasks, utcDate("2026-05-27"), "full");
    // Only the check-in row should mention Shared
    expect(r.text).toContain("🟡 Delegation Check-ins Due");
    expect(r.text).toContain("alice — Shared");
    expect(r.text).not.toContain("🔴 Overdue Active Tasks");
  });

  test("SB-REND-014: unparseable Scheduled date is flagged in Note line", () => {
    const tasks = {
      Inbox: [],
      Active: [{ fields: { Title: "Bad date", Scheduled: "next Tuesday" }, section: "Active" as const }],
      Delegated: [],
      Done: [],
    };
    const r = renderBriefing(tasks, utcDate("2026-05-27"), "full");
    expect(r.text).toContain("unparseable date values: Bad date");
  });
});

// ── briefing-events (SB-EVT) ──────────────────────────────────────────────

describe("briefing-events (SB-EVT)", () => {
  test("SB-EVT-001: isHit true within 10-minute window for matching command", () => {
    const b: BriefingEvent = {
      kind: "briefing_shown",
      shown_at: "2026-05-27T09:00:00Z",
      suggested_action: "intake",
      date: "2026-05-27",
    };
    const c: CommandEvent = {
      kind: "command_run",
      ran_at: "2026-05-27T09:05:00Z",
      command: "/intake",
    };
    expect(isHit(b, c)).toBe(true);
  });

  test("SB-EVT-002: isHit false outside 10-minute window", () => {
    const b: BriefingEvent = {
      kind: "briefing_shown",
      shown_at: "2026-05-27T09:00:00Z",
      suggested_action: "intake",
      date: "2026-05-27",
    };
    const c: CommandEvent = {
      kind: "command_run",
      ran_at: "2026-05-27T09:15:00Z",
      command: "/intake",
    };
    expect(isHit(b, c)).toBe(false);
  });

  test("SB-EVT-003: isHit false for non-matching command", () => {
    const b: BriefingEvent = {
      kind: "briefing_shown",
      shown_at: "2026-05-27T09:00:00Z",
      suggested_action: "intake",
      date: "2026-05-27",
    };
    const c: CommandEvent = {
      kind: "command_run",
      ran_at: "2026-05-27T09:05:00Z",
      command: "/today",
    };
    expect(isHit(b, c)).toBe(false);
  });

  test("SB-EVT-004: computeHitRate aggregates hits over denominator (briefings with suggestion)", () => {
    const events = [
      { kind: "briefing_shown", shown_at: "2026-05-27T09:00:00Z", suggested_action: "intake", date: "2026-05-27" },
      { kind: "command_run", ran_at: "2026-05-27T09:02:00Z", command: "/intake" },
      { kind: "briefing_shown", shown_at: "2026-05-28T09:00:00Z", suggested_action: "schedule", date: "2026-05-28" },
      { kind: "briefing_shown", shown_at: "2026-05-29T09:00:00Z", suggested_action: "none", date: "2026-05-29" },
    ] as any;
    const stats = computeHitRate(events);
    expect(stats.totalBriefings).toBe(3);
    expect(stats.briefingsWithSuggestion).toBe(2);
    expect(stats.hits).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5);
  });

  test("SB-EVT-005: parseEventsLog handles blank lines and malformed JSON", () => {
    const log = `
{"kind":"briefing_shown","shown_at":"2026-05-27T09:00:00Z","suggested_action":"intake","date":"2026-05-27"}
not-json-line
{"kind":"command_run","ran_at":"2026-05-27T09:05:00Z","command":"/intake"}

`;
    const events = parseEventsLog(log);
    expect(events).toHaveLength(2);
  });

  test("SB-EVT-006: lastBriefingDate returns last shown date or null", () => {
    expect(lastBriefingDate([])).toBeNull();
    const events = [
      { kind: "briefing_shown", shown_at: "x", suggested_action: "none", date: "2026-05-26" } as any,
      { kind: "command_run", ran_at: "x", command: "/intake" } as any,
      { kind: "briefing_shown", shown_at: "x", suggested_action: "none", date: "2026-05-27" } as any,
    ];
    expect(lastBriefingDate(events)).toBe("2026-05-27");
  });
});

// ── runBriefing end-to-end (SB-RUN) ───────────────────────────────────────

describe("runBriefing end-to-end (SB-RUN)", () => {
  test("SB-RUN-001: no TASKS.md → silent (no output, no event written)", () => {
    const dir = tmpdir();
    const r = runBriefing({ cwd: dir, today: utcDate("2026-05-27") });
    expect(r.output).toBe("");
    expect(r.shown).toBe(false);
    expect(r.reason).toBe("no-tasks-file");
    expect(fs.existsSync(path.join(dir, "memory"))).toBe(false);
  });

  test("SB-RUN-002: TASKS.md present, full mode → prints briefing and writes event", () => {
    const dir = tmpdir();
    fs.writeFileSync(
      path.join(dir, "TASKS.md"),
      `## Inbox\n\n## Active\n\nTitle: Late\nScheduled: 2026-05-20\nState: Active\n\n## Delegated\n\n## Done\n`,
      "utf8"
    );
    const r = runBriefing({ cwd: dir, today: utcDate("2026-05-27") });
    expect(r.shown).toBe(true);
    expect(r.output).toContain("🔴 Overdue Active Tasks");
    expect(r.output).toContain("Late");
    const eventsPath = path.join(dir, "memory", "briefing-events.jsonl");
    expect(fs.existsSync(eventsPath)).toBe(true);
    const events = fs.readFileSync(eventsPath, "utf8").trim().split("\n");
    expect(events).toHaveLength(1);
    const parsed = JSON.parse(events[0]);
    expect(parsed.kind).toBe("briefing_shown");
    expect(parsed.suggested_action).toBe("schedule");
    expect(parsed.date).toBe("2026-05-27");
  });

  test("SB-RUN-003: second invocation same day → skipped (dedup)", () => {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, "TASKS.md"), `## Inbox\n\n## Active\n\n## Delegated\n\n## Done\n`, "utf8");
    const today = utcDate("2026-05-27");
    const first = runBriefing({ cwd: dir, today });
    expect(first.shown).toBe(true);
    const second = runBriefing({ cwd: dir, today });
    expect(second.shown).toBe(false);
    expect(second.reason).toBe("already-shown-today");
    expect(second.output).toBe("");
  });

  test("SB-RUN-004: mode=off in config → no output, no event", () => {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, "TASKS.md"), `## Inbox\n\n## Active\n\n## Delegated\n\n## Done\n`, "utf8");
    fs.mkdirSync(path.join(dir, "config"));
    fs.writeFileSync(path.join(dir, "config", "task-output-config.md"), `briefing_mode: off\n`, "utf8");
    const r = runBriefing({ cwd: dir, today: utcDate("2026-05-27") });
    expect(r.shown).toBe(false);
    expect(r.reason).toBe("mode-off");
    expect(fs.existsSync(path.join(dir, "memory"))).toBe(false);
  });

  test("SB-RUN-005: mode=quiet untriggered emits one-liner", () => {
    const dir = tmpdir();
    fs.writeFileSync(
      path.join(dir, "TASKS.md"),
      `## Inbox\n\nTitle: One\nState: Inbox\n\n## Active\n\n## Delegated\n\n## Done\n`,
      "utf8"
    );
    fs.mkdirSync(path.join(dir, "config"));
    fs.writeFileSync(path.join(dir, "config", "task-output-config.md"), `briefing_mode: quiet\n`, "utf8");
    const r = runBriefing({ cwd: dir, today: utcDate("2026-05-27") });
    expect(r.shown).toBe(true);
    expect(r.output).toContain("run /today for briefing");
  });

  test("SB-RUN-006: readBriefingMode defaults to full when config missing", () => {
    const dir = tmpdir();
    expect(readBriefingMode(path.join(dir, "config", "task-output-config.md"))).toBe("full");
  });

  test("SB-RUN-007: readBriefingMode parses quiet/off/full case-insensitive", () => {
    const dir = tmpdir();
    const cfg = path.join(dir, "cfg.md");
    fs.writeFileSync(cfg, "briefing_mode: QUIET\n");
    expect(readBriefingMode(cfg)).toBe("quiet");
    fs.writeFileSync(cfg, "Briefing_Mode: off\n");
    expect(readBriefingMode(cfg)).toBe("off");
  });
});

// ── Hook contract (SB-HOOK) ───────────────────────────────────────────────

describe("SessionStart hook contract (SB-HOOK)", () => {
  const ROOT = path.resolve(__dirname, "..");
  const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks/hooks.json"), "utf8"));
  const entry = hooks.SessionStart[0].hooks[0];

  test("SB-HOOK-001: SessionStart hook is type 'command'", () => {
    expect(entry.type).toBe("command");
  });

  test("SB-HOOK-002: command references session-briefing.ts via CLAUDE_PLUGIN_ROOT", () => {
    expect(entry.command).toContain("${CLAUDE_PLUGIN_ROOT}");
    expect(entry.command).toContain("session-briefing");
  });

  test("SB-HOOK-003: hook has a finite timeout", () => {
    expect(typeof entry.timeout).toBe("number");
    expect(entry.timeout).toBeGreaterThan(0);
    expect(entry.timeout).toBeLessThanOrEqual(30);
  });
});
