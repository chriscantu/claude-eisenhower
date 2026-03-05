/**
 * pending-counts.test.ts
 *
 * Regression suite for the live pending-task integration (fix/memory-robustness).
 *
 * Covers:
 *   - loadPendingCounts() parsing of memory/glossary.md
 *   - scoreDelegate() penalty applied when pendingCount > PENDING_THRESHOLD
 *   - capacity_warning flag set when overloaded (even if static signal is "high")
 *   - runMatch() threads pendingCounts through to scoring
 *   - Backward compat: runMatch() with no pendingCounts behaves identically to before
 *   - validateGlossaryHeader() detects schema drift (wrong/missing columns)
 *   - loadPendingCounts() warns to stderr and returns {} on header mismatch (Option A)
 *   - GLOSSARY_COLUMNS and PEOPLE_COLUMNS are exported and contain expected values
 *
 * Run: cd scripts && npm test
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  Stakeholder, CapacitySignal, Relationship,
  scoreDelegate, runMatch,
  PENDING_THRESHOLD, PENDING_PENALTY,
  GLOSSARY_COLUMNS, PEOPLE_COLUMNS,
  glossaryColIndex,
} from "../scripts/delegate-core";
import { loadPendingCounts, validateGlossaryHeader } from "../scripts/match-delegate";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const highCapInfra: Stakeholder = {
  name: "FIRST_LAST_1", alias: "Alex E.", role: "Senior Engineer",
  relationship: "direct_report",
  domains: ["infrastructure", "CI/CD"],
  capacity_signal: "high",
};

const highCapFrontend: Stakeholder = {
  name: "FIRST_LAST_2", alias: "Jordan F.", role: "Engineering Lead",
  relationship: "direct_report",
  domains: ["infrastructure", "frontend"],
  capacity_signal: "high",
};

// ── PENDING-001: scoreDelegate with zero pending tasks (baseline) ─────────────

describe("PENDING-001: scoreDelegate baseline — zero pending tasks", () => {
  test("score unchanged when pendingCount = 0", () => {
    const withPending = scoreDelegate(highCapInfra, "infrastructure work", "", 0);
    const withoutArg  = scoreDelegate(highCapInfra, "infrastructure work", "");
    expect(withPending.score).toBe(withoutArg.score);
  });

  test("capacity_warning remains false below threshold", () => {
    const result = scoreDelegate(highCapInfra, "infrastructure work", "", PENDING_THRESHOLD);
    expect(result.capacity_warning).toBe(false);
  });
});

// ── PENDING-002: scoreDelegate penalty above threshold ────────────────────────

describe("PENDING-002: scoreDelegate — penalty applies above threshold", () => {
  test("score decreases by PENDING_PENALTY per task beyond threshold", () => {
    const baseline = scoreDelegate(highCapInfra, "infrastructure work", "", 0);
    const overloaded = scoreDelegate(highCapInfra, "infrastructure work", "", PENDING_THRESHOLD + 1);
    expect(overloaded.score).toBe(baseline.score + PENDING_PENALTY);
  });

  test("two tasks over threshold = 2× penalty", () => {
    const baseline = scoreDelegate(highCapInfra, "infrastructure work", "", 0);
    const overloaded = scoreDelegate(highCapInfra, "infrastructure work", "", PENDING_THRESHOLD + 2);
    expect(overloaded.score).toBe(baseline.score + PENDING_PENALTY * 2);
  });

  test("capacity_warning set to true when pendingCount > PENDING_THRESHOLD", () => {
    const result = scoreDelegate(highCapInfra, "infrastructure work", "", PENDING_THRESHOLD + 1);
    expect(result.capacity_warning).toBe(true);
  });

  test("capacity_warning true even when static capacity_signal is 'high'", () => {
    expect(highCapInfra.capacity_signal).toBe("high");
    const result = scoreDelegate(highCapInfra, "infrastructure work", "", PENDING_THRESHOLD + 1);
    expect(result.capacity_warning).toBe(true);
  });
});

// ── PENDING-003: runMatch threads pendingCounts ───────────────────────────────

describe("PENDING-003: runMatch — pendingCounts affects ranking", () => {
  test("overloaded top scorer can be outranked by less-loaded peer", () => {
    // Alex has 4 pending tasks (2 over threshold); Jordan has 0.
    // Both match "infrastructure" equally for domain, same relationship.
    // With penalty, Jordan should rank above Alex.
    const pendingCounts = { "Alex E.": PENDING_THRESHOLD + 2, "Jordan F.": 0 };
    const result = runMatch([highCapInfra, highCapFrontend],
      "infrastructure work", "", pendingCounts);
    expect(result.status).toBe("match");
    expect(result.candidates[0].alias).toBe("Jordan F.");
  });

  test("no pendingCounts arg → same result as before (backward compat)", () => {
    const with_ = runMatch([highCapInfra, highCapFrontend], "infrastructure work", "", {});
    const without = runMatch([highCapInfra, highCapFrontend], "infrastructure work", "");
    expect(with_.candidates[0].alias).toBe(without.candidates[0].alias);
    expect(with_.candidates[0].score).toBe(without.candidates[0].score);
  });

  test("alias not in pendingCounts treated as zero pending", () => {
    const result = runMatch([highCapInfra], "infrastructure work", "", { "Jordan F.": 5 });
    expect(result.candidates[0].alias).toBe("Alex E.");
    // No penalty applied — Alex not in pendingCounts map
    const baseline = scoreDelegate(highCapInfra, "infrastructure work", "");
    expect(result.candidates[0].score).toBe(baseline.score);
  });
});

// ── PENDING-004: loadPendingCounts glossary parsing ───────────────────────────

describe("PENDING-004: loadPendingCounts — glossary.md parsing", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eisenhower-pending-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const writeGlossary = (content: string) => {
    const p = path.join(tmpDir, "glossary.md");
    fs.writeFileSync(p, content);
    return p;
  };

  test("returns empty object when file does not exist", () => {
    expect(loadPendingCounts(path.join(tmpDir, "missing.md"))).toEqual({});
  });

  test("counts only Pending rows (case-insensitive)", () => {
    const p = writeGlossary(`
# Stakeholder Memory

## Stakeholder Follow-ups

| Alias | Task | Delegated on | Check-by | Status |
|-------|------|-------------|----------|--------|
| Alex E. | Task A | 2026-03-01 | 2026-03-05 | Pending |
| Alex E. | Task B | 2026-03-02 | 2026-03-06 | Resolved — 2026-03-03 |
| Jordan F. | Task C | 2026-03-01 | 2026-03-05 | pending |
`);
    const counts = loadPendingCounts(p);
    expect(counts["Alex E."]).toBe(1);
    expect(counts["Jordan F."]).toBe(1);
    expect(Object.keys(counts)).toHaveLength(2);
  });

  test("accumulates multiple pending tasks for same alias", () => {
    const p = writeGlossary(`
# Stakeholder Memory

## Stakeholder Follow-ups

| Alias | Task | Delegated on | Check-by | Status |
|-------|------|-------------|----------|--------|
| Alex E. | Task A | 2026-03-01 | 2026-03-05 | Pending |
| Alex E. | Task B | 2026-03-02 | 2026-03-06 | Pending |
| Alex E. | Task C | 2026-03-03 | 2026-03-07 | Pending |
`);
    expect(loadPendingCounts(p)["Alex E."]).toBe(3);
  });

  test("stops parsing at next ## section boundary", () => {
    const p = writeGlossary(`
# Stakeholder Memory

## Stakeholder Follow-ups

| Alias | Task | Delegated on | Check-by | Status |
|-------|------|-------------|----------|--------|
| Alex E. | Task A | 2026-03-01 | 2026-03-05 | Pending |

## Other Section

| Alias | Task | Delegated on | Check-by | Status |
|-------|------|-------------|----------|--------|
| Alex E. | Task B | 2026-03-01 | 2026-03-05 | Pending |
`);
    // Should only count the one row before the next section
    expect(loadPendingCounts(p)["Alex E."]).toBe(1);
  });

  test("returns empty object for valid glossary with no Pending rows", () => {
    const p = writeGlossary(`
# Stakeholder Memory

## Stakeholder Follow-ups

| Alias | Task | Delegated on | Check-by | Status |
|-------|------|-------------|----------|--------|
| Alex E. | Task A | 2026-03-01 | 2026-03-05 | Resolved — 2026-03-04 |
`);
    expect(loadPendingCounts(p)).toEqual({});
  });
});

// ── SCHEMA-001: GLOSSARY_COLUMNS and PEOPLE_COLUMNS constants ─────────────────

describe("SCHEMA-001: exported schema constants", () => {
  test("GLOSSARY_COLUMNS contains all five required column names", () => {
    expect(GLOSSARY_COLUMNS).toContain("Alias");
    expect(GLOSSARY_COLUMNS).toContain("Task");
    expect(GLOSSARY_COLUMNS).toContain("Delegated on");
    expect(GLOSSARY_COLUMNS).toContain("Check-by");
    expect(GLOSSARY_COLUMNS).toContain("Status");
    expect(GLOSSARY_COLUMNS).toHaveLength(5);
  });

  test("PEOPLE_COLUMNS contains all five required column names", () => {
    expect(PEOPLE_COLUMNS).toContain("Task");
    expect(PEOPLE_COLUMNS).toContain("Delegated on");
    expect(PEOPLE_COLUMNS).toContain("Check-by");
    expect(PEOPLE_COLUMNS).toContain("Status");
    expect(PEOPLE_COLUMNS).toContain("Notes");
    expect(PEOPLE_COLUMNS).toHaveLength(5);
  });

  test("glossaryColIndex returns correct 0-based position for each column", () => {
    expect(glossaryColIndex("Alias")).toBe(0);
    expect(glossaryColIndex("Task")).toBe(1);
    expect(glossaryColIndex("Delegated on")).toBe(2);
    expect(glossaryColIndex("Check-by")).toBe(3);
    expect(glossaryColIndex("Status")).toBe(4);
  });
});

// ── SCHEMA-002: validateGlossaryHeader ───────────────────────────────────────

describe("SCHEMA-002: validateGlossaryHeader", () => {
  test("returns valid:true for exact column match", () => {
    const result = validateGlossaryHeader(
      ["Alias", "Task", "Delegated on", "Check-by", "Status"],
      GLOSSARY_COLUMNS
    );
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  test("returns valid:false when a column is missing", () => {
    // 'Check-by' is the old drift case ('Check-in Date' was used instead)
    const result = validateGlossaryHeader(
      ["Alias", "Task", "Delegated on", "Check-in Date", "Status"],
      GLOSSARY_COLUMNS
    );
    expect(result.valid).toBe(false);
    expect(result.warning).toContain("Check-by");
    expect(result.warning).toContain("Expected");
    expect(result.warning).toContain("Found");
  });

  test("returns valid:false when header uses old 'Person' column name", () => {
    // Regression: this was the actual drift found in glossary.md
    const result = validateGlossaryHeader(
      ["Person", "Delegated Task", "Check-in Date", "Status"],
      GLOSSARY_COLUMNS
    );
    expect(result.valid).toBe(false);
    expect(result.warning).toContain("Alias");
    expect(result.warning).toContain("Task");
    expect(result.warning).toContain("Delegated on");
    expect(result.warning).toContain("Check-by");
  });

  test("warning message references expected columns verbatim", () => {
    const result = validateGlossaryHeader(["Wrong"], GLOSSARY_COLUMNS);
    expect(result.warning).toContain(GLOSSARY_COLUMNS.join(" | "));
  });

  test("returns valid:true even when extra columns are present (additive drift is safe)", () => {
    // Extra columns at the end don't break parsing — only missing required ones do
    const result = validateGlossaryHeader(
      ["Alias", "Task", "Delegated on", "Check-by", "Status", "Extra Column"],
      GLOSSARY_COLUMNS
    );
    expect(result.valid).toBe(true);
  });
});

// ── SCHEMA-003: loadPendingCounts — Option A behavior on schema drift ─────────

describe("SCHEMA-003: loadPendingCounts — Option A on header mismatch", () => {
  let tmpDir: string;
  let stderrOutput: string;
  let stderrSpy: jest.SpyInstance;

  const writeGlossary = (content: string) => {
    const p = path.join(tmpDir, "glossary.md");
    fs.writeFileSync(p, content);
    return p;
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eisenhower-schema-"));
    stderrOutput = "";
    stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrOutput += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns {} when header uses old column names (does not throw)", () => {
    const p = writeGlossary(`
# Stakeholder Memory

## Stakeholder Follow-ups

| Person | Delegated Task | Check-in Date | Status |
|--------|---------------|---------------|--------|
| Alex E. | Task A | 2026-03-05 | Pending |
`);
    expect(() => loadPendingCounts(p)).not.toThrow();
    expect(loadPendingCounts(p)).toEqual({});
  });

  test("writes warning to stderr on header mismatch", () => {
    const p = writeGlossary(`
# Stakeholder Memory

## Stakeholder Follow-ups

| Person | Delegated Task | Check-in Date | Status |
|--------|---------------|---------------|--------|
| Alex E. | Task A | 2026-03-05 | Pending |
`);
    loadPendingCounts(p);
    expect(stderrOutput).toContain("glossary schema warning");
    expect(stderrOutput).toContain("Expected");
    expect(stderrOutput).toContain("Alias");
  });

  test("warning includes actionable fix hint", () => {
    const p = writeGlossary(`
## Stakeholder Follow-ups

| Wrong | Columns | Here | Are | Bad |
|-------|---------|------|-----|-----|
| Alex E. | Task | 2026-03-01 | 2026-03-05 | Pending |
`);
    loadPendingCounts(p);
    expect(stderrOutput).toMatch(/fix the header|re-run/i);
  });

  test("valid glossary produces no stderr output", () => {
    const p = writeGlossary(`
## Stakeholder Follow-ups

| Alias | Task | Delegated on | Check-by | Status |
|-------|------|-------------|----------|--------|
| Alex E. | Task A | 2026-03-01 | 2026-03-05 | Pending |
`);
    loadPendingCounts(p);
    expect(stderrOutput).toBe("");
  });
});
