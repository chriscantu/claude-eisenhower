/**
 * markdown-file.ts
 *
 * Cross-platform task-output adapter that writes to a plain markdown file.
 * No external dependencies (no AppleScript, no network). Proves the swap
 * mechanic: a second concrete adapter alongside Reminders.
 *
 * Push semantics:
 *   - Appends a GFM checkbox line: `- [ ] <title> [<quadrant>] (due: <date>)`
 *   - Skips when an existing checkbox line (any state) already carries the
 *     same title (case-insensitive trim).
 *
 * Complete semantics:
 *   - Finds the line containing the title and flips `- [ ]` → `- [x]`.
 *   - Idempotent: re-completing already-checked line returns success.
 *   - Missing file or unmatched title → skipped (non-blocking).
 *
 * `list_name` is ignored by this adapter — it does not partition output by
 * list. The field is part of the contract for adapters that need it
 * (Reminders, Asana, …); ignoring it here is honest per "if a field
 * doesn't apply, the adapter ignores not throws."
 *
 * SOLID:
 *   - SRP: only filesystem I/O for the markdown file
 *   - DI:  the file path is injected via `createMarkdownFileAdapter({ file })`
 *
 * Spec: adapters/markdown-file.md
 * Issue: #27
 */

import * as fs from "fs";
import * as path from "path";

import type {
  TaskOutputRecord,
  PushResult,
  CompleteResult,
  TaskOutputAdapter,
} from "../adapter-types";

export interface MarkdownFileAdapterOptions {
  /** Absolute path to the markdown file the adapter appends to. */
  file: string;
}

const CHECKBOX_OPEN_RE = /^(\s*)-\s\[ \]\s/;
const CHECKBOX_DONE_RE = /^(\s*)-\s\[x\]\s/i;

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function readLines(file: string): string[] {
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, "utf-8");
  return raw.length === 0 ? [] : raw.split("\n");
}

function writeLines(file: string, lines: string[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join("\n"));
}

/**
 * Extract the title portion of a checkbox line. Returns null if the line is
 * not a checkbox. The title is everything between the checkbox marker and
 * the first ` [` (which begins the quadrant tag rendered at push time).
 *
 * Tolerates lines without the quadrant suffix — older external edits or
 * hand-added items — by falling back to "after marker → end of line".
 */
function extractCheckboxTitle(line: string): string | null {
  const m = line.match(/^\s*-\s\[[ xX]\]\s+(.*)$/);
  if (!m) return null;
  const rest = m[1];
  const tagIdx = rest.indexOf(" [");
  return tagIdx === -1 ? rest.trim() : rest.slice(0, tagIdx).trim();
}

function renderLine(record: TaskOutputRecord): string {
  const due = record.due_date ?? "no due date";
  return `- [ ] ${record.title} [${record.quadrant}] (due: ${due})`;
}

export function createMarkdownFileAdapter(
  opts: MarkdownFileAdapterOptions
): TaskOutputAdapter {
  const file = opts.file;

  return {
    name: "markdown-file",

    async pushTask(record: TaskOutputRecord): Promise<PushResult> {
      const lines = readLines(file);
      const target = normalize(record.title);
      for (const line of lines) {
        const title = extractCheckboxTitle(line);
        if (title !== null && normalize(title) === target) {
          return { status: "skipped", reason: "Already exists", id: "" };
        }
      }
      const newLine = renderLine(record);
      const nextLines = lines.length === 0 ? [newLine, ""] : [...lines, newLine];
      writeLines(file, nextLines);
      return {
        status: "success",
        reason: "Created",
        id: `${file}:${record.title}`,
      };
    },

    async completeTask(
      title: string,
      _list_name: string
    ): Promise<CompleteResult> {
      if (!fs.existsSync(file)) {
        return { status: "skipped", reason: "File not found" };
      }
      const lines = readLines(file);
      const target = normalize(title);
      let matched = false;
      let alreadyComplete = false;
      const nextLines = lines.map((line) => {
        const lineTitle = extractCheckboxTitle(line);
        if (lineTitle === null || normalize(lineTitle) !== target) return line;
        if (CHECKBOX_DONE_RE.test(line)) {
          alreadyComplete = true;
          matched = true;
          return line;
        }
        if (CHECKBOX_OPEN_RE.test(line)) {
          matched = true;
          return line.replace(CHECKBOX_OPEN_RE, "$1- [x] ");
        }
        return line;
      });
      if (!matched) {
        return { status: "skipped", reason: "Not found" };
      }
      if (alreadyComplete) {
        return { status: "success", reason: "Already completed" };
      }
      writeLines(file, nextLines);
      return { status: "success", reason: "Completed" };
    },
  };
}
