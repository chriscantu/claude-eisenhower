# `/delegate` Direct Entry Point — Feature Spec

**Plugin**: claude-eisenhower
**Version**: 0.5.1
**Status**: Shipped
**Last updated**: 2026-02-21
**Author**: Cantu

---

## Problem Statement

Delegation in the current plugin is embedded inside two existing commands: `/prioritize` (Q3 classification) and `/execute delegate`. There is no way to ask "who should own this?" outside the full Eisenhower loop. When a task arrives mid-session — a Slack ping, a quick hallway ask, a redirect from a meeting — the user must either run the entire intake-prioritize cycle to get a delegate suggestion, or resolve the delegation mentally on their own. This friction causes Q3 work to either pile up in Unprocessed or get delegated without the scoring engine.

This is Open Question #2 from `delegation-spec.md`: *Should there be a dedicated `/delegate` command as a direct entry point?*

The answer is yes. The scoring engine (`match-delegate.ts`) and stakeholder graph (`stakeholders.yaml`) already exist. `/delegate` is a thin command layer that calls existing infrastructure and writes a confirmed result to TASKS.md.

---

## Goals

1. **Reduce friction for ad-hoc delegation** — Any task, regardless of how it entered the system (or whether it is in TASKS.md at all), can be delegated in a single command without running the full workflow.
2. **Drive consistent use of the scoring engine** — All delegation paths converge on `match-delegate.ts`. No delegation should bypass the algorithm and go directly to a name.
3. **Produce a complete, properly-formatted TASKS.md entry** — A confirmed `/delegate` run writes a Q3 task record indistinguishable from one produced by the prioritize → schedule chain, including `Delegate to:`, `Check-in date:`, and `Synced:` fields.
4. **Preserve PII discipline** — Alias is surfaced to the user; full name stays in `stakeholders.yaml` and never appears in TASKS.md, memory, or Reminders output.
5. **Keep the command stateless and composable** — `/delegate` should be callable from anywhere in the workflow without requiring prior intake or prioritization.

---

## Non-Goals

1. **No new algorithm or scoring changes** — The weighted scoring logic in `delegate-core.ts` is not modified. If scoring needs to change, that is a separate effort.
2. **No automatic message sending** — `/delegate` will never send a Slack message, email, or calendar invite on the user's behalf. It surfaces the suggestion and writes to TASKS.md. The human conversation is the user's responsibility. (Explicit cut in ROADMAP.md "Won't Do" table.)
3. **No multi-delegate splitting** — A single task gets one delegate. If the task needs to be split, that happens at `/intake`. (Explicit cut in ROADMAP.md "Won't Do" table.)
4. **No capacity auto-refresh** — `capacity_signal` is read as-is from the YAML. Stale capacity detection is addressed separately in Roadmap item #3 (Capacity Signal Review Prompt). Out of scope here.
5. **No `/prioritize --delegate` flag** — The ROADMAP open question raised this as an alternative. The decision here is a dedicated command: it is simpler to document, simpler to invoke, and consistent with the existing command-per-phase pattern (`/intake`, `/prioritize`, `/schedule`, `/execute`).

---

## User Stories

**As a Director**, I want to run `/delegate "Review the on-call rotation proposal"` so that I immediately get a ranked delegate suggestion with reasoning — without running intake and prioritize first.

**As a Director**, I want the scoring engine to surface its domain match reasoning (not just the alias) so that I can sanity-check the recommendation before confirming.

**As a Director**, I want to be able to override the suggested delegate and name someone manually so that I retain control even when the algorithm scores no clear match.

**As a Director**, I want the confirmed delegation written to TASKS.md as a properly-formed Q3 entry so that `/schedule` and `/execute` can pick it up without special-casing.

**As a Director**, I want the command to catch authority-sensitive tasks (those that require my sign-off or personnel decisions) and warn me before recording a delegate so that I do not accidentally hand off something I need to own.

**As a Director**, I want the Reminders push to happen as part of the confirm flow (not as a separate `/schedule` run) so that the check-in appears in my task manager immediately.

**As a Director**, I want the command to handle the case where `stakeholders.yaml` does not exist or is empty gracefully so that I can still record a delegation manually without the graph.

---

## Requirements

### Must-Have (P0)

**DEL-001 — Command file: `commands/delegate.md`**
A new command file is created at `commands/delegate.md`. It is invokable as `/delegate [task title or description]`. The argument is the full task description; if omitted, the command prompts for it.

**DEL-002 — Calls `match-delegate.ts` via shell**
The command executes:
```
npx ts-node scripts/match-delegate.ts "<task title>" "<task description>"
```
from `~/repos/claude-eisenhower/`. No inline scoring logic — algorithm stays in `delegate-core.ts`.

**DEL-003 — Surfaces top candidate with reasoning**
Output from the CLI is formatted for the user as:
```
Suggested delegate: [alias] ([role])
Reason: domain match on [matched_domains], relationship: [type], capacity: [signal]
Runner-up: [alias] ([role]) — within 2 points
```
If `status: no_match`, says: "No clear domain match. Who should own this?" and accepts a manual name.

**DEL-004 — Authority flag check**
Before presenting a delegate suggestion, scan the task title and description for authority-sensitive language: `"requires your sign-off"`, `"executive decision"`, `"personnel decision"`, `"sensitive communication on your behalf"`. If any match:
- Surface: "⚠ This may require your authority — are you sure you want to delegate it?"
- Ask: "Confirm delegation, or should this be a Q1 task instead?"
- Do not record a delegate until the user explicitly confirms.

**DEL-005 — Capacity warning**
If `top.capacity_warning` is true in the CLI output, append to the suggestion: "Note: [alias] is currently showing low capacity — confirm they can take this on."

**DEL-006 — Confirmation before writing**
Never write to TASKS.md without explicit user confirmation. The confirmation prompt is: "Delegate this to [alias]? I'll log a Q3 task and set a check-in for [date]."

**DEL-007 — Writes a complete Q3 task record to TASKS.md**
On confirmation, appends to the `## Q3 — Delegate` section of TASKS.md:

```
[ Q3 — DELEGATE — [today's date] ]
Title:           [task title from argument]
Description:     [task description]
Source:          Direct delegation
Requester:       Self
Urgency:         Delegated
Quadrant:        Q3 — Delegate if possible
Delegate to:     [confirmed alias]
Check-in date:   [2–3 business days from today]
Scheduled:       [today's date]
Action:          Delegated — check in [check-in date]
```

If TASKS.md does not exist, create it with the standard section headers before appending.

**DEL-008 — Pushes check-in to Reminders adapter**
After TASKS.md is saved, reads `integrations/config/task-output-config.md` for the active adapter. If configured, pushes:
- Title: `"Check in: [alias] re: [task title]"`
- Due date: check-in date
- Priority: medium
- Quadrant: Q3

Marks the task record `Synced: Reminders (Eisenhower List) — [today's date]` on success, `Synced: failed — [reason]` on failure.

**DEL-009 — Logs to memory**
After TASKS.md is saved, creates a follow-up memory entry via `productivity:memory-management`:
- Stakeholder: delegate alias and role
- What was delegated: task title and brief description
- Check-in date: confirmed date
- Status: pending

**DEL-010 — Handles missing or empty stakeholder graph**
If `stakeholders.yaml` does not exist: "No stakeholder graph found. Copy `integrations/config/stakeholders.yaml.example` to `stakeholders.yaml` to enable scoring." Then: "Who should own this?" and accept a manual name to proceed.

If `stakeholders.yaml` exists but is empty: "Stakeholder graph is empty. Who should own this?" Same fallback.

In both cases, the command still writes a valid Q3 record to TASKS.md.

---

### Nice-to-Have (P1)

**DEL-101 — Pre-flight check for existing task in TASKS.md**
Before running the scoring CLI, scan TASKS.md for a task title that closely matches the argument. If found, offer: "A task with a similar title already exists in [quadrant]. Do you want to delegate the existing task, or create a new one?"

**DEL-102 — Interactive mode when no argument is provided**
If `/delegate` is run with no argument, prompt step-by-step:
1. "What's the task title?"
2. "Any additional context? (description, deadline, requester)"
Then proceed with scoring.

**DEL-103 — Show full scoring table on request**
If the user asks "why" or "show me the scores", print the full ranked candidate table from the CLI output before re-presenting the suggestion.

**DEL-104 — Check-in date customization**
After presenting the default check-in date (2–3 business days), ask: "Does [date] work for a check-in, or would you like to set a different date?" Accept natural language input ("next Friday", "in a week").

---

### Future Considerations (P2)

**DEL-201 — Anti-domain enforcement**
Once `anti_domains` is added to the `stakeholders.yaml` schema (ROADMAP Later item), `/delegate` should exclude any delegate whose `anti_domains` include a keyword found in the task. No algorithm change needed — a pre-filter in `delegate-core.ts` before scoring.

**DEL-202 — Capacity-aware check-in date**
If the top delegate has `capacity_signal: low`, propose a longer check-in window (4–5 business days instead of 2–3) automatically.

**DEL-203 — Delegation from scan-email**
`/scan-email` currently classifies Q3 emails and asks the user to run `/delegate`. In a future version, scan-email could pipe the email subject and body directly into the delegate scoring CLI and present a candidate inline, collapsing two steps into one.

---

## Success Metrics

**Adoption (30 days post-ship)**
- `/delegate` used at least once per week in active weeks (measured via TASKS.md `Source: Direct delegation` entries).
- Target: ≥ 4 direct delegation entries in the first 30 days.

**Workflow bypass reduction**
- Baseline: number of Q3 tasks in TASKS.md with `Delegate to: [not yet assigned]` at the end of a schedule session (proxy for delegation that was deferred or skipped).
- Target: ≥ 50% reduction in unassigned Q3 tasks 30 days after shipping `/delegate`.

**Algorithm coverage**
- All confirmed delegations via `/delegate` use `match-delegate.ts` (no entries where `Delegate to:` was written without a prior CLI call).
- Verified by code review — confirmed by `Reason:` field presence in the task record or `status: no_match` logged.

**Test coverage**
- All P0 requirements have corresponding Jest test cases in `tests/delegate-entry.test.ts` before merge.
- 0 regressions in existing `delegation.test.ts` (35-test suite must remain 35/35 passing).

---

## Acceptance Criteria

### Happy path — domain match found

- Given `stakeholders.yaml` has a delegate with `domains: [infrastructure]`
- And `/delegate "Review on-call rotation proposal"` is run
- Then Claude calls `match-delegate.ts` with the title and description
- And presents the top candidate with alias, role, domain match, and capacity signal
- And asks for confirmation before writing anything
- And on confirmation, appends a complete Q3 record to TASKS.md
- And pushes a check-in Reminder if the adapter is configured
- And logs a memory entry for the delegate

### No domain match

- Given no delegate has a domain keyword matching the task
- When `/delegate "Ad-hoc board request"` is run
- Then Claude says "No clear domain match" and asks who should own it
- And accepts a manually-entered alias
- And writes the Q3 record with the manual alias as `Delegate to:`

### Authority flag triggered

- Given a task description includes "requires your sign-off"
- When `/delegate` is run for that task
- Then Claude surfaces the authority warning before presenting any delegate suggestion
- And asks whether to continue delegating or reclassify as Q1
- And does NOT write to TASKS.md until the user explicitly confirms delegation

### No stakeholder graph

- Given `stakeholders.yaml` does not exist
- When `/delegate` is run
- Then Claude explains the missing graph and prompts for a manual name
- And writes a valid Q3 record using the manual name

### Dedup guard

- Given a task was already delegated and has `Synced:` in its record
- When `/delegate` is run with the same title
- Then DEL-101 (P1 pre-flight check) surfaces the existing entry
- And asks whether to update the existing delegation or create a new task

---

## Files to Create

| File | Purpose |
|------|---------|
| `commands/delegate.md` | New command — the primary deliverable of this spec |
| `integrations/specs/delegate-entry-point-spec.md` | This spec |
| `tests/delegate-entry.test.ts` | Jest regression tests for all P0 requirements |

## Files to Update

| File | Change |
|------|--------|
| `README.md` | Add `/delegate` to the command reference table |
| `STRUCTURE.md` | Add `commands/delegate.md` to the commands table |
| `ROADMAP.md` | Mark item #2 as in-progress; add version target v0.5.1 |
| `skills/claude-eisenhower/SKILL.md` | Add `/delegate` trigger pattern to the skill description |

---

## Decisions Log

| # | Question | Decision |
|---|----------|----------|
| 1 | Command vs. flag on `/prioritize`? | Dedicated command. Consistent with command-per-phase pattern; simpler to document and discover. |
| 2 | Should `/delegate` run intake implicitly? | No. It takes the task description as an argument. Intake is a separate concern. |
| 3 | Should the check-in Reminder push happen in `/delegate` or require a `/schedule` run? | Push happens in `/delegate` on confirmation (P0). Requiring `/schedule` adds unnecessary friction for a task that doesn't need scheduling for the user. |
| 4 | Should `/delegate` write to `## Q3` or `## Unprocessed`? | Writes directly to `## Q3`. The user is explicitly delegating — prioritization is not needed. |
| 5 | What is the source of truth for dedup? | `Synced:` field in the task record, consistent with the existing dedup guard in `/schedule`. |
| 6 | Should authority flag be a hard block or a soft warning? | Soft warning with required confirmation. Hard blocks are too aggressive for a power user; the warning plus explicit confirm is the right friction level. |

---

## Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| 1 | Should `/delegate` accept a task number (e.g., `/delegate 7`) as a shorthand to delegate an existing TASKS.md entry by position? | Cantu | No — P1 at earliest |
| 2 | Should the check-in date calculation skip holidays, or only weekends? | Cantu | No — current `/schedule` skips weekends only; match that behavior |
| 3 | When the user manually names a delegate (no graph match), should the alias be validated against `stakeholders.yaml` entries? | Engineering | No — but a warning like "That alias isn't in your stakeholder graph — want to add them?" would be good P1 behavior |

---

## Timeline Considerations

- No hard deadline.
- Natural sequencing: ship after v0.5.0 alias resolution (already shipped) stabilizes.
- Regression test suite (`delegate-entry.test.ts`) should be written before `commands/delegate.md` — consistent with TDD principle in `PRINCIPLES.md`.
- Suggested version target: **v0.5.1**.
- Estimated scope: 1 command file + 1 test file + README/STRUCTURE updates. No algorithm changes. Small lift.
