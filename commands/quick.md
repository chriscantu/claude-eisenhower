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

## Step 2: Default Q from urgency keywords

Pick a default quadrant from the parsed urgency + due-date + source. The user
will see this and can override in the single confirmation:

| Signal in parsed input                                                    | Default Q |
|---------------------------------------------------------------------------|-----------|
| `today`, `EOD`, `urgent`, `now`, `asap`, due date = today                 | Q1        |
| `this week`, `by Friday`, due date within 7 days from today               | Q2        |
| Requester ≠ Self AND match found by `scripts/match-delegate.ts` (status = `match`) AND no authority signal | Q3        |
| No timing AND Requester = Self AND no `match-delegate` hit                | Q4        |

Match the rows top-to-bottom and take the first that fires. The Q3 row
defers the domain-match decision to the canonical scoring CLI rather than
re-implementing keyword extraction here — same source of truth `/delegate`
and `/prioritize` use.

**Authority flag** — canonical pattern list lives in `AUTHORITY_PATTERNS` in
`scripts/delegate-core.ts`. Pass the task title + description through
`hasAuthorityFlag()` (called automatically by the scoring CLI in the Q3
path). If any pattern matches, do NOT default to Q3 — promote to Q1 and
surface the matched phrase in the confirmation block (label as
`authority-promoted`). The user can still override at confirmation time.
Do NOT restate the pattern list here — drift risk; canonical source is
`scripts/delegate-core.ts:AUTHORITY_PATTERNS`.

When NONE of the four rows fires (genuine ambiguity), default to Q2 and
mark the Q value as `(inferred)`. Never silently pick Q4 for work the user
explicitly captured — `/quick` is for capture, not elimination.

## Step 3: Default schedule per Q

| Q  | Default schedule                                                          |
|----|---------------------------------------------------------------------------|
| Q1 | TODAY (use `# currentDate` ISO)                                            |
| Q2 | Next focus block this week — pick a weekday ≥ TODAY+1 in `# currentDate`'s week. If today is Friday, roll to next Monday. |
| Q3 | Suggest delegate via `scripts/match-delegate.ts` per `prioritize.md` Step 4b. Confirm-by date = Due date or TODAY+3 if no due date. |
| Q4 | No schedule — eliminate on confirm.                                        |

For Q3, run the scoring CLI exactly as `prioritize.md` Step 4b describes
(resolve plugin_root via `skills/core/references/plugin-root-resolution.md`,
invoke `npx ts-node match-delegate.ts`, parse the `MatchResult` JSON). Show
the top candidate's `alias` + one-line breakdown in the confirmation block.
If the graph is missing/empty, show `[not yet assigned — see stakeholders.yaml]`
and continue.

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
> from TASKS.md (and run the adapter's delete path if you pushed it)."

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
user's list adds noise without changing who owns the work. If the user
explicitly types `push Q3` at the `Push to:` edit step, honor it.

---

## When to fall back to the explicit flow

`/quick` is one-task. Multi-task detection — fires when ALL of:

- `$ARGUMENTS` contains ≥2 imperative verbs (e.g. `review`, `write`,
  `follow up`, `send`, `update`, `schedule`, `delegate`) AND
- Those verbs are joined by `and`, `then`, `,`, `;`, `&`, or a newline AND
- Each verb has a distinct direct object (different nouns / different
  subjects)

"Review PR and merge it" → one task (same object — the PR). Pass through.
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
