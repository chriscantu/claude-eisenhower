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

const SECTION_NAMES: readonly FourState[] = ["Inbox", "Active", "Delegated", "Done"] as const;

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
