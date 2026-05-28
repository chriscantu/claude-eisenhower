/**
 * tasks-parser.ts
 *
 * Pure parser for TASKS.md — splits markdown into the four sections
 * (Inbox, Active, Delegated, Done) and parses each record's fields.
 *
 * No I/O. Takes a string, returns typed structures. Used by
 * session-briefing.ts and any other tooling that needs to introspect
 * TASKS.md without re-implementing the format.
 *
 * Spec: docs/specs/tasks-schema-spec.md
 */

export type FourState = "Inbox" | "Active" | "Delegated" | "Done";

export interface TaskRecord {
  /** Raw field map, e.g. {Title: "...", Scheduled: "..."} */
  fields: Record<string, string>;
  /** Section the record was found in. */
  section: FourState;
}

export interface ParsedTasks {
  Inbox: TaskRecord[];
  Active: TaskRecord[];
  Delegated: TaskRecord[];
  Done: TaskRecord[];
}

/**
 * Section names — the keys exposed on `ParsedTasks` and the legal `## …` headers
 * the parser recognizes. Order here is irrelevant for parsing; render order is
 * controlled by `RENDER_ORDER` below.
 */
const SECTION_NAMES: readonly FourState[] = ["Inbox", "Active", "Delegated", "Done"] as const;

/**
 * Render order for `renderTasks` — issue #25 reordered sections so the
 * actionable surface (Active → Delegated → Inbox) appears before the archive
 * (Done). The most-recent Done section sits at the bottom where it can grow
 * without burying open work.
 */
const RENDER_ORDER: readonly FourState[] = ["Active", "Delegated", "Inbox", "Done"] as const;

/**
 * Compact one-line shape for Done records:
 *
 *   - [YYYY-MM-DD] Title — Owner — Done YYYY-MM-DD
 *   - [YYYY-MM-DD] Title — Done YYYY-MM-DD                (no Owner)
 *   - [no date] Title — Owner                              (no Done date)
 *   - [no date] Title                                      (neither)
 *
 * The leading bracket date is the `Done` field value (sortable). Lines that do
 * not match this shape fall through to the standard `Key: Value` parser, so
 * legacy fenced Done records (pre-#25) continue to round-trip.
 */
const COMPACT_DONE_RE =
  /^\s*-\s+\[(?<lead>[^\]]+)\]\s+(?<rest>.+?)\s*$/;

/**
 * Parses a TASKS.md string into ParsedTasks.
 *
 * Records are blocks of `Key: Value` lines separated by blank lines or
 * `---` delimiters or section headers. The parser is intentionally lenient:
 * unrecognized lines are skipped, and any block that contains at least one
 * field is treated as a record.
 */
export function parseTasks(markdown: string): ParsedTasks {
  const result: ParsedTasks = { Inbox: [], Active: [], Delegated: [], Done: [] };

  const lines = markdown.split(/\r?\n/);
  let currentSection: FourState | null = null;
  let currentFields: Record<string, string> = {};

  const flush = () => {
    if (currentSection && Object.keys(currentFields).length > 0) {
      result[currentSection].push({ fields: currentFields, section: currentSection });
    }
    currentFields = {};
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Section header
    const sectionMatch = line.match(/^##\s+(Inbox|Active|Delegated|Done)\s*$/);
    if (sectionMatch) {
      flush();
      currentSection = sectionMatch[1] as FourState;
      continue;
    }

    // Record boundary markers — flush whatever we have
    if (line === "" || line.startsWith("---") || line.startsWith("[ INTAKE")) {
      flush();
      continue;
    }

    if (!currentSection) continue;
    if (line.startsWith("#")) continue; // top-level heading, ignored

    // Compact Done line — only honored inside the Done section. Any record
    // already accumulated is flushed first because the compact line stands
    // alone (no fence above it).
    if (currentSection === "Done") {
      const compact = parseCompactDoneLine(line);
      if (compact) {
        flush();
        currentFields = compact;
        flush();
        continue;
      }
    }

    // Field line: "Key: Value" (colon must appear before any other special char)
    const fieldMatch = rawLine.match(/^\s*([A-Za-z][A-Za-z\- ]*?):\s*(.*?)\s*$/);
    if (fieldMatch) {
      const key = fieldMatch[1].trim();
      const value = fieldMatch[2].trim();
      currentFields[key] = value;
    }
  }

  flush();
  return result;
}

/**
 * Canonical field order for serialized records.
 *
 * Mirrors `docs/specs/tasks-schema-spec.md` § Task Record Schema → Fields.
 * Fields outside this list are appended in insertion order after the
 * canonical ones, so unknown / future fields round-trip without loss.
 */
const FIELD_ORDER: readonly string[] = [
  "Title",
  "Description",
  "Source",
  "Requester",
  "Urgency",
  "Due date",
  "Priority",
  "State",
  "Owner",
  "Check-by",
  "Scheduled",
  "Action",
  "Note",
  "Done",
  "Synced",
  "Project",
] as const;

/**
 * Parse a single compact Done line back into a field map.
 *
 * Returns `null` if the line does not match the compact shape, in which case
 * the caller should fall through to the standard `Key: Value` parser.
 */
function parseCompactDoneLine(line: string): Record<string, string> | null {
  const m = COMPACT_DONE_RE.exec(line);
  if (!m || !m.groups) return null;

  const lead = m.groups.lead.trim();
  const rest = m.groups.rest;

  // Split on em-dash with surrounding spaces. Two valid shapes:
  //   "Title"                              (1 segment)
  //   "Title — Owner"                      (2 segments)
  //   "Title — Done YYYY-MM-DD"            (2 segments)
  //   "Title — Owner — Done YYYY-MM-DD"    (3 segments)
  const segments = rest.split(/\s+—\s+/);

  const fields: Record<string, string> = { State: "Done" };

  let title = segments[0]?.trim();
  let owner: string | undefined;
  let doneSegment: string | undefined;

  if (segments.length === 2) {
    const second = segments[1].trim();
    if (second.startsWith("Done ")) {
      doneSegment = second.slice("Done ".length).trim();
    } else {
      owner = second;
    }
  } else if (segments.length >= 3) {
    owner = segments[1].trim();
    const last = segments[2].trim();
    doneSegment = last.startsWith("Done ") ? last.slice("Done ".length).trim() : last;
  }

  if (!title) return null;
  fields.Title = title;
  if (owner) fields.Owner = owner;

  // Prefer the explicit `Done YYYY-MM-DD` tail; fall back to the leading
  // bracket date when it parses as a date.
  if (doneSegment && /^\d{4}-\d{2}-\d{2}$/.test(doneSegment)) {
    fields.Done = doneSegment;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(lead)) {
    fields.Done = lead;
  }
  return fields;
}

function renderRecord(fields: Record<string, string>): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const key of FIELD_ORDER) {
    if (key in fields) {
      lines.push(`${key}: ${fields[key]}`);
      seen.add(key);
    }
  }
  for (const key of Object.keys(fields)) {
    if (!seen.has(key)) {
      lines.push(`${key}: ${fields[key]}`);
    }
  }
  return lines.join("\n");
}

/**
 * Serializes `ParsedTasks` back to a TASKS.md string.
 *
 * Output shape (per `docs/specs/tasks-schema-spec.md`):
 *
 *   # Task Board
 *
 *   ## Inbox
 *   ---
 *   Title: ...
 *   ...
 *   ---
 *
 *   ## Active
 *   ...
 *
 * Round-trip contract: `parseTasks(renderTasks(parseTasks(s)))` equals
 * `parseTasks(s)`. Byte-identity with the original `s` is NOT promised —
 * the parser is lossy (drops free-form prose, normalizes whitespace, drops
 * `[ INTAKE — date ]` headers). Records survive in full, in section order,
 * in canonical field order.
 */
/**
 * Render a Done record as a single compact line. See `COMPACT_DONE_RE` for
 * the shape and the round-trip contract.
 */
export function renderDoneCompact(fields: Record<string, string>): string {
  const title = (fields.Title ?? "").trim() || "(untitled)";
  const owner = (fields.Owner ?? "").trim();
  const done = (fields.Done ?? "").trim();
  const lead = done || "no date";
  const parts = [title];
  if (owner) parts.push(owner);
  if (done) parts.push(`Done ${done}`);
  return `- [${lead}] ${parts.join(" — ")}`;
}

export function renderTasks(tasks: ParsedTasks): string {
  const out: string[] = ["# Task Board", ""];
  for (const section of RENDER_ORDER) {
    out.push(`## ${section}`);
    out.push("");
    if (section === "Done") {
      for (const record of tasks[section]) {
        out.push(renderDoneCompact(record.fields));
      }
      if (tasks[section].length > 0) out.push("");
    } else {
      for (const record of tasks[section]) {
        out.push("---");
        out.push(renderRecord(record.fields));
        out.push("---");
        out.push("");
      }
    }
  }
  // Trailing newline; collapse consecutive blanks at EOF to exactly one.
  return out.join("\n").replace(/\n+$/, "\n");
}
