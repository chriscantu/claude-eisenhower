/**
 * tasks-parser.test.ts
 *
 * Tests for `scripts/tasks-parser.ts`. Covers the rendering changes
 * introduced by issue #25 (TASKS.md UX scale):
 *
 *   - New section order: Active → Delegated → Inbox → Done
 *   - Done records render as a single compact line
 *   - Compact Done line is parseable back (round-trip)
 *   - Active / Delegated / Inbox records preserve exact field content
 *
 * Test IDs:
 *   - PARSE-ORD-NNN  section ordering
 *   - PARSE-CMP-NNN  compact Done rendering
 *   - PARSE-RT-NNN   round-trip
 *
 * Run: cd scripts && npm test -- tasks-parser
 */

import {
  parseTasks,
  renderTasks,
  ParsedTasks,
} from "../scripts/tasks-parser";

function sampleTasks(): ParsedTasks {
  return {
    Inbox: [
      {
        fields: {
          Title: "Triage email",
          Description: "Sort the inbox",
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
          Title: "Fix latency",
          Description: "p99 above SLO",
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
          Description: "Need ack from arch council",
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
          Title: "Ship docs",
          Description: "v1.8 release notes",
          Source: "Self",
          Requester: "Self",
          Urgency: "Not specified",
          "Due date": "Not specified",
          State: "Done",
          Owner: "me",
          Done: "2026-05-20",
        },
        section: "Done",
      },
    ],
  };
}

// ─── section ordering (PARSE-ORD) ───────────────────────────────────────

describe("renderTasks section order (PARSE-ORD)", () => {
  test("PARSE-ORD-001: Active appears before Delegated, Inbox, and Done", () => {
    const out = renderTasks(sampleTasks());
    const activeIdx = out.indexOf("## Active");
    const delegatedIdx = out.indexOf("## Delegated");
    const inboxIdx = out.indexOf("## Inbox");
    const doneIdx = out.indexOf("## Done");

    expect(activeIdx).toBeGreaterThanOrEqual(0);
    expect(delegatedIdx).toBeGreaterThan(activeIdx);
    expect(inboxIdx).toBeGreaterThan(delegatedIdx);
    expect(doneIdx).toBeGreaterThan(inboxIdx);
  });

  test("PARSE-ORD-002: empty Inbox/Active/Delegated/Done still emit headers in new order", () => {
    const out = renderTasks({
      Inbox: [],
      Active: [],
      Delegated: [],
      Done: [],
    });
    const activeIdx = out.indexOf("## Active");
    const delegatedIdx = out.indexOf("## Delegated");
    const inboxIdx = out.indexOf("## Inbox");
    const doneIdx = out.indexOf("## Done");
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    expect(delegatedIdx).toBeGreaterThan(activeIdx);
    expect(inboxIdx).toBeGreaterThan(delegatedIdx);
    expect(doneIdx).toBeGreaterThan(inboxIdx);
  });
});

// ─── Done compact rendering (PARSE-CMP) ─────────────────────────────────

describe("Done compact rendering (PARSE-CMP)", () => {
  test("PARSE-CMP-001: Done record renders to a single line, no fenced block", () => {
    const out = renderTasks({
      Inbox: [],
      Active: [],
      Delegated: [],
      Done: [
        {
          fields: {
            Title: "Ship docs",
            State: "Done",
            Owner: "me",
            Done: "2026-05-20",
          },
          section: "Done",
        },
      ],
    });
    // Compact line shape: `- [YYYY-MM-DD] Title — Owner — Done YYYY-MM-DD`
    expect(out).toMatch(/- \[2026-05-20\] Ship docs — me — Done 2026-05-20/);

    // Done section MUST NOT use fenced `---` blocks for compact records.
    const doneSlice = out.slice(out.indexOf("## Done"));
    // No `---` fence inside the Done section (we have leading/trailing
    // section blanks, but no record fences).
    expect(doneSlice.split("\n").filter((l) => l === "---")).toHaveLength(0);
  });

  test("PARSE-CMP-002: missing Owner is omitted gracefully", () => {
    const out = renderTasks({
      Inbox: [],
      Active: [],
      Delegated: [],
      Done: [
        {
          fields: {
            Title: "Drop the feature",
            State: "Done",
            Done: "2026-05-19",
            Note: "Eliminated — Q4 cut 2026-05-19",
          },
          section: "Done",
        },
      ],
    });
    expect(out).toContain("- [2026-05-19] Drop the feature — Done 2026-05-19");
  });

  test("PARSE-CMP-003: missing Done date falls back to (no date)", () => {
    const out = renderTasks({
      Inbox: [],
      Active: [],
      Delegated: [],
      Done: [
        {
          fields: {
            Title: "Mystery task",
            State: "Done",
          },
          section: "Done",
        },
      ],
    });
    expect(out).toContain("- [no date] Mystery task");
  });

  test("PARSE-CMP-004: Active / Delegated / Inbox still use fenced full-field blocks", () => {
    const out = renderTasks(sampleTasks());
    // Each non-Done section should contain at least one `---` fence.
    const activeSlice = out.slice(out.indexOf("## Active"), out.indexOf("## Delegated"));
    const delegatedSlice = out.slice(out.indexOf("## Delegated"), out.indexOf("## Inbox"));
    const inboxSlice = out.slice(out.indexOf("## Inbox"), out.indexOf("## Done"));
    expect(activeSlice).toContain("---");
    expect(activeSlice).toContain("Title: Fix latency");
    expect(delegatedSlice).toContain("---");
    expect(delegatedSlice).toContain("Check-by: 2026-05-28");
    expect(inboxSlice).toContain("---");
    expect(inboxSlice).toContain("Title: Triage email");
  });
});

// ─── round-trip (PARSE-RT) ──────────────────────────────────────────────

describe("round-trip parseTasks(renderTasks(x)) (PARSE-RT)", () => {
  test("PARSE-RT-001: Active / Delegated / Inbox records preserve exact field content", () => {
    const original = sampleTasks();
    const round = parseTasks(renderTasks(original));

    expect(round.Active).toEqual(original.Active);
    expect(round.Delegated).toEqual(original.Delegated);
    expect(round.Inbox).toEqual(original.Inbox);
  });

  test("PARSE-RT-002: compact Done lines parse back into Done records", () => {
    const original: ParsedTasks = {
      Inbox: [],
      Active: [],
      Delegated: [],
      Done: [
        {
          fields: { Title: "Ship docs", State: "Done", Owner: "me", Done: "2026-05-20" },
          section: "Done",
        },
        {
          fields: { Title: "Drop feature", State: "Done", Done: "2026-05-19" },
          section: "Done",
        },
      ],
    };
    const round = parseTasks(renderTasks(original));
    expect(round.Done).toHaveLength(2);
    expect(round.Done[0].fields.Title).toBe("Ship docs");
    expect(round.Done[0].fields.Owner).toBe("me");
    expect(round.Done[0].fields.Done).toBe("2026-05-20");
    expect(round.Done[0].fields.State).toBe("Done");
    expect(round.Done[1].fields.Title).toBe("Drop feature");
    expect(round.Done[1].fields.Owner).toBeUndefined();
    expect(round.Done[1].fields.Done).toBe("2026-05-19");
  });

  test("PARSE-RT-003: mixed sections — full round-trip preserves order and counts", () => {
    const original = sampleTasks();
    const round = parseTasks(renderTasks(original));
    expect(round.Active).toHaveLength(1);
    expect(round.Delegated).toHaveLength(1);
    expect(round.Inbox).toHaveLength(1);
    expect(round.Done).toHaveLength(1);
  });

  test("PARSE-RT-004: idempotent — render(parse(render(x))) === render(x) modulo whitespace", () => {
    const original = sampleTasks();
    const once = renderTasks(original);
    const twice = renderTasks(parseTasks(once));
    expect(twice).toBe(once);
  });
});

// ─── Awaiting field (PARSE-AWAIT) — issue #44 ─────────────────────────

describe("Awaiting field round-trip (PARSE-AWAIT)", () => {
  function awaitingTasks(): ParsedTasks {
    return {
      Inbox: [],
      Active: [
        {
          fields: {
            Title: "SOC2 evidence pack",
            Description: "Need security review sign-off before submission",
            Source: "Self",
            Requester: "Self",
            Urgency: "this quarter",
            "Due date": "2026-06-30",
            Priority: "Q2",
            State: "Active",
            Owner: "me",
            Awaiting: "Security review",
            "Check-by": "2026-06-05",
            Note: "Pinged Priya 2026-05-25",
          },
          section: "Active",
        },
      ],
      Delegated: [],
      Done: [],
    };
  }

  test("PARSE-AWAIT-001: Awaiting field round-trips on Active record", () => {
    const original = awaitingTasks();
    const round = parseTasks(renderTasks(original));
    expect(round.Active).toHaveLength(1);
    expect(round.Active[0].fields.Awaiting).toBe("Security review");
    expect(round.Active[0].fields["Check-by"]).toBe("2026-06-05");
  });

  test("PARSE-AWAIT-002: Awaiting renders between Owner and Check-by in canonical order", () => {
    const out = renderTasks(awaitingTasks());
    const ownerIdx = out.indexOf("Owner: me");
    const awaitingIdx = out.indexOf("Awaiting: Security review");
    const checkByIdx = out.indexOf("Check-by: 2026-06-05");
    expect(ownerIdx).toBeGreaterThan(-1);
    expect(awaitingIdx).toBeGreaterThan(ownerIdx);
    expect(checkByIdx).toBeGreaterThan(awaitingIdx);
  });

  test("PARSE-AWAIT-003: idempotent render — Awaiting record stable across two render cycles", () => {
    const original = awaitingTasks();
    const once = renderTasks(original);
    const twice = renderTasks(parseTasks(once));
    expect(twice).toBe(once);
  });
});
