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

# Sync Prep

Meeting preparation skill for Directors of Engineering. Generates per-person
briefings with talking points for 1:1s (downward) and supervisor check-ins (upward).

This skill is read-only — it never writes to any file. No analytics log, no triage,
no task modifications.

---

## Step 1: Load the task board

Read TASKS.md from the root of the workspace.
If TASKS.md does not exist: show "No task board found. Run /intake to get started." and stop.

Extract all task records across all sections (Inbox, Active, Delegated, Done).
For each task, read: title, State, Priority, Due date, Scheduled, Owner,
Check-by, Done, and Project (if present).

---

## Step 2: Resolve the alias

Extract the person's name from the user's message (e.g., "Alex" from "prep for my 1:1 with Alex").

**Alias resolution** — follows the same logic as the rest of the plugin.
See `docs/specs/alias-resolution-spec.md` for the full contract.

1. Read `config/stakeholders.yaml`. If missing, note it and proceed to fallback matching.
2. Resolve the extracted name against stakeholders.yaml using `resolveAlias()` —
   case-insensitive exact match against all alias entries (primary + lookup terms).
3. If resolved: use the display alias (`alias[0]`) for all output.
4. If not resolved: check TASKS.md `Owner:` fields for a case-insensitive match.
5. If still not resolved: check `memory/people/*.md` filenames for a case-insensitive match.
6. If still unresolved: ask the user for clarification — "I don't recognize '{name}'.
   Could you confirm who you mean?"

---

## Step 3: Detect direction

Determine whether this is a downward brief (1:1 with a delegate) or an upward brief
(supervisor check-in / upward reporting).

**Detection order:**

1. Check `config/stakeholders.yaml` for a `role: supervisor` match on the resolved alias.
   If matched → **Upward**. Proceed to Step 5.
2. Check TASKS.md `Owner:` fields for a delegate match on the resolved alias.
   If matched → **Downward**. Proceed to Step 4.
3. Check `memory/people/*.md` filenames for a delegate match.
   If matched → **Downward**. Proceed to Step 4.
4. Check for upward keywords in the user's message: "upward", "brief", "update for",
   "status update for". If any present → **Upward**. Proceed to Step 5.
5. If no match: ask "Is {name} someone you report to, or someone who reports to you?"
   - If they report to user → **Downward**. Proceed to Step 4.
   - If user reports to them → **Upward**. Proceed to Step 5.

**Edge case:** If the alias matches both supervisor (in stakeholders.yaml) and delegate
(in TASKS.md Owner), supervisor takes precedence — the user is more likely prepping
to report upward.

---

## Step 4: Build the downward brief

This step runs for delegate meetings (1:1s).

### Data gathering

**From TASKS.md:**
- Active delegations: all tasks with `State: Delegated` and `Owner:` matching the resolved alias
- Overdue: delegations where `Check-by:` date is today or earlier. Compute business days
  overdue (skip Saturday and Sunday).
- Upcoming check-ins: delegations where `Check-by:` is within 5 business days from today
- Recently completed: tasks in `## Done` with `Owner:` matching the alias and `Done:` date
  within 5 business days from today. Maximum 5 items.

**From delegation memory:**
Invoke the memory-manager skill: `query-pending — within: 5 business days`
Filter results to the matching alias only.
See `skills/memory-manager/SKILL.md` for the contract.

**Deduplication:**
Cross-reference the memory-manager results against TASKS.md Delegated records.
If the same alias + task title appears in both, suppress the memory-only entry.
TASKS.md is the authoritative source.

**From memory file:**
Read `memory/people/{alias-filename}.md` if it exists. Note any content outside the
`## Delegations` table (e.g., working style notes, preferences, growth areas).

### Empty state

If no active delegations and no recently completed tasks exist for this alias:

```
─── Sync Prep — {alias} ──────────────────────────────────────

No delegation history with {alias} in the last 5 business days.
This may be a new relationship — consider what to delegate during
your 1:1.
```

Proceed to Step 6 (Done). Do not render any sections below.

### Render the downward brief

**Header:**

```
─── Sync Prep — {alias} ──────────────────────────────────────
```

**Section 1 — Active Delegations**

Render only if active delegations exist for this alias.

```
─── 📋 Active Delegations ────────────────────────────────────
  • [{project}] "{task title}" — Check-by: {date} ⚠️ ({N} day(s) overdue)
  • [{project}] "{task title}" — Check-by: {date} ({N} business days)
```

Rules:
- Sort: overdue first (most overdue at top), then by check-by date ascending
- Overdue items flagged with ⚠️ and business days overdue
- Upcoming items show business days remaining
- Project tag shown in brackets if `Project:` field exists on the task. Omit brackets if untagged.

**Section 2 — Recently Completed**

Render only if completions exist within 5 business day window. Max 5 items.

```
─── ✅ Recently Completed (Last 5 Days) ──────────────────────
  • "{task title}" — Done: {date}
```

If more than 5: `  ... and {N} more`

**Section 3 — Talking Points**

Always render for downward briefs. Auto-generated, 2-4 items based on signals:

```
─── 💬 Talking Points ────────────────────────────────────────
  1. {point}
  2. {point}
  ...
```

Signal-to-talking-point mapping:

| Signal | Talking point |
|--------|---------------|
| Overdue delegation | "Follow up on {task} — {N} days past check-in, get status and new ETA" |
| Check-in within 2 business days | "{task} check-in coming up — on track? Any blockers?" |
| Check-in 3-5 business days out | "{task} due {date} — surface blockers early" |
| Recent completion | "Acknowledge {task} completion" |
| No delegations and no completions | "No active delegations — consider whether there's work to delegate" |

**Section 4 — Notes from Memory**

Render only if the delegate's memory file (`memory/people/{alias-filename}.md`)
contains content beyond the `## Delegations` table.

```
─── 📝 Notes ─────────────────────────────────────────────────
  • {note}
  • {note}
```

Rules:
- Surface non-delegation content only (delegation data is already in Section 1)
- Max 3 notes. If more exist, show most recent.
- If no non-delegation content exists in the memory file: omit section.

Proceed to Step 6 (Done).

---

## Step 5: Build the upward brief

This step runs for supervisor check-ins and ad-hoc upward reporting.

### Data gathering

**From TASKS.md:**
- All non-Done tasks grouped by `Project:` tag
- Overdue delegations: all Delegated tasks where `Check-by:` date is today or earlier.
  Compute business days overdue (skip Saturday and Sunday).
- Upcoming check-ins: Delegated tasks where `Check-by:` is within 2 business days
- Recently completed: tasks in `## Done` with `Done:` date within 5 business days.
  Maximum 5 items.
- Untagged non-Done tasks: count only. Do not triage — sync-prep is read-only.

**From delegation memory:**
Invoke the memory-manager skill: `query-pending — within: 5 business days`
Return all aliases (do not filter).
See `skills/memory-manager/SKILL.md` for the contract.

**Deduplication:**
Cross-reference the memory-manager results against TASKS.md Delegated records.
If the same alias + task title appears in both, suppress the memory-only entry.
TASKS.md is the authoritative source.

### Health signal logic

Compute one health signal per project. Same logic as `/status`:

| Signal | Condition |
|--------|-----------|
| 🔴 | Any delegation in this project is overdue (Check-by date has passed) |
| 🟡 | No overdue, but a Check-by date in this project is within 2 business days |
| 🟢 | All on track (includes projects with no delegations) |

### Empty state

If no non-Done tasks exist at all:

```
─── Sync Prep — {name} (Upward) ──────────────────────────────

No active tasks on the board. Run /intake to capture work before
your meeting.
```

Proceed to Step 6 (Done). Do not render any sections below.

### Render the upward brief

**Header:**

```
─── Sync Prep — {name} (Upward) ──────────────────────────────
```

**Executive Summary**

Always render. 1-2 sentences.

```
{N} projects in flight. {risk summary}. {wins summary}.
```

Rules:
- If risks exist: "{N} risk(s) I'm actively managing."
- If no risks: "No risks this week."
- If wins exist: "{N} item(s) closed this week."
- If no wins: omit wins from summary.

**Section 1 — Portfolio**

Always render. One line per project with health signal and confidence explanation.

```
─── 📊 Portfolio ─────────────────────────────────────────────
  Auth Migration 🔴 — at risk: Alex's rollback plan 2 days overdue,
    following up today
  API Redesign 🟡 — on track, but Jordan's load test results due today
  Infra Reliability 🟢 — on track, staging runbook due Apr 3
```

Rules:
- Sort: 🔴 first, then 🟡, then 🟢
- Each line includes the key signal driving the health color:
  - 🔴: name the overdue delegation and mitigation action
  - 🟡: name the upcoming check-in
  - 🟢: name the nearest upcoming item or "all clear"
- If untagged non-Done tasks exist, add at bottom: `{N} untagged tasks — run /status to categorize`

**Section 2 — Risks & Mitigations**

Render only if overdue or due-today delegations exist.

```
─── ⚠️ Risks & Mitigations ───────────────────────────────────
  • {alias} — "{task title}" — {N} days overdue
    → {mitigation}
  • {alias} — "{task title}" — Check-by: today
    → {mitigation}
```

Auto-generated mitigations:

| Signal | Mitigation |
|--------|------------|
| Overdue | "Following up today" |
| Due today | "Expecting update today" |
| Cannot infer | "Action needed — discuss in meeting" |

**Section 3 — Wins**

Render only if completions exist within 5 business day window. Max 5 items.

```
─── ✅ Wins (Last 5 Days) ────────────────────────────────────
  • "{task title}" — Done: {date}
```

If more than 5: `  ... and {N} more`

**Section 4 — Anticipate Questions**

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
- If all projects are 🟢: omit section, replace with single line:
  `No likely risk questions — strong position this week.`

Proceed to Step 6 (Done).

---

## Step 6: Done

The skill is complete. Do not prompt for further action. The user drives any
follow-on commands or additional prep requests.
