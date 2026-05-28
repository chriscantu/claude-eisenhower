# Task Output Adapter Interface

This directory contains adapters for the `~~task_output` connector. Each adapter
implements the same contract so that `/schedule` can push tasks to any external
system by swapping one file and one config line.

---

## The Contract

Every adapter must document:

1. **How it receives input** — the `task_output_record` fields it reads
2. **What it does** — the system-specific action (AppleScript, MCP call, API, etc.)
3. **What it returns** — a `push_result` with status, reason, and external ID
4. **Deduplication logic** — how it checks for existing tasks before writing
5. **Error handling** — what causes a failure vs. a skip vs. a success

---

## Input Schema (`task_output_record`)

Every adapter receives these fields from `/schedule`:

```
title:        string         # Short action-oriented label (max 10 words)
description:  string         # Full task description including context
due_date:     date | null    # ISO date (YYYY-MM-DD) or null if not set
quadrant:     Q1 | Q2 | Q3  # Eisenhower quadrant (Q4 is never pushed)
priority:     high | medium  # Q1 = high, Q2/Q3 = medium
source:       string         # Where this task originated (e.g., "Email (Procore)")
requester:    string | null  # Person who requested the task, if known
list_name:    string         # Target list/project name in the external system
```

---

## Output Schema (`push_result`)

Every adapter returns:

```
status:   success | skipped | error
reason:   string   # e.g., "Created", "Already exists", "Permission denied"
id:       string   # External system ID (Reminder ID, Jira ticket key, etc.) or ""
```

---

## Quadrant Rules (applied before calling the adapter)

`/schedule` enforces these rules before any adapter call:

| Quadrant | Pushed? | title modification | due_date |
|----------|---------|--------------------|----------|
| Q1       | Yes     | None               | Today (YYYY-MM-DD) |
| Q2       | Yes     | None               | Confirmed focus block date |
| Q3       | Yes     | Prefixed: "Check in: [delegate] re: [original title]" | 3–5 business days from today |
| Q4       | No      | —                  | — |

Adapters receive the already-modified title and due_date. They do not need to re-apply quadrant logic.

---

## Available Adapters

| Adapter | File | Code | Status | Platform |
|---------|------|------|--------|----------|
| Mac Reminders | `reminders.md` | `scripts/adapters/reminders.ts` | ✅ Shipped | macOS |
| Markdown File | `markdown-file.md` | `scripts/adapters/markdown-file.ts` | ✅ Shipped | Cross-platform |
| Asana | (future) | — | 🔲 Future | — |
| Jira | (future) | — | 🔲 Future | — |
| Linear | (future) | — | 🔲 Future | — |

Two shipped implementations prove the dispatcher is real: swap by changing
one line in `config/task-output-config.md` (`## Active Adapter`). The
dispatcher lives in `scripts/task-output.ts` and is the single entry point
commands use.

---

## Adding a New Adapter

1. Copy the structure from `reminders.md` or `markdown-file.md`.
2. Add `scripts/adapters/[system].ts` implementing the `TaskOutputAdapter`
   interface from `scripts/adapter-types.ts` (`pushTask`, `completeTask`,
   and a string `name`).
3. Implement the same deduplication check before writing.
4. Register the adapter in `scripts/task-output.ts` `bootstrapBuiltInAdapters`.
5. Set `## Active Adapter` in `config/task-output-config.md` to the new name.

The adapter name in `task-output-config.md` must exactly match the
`name` property the adapter exposes (and conventionally the filename
without `.md`).
