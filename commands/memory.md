---
description: [Memory] Surface local memory state — delegate logs and analytics
argument-hint: show [alias|analytics] (default: show)
allowed-tools: Read
---

You are running the MEMORY command of the Engineering Task Flow.

This command is the user-facing read surface for everything the plugin stores
under `memory/`. Issue #42: the user is never shown what's in those files,
which is a trust violation — silent state with no inspection loop.

This command writes nothing. For correction use `/forget`.

---

## Step 1: Parse argument

Forms supported:

- `/memory` or `/memory show` — render the index (Step 2A)
- `/memory show <alias>` — render that delegate's per-person file (Step 2B)
- `/memory show analytics` — summarize the three `*-log.md` files (Step 2C)

Any other form: render `Usage: /memory show [alias|analytics]` and stop.

---

## Step 2A: Index view (no arg or "show")

Read `memory/glossary.md` `## Stakeholder Follow-ups` table. If the file is
missing or the table is empty, render:

```
No memory entries yet. Delegations recorded by /delegate, /schedule, and
/complete-task will appear here.
```

Otherwise, group entries by alias and render:

```
## Memory — index

─── Delegations ─────────────────────────────────────────
  {alias}: {pending_count} pending, {resolved_count} resolved
  {alias}: {pending_count} pending, {resolved_count} resolved
  ...

─── Analytics logs ──────────────────────────────────────
  today-log.md:  {N} entries (oldest {date}, newest {date})
  plan-log.md:   {N} entries (oldest {date}, newest {date})
  review-log.md: {N} entries (oldest {date}, newest {date})
```

If a log file is missing, render `today-log.md: not present yet`.

Close with:

```
Run /memory show {alias} for delegate detail, or /memory show analytics for
the log summary.
```

---

## Step 2B: Alias detail view

Resolve the alias argument case-insensitively against:

1. Existing `memory/people/*.md` filenames (basename without `.md`)
2. Alias values in `memory/glossary.md` `## Stakeholder Follow-ups` rows
3. `Owner:` values on Delegated records in `TASKS.md`

If no match: render `No memory entries for "{arg}".` and stop. If the alias
exists in TASKS.md as a current delegate but has no `memory/people/` file,
render: `"{arg}" is a current delegate but has no memory file yet. The next
/delegate or /schedule call to this alias will create it.`

On match, read `memory/people/{alias-filename}.md` verbatim and render it
inside a markdown code fence so the user sees the actual file contents.

Close with:

```
Run /forget {alias} to clear all entries for this delegate (requires
confirmation), or /review-org {alias} to see in-flight delegations from TASKS.md.
```

---

## Step 2C: Analytics view

Run the analytics aggregator script — it parses the three log files and emits
a single-line JSON summary. The LLM does not count lines or sum columns by
hand: that was identified as a brittle pattern in code review (PR #91), with
drift expected across runs and models.

Resolve `plugin_root` following `skills/core/references/plugin-root-resolution.md`.

Run:

```bash
npx ts-node ${plugin_root}/scripts/memory-analytics.ts .
```

Parse the JSON output. Each log key returns `{present, entry_count,
date_range, recent_sums, recent_trend}`. Window sizes are pinned in the
script:

- **today-log**: last 14 entries (≈2 weeks), `recent_sums` over
  `overdue`, `inbox`, `on_plate`, `completed`
- **plan-log**: last 4 entries (≈4 weeks), `recent_sums` over
  `committed`, `carryover`, `deferred`
- **review-log**: last 4 entries, `recent_trend` (first → last delta) over
  `inbox` and `delegated`

If a log file is absent, the corresponding key returns `present: false` —
render `{filename}: not present yet` for that block.

Render:

```
## Memory — analytics summary

─── today-log.md (last 14 entries) ──────────────────────
  overdue: {N}  inbox: {N}  on_plate: {N}  completed: {N}

─── plan-log.md (last 4 entries) ────────────────────────
  committed: {N}  carryover: {N}  deferred: {N}

─── review-log.md (last 4 entries) ──────────────────────
  inbox trend: {first} → {last} ({+/-N})
  delegated trend: {first} → {last} ({+/-N})
```

If a log file is missing, write `{filename}: not present yet` for that block.

Close with:

```
Run /trends for the 4-week pattern report, or /memory show for the index.
```

---

## Step 3: Done

The command is complete. It writes nothing — no log entry of its own, no
mutation to memory or TASKS.md.
