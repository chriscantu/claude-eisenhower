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
| `this week`, `by Friday`, due date within 7 days, strategic work          | Q2        |
| Requester ≠ Self AND domain matches a stakeholder AND no authority signal | Q3        |
| No timing AND no clear importance                                         | Q4        |

**Authority flag** — if the description contains language matching the
`AUTHORITY_PATTERNS` list referenced by `commands/prioritize.md` Step 3
("requires your sign-off", "executive decision", "personnel decision",
"sensitive communication on your behalf"), do NOT default to Q3 — promote to
Q1 and surface the reason in the confirmation block. The user can still
override.

When the urgency signals are ambiguous (e.g. nothing said + Requester ≠ Self),
default to Q2 and mark the Q value as `(inferred)`. Never silently pick Q4 for
work the user explicitly captured — `/quick` is for capture, not elimination.

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

Confirm / edit / cancel?
```

The confirmation block must include EVERY default the command is about to
apply — Q-classification, scheduled date, delegate alias. Silent defaults are
the failure mode this command is trying to avoid; surfacing them in one block
is the trade-off vs running three commands sequentially.

- **confirm**: write to TASKS.md per Step 5 below.
- **edit**: ask which field to change, re-render the block. Loop until confirm.
- **cancel**: drop the record, no write.

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

## Step 6: Push to adapter (optional, same rules as `/schedule`)

For Q1 / Q2 entries that were just scheduled, offer the same push prompt that
`/schedule` ends on: "Push to your task output adapter now? (yes / no)". On
yes, follow the `config/task-output-config.md` active adapter contract — same
code path `/schedule` uses, no duplication. On no, the record stays in
TASKS.md only.

Q3 delegated tasks SHOULD NOT auto-push to the adapter — the active delegate
needs the visibility, not a Reminders entry on the user's list. Skip Step 6
for Q3 unless the user explicitly asks.

---

## When to fall back to the explicit flow

`/quick` is one-task. If `$ARGUMENTS` describes multiple tasks (e.g. "review
PR and write status doc and follow up with Jordan"), say:

> "Looks like more than one task here. Run `/intake` for each, then
> `/prioritize` to batch-classify. `/quick` is one task at a time."

Do not silently pick the first one — the user lost the others if you do.

## Edge cases

- No `# currentDate` → STOP and ask, per intake rule.
- Empty `$ARGUMENTS` → "What's the task? Give me a sentence and I'll handle
  the rest."
- Stakeholder graph missing on Q3 path → write `Owner: [not yet assigned —
  see stakeholders.yaml]`, surface that in the confirmation block, continue.
- Authority signal detected → promote to Q1, label as `authority-promoted` in
  the Priority field, surface the matched phrase.
