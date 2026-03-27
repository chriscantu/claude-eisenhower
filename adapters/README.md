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

| Adapter | File | Status |
|---------|------|--------|
| Mac Reminders | `reminders.md` | ✅ Active (v1) |
| Asana | `asana.md` | 🔲 Future |
| Jira | `jira.md` | 🔲 Future |
| Linear | `linear.md` | 🔲 Future |

---

## Adding a New Adapter

1. Copy the structure from `reminders.md`
2. Replace the AppleScript section with the system-specific push mechanism (MCP call, REST API via bash, etc.)
3. Implement the same deduplication check before writing
4. Return a `push_result` in the standard format
5. Register the adapter name in `integrations/config/task-output-config.md` under `## Active Adapter`

The adapter name in `task-output-config.md` must exactly match the filename (without `.md`).
