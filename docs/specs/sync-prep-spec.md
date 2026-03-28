# sync-prep — Meeting Preparation Skill

**Plugin**: claude-eisenhower
**Version target**: v1.6.0
**Status**: Approved
**Date**: 2026-03-27
**Author**: Cantu

---

## Problem Statement

**User**: Director of Engineering preparing for 1:1s and supervisor check-ins
**Problem**: No consolidated per-person view of delegation status, overdue items,
recent completions, and meeting-ready talking points. The Director walks into
meetings either underprepared or having spent 10 minutes manually scanning TASKS.md
and memory files.
**Impact**: Every 1:1, every supervisor sync. Being caught without details in a
supervisor check-in erodes credibility. Being underprepared for a 1:1 wastes the
delegate's time and misses coaching opportunities.
**Evidence**: `/today` is a daily personal briefing. `/status` is org-wide reporting.
Neither is framed for a specific meeting with a specific person. The data exists
across TASKS.md and delegation memory — nothing assembles it into a meeting-ready
brief with talking points.
**Constraints**: Must work with existing TASKS.md + memory-manager data sources.
Plugin is local-first, file-based. Skill is auto-invocable (not a slash command).
Read-only — no writes to any file.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Component type | Auto-invocable skill (not command) | Reduces friction — user says "prep for my 1:1 with Alex" naturally. No ceremony. |
| Direction detection | Automatic with fallback | Delegates detected from TASKS.md/memory. Supervisor detected from stakeholders.yaml role tag. Unknown names prompt for clarification. |
| Upward detection | Role tag in stakeholders.yaml + keyword detection | Primary supervisor tagged `role: supervisor`. Ad-hoc upward via keywords ("upward", "brief", "update for"). |
| Output tone | Single professional tone | Candid enough for self-prep, clean enough to share. No dual rendering. |
| Lookback window | 5 business days, fixed | Covers typical 1:1 cadence. Stateless — no "last meeting date" tracking. |
| Talking points | Auto-generated from signals | Overdue → follow up. Upcoming → check status. Completions → acknowledge. Risks → mitigation. |
| Anticipated questions (upward) | Generated from risk signals | One per 🔴/🟡 project with prepared answer. Highest-value prep for managing up. |
| Analytics log | None | Read-only skill. No daily ritual, no state to track. |
| Writes | None | Purely read-only. No triage, no tagging, no task modifications. |
| Share-safe variant | Not needed | Professional tone throughout — data is factual, works for both audiences. |

---

## Skill Identity

**File**: `skills/sync-prep/SKILL.md`

```yaml
---
name: sync-prep
description: >
  Use when the user mentions preparing for a meeting, 1:1, sync, or check-in
  with a specific person. Triggers on phrases like "prep for my 1:1 with Alex",
  "I'm meeting with Hisham tomorrow", "help me prepare for my sync with Jordan",
  "what should I bring up with Alex". Do NOT use for general status queries
  (those belong to /status) or daily briefings (those belong to /today).
version: 1.0.0
---
```

Read-only. `allowed-tools: Read` only — no writes to any file.

---

## Direction Detection

### Detection Logic

| Signal | Direction |
|--------|-----------|
| Alias matches a delegate in TASKS.md `Owner:` field or `memory/people/*.md` | Downward |
| Alias matches a supervisor-tagged entry in `config/stakeholders.yaml` | Upward |
| User says "upward", "brief", "update for", "status update for" | Upward |
| No match found | Ask: "Is {name} someone you report to, or someone who reports to you?" |

### stakeholders.yaml Role Field

Additive field — no schema break. Only the primary supervisor needs a tag:

```yaml
- name: Hisham
  role: supervisor
```

Delegates do not need a role tag — they are detected from TASKS.md `Owner:` fields
and `memory/people/*.md` files. The `role` field is optional; absence means "detect
from data."

### Alias Resolution

Sync-prep uses the same alias resolution logic as the rest of the plugin. See
`docs/specs/alias-resolution-spec.md` for the full contract.

1. Extract the name from the user's message (e.g., "Alex" from "prep for my 1:1 with Alex")
2. Resolve against `config/stakeholders.yaml` using `resolveAlias()` — case-insensitive
   exact match against all alias entries (primary + lookup terms)
3. If resolved: use the display alias (`alias[0]`) for all output
4. If not resolved: fall back to TASKS.md `Owner:` field matching and
   `memory/people/*.md` filename matching (case-insensitive)
5. If still unresolved: ask the user for clarification

### Resolution Order (Direction Detection)

1. Check `config/stakeholders.yaml` for a `role: supervisor` match on the resolved alias
2. Check TASKS.md `Owner:` fields for a delegate match
3. Check `memory/people/*.md` filenames for a delegate match
4. Check for upward keywords in the user's message
5. If no match: ask "Is {name} someone you report to, or someone who reports to you?"

If the alias matches both supervisor and delegate (edge case): supervisor takes
precedence — the user is more likely prepping to report upward.

---

## Data Sources

Both directions share the same data sources. No new integrations.

### A. TASKS.md

Read TASKS.md from the workspace root. If it does not exist: "No task board found.
Run /intake to get started." and stop.

**Downward extraction (specific delegate):**
- Active delegations: tasks with `State: Delegated` and `Owner:` matching alias
- Overdue: delegations where `Check-by:` date is today or earlier
- Upcoming check-ins: delegations where `Check-by:` is within 5 business days
- Recently completed: tasks in `## Done` with `Owner:` matching alias, `Done:` date
  within 5 business days. Max 5 items.

**Upward extraction (portfolio-wide):**
- All non-Done tasks grouped by `Project:` tag
- Health signal per project (same logic as /status)
- Overdue delegations across all delegates
- Recently completed across all delegates. 5 business day window, max 5 items.
- Untagged tasks: note count but do not triage. Sync-prep is read-only.

### B. Delegation Memory

Invoke the memory-manager skill:

**Downward:** `query-pending — within: 5 business days` — filter results to matching alias only.

**Upward:** `query-pending — within: 5 business days` — all aliases.

Cross-reference results against TASKS.md delegation records. If the same alias +
task title appears in both, suppress the memory-only entry. TASKS.md is authoritative.

### C. Config

| File | Used for | If missing |
|------|----------|------------|
| `config/stakeholders.yaml` | Supervisor role detection | Fall back to TASKS.md/memory match or ask user |
| TASKS.md | All task data | Show "No task board found" and stop |

No calendar, no adapters, no email config. Sync-prep is platform-agnostic.

---

## Output Format — Downward Brief

For 1:1s with delegates. Per-person view of delegations, completions, and talking points.

### Header

```
─── Sync Prep — {alias} ──────────────────────────────────────
```

### Section 1 — Active Delegations

Render only if active delegations exist for this alias.

```
─── 📋 Active Delegations ────────────────────────────────────
  • [{project}] "{task title}" — Check-by: {date} ⚠️ ({N} day(s) overdue)
  • [{project}] "{task title}" — Check-by: {date} ({N} business days)
```

Sort: overdue first (most overdue at top), then by check-by date ascending.
Overdue items flagged with ⚠️ and business days overdue.
Upcoming items show business days remaining.
Project tag shown in brackets if `Project:` field exists on the task. Omit brackets
if untagged.

### Section 2 — Recently Completed

Render only if completions exist within 5 business day window. Max 5 items.

```
─── ✅ Recently Completed (Last 5 Days) ──────────────────────
  • "{task title}" — Done: {date}
```

If more than 5: `  ... and {N} more`

### Section 3 — Talking Points

Always render for downward briefs.

```
─── 💬 Talking Points ────────────────────────────────────────
  1. {point}
  2. {point}
  ...
```

Auto-generated, 2-4 items based on signals:

| Signal | Talking point |
|--------|---------------|
| Overdue delegation | "Follow up on {task} — {N} days past check-in, get status and new ETA" |
| Check-in within 2 business days | "{task} check-in coming up — on track? Any blockers?" |
| Check-in 3-5 business days out | "{task} due {date} — surface blockers early" |
| Recent completion | "Acknowledge {task} completion" |
| No delegations, no completions | "No active delegations — consider whether there's work to delegate" |

### Section 4 — Notes from Memory

Render only if the delegate's memory file (`memory/people/{alias-filename}.md`)
contains content beyond the `## Delegations` table — e.g., notes about working
style, preferences, past context, or growth areas.

```
─── 📝 Notes ─────────────────────────────────────────────────
  • Last noted: Alex mentioned wanting more architecture exposure
  • Prefers async check-ins over meetings when possible
```

Rules:
- Surface non-delegation content only (delegation data is already in Section 1)
- Max 3 notes. If more exist, show most recent.
- If no non-delegation content exists in the memory file: omit section.

### Empty State

If no delegations and no recent completions for this alias:

```
─── Sync Prep — {alias} ──────────────────────────────────────

No delegation history with {alias} in the last 5 business days.
This may be a new relationship — consider what to delegate during
your 1:1.
```

---

## Output Format — Upward Brief

For supervisor check-ins and ad-hoc upward reporting. Portfolio-level view with
executive summary, confidence signals, risk mitigations, and anticipated questions.

### Header

```
─── Sync Prep — {name} (Upward) ──────────────────────────────
```

### Executive Summary

Always render. 1-2 sentences.

```
{N} projects in flight. {risk summary}. {wins summary}.
```

Rules:
- If risks exist: "{N} risk(s) I'm actively managing."
- If no risks: "No risks this week."
- If wins exist: "{N} item(s) closed this week."
- If no wins: omit wins from summary.

### Section 1 — Portfolio

Always render. One line per project with health signal and confidence explanation.

```
─── 📊 Portfolio ─────────────────────────────────────────────
  Auth Migration 🔴 — at risk: Alex's rollback plan 2 days overdue,
    following up today
  API Redesign 🟡 — on track, but Jordan's load test results due today
  Infra Reliability 🟢 — on track, staging runbook due Apr 3
```

Sort: 🔴 first, then 🟡, then 🟢.

Each line includes the key signal driving the health color:
- 🔴: name the overdue delegation and mitigation action
- 🟡: name the upcoming check-in
- 🟢: name the nearest upcoming item or "all clear"

If untagged non-Done tasks exist:
```
  {N} untagged tasks — run /status to categorize
```

Health signal logic (same as /status):

| Signal | Condition |
|--------|-----------|
| 🔴 | Any delegation overdue (Check-by date has passed) |
| 🟡 | No overdue, but a Check-by date is within 2 business days |
| 🟢 | All on track (includes projects with no delegations) |

### Section 2 — Risks & Mitigations

Render only if overdue or due-today delegations exist.

```
─── ⚠️ Risks & Mitigations ───────────────────────────────────
  • {alias} — "{task title}" — {N} days overdue
    → {mitigation}
```

Auto-generated mitigations:

| Signal | Mitigation |
|--------|------------|
| Overdue | "Following up today" |
| Due today | "Expecting update today" |
| Cannot infer | "Action needed — discuss in meeting" |

### Section 3 — Wins

Render only if completions exist within 5 business day window. Max 5 items.

```
─── ✅ Wins (Last 5 Days) ────────────────────────────────────
  • "{task title}" — Done: {date}
```

If more than 5: `  ... and {N} more`

### Section 4 — Anticipate Questions

Render if any 🔴 or 🟡 projects exist. One entry per at-risk project.

```
─── 🔮 Anticipate Questions ──────────────────────────────────
  • "What's going on with {project}?"
    → {prepared answer using data from portfolio section}
```

Rules:
- One question per 🔴 or 🟡 project, max 3
- Question framed as what the supervisor would naturally ask
- Answer draws from delegation data: what's overdue, what's the mitigation,
  what else is on track in that project
- If all projects are 🟢: omit section, replace with:
  `No likely risk questions — strong position this week.`

### Upward Empty State

If no non-Done tasks exist at all:

```
─── Sync Prep — {name} (Upward) ──────────────────────────────

No active tasks on the board. Run /intake to capture work before
your meeting.
```

---

## Boundaries — What sync-prep Is Not

| Not this | Why |
|----------|-----|
| `/status` | /status is on-demand org reporting with project triage. Sync-prep is meeting preparation with talking points and anticipated questions. Different framing, different audience. |
| `/today` | /today is a daily personal briefing across all concerns. Sync-prep is per-person, on-demand, meeting-focused. |
| A triage tool | Read-only. No writes, no tagging, no state changes. Untagged tasks are noted but not triaged — that belongs to /status. |
| A scheduling tool | Doesn't create tasks or set check-in dates. Suggests what to discuss, never acts. |
| A delegation tool | Doesn't delegate or reassign. Use /delegate for that. |
| A batch tool | One alias per invocation. For multiple 1:1s, invoke sequentially ("prep for Alex", then "prep for Jordan"). |

---

## Blast Radius

| File | Change |
|------|--------|
| Create: `skills/sync-prep/SKILL.md` | New skill file |
| Modify: `docs/STRUCTURE.md` | Add sync-prep/ to skills listing |

No new scripts, no new config files, no new tests. Pure prompt skill — no TypeScript
logic to test. The `role` field in stakeholders.yaml is additive and optional — no
schema break, no migration needed.

---

## Verification

1. **Downward test** — Say "prep for my 1:1 with {delegate}" where the delegate has
   overdue delegations, upcoming check-ins, and recent completions. Confirm all
   sections render correctly and talking points match signals.
2. **Upward test** — Say "prep for my sync with Hisham" where Hisham is tagged
   `role: supervisor` in stakeholders.yaml. Confirm executive summary, portfolio
   with confidence signals, risks with mitigations, and anticipated questions render.
3. **Ad-hoc upward test** — Say "prep an upward brief for {name}" where name is not
   in stakeholders.yaml. Confirm upward keyword detection produces portfolio view.
4. **Unknown alias test** — Say "prep for my meeting with {unknown}" and confirm
   the skill asks for direction clarification.
5. **Empty delegate test** — Prep for a delegate with no delegations and no
   completions. Confirm empty state message renders.
6. **Empty board test** — Remove TASKS.md and confirm "No task board found" message.
7. **Missing stakeholders.yaml test** — Remove stakeholders.yaml and prep for a
   known delegate. Confirm delegate detection falls back to TASKS.md/memory.
8. **Existing tests** — `cd scripts && npm test` (all tests passing). No new tests
   needed — no TypeScript logic added.
