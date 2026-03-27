# /status — Org Status Command

**Plugin**: claude-eisenhower
**Version target**: v1.5.0
**Status**: Approved
**Date**: 2026-03-27
**Author**: Cantu

---

## Problem Statement

**User**: Director of Engineering reporting to a detail-oriented supervisor
**Problem**: No consolidated, queryable view of delegation status across the org.
Supervisor expects granular working knowledge of what every delegate is working on,
what's at risk, and what's been completed — and the Director can't produce that
without manually scanning TASKS.md and memory files.
**Impact**: Weekly+ (every supervisor check-in, every status report, every 1:1).
Being caught without details erodes credibility. The data exists in TASKS.md and
delegation memory — nothing assembles it into a reporting-ready view.
**Evidence**: `/today` surfaces what needs attention right now. `/review-week` is
retrospective. Neither gives a per-project portfolio or risk-oriented view. The
supervisor reporting need was the #1 signal that promoted this to P2.
**Constraints**: Must work with existing TASKS.md + memory-manager data sources.
Plugin is local-first, file-based. Should be queryable with arguments.
**Known Unknowns**: Whether `/intake` should prompt for `Project:` at intake time
(deferred — out of scope for this spec).

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary grouping | By project/initiative | Supervisor thinks in initiatives ("what's going on with X?"), not delegates or states. |
| Project tagging | `Project:` field on tasks, inferred + confirmed | Zero upfront cost. Inference reduces burden, user confirmation ensures accuracy, tags written back for future runs. |
| Triage UX | Confidence-split (auto-tag high, prompt ambiguous) | Reduces decision surface. User only engages with genuinely ambiguous items. |
| Risk section | Embedded in default view, not a separate query | Risks are context for the full picture, not a standalone report. |
| Done items in default view | Omitted | Default view is about what's in motion and what's at risk. Done items surface in `/status [project]` detail only. |
| Health signals | 🔴🟡🟢 per project | Scannable at a glance. Supervisor can immediately see which projects need attention. |
| Analytics log | None | `/status` is on-demand, not a daily ritual. `/today` already captures the daily snapshot. |
| Query modes | `/status`, `/status [project]`, `/status [alias]` | Covers the three angles: full org, single initiative, single person. No special keywords. |
| Argument resolution | Project names first, then aliases | Projects are the primary grouping. Ambiguous matches prompt for clarification. |
| Closing prompt | Reporting-oriented, not action-oriented | `/status` is a reporting tool. Point to `/status [project]`, `/status [alias]`, `/today` — not action commands. |

---

## Command Identity

**File**: `commands/status.md`

```yaml
---
description: Org status — project health, delegation portfolio, risk view
argument-hint: [project-name] or [alias] (optional)
allowed-tools: Read, Write
---
```

Read-only for reporting. Write is used solely to tag untagged tasks with `Project:`
during the triage phase — never modifies task state, dates, or delegation fields.

---

## Query Modes

| Invocation | What it shows |
|------------|---------------|
| `/status` | Triage (if needed) → Risk summary → All projects with health signals → Closing prompt |
| `/status [project]` | Single project deep dive — active, delegated, recently completed |
| `/status [alias]` | Everything delegated to that person, grouped by project |

**Argument resolution order:**
1. Check against known project names (from `Project:` tags in TASKS.md)
2. Check against delegate aliases (from memory-manager)
3. If ambiguous (matches both): ask the user
4. If no match: "No project or delegate found matching '{arg}'."

---

## Data Sources

### A. TASKS.md

Read TASKS.md from the workspace root. If it does not exist: "No task board found.
Run /intake to get started." and stop.

Extract all task records across all sections (Inbox, Active, Delegated, Done).
For each task, read: title, State, Quadrant, Due date, Scheduled, Delegated-to,
Check-by, Done date, and Project (if present).

### B. Delegation Memory

Invoke the memory-manager skill:
`query-pending — within: 14 business days`

Cross-reference results against TASKS.md delegation records. If the same alias +
task title appears in both, suppress the memory-only entry. TASKS.md is authoritative.

### C. Config Fallbacks

| Missing | Behavior |
|---------|----------|
| TASKS.md | Show "No task board found" message and stop |

No calendar or adapter config needed — `/status` reads only TASKS.md and delegation memory.

---

## Project Tagging

### New Field: `Project:`

Added to task records in TASKS.md. Optional — absence triggers triage.

```markdown
### Migrate auth tokens to v2 format
- State: Active
- Quadrant: Q1
- Due date: 2026-03-28
- Project: Auth Migration
```

**Project name conventions:**
- Human-readable, title case (e.g., "Auth Migration", not "auth-migration")
- Names emerge from usage — no config file registry
- New project names introduced during triage become available for future tagging

### Triage Phase

Runs at the start of `/status` (any query mode) when untagged non-Done tasks exist.

1. Scan all non-Done tasks for missing `Project:` field
2. Infer groupings using task titles, delegate context, and existing project names
3. Split by confidence:
   - **Auto-tagged** (high confidence — title clearly matches an existing project): tag silently
   - **Needs confirmation** (ambiguous or suggests a new project): present for user decision
4. Present:
   ```
   Auto-tagged 8 tasks to existing projects.

   3 tasks need your input:
     "Fix staging deploy script"        → Infra Reliability (new project)
     "Review caching RFC"               → API Redesign? or new project?
     "Update onboarding docs"           → ?

   Confirm, adjust, or skip for now?
   ```
5. User confirms or adjusts → `Project:` tags written back to TASKS.md
6. "Skip for now" groups skipped tasks under "Untagged" in the report

**Rules:**
- Triage only prompts for genuinely ambiguous items — high-confidence matches are silent
- New project names are valid — triage is where projects get discovered
- Skipping is always an option — no blocking the report
- Triage does not modify any field other than `Project:`

---

## Output Format

### Health Signal Logic

| Signal | Condition |
|--------|-----------|
| 🔴 | Any delegation overdue (Check-by date has passed) |
| 🟡 | No overdue, but a Check-by date is within 2 business days |
| 🟢 | All on track |

### Default View (`/status`)

```
## Status — Thursday, March 27

─── ⚠️ Risks ─────────────────────────────────────────────
  • Alex — "Auth token rollback plan" — 2 days overdue
  • Jordan — "Load test results" — Check-by: today

─── Auth Migration 🔴 (1 overdue, 2 active, 1 delegated) ─
  • [Active] "Migrate auth tokens to v2 format" — Due: Mar 28
  • [Delegated → Alex] "Auth token rollback plan" — Check-by: Mar 25 ⚠️
  • [Delegated → Alex] "Update SSO config" — Check-by: Mar 31

─── API Redesign 🟡 (1 active, 2 delegated) ──────────────
  • [Active] "Update API rate limiting" — Due: Mar 30
  • [Delegated → Jordan] "Load test results" — Check-by: today ⚠️
  • [Delegated → Jordan] "Endpoint deprecation plan" — Check-by: Apr 2

─── Untagged (2 tasks) ────────────────────────────────────
  • [Active] "Update onboarding docs" — Due: Mar 29
  • [Inbox] "Review team survey results"

Run /status [project] for detail, or /status [alias] for a person view.
```

**Default view rules:**
- Risk section renders first — only if overdue or due-today delegations exist
- Projects sorted: 🔴 first, then 🟡, then 🟢
- Done items omitted — default view shows what's in motion
- Untagged section renders last, only if untagged non-Done tasks exist
- Inbox tasks show `[Inbox]` state, no date
- Overdue items flagged with ⚠️ inline
- Section header includes task count summary (overdue, active, delegated)
- Omit empty sections — no "nothing here" placeholders

### Project Detail View (`/status [project]`)

```
## Status — Auth Migration

─── Health: 🔴 (1 overdue) ────────────────────────────────
  • Alex — "Auth token rollback plan" — 2 days overdue

─── Active (2) ─────────────────────────────────────────────
  • "Migrate auth tokens to v2 format" — Due: Mar 28
  • "Session token compliance update" — Due: Apr 1

─── Delegated (2) ──────────────────────────────────────────
  • Alex — "Auth token rollback plan" — Check-by: Mar 25 ⚠️
  • Alex — "Update SSO config" — Check-by: Mar 31

─── Recently Completed ─────────────────────────────────────
  • "Deprecate v1 token endpoint" — Done: Mar 26
  • "Audit session storage" — Done: Mar 24

Run /status for full org view, or /status alex for delegate view.
```

**Project detail rules:**
- Health section with signal and overdue summary
- Grouped by state: Active, Delegated, Recently Completed
- Recently completed: last 2 weeks, max 5 items. If more: "... and {N} more"
- Omit empty state sections

### Alias View (`/status [alias]`)

```
## Status — Alex

─── Delegated (3 across 2 projects) ───────────────────────

  Auth Migration:
  • "Auth token rollback plan" — Check-by: Mar 25 ⚠️ (2 days overdue)
  • "Update SSO config" — Check-by: Mar 31

  Infra Reliability:
  • "Staging deploy runbook" — Check-by: Apr 3

Run /status for full org view, or /status auth-migration for project view.
```

**Alias view rules:**
- Grouped by project within the alias view
- Overdue items flagged with ⚠️ and days overdue
- No Done items — alias view is about what's in flight
- Header shows total delegation count and project count

---

## Boundaries — What /status Is Not

| Not this | Why |
|----------|-----|
| `/today` | `/today` is daily pulse — what needs attention right now. `/status` is on-demand portfolio reporting — what's the state of the org. |
| `/review-week` | Weekly retrospective with calendar and throughput analysis. `/status` is current state, not historical. |
| A triage tool | Tagging is the only write. No state changes, no rescheduling, no delegation actions. |
| A project management tool | No project creation, no milestones, no dependencies. Projects emerge from task tags. |
| An action tool | Suggests view commands (`/status [x]`), not action commands (`/delegate`, `/execute`). |

---

## Blast Radius

| File | Change |
|------|--------|
| Create: `commands/status.md` | New command file |
| Modify: `docs/STRUCTURE.md` | Add status.md to commands listing |
| Modify: TASKS.md (runtime) | Writes `Project:` tags during triage — no other field changes |

No new scripts, no new config files, no new tests (command is pure prompt — no
TypeScript logic to test).

### TASKS.md Schema Impact

`Project:` is a new optional field on task records. Existing tasks without it
continue to work — they appear as "Untagged" until triaged. Other commands
(`/intake`, `/prioritize`, `/schedule`, `/execute`, `/delegate`) are unaffected —
they don't read or write `Project:`.

Future opportunity: `/intake` could prompt for `Project:` at intake time (out of scope).

---

## Verification

1. **Default view test** — Run `/status` on a board with tasks across multiple
   projects, some overdue delegations, and some untagged tasks. Confirm triage
   prompts for ambiguous items only, health signals are correct, and Done items
   are omitted.
2. **Project detail test** — Run `/status [project]` and confirm it shows active,
   delegated, and recently completed for that project only.
3. **Alias view test** — Run `/status [alias]` and confirm it shows all delegations
   for that person grouped by project.
4. **Empty board test** — Run `/status` with no tasks. Confirm "No task board found."
5. **All tagged test** — Run `/status` with all tasks tagged. Confirm triage phase
   is skipped entirely.
6. **Ambiguous argument test** — Run `/status` with an argument that matches both
   a project and an alias. Confirm it asks for clarification.
7. **Existing tests** — `cd scripts && npm test` (all tests passing). No new tests
   needed — no TypeScript logic added.
