---
description: Delegate a task directly — score candidates, confirm, and write a Delegated entry to TASKS.md
argument-hint: [task title or description]
allowed-tools: Read, Write, Edit
---

You are running the DELEGATE direct entry point for the claude-eisenhower plugin.

This command bypasses the full intake → prioritize → schedule chain. It is designed
for ad-hoc delegation: a task that arrives mid-session and needs an owner immediately.

A confirmed run produces a complete Delegated task record in TASKS.md, pushes a check-in
Reminder, and logs a follow-up memory entry — no `/schedule` run needed.

---

## Config check

Before doing anything else, check that `config/stakeholders.yaml` exists.

If it does not exist → stop and say:
> "I need a stakeholders file before I can score delegation candidates. Would you like me to create a starter file now? You'll fill in your team's details after setup."

If yes → run the `/setup` command (stakeholders step only), then resume `/delegate` when complete.
If no → stop and tell the user: "You can run /setup at any time to create the stakeholders file. /delegate requires it to score candidates."

## Step 1: Resolve the task input

If $ARGUMENTS is provided, treat it as the task title (and optionally description,
if the user passed both separated by " — " or on separate lines).

If $ARGUMENTS is empty, prompt:
1. "What's the task title?"
2. "Any additional context — description, deadline, or requester?" (optional)

Proceed with whatever the user provides. Do not require intake first.

---

## Step 2: Authority flag check

Before scoring, pass the task title and description through the `hasAuthorityFlag()` function
defined in `scripts/delegate-core.ts` (called automatically via the scoring CLI in Step 3).
The canonical authority pattern list is maintained in `AUTHORITY_PATTERNS` in that module —
do not duplicate it here.

If any pattern matches (case-insensitive):

> ⚠ This task may require your authority — are you sure you want to delegate it?

Ask: "Confirm delegation, or should this be reclassified as Q1 instead?"

- If the user says Q1: stop here. Say "Run /intake or /prioritize to add this as a Q1 task." Do NOT write to TASKS.md.
- If the user confirms delegation: note the override and continue.

---

## Step 3: Load the stakeholder graph and score

Resolve `plugin_root` following `skills/core/references/plugin-root-resolution.md`.

Read `config/stakeholders.yaml` from `{plugin_root}/`.

**If the file does not exist:**
> No stakeholder graph found. Copy `config/stakeholders.yaml.example`
> to `stakeholders.yaml` and fill in your delegates to enable scoring.

Ask: "Who should own this?" Accept a manually-entered alias and skip to Step 5.

**If the file exists but the stakeholders list is empty:**
> Stakeholder graph is empty — no delegates configured.

Ask: "Who should own this?" Accept a manually-entered alias and skip to Step 5.

**If the file exists and has delegates:**
Run the scoring CLI:

```
do shell script "cd " & quoted form of "{plugin_root}/scripts" & " && npx ts-node match-delegate.ts " & quoted form of taskTitle & " " & quoted form of taskDescription & " 2>&1"
```

Parse the JSON output. The `status` field will be one of:
- `match` — one or more candidates found
- `no_match` — no domain keyword scored above 0
- `empty_graph` — graph empty (handled above)
- `no_graph` — file missing (handled above)
- `invalid_graph` — file exists but has a schema / validation error. Do NOT
  tell the user to create the file — they already have one. Surface the
  `message` field verbatim (it names the file, alias, and offending value)
  and ask them to fix the typo. Skip to a manual delegate prompt: "Who
  should own this in the meantime?"
- `internal_error` — match-delegate hit an internal invariant. Show the
  `message` field, do NOT auto-assign, fall back to manual delegate prompt.

---

## Step 4: Present the scoring result with narrative scorecard

The CLI in Step 3 emits a JSON document on stdout. Parse it and read the
following fields (NOT in-process JS objects — these are top-level / per-element
fields on the parsed JSON):

- `candidates[]` — array of scored candidates, each with `alias`, `role`,
  `score`, `matched_domains`, `breakdown` (per-axis: `domain`, `relationship`,
  `capacity`, `pending`)
- `runnerUpDelta` — **top-level** field, NOT a sub-property of any candidate.
  Type is `number | null`. `null` means "fewer than 2 viable candidates" —
  semantically distinct from `0` ("tied with top"). Do NOT coerce or render
  `null` as `0`.

**If `status: match`:**

Render a narrative scorecard for the top candidate from the parsed JSON.
Use the breakdown object on `candidates[0]` to show each axis explicitly:

```
Suggested delegate: [candidates[0].alias] ([candidates[0].role]) — score [candidates[0].score]
  breakdown:
    domain +[breakdown.domain] ([matched_domains.join(", ")])
    [relationship] +[breakdown.relationship]
    capacity [capacity_signal] [+/-][breakdown.capacity]
    [if breakdown.pending < 0] pending [breakdown.pending] (currently overloaded)

Why [alias]: [1-sentence narrative tying the matched domain(s) to the task,
the relationship advantage, and any capacity caveat].
```

**Surface the runner-up** ONLY when BOTH (a) `candidates.length >= 2` AND
(b) `runnerUpDelta !== null`. If either is false, do NOT render the runner-up
block — there is no runner-up. (`null` ≠ `0`. A delta of 0 means tied; null
means absent. They are not interchangeable.)

```
Runner-up: [candidates[1].alias] ([candidates[1].role]) — score [candidates[1].score]
  (delta [runnerUpDelta])
  breakdown: [same per-axis format as above]
```

**Third-place** (when `candidates.length >= 3`): one-line summary —
`Also considered: [alias] ([score]) — [single dominant axis or "weak match"]`.

If `capacity_warning` is true for the top candidate, append:
> Note: [alias] is currently showing low capacity — confirm they can take this on.

Ask: "Delegate this to [alias]? Or would you like to assign someone else?"

**If `status: no_match`:**
> No clear domain match in your stakeholder graph.

Ask: "Who should own this?" Accept a manually-entered alias. If the input does not
match any alias in the graph, note: "That alias isn't in your stakeholder graph —
you can add them to stakeholders.yaml later. Proceeding with [input] as the delegate."

---

## Step 5: Confirm before writing — never auto-assign

Once a delegate is identified (scored or manual), present the confirmation prompt:

```
Ready to delegate:
  Task:       [title]
  Delegate:   [alias]
  Check-in:   [2–3 business days from today — skip weekends]
  TASKS.md:   Will write a Delegated entry
  Reminders:  Will push "Check in: [alias] re: [title]" if adapter is configured

Confirm? (yes / assign someone else / make this Q1 instead)
```

Do NOT write anything until the user says yes (or equivalent: "confirm", "go ahead",
"looks good").

If the user says "assign someone else": return to Step 4 and ask who. Then run the
**override learning loop** described in Step 5b before continuing.
If the user says "make this Q1": stop. Say "Run /intake or /prioritize to log this as Q1."

---

## Step 5b: Override learning loop

When the user overrides the suggested delegate (picks a different alias than
`candidates[0].alias`), ask ONE structured question before continuing:

> Was the suggestion wrong because of **domain** (which one was missed?),
> **capacity** (who's actually overloaded?), or **relationship** (peer/report
> mismatch)?

Capture the answer and append a row to `memory/delegation-learnings.md`
(create the file with the header row below if it does not exist). The
`Reason` cell holds ONE concrete value — not a list — chosen from the
allowed set described below the example.

Example row (concrete values, not placeholders):

```
| Date       | Task                     | Suggested | Chosen | Reason | Detail                  |
|------------|--------------------------|-----------|--------|--------|-------------------------|
| 2026-05-27 | Review API contract spec | Jordan F. | Alex E.| domain | missed: legal compliance|
```

Set `Reason` to EXACTLY ONE of: `domain`, `capacity`, `relationship`, or
`declined` (decline path — see below). Do NOT write the literal string
"domain / capacity / relationship" into the cell — that is the
*alternative set*, not a valid value. Set `Detail` to the user's specific
answer (e.g., "missed: legal review" or "Sam is on vacation this week");
use `—` for the decline path.

**If the user declines to answer** ("just go" / "skip"): do NOT block —
continue to Step 5 confirmation. ALSO append a stub row with
`Reason: declined` and `Detail: —`. The override signal ("scoring picked X
but user chose Y") is preserved even without the diagnostic axis; without
the stub the override is invisible to any future review.

`memory/delegation-learnings.md` is a manual review log. Nothing else
currently reads it; the value is letting the user notice override patterns
when they review the file themselves. Do not claim the plugin "learns from"
this file — it does not, today.

---

## Step 5c: Inferred-domain suggestion log

After the user confirms the suggested delegate (Step 5 yes-path — NOT the
override path which is already handled in Step 5b), extract candidate domain
keywords from the task title + description and log them for later promotion
into `config/stakeholders.yaml`.

This implements the "learn-by-doing" loop from issue #39 without silently
editing the stakeholders file. The plugin proposes; the user promotes.

**Extraction rule (heuristic, intentionally non-deterministic):**

1. Tokenize task title + description, lowercase, strip punctuation.
2. Drop English stop-words. Use this concrete list as the floor — the LLM
   may extend it with judgment but must not shrink it:
   `the, a, an, and, or, but, if, then, to, of, in, on, at, for, with,
   from, by, as, is, are, was, were, be, been, being, have, has, had, do,
   does, did, will, would, should, could, may, might, can, this, that,
   these, those, it, its, i, me, my, you, your, we, our, he, she, they,
   them, his, her, their, what, which, when, where, who, why, how, please,
   thanks, asap, urgent`.
3. Drop tokens already present (case-insensitively) in the alias's current
   `domains:` list in `config/stakeholders.yaml` — no point suggesting what
   is already there.
4. Keep only multi-character tokens that look like domain-of-work nouns
   (skip pronouns, verbs of motion, common adjectives). When in doubt, keep
   — the user filters at promotion time.
5. Cap the suggestion list at 5 keywords per delegation; surface the
   highest-signal tokens (longest, lowest stop-word affinity).
6. **Cap on stop-word floor extension.** The LLM may extend the floor list
   above by AT MOST 10 additional tokens per run. An over-extended floor
   that silences every delegation is the failure mode of "may extend with
   judgment" — keep the cap visible and enforce it.

If the extracted list is empty after the rules above, skip this step
silently — nothing to suggest.

**Write to `memory/domain-suggestions.md`** (create with this header on
first write):

```
# Domain suggestions — confirmed delegations

Tasks you confirmed for each delegate, with inferred keywords. Review
periodically and promote good keywords into config/stakeholders.yaml
under the alias's `domains:` list.

| Date       | Alias    | Task                       | Suggested domains             | Promoted? |
|------------|----------|----------------------------|-------------------------------|-----------|
```

Append one row per confirmed delegation:

```
| 2026-05-28 | Jordan V.| Review API contract spec   | api, contract, spec, review   | ☐         |
```

### Markdown-table escape rules (MANDATORY)

Pipe characters and newlines in user content silently corrupt markdown
tables. Apply these rules to every USER-CONTENT column value before writing
the row. "User-content columns" are `Alias`, `Task`, and `Suggested
domains` in the current table; `Date` is plugin-generated `YYYY-MM-DD` and
exempt; `Promoted?` is plugin-controlled and exempt. If a future schema
adds a column carrying user-provided text, apply the same rules.

1. Replace every `|` in user-content cells with `\|` (backslash-escaped).
2. Collapse `\n`, `\r`, and `\r\n` to a single space.
3. Trim leading/trailing whitespace.
4. Truncate the `Task` cell to 80 characters; if truncated, append `…`. The
   full title still lives in TASKS.md.

### Idempotency

Apply escape rules 1–4 FIRST, then compare. Before appending, check the
existing log for a row matching the POST-ESCAPE
`(Date, Alias, Task)` tuple (case-insensitive on Alias + Task, exact on
Date). This catches whitespace drift (`"Review PR "` vs `"Review PR"`),
pipe-escape drift, and newline drift — without normalizing first, a
mechanically equivalent task would append a duplicate.

If found, do NOT append a duplicate — same-day re-delegation of the same
task is a no-op for the suggestion log. Cross-day re-delegation of the
same task DOES append (the date differs) — that's signal about repeated
work, not duplication.

If extraction produced ZERO candidates (Step 5c's "skip silently" path)
AND the user has had ≥5 such silent skips in this log file, surface a
one-line note ONCE: "Heads up — Step 5c has skipped suggestion logging
on N delegations in a row. If you want richer suggestions, consider
tightening the stop-word floor cap or adding domain seeds to
stakeholders.yaml." Prevents silent-loop pathology if the floor extension
got over-aggressive.

Set `Promoted?` to `☐` always — the user manually flips to `☑` after editing
`stakeholders.yaml`. The plugin never modifies the `Promoted?` column.

**Do NOT edit `config/stakeholders.yaml`.** The file is PII-bearing and
user-owned. The learn-by-doing loop is markdown-log + manual promotion,
matching the existing override-learning pattern in Step 5b. If the user
wants direct YAML writeback in the future, that's a follow-up issue with
explicit consent prompts and a safe YAML mutator.

`memory/` is gitignored, so this log stays local.

---

## Step 6: Write the Delegated task record to TASKS.md

Read TASKS.md from the workspace root. If the file does not exist, create it with
these section headers before appending:

```markdown
# Task Board

## Inbox

## Active

## Delegated

## Done
```

Append the following record to the `## Delegated` section:

```
---
[ INTAKE — {TODAY} ]
Title:       {task title}
Description: {task description or "(none provided)"}
Source:      Direct delegation
Requester:   Self
Urgency:     Delegated
Due date:    Not specified
Priority:    Q3
State:       Delegated
Owner:       {confirmed alias}
Check-by:    {check-in date}
Scheduled:   {today's date}
Action:      Delegated — check in {check-in date}
---
```

Where `{TODAY}` and `{Scheduled}` are today's date in YYYY-MM-DD format.

---

## Step 7: Push to task output adapter

Read `config/task-output-config.md` for the active adapter.

If the adapter is not configured (`~~task_output` or missing), skip this step silently.

If configured, push via the dispatcher — never invoke an adapter's script directly.
Resolve `plugin_root` per `skills/core/references/plugin-root-resolution.md`, write
the prepared `task_output_record` to a temp JSON file, then run:

```applescript
do shell script "cd " & quoted form of (pluginRoot & "/scripts") & " && npx ts-node task-output.ts push " & ¬
    quoted form of pluginRoot & " " & ¬
    quoted form of configFile & " " & ¬
    quoted form of recordJsonPath
```

The record uses:
- **title**: `"Check in: {alias} re: {task title}"`
- **due_date**: check-in date (YYYY-MM-DD)
- **priority**: `medium`
- **quadrant**: `Q3`
- **list_name**: read from the matching `### <adapter>` block (Markdown File ignores it).

Stdout is one line of JSON: `{"ok":true,"mode":"push","result":{"status":"...","reason":"...","id":"..."}}`.

On `result.status: success`: update the task record with:
```
Synced: {adapter} ({list_name}) — {today's date}
Reminder-id: {result.id}
```

On `result.status: skipped`: include `Reminder-id` only when the dedup path returned a non-empty `id`.
```
Synced: skipped (already exists)
Reminder-id: {result.id}   ← omit if result.id is ""
```

On `result.status: error` or `ok:false`:
```
Synced: failed — {reason or error}
```

`Reminder-id` carries the adapter's stable identifier (Reminders x-coredata URI for the Reminders adapter). `commands/execute.md` reads it back at completion time so re-delegation cannot orphan the external record (issue #36).

Show a one-line result: `✓ Check-in pushed to {adapter}` or `⚠ {adapter} push failed — [reason]. TASKS.md entry is saved.`

---

## Step 8: Log to memory

Invoke the memory-manager skill:
`log-delegation — alias: [confirmed alias], task: [task title], check_in_date: [check-in date]`

---

## Step 9: Confirm to the user

```
Delegated ✓
  Task:       {title}
  Owner:      {alias}
  Check-in:   {check-in date}
  TASKS.md:   Delegated entry written
  Reminders:  {push result}
  Memory:     Follow-up logged for {alias}

Run /execute when {alias} reports back, or /schedule to review all open delegations.
```

---

## Edge cases

**Task already exists in TASKS.md**: Before Step 3, scan TASKS.md for a close title
match. If found, ask: "A task titled '[title]' already exists in [{quadrant}]. Do you
want to delegate the existing task or create a new Q3 entry?"

**User provides a name not in the graph at Step 4**: Record the literal name as the
`Delegate to:` alias and note in the confirmation: "This alias isn't in your stakeholder
graph — scoring was not used."

**Synced field already present on an existing Q3 task**: If the user is re-delegating
a task that already has `Synced:` set, warn: "This task was already delegated and synced.
Confirm you want to create a duplicate entry, or update the existing one?"

**No TASKS.md write permission**: If the write fails, surface the error clearly and
do not attempt the Reminders push. The user must resolve file access before retrying.
