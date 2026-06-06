# Empty-State Behavior Audit

**Issue**: [#41](https://github.com/chriscantu/claude-eisenhower/issues/41) — first-run UX is not modelled across the command set.

This document is the canonical map of how every command behaves when the workspace
is empty, sparse, or missing required config. Every command file MUST conform to
the rules below. When you add or modify a command, update this audit in the same PR.

## Audit principles

1. **Distinguish "feature ran, found nothing" from "feature failed to run."** A new
   user with a normal inbox that happens to contain no compliance/escalation emails
   should NOT conclude the plugin is broken. Show the scan count.
2. **Empty workspace ≠ error.** TASKS.md missing on first run is the expected state.
   Direct the user to `/intake` or `/help`; do not raise an error.
3. **Triage flows gate on signal density.** A 30-line triage prompt for a user with
   3 tasks total is hostile. Gate triage behind a threshold that means "you have
   enough data for grouping to matter."
4. **Missing config = skip that data source, not error.** Per `docs/PRINCIPLES.md`
   "Platform Architecture" — graceful degradation across platform integrations.
5. **First-run pathway exists.** `/help` walks a new user through
   intake → prioritize → schedule → execute on synthetic data so they see the loop
   before live use.

## Per-command audit

| Command | TASKS.md missing | Empty section | Missing config | Notes |
|---------|------------------|---------------|----------------|-------|
| `/help` | Renders first-run walkthrough (Step 2A) | n/a | n/a | New-user entry point. Detects first-run vs returning by TASKS.md state. |
| `/intake` | Creates TASKS.md if absent | n/a | Uses stakeholders.yaml if present; degrades silently if absent | Capture-only — no upstream dependencies. |
| `/prioritize` | "No task board found. Run /intake to add tasks first." | "No inbox tasks found. Use /intake to add new tasks." | "No stakeholder graph found. Copy `config/stakeholders.yaml.example`…" + saves placeholder | All three paths covered. |
| `/delegate` | Same as `/prioritize` | n/a (delegates a specific task by arg) | "No stakeholder graph found." + prompt; "Stakeholder graph is empty" | Hard-required config; cannot degrade silently. |
| `/schedule` | "No prioritized tasks found. Run /prioritize first." | Same as TASKS.md missing | Uses adapter config; missing config = markdown-only mode (graceful) | Adapter degradation per `config/task-output-config.md`. |
| `/complete-task` | "No task board found. Nothing to execute yet." | "No task matches" — surfaces the miss explicitly | n/a | |
| `/today` | "No task board found. Run /intake to get started." | Section-level: omit empty sections (no placeholders) | Calendar config optional — skips calendar pane if absent | Reads logs but does not require them. |
| `/plan-week` | "No task board found. Run /intake to get started." | "no personal commitments exist" handled | Calendar config optional | Writes plan-log silently. |
| `/review-week` | "No task board found. Run /intake to get started." | Section-level: omit empty sections | Calendar config optional | Writes review-log silently. |
| `/review-org` | "No task board found. Run /intake to get started." | Section-level: omit empty sections; "No project or delegate found matching '{arg}'." for bad arg | n/a | **Triage gate**: triage runs only when ≥5 tagged tasks exist AND untagged tasks present. Issue #41. |
| `/review-org awaiting` | Same as `/review-org` | "No tasks awaiting external blockers." | n/a | Issue #44. |
| `/scan-email` | Creates TASKS.md if absent | **Distinguish two shapes (issue #41)**: 0 emails in window → "Your inbox is empty"; N emails, 0 matched → "Scanned N email(s); 0 matched the actionable patterns" — explicit count confirms scan ran | Apple Mail config required (no degradation) | The 0-match wording was the original failure: user concluded plugin broken. |
| `/quick` | Creates TASKS.md if absent | n/a (single-task pipeline) | Same as `/prioritize` for stakeholders; same as `/schedule` for adapter | One-shot capture+classify+schedule. |
| `/setup` | n/a (setup writes initial config) | n/a | n/a — this IS the config bootstrap | First-run config command. |
| `/trends` | "TASKS.md not found." renders for Pattern 3; other patterns continue from logs | "No analytics data yet." when all three log files missing; per-pattern "insufficient data" when partial | n/a | Issue #43. Read-only, degrades gracefully. |
| `/memory` | "No memory entries yet. Delegations recorded by /delegate, /schedule, and /complete-task will appear here." | Per view: alias arg missing memory file → "No memory entries for '{arg}'"; analytics view marks each missing log as "not present yet" | n/a | Issue #42. Read-only inspection surface; writes nothing. |
| `/forget` | "No memory entries for '{arg}'." for alias/task scope when no match | Confirmation gates fire even on empty matches; bad confirmation token → "Cancelled." | n/a | Issue #42. Destructive correction loop; TASKS.md never touched. |

## Triage-gate rule (issue #41 specific)

`/review-org` Step 3 triage gates on:

1. ≥5 non-Done tasks WITH a `Project:` tag, AND
2. ≥1 non-Done task missing a `Project:` tag

Below 5 tagged tasks, untagged items render in the "Untagged" section of the
default view (Step 5, Section 3) — visible, not invisible. The gate re-opens
automatically once the user tags ≥5 tasks through normal use.

Rationale: a first-run user with 3 tasks has zero useful project structure to
infer from. The triage prompt asks "Confirm, adjust, or skip for now?" for every
task — a hostile experience that makes the plugin feel demanding rather than
useful.

## Scan-email count distinction (issue #41 specific)

`/scan-email` MUST distinguish:

- **0 emails reached the categorization step**: inbox was empty → "Your inbox is empty."
- **N emails reached the categorization step, 0 matched actionable categories**:
  "Scanned N email(s); 0 matched the actionable patterns."

The explicit count is what confirms the scan ran. Without it, the failure mode
is "user concludes the plugin is broken because the message looks identical to
the connection-failed message."

## Adding a new command

When you add a command:

1. Add a row to the table above.
2. State explicit behavior for TASKS.md missing, empty primary section, and
   missing config (if applicable).
3. Reference the relevant `commands/*.md` step where the empty-state branch
   is implemented.
4. If the command introduces a new triage-shaped prompt, add a gate rationale
   following the `/review-org` pattern.

## Related

- Issue #41 — Empty states + first-run pathway across 11 commands
- `commands/help.md` — first-run walkthrough
- `commands/review-org.md` Step 3 — triage gate implementation
- `commands/scan-email.md` Step 8 — count distinction implementation
- `docs/PRINCIPLES.md` "Platform Architecture" — degradation requirement
