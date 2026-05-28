---
description: One-shot capture — parse, prioritize, and schedule a single task with one confirmation
argument-hint: [describe the task in natural language]
allowed-tools: Read, Write, Edit
---

You are running the QUICK one-shot of the Engineering Task Flow.

The user has described a task: $ARGUMENTS

`/quick` collapses `/intake` → `/prioritize` → `/schedule` into a single
confirmation block. Use it when the task is small enough that a four-command
ceremony costs more than it earns — Slack-message tasks, drive-by PR review
requests, single-day actions. For multi-task batches or anything ambiguous,
fall back to the explicit three-command flow.

---

## Step 1: Parse

Apply the full extraction rules from `commands/intake.md` to `$ARGUMENTS`:

- Title, Description, Source, Requester, Urgency signal, Due date
- Use the session date from `# currentDate` as the temporal anchor (same rule
  as intake). If `# currentDate` is missing, STOP and ask "What is today's
  date?" — do NOT fall back to training-cutoff dates.
- Resolve Requester against `config/stakeholders.yaml` per the intake alias
  rules. Missing file → write verbatim, no error.

Track `(stated)` vs `(inferred)` for each field — these markers MUST appear in
the confirmation block.

## Step 2: Tentative Q (two-pass — confirmed at Step 3)

Q assignment is two-pass. Step 2 picks a TENTATIVE Q from the parsed text
alone (no CLI calls); Step 3 may demote a tentative Q3 to Q1/Q2/Q4 based
on the `match-delegate.ts` result. The user sees only the final Q in the
Step 4 confirmation block.

**Authority check (runs UNCONDITIONALLY, before the table below).** Pass
the task title + description through `hasAuthorityFlag()` in
`scripts/delegate-core.ts` (canonical pattern list `AUTHORITY_PATTERNS`
lives there — do NOT restate it here; drift risk). If any pattern matches,
short-circuit: tentative Q = Q1, label as `authority-promoted`, capture
the matched phrase for the confirmation block, skip the table. The user
can still override at confirmation. This check is independent of the Q3
CLI path — it MUST run for Q1/Q2/Q4 inputs too, otherwise authority
detection silently misses everything that doesn't reach Step 3.

**Tentative-Q table** (when the authority check didn't fire):

| Signal in parsed input                                                              | Tentative Q |
|-------------------------------------------------------------------------------------|-------------|
| `today`, `EOD`, `urgent`, `now`, `asap`, due date = today                           | Q1          |
| `this week`, `by Friday`, due date within 7 days from today                         | Q2          |
| Requester ≠ Self AND no Q1/Q2 signal                                                | Q3 (candidate) |
| Explicit elimination signal (`drop`, `cancel`, `eliminate`, `not doing`, `kill`, `nevermind`, `skip it`, `won't do`) | Q4 |

Match top-to-bottom; take the first that fires. The Q3 row is a
**candidate** — Step 3 confirms via `match-delegate.ts`.

When NONE of the four rows fires (genuine ambiguity — including the
common capture shape "Have/Ask/Get [NAME] do [TASK]" where Requester
resolves to Self but the work is not for Self, fix #63), default to Q2
and mark the Q value as `(inferred)`. Never silently pick Q4 for work
the user explicitly captured — `/quick` is for capture, not
elimination. Q4 is opt-in: it requires the explicit elimination signal
in Row 4 above, or a manual Q-override at the Step 4 edit prompt.

## Step 3: Confirm Q + assign schedule

This step resolves the Step 2 tentative Q into a final Q and computes the
scheduled date.

**If tentative Q == Q3 (candidate):** run the scoring CLI exactly as
`prioritize.md` Step 4b describes (resolve plugin_root via
`skills/core/references/plugin-root-resolution.md`, invoke
`npx ts-node match-delegate.ts`, parse the `MatchResult` JSON).

- `status: match` → final Q = Q3. Show the top candidate's `alias` + one-line
  breakdown in the confirmation block.
- `status: no_match` / `empty_graph` / `no_graph` / `invalid_graph` /
  `internal_error` → DEMOTE the tentative Q3. If due date is set OR urgency
  signal present, final Q = Q2; otherwise final Q = Q4. Surface a one-line
  note: "No clear delegate — keeping this on your plate."

**If tentative Q ∈ {Q1, Q2, Q4}:** no CLI call needed; use the tentative
value as final.

**Default schedule per final Q:**

| Final Q | Default schedule                                                          |
|---------|---------------------------------------------------------------------------|
| Q1      | TODAY (use `# currentDate` ISO)                                            |
| Q2      | Next focus block this week — pick a weekday ≥ TODAY+1 in `# currentDate`'s week. If today is Friday, roll to next Monday. |
| Q3      | Delegate suggested by `match-delegate.ts`. Check-by date = Due date or TODAY+3 if no due date. |
| Q4      | No schedule — eliminate on confirm.                                        |

## Step 4: Single confirmation block

Present everything in one block. This is the only confirmation prompt:

```
/quick — review and confirm:

  Title:        [title]
  Source:       [source]  (stated | inferred)
  Requester:    [requester]  (stated | inferred)
  Urgency:      [urgency signal]  (stated | not mentioned)
  Due date:     [ISO date]  (verbatim | parsed from "[phrase]", anchor [TODAY-ISO] | not mentioned)

  Priority:     Q[X]  (inferred from "[signal]" | authority-promoted | stated)
  Schedule:     [date or "delegate to [alias]" or "eliminate"]
  Check-by:     [date if Q3, omitted otherwise]
  Push to:      [adapter name from config/task-output-config.md, or "skip (Q3 / Q4)" or "no adapter configured"]

Confirm / edit / cancel?
```

The confirmation block must include EVERY default the command is about to
apply — Q-classification, scheduled date, delegate alias, AND the adapter
push decision. The `Push to:` line collapses what would otherwise be a
second prompt at Step 6 into this single gate, preserving the
one-confirmation contract from issue #35.

- **confirm**: write to TASKS.md per Step 5 below, then perform the adapter
  push declared on the `Push to:` line (no second prompt).
- **edit**: ask which field to change, re-render the block. Loop until
  confirm. Edit is PRE-WRITE only — see "Post-write requests" below.
- **cancel**: drop the record, no write, no push.

### Post-write requests

If the user asks to "edit", "fix", or "undo" AFTER `confirm` has already
written to TASKS.md, the spec does NOT retroactively unwind the write —
TASKS.md is the source of truth and undo would risk silent state drift.
Respond:

> "/quick has already written this task. To change it, run `/prioritize
> [title]` to reclassify, `/schedule [title]` to move the date, or
> hand-edit the entry in TASKS.md. To remove it entirely, delete the entry
> from TASKS.md; if it was pushed to your adapter, mark it complete via
> `/execute [title]` (uses the adapter's `completeTask` path) and then
> delete the Reminder / output by hand. The adapter contract does not
> currently expose a `deleteTask` operation."

Only PRE-confirm `edit` re-renders the block.

## Step 5: Write on confirm

Apply the writes that the equivalent `/intake` + `/prioritize` + `/schedule`
sequence would produce — but skip the intermediate Inbox parking step.

1. Ensure `TASKS.md` exists with the standard headings (`## Inbox`,
   `## Active`, `## Delegated`, `## Done`). Create with that structure if
   missing.
2. Compose the full task record with intake fields PLUS:
   - `Priority: Q[X]`
   - `State: Active | Delegated | Done` per Q
   - `Owner: me | [delegate alias]`
   - `Scheduled: [ISO date]` (Q1/Q2) or `Check-by: [ISO date]` (Q3) or
     `Note: Eliminated — Q4 cut [TODAY-ISO]` (Q4)
   - `Suggested delegate: [alias]` for Q3 when the scoring CLI returned a
     match (mirrors `/prioritize` Step 4b output).
3. Append the record to the correct section directly — do NOT park in
   `## Inbox` first. The single-confirm gate is what authorizes the direct
   write; without it `/quick` would skip the intake confirmation that
   `/intake` enforces.
4. Confirm in one line: "Done — [title] [verb per Q]." Examples:
   - Q1: "Done — 'Review PR' scheduled today."
   - Q2: "Done — 'Plan Q3 OKRs' scheduled Thu 2026-06-04."
   - Q3: "Done — 'Update onboarding doc' delegated to Jordan V., check-by 2026-06-03."
   - Q4: "Done — 'Tidy old Jira labels' eliminated."

## Step 6: Push to adapter (no second prompt)

The `Push to:` line in Step 4's confirmation block already declared the
adapter decision. Step 6 EXECUTES that decision — it does NOT re-prompt.

Push behavior per Q:

| Q  | `Push to:` line default                                        | Action on confirm |
|----|----------------------------------------------------------------|-------------------|
| Q1 | active adapter name (read from `config/task-output-config.md`) | push via dispatcher |
| Q2 | active adapter name                                            | push via dispatcher |
| Q3 | `skip (Q3 — delegate needs visibility, not your list)`         | no push            |
| Q4 | `skip (Q4 — eliminated)`                                       | no push            |

The dispatcher invocation follows the same contract `/schedule` uses; see
`scripts/task-output.ts`. No duplication of the dispatch logic here.

If no adapter is configured (`Active Adapter: ~~task_output` or section
missing), the `Push to:` line reads `no adapter configured` and Step 6 is a
no-op. The task still lives in TASKS.md.

Q3 carve-out rationale: the active delegate needs the visibility (their
Slack / email / their Reminders, not yours). Auto-pushing a Q3 to the
user's list adds noise without changing who owns the work.

**Override grammar for `Push to:` at edit time** — any edit that changes
the `Push to:` value away from `skip (...)` honors the override and
pushes. Example tokens the LLM should treat as override: `push`,
`push anyway`, `push to [adapter]`, `push it`, `yes push`. The literal
token doesn't matter as long as the resulting `Push to:` value is the
adapter name and not a `skip (…)` string. Re-draw the Step 4 block with
the new value and re-confirm before writing.

---

## When to fall back to the explicit flow

`/quick` is one-task. Multi-task detection — fires when ALL of:

- `$ARGUMENTS` contains ≥2 imperative verbs (e.g. `review`, `write`,
  `follow up`, `send`, `update`, `draft`, `prep`, `ship`, `respond to`,
  `merge`, `approve`). Excluded from the verb list on purpose:
  `schedule`, `delegate`, `prioritize`, `intake`, `execute` — those are
  command names and frequently appear as Q-defaults metadata in user
  phrasing ("schedule my PR review for Thursday" is one task, not two).
  AND
- Those verbs are joined by `and`, `then`, `,`, `;`, `&`, or a newline.
  Joiner `for` and prepositions like `to`, `by`, `with` are NOT joiners
  for this rule — they typically introduce arguments to the same verb.
  AND
- Each verb has a distinct direct object (different nouns / different
  subjects)

"Review PR and merge it" → one task (same object — the PR). Pass through.
"Schedule my PR review for Thursday" → one task (`schedule` excluded from
verb list). Pass through.
"Review PR and write status doc and follow up with Jordan" → three tasks.
Refuse:

> "Looks like more than one task here ([N] detected). Run `/intake` for
> each, then `/prioritize` to batch-classify. `/quick` is one task at a
> time."

Do not silently pick the first one — the user loses the others if you do.

## Edge cases

- **No `# currentDate`** → STOP and ask, per intake rule.
- **Empty `$ARGUMENTS`** → "What's the task? Give me a sentence and I'll
  handle the rest."
- **Stakeholder graph missing on Q3 path** → write `Owner: [not yet
  assigned — see stakeholders.yaml]`, surface that in the confirmation
  block, continue.
- **Authority signal detected** → promote to Q1, label as
  `authority-promoted` in the Priority field, surface the matched phrase.
- **Malformed `TASKS.md`** (missing one or more of the standard headings:
  `## Inbox`, `## Active`, `## Delegated`, `## Done`) → do NOT silently
  rewrite the file. Surface: "TASKS.md is missing the `[X]` heading.
  Append it manually or delete TASKS.md so /quick can recreate from
  scratch." Stop without writing.
- **`scripts/match-delegate.ts` non-zero exit** (Q3 path) → treat as
  `status: internal_error`; surface the stderr / message verbatim, fall
  back to a manual delegate prompt ("Who should own this?"), do NOT
  auto-assign. Do NOT silently demote to Q4.
- **`$ARGUMENTS` parses to zero task fields** (no title, no description, no
  source, no requester signal) → re-prompt: "I couldn't extract a task
  from that. Try a sentence like 'Review Jordan's PR by Thursday'."
- **`stakeholders.yaml` `status: invalid_graph`** (Q3 path) → surface the
  CLI's `message` field verbatim, ask "Who should own this in the
  meantime?", proceed with the manually-entered alias.
