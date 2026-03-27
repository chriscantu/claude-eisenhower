# /status Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `/status` command — an on-demand org status view grouped by project with health signals, delegation portfolio, and risk summary.

**Architecture:** Pure prompt command (no TypeScript, no scripts). Reads TASKS.md and delegation memory, infers and writes `Project:` tags during triage, renders three query modes (default, project detail, alias view). Follows the same pattern as `commands/today.md` and `commands/review-week.md`.

**Tech Stack:** Markdown prompt file, YAML frontmatter. No build step.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `commands/status.md` | Create | Full command prompt — triage, argument resolution, three output views |
| `docs/STRUCTURE.md` | Modify (line 66) | Add `status.md` to commands listing |
| `docs/specs/tasks-schema-spec.md` | Modify (fields table) | Document new optional `Project:` field |

---

### Task 1: Add `Project:` field to TASKS.md schema spec

The `/status` command introduces a new optional `Project:` field on task records. Before creating the command, document the field in the canonical schema spec so all commands share a single source of truth.

**Files:**
- Modify: `docs/specs/tasks-schema-spec.md:49-65` (Fields table)

- [ ] **Step 1: Add `Project:` to the fields table**

Open `docs/specs/tasks-schema-spec.md`. In the `### Fields` table (starts at line 49), add a new row after the `Synced` row (line 65):

```markdown
| `Project` | string | Optional | Human-readable initiative name, title case (e.g., "Auth Migration"). Introduced by `/status` triage. Not written by other commands unless they opt in. |
```

The full table row to insert after the `Synced` row:

```
| `Project` | string | Optional | Human-readable initiative name, title case (e.g., "Auth Migration"). Introduced by `/status` triage. Not written by other commands unless they opt in. |
```

- [ ] **Step 2: Add a decisions log entry**

Append to the `## Decisions Log` section at the end of the file (after Decision 4):

```markdown

5. **`Project:` is optional and never required** — Unlike `Check-by` on Delegated tasks,
   `Project:` has no enforcement gate. Tasks without it are valid and appear as "Untagged"
   in `/status`. The field is populated progressively through `/status` triage, not at
   intake time.
```

- [ ] **Step 3: Verify no existing tests break**

Run:
```bash
cd scripts && npm test
```

Expected: All tests pass. The schema spec is documentation — no code references `Project:` yet.

- [ ] **Step 4: Commit**

```bash
git add docs/specs/tasks-schema-spec.md
git commit -m "docs: add Project field to TASKS.md schema spec"
```

---

### Task 2: Create `commands/status.md`

This is the main deliverable — the full command prompt file. It follows the pattern of `commands/today.md` (YAML frontmatter, numbered steps, exact output templates).

**Files:**
- Create: `commands/status.md`

**Reference files to read before starting:**
- `commands/today.md` — closest pattern (config check, TASKS.md load, memory query, sectioned output)
- `commands/review-week.md` — memory-manager invocation pattern, deduplication
- `docs/specs/status-command-spec.md` — the full spec
- `docs/specs/tasks-schema-spec.md` — TASKS.md field definitions
- `skills/memory-manager/SKILL.md` — `query-pending` interface

- [ ] **Step 1: Create the command file with frontmatter**

Create `commands/status.md` with the following complete content:

````markdown
---
description: Org status — project health, delegation portfolio, risk view
argument-hint: [project-name] or [alias] (optional)
allowed-tools: Read, Write
---

You are running the STATUS command of the Engineering Task Flow.

This command provides an on-demand org-wide status view grouped by project/initiative.
It surfaces project health, delegation portfolios, and risk signals. The only write
is tagging untagged tasks with `Project:` during triage — it never modifies task state,
dates, or delegation fields.

---

## Step 1: Load the task board

Read TASKS.md from the root of the workspace.
If TASKS.md does not exist: show "No task board found. Run /intake to get started." and stop.

Extract all task records across all sections (Inbox, Active, Delegated, Done).
For each task, read: title, State, Quadrant, Due date, Scheduled, Delegated-to (alias),
Check-by, Done date, and Project (if present).

---

## Step 2: Query delegation memory

Invoke the memory-manager skill:
`query-pending — within: 14 business days`

The skill returns a unified list regardless of which backend was active.
See `skills/memory-manager/SKILL.md` for the contract.

**Deduplication**
Cross-reference the results against the TASKS.md Delegated records.
If the same alias + task title appears in both, suppress the memory-only entry.
TASKS.md is the authoritative source for that entry.

---

## Step 3: Resolve argument (if provided)

If the user provided an argument (e.g., `/status auth-migration` or `/status alex`):

1. Collect all unique `Project:` values from TASKS.md task records
2. Collect all delegate aliases from Delegated tasks and memory-manager results
3. Check the argument against project names (case-insensitive partial match)
4. Check the argument against delegate aliases (case-insensitive partial match)
5. Resolution:
   - **Matches a project only** → proceed to Step 5 (Project Detail View)
   - **Matches an alias only** → proceed to Step 6 (Alias View)
   - **Matches both** → ask the user: "'{arg}' matches both project '{project}' and delegate '{alias}'. Which did you mean?"
   - **Matches neither** → "No project or delegate found matching '{arg}'."

If no argument was provided, proceed to Step 4 (Triage → Default View).

---

## Step 4: Triage untagged tasks

Scan all non-Done tasks for a missing `Project:` field.

**If no untagged tasks exist:** skip triage entirely — proceed to rendering the default view (Step 4b).

**If untagged tasks exist:**

1. Collect all existing project names from tagged tasks
2. For each untagged task, infer the most likely project using:
   - Task title keywords matching existing project names
   - Delegate context (other tasks delegated to the same person)
   - Similarity to existing tasks within a project
3. Split by confidence:
   - **Auto-tagged** (high confidence — title clearly matches an existing project name): tag silently, count them
   - **Needs confirmation** (ambiguous, or would create a new project): present for user decision
4. Present the triage prompt:

```
Auto-tagged {N} tasks to existing projects.

{N} tasks need your input:
  "{task title}"        → {suggested project} (new project)
  "{task title}"        → {suggested project}? or new project?
  "{task title}"        → ?

Confirm, adjust, or skip for now?
```

5. Wait for user response:
   - **Confirm** → write `Project:` tags to all presented tasks in TASKS.md using the suggested values
   - **Adjust** → user provides corrections, write corrected `Project:` tags
   - **Skip** → do not tag these tasks; they appear under "Untagged" in the report
6. For auto-tagged tasks, write `Project:` tags to TASKS.md silently

**Rules:**
- Only write the `Project:` field — never modify State, dates, or any other field
- New project names introduced by the user are valid
- Skipping is always an option — never block the report

### Step 4b: Build the default view

Compute the following from all task records:

**Risks:** All Delegated tasks (not in Done) where Check-by date is today or earlier.
Compute days overdue as business days (skip Saturday and Sunday).

**Project groupings:** Group all non-Done tasks by their `Project:` value.
Tasks without a `Project:` value go into an "Untagged" group.

**Health signal per project:**

| Signal | Condition |
|--------|-----------|
| 🔴 | Any delegation in this project is overdue (Check-by date has passed) |
| 🟡 | No overdue, but a Check-by date in this project is within 2 business days |
| 🟢 | All delegations in this project are on track |

**Task count summary per project:** Count of overdue, active, and delegated tasks.
Only include non-zero counts in the summary.

**Render the default view:**

```
## Status — {full day name}, {full date, e.g. Thursday, March 27}
```

**Section 1 — Risks (render only if overdue or due-today delegations exist):**

```
─── ⚠️ Risks ─────────────────────────────────────────────
  • {alias} — "{task title}" — {N} day(s) overdue
  • {alias} — "{task title}" — Check-by: today
```

Sort: most overdue first, then due-today items.

**Section 2 — Project sections (one per project, sorted by health: 🔴 first, 🟡 second, 🟢 last):**

```
─── {Project Name} {health signal} ({count summary}) ─────
  • [Active] "{task title}" — Due: {date}
  • [Delegated → {alias}] "{task title}" — Check-by: {date} ⚠️
  • [Inbox] "{task title}"
```

Within each project:
- Active tasks first (sorted by due date ascending), then Delegated (sorted by Check-by ascending), then Inbox
- Overdue items flagged with ⚠️ inline
- Inbox tasks show `[Inbox]` state, no date
- Done items omitted

**Section 3 — Untagged (render only if untagged non-Done tasks exist after triage):**

```
─── Untagged ({N} tasks) ────────────────────────────────
  • [{state}] "{task title}" — {date info if applicable}
```

**Closing prompt:**

```
Run /status [project] for detail, or /status [alias] for a person view.
```

Proceed to Step 7 (Done).

---

## Step 5: Project detail view

Render a deep dive for a single project.

Collect all tasks (including Done) with `Project:` matching the resolved project name.

**Health section:**

```
## Status — {Project Name}

─── Health: {signal} ({overdue summary or "on track"}) ───
  • {alias} — "{task title}" — {N} days overdue
```

Render health items only if overdue delegations exist for this project.

**Active section (render only if Active tasks exist for this project):**

```
─── Active ({N}) ──────────────────────────────────────────
  • "{task title}" — Due: {date}
```

Sort by due date ascending.

**Delegated section (render only if Delegated tasks exist for this project):**

```
─── Delegated ({N}) ───────────────────────────────────────
  • {alias} — "{task title}" — Check-by: {date} ⚠️
```

Sort by Check-by date ascending. Flag overdue with ⚠️.

**Recently Completed section (render only if Done tasks exist for this project within last 2 weeks):**

```
─── Recently Completed ────────────────────────────────────
  • "{task title}" — Done: {date}
  ... and {N} more
```

Maximum 5 items, sorted by Done date descending. If more than 5: show "... and {N} more".

**Closing prompt:**

```
Run /status for full org view, or /status {alias} for delegate view.
```

Use an actual alias from the project's delegated tasks in the closing prompt example.

Proceed to Step 7 (Done).

---

## Step 6: Alias view

Render everything delegated to a single person, grouped by project.

Collect all Delegated tasks (not in Done) where the delegate alias matches the resolved alias.
Also include any delegation memory entries for this alias (after deduplication from Step 2).

**Header:**

```
## Status — {Alias}

─── Delegated ({N} across {M} projects) ──────────────────
```

**Project sub-groups (one per project, sorted alphabetically):**

```
  {Project Name}:
  • "{task title}" — Check-by: {date} ⚠️ ({N} days overdue)
  • "{task title}" — Check-by: {date}
```

Within each project, sort by Check-by date ascending. Flag overdue with ⚠️ and days overdue.

Tasks without a `Project:` tag appear under "Untagged".

**Rules:**
- No Done items — alias view shows what's in flight only
- Header shows total delegation count and project count

**Closing prompt:**

```
Run /status for full org view, or /status {project} for project view.
```

Use an actual project name from the alias's delegated tasks in the closing prompt example.

Proceed to Step 7 (Done).

---

## Step 7: Done

The command is complete. Do not prompt for further action beyond the closing line
in the rendered view. The user drives any follow-on commands.
````

- [ ] **Step 2: Verify the command file is well-formed**

Read back `commands/status.md` and verify:
- YAML frontmatter has `description`, `argument-hint`, and `allowed-tools`
- All steps are numbered sequentially (1-7)
- All three output views are fully specified (default, project detail, alias)
- Triage phase includes skip option
- Health signal table is present with 🔴🟡🟢 conditions
- Memory-manager invocation uses `query-pending — within: 14 business days`
- Deduplication rule is present (TASKS.md authoritative)
- No placeholders, TBDs, or TODOs

- [ ] **Step 3: Run existing tests to confirm no regressions**

Run:
```bash
cd scripts && npm test
```

Expected: All tests pass. This is a new file — no existing behavior changes.

- [ ] **Step 4: Commit**

```bash
git add commands/status.md
git commit -m "feat: add /status org status command"
```

---

### Task 3: Update `docs/STRUCTURE.md`

Add `status.md` to the commands listing so the structure doc stays canonical.

**Files:**
- Modify: `docs/STRUCTURE.md:57-67` (commands listing)

- [ ] **Step 1: Add status.md to the commands listing**

In `docs/STRUCTURE.md`, find the commands listing block (lines 57-67):

```
commands/
  intake.md
  prioritize.md
  schedule.md
  execute.md
  delegate.md
  scan-email.md
  review-week.md
  today.md
  setup.md
```

Add `status.md` in alphabetical position (after `setup.md`, before `today.md`):

```
commands/
  intake.md
  prioritize.md
  schedule.md
  execute.md
  delegate.md
  scan-email.md
  review-week.md
  setup.md
  status.md
  today.md
```

- [ ] **Step 2: Update the command count in the Claude Code Plugin Best Practices section of `docs/PRINCIPLES.md`**

In `docs/PRINCIPLES.md`, find the line that reads:
```
- `commands/` holds 8 slash commands (intake, prioritize, schedule, execute, delegate, scan-email, review-week, setup)
```

Update to:
```
- `commands/` holds 10 slash commands (intake, prioritize, schedule, execute, delegate, scan-email, review-week, setup, status, today)
```

(Note: `today` was added in P1 but the count was not updated. Fix both here.)

- [ ] **Step 3: Commit**

```bash
git add docs/STRUCTURE.md docs/PRINCIPLES.md
git commit -m "docs: add status.md to structure listing, update command count"
```

---

### Task 4: Manual verification

Run through the spec's verification checklist to confirm the command works correctly.

**Files:**
- Read: `commands/status.md`
- Read: `docs/specs/status-command-spec.md`

- [ ] **Step 1: Verify spec coverage**

Read `docs/specs/status-command-spec.md` and cross-reference each requirement against `commands/status.md`:

| Spec requirement | Covered in command? |
|-----------------|---------------------|
| Three query modes (`/status`, `/status [project]`, `/status [alias]`) | Step 3 argument resolution + Steps 4b, 5, 6 |
| Argument resolution order (project first, then alias, ambiguous, no match) | Step 3 |
| TASKS.md load + missing board fallback | Step 1 |
| Memory-manager `query-pending — within: 14 business days` | Step 2 |
| Deduplication (TASKS.md authoritative) | Step 2 |
| Triage: confidence split, auto-tag, prompt ambiguous, skip option | Step 4 |
| Triage: only writes `Project:` field | Step 4 rules |
| Health signals: 🔴🟡🟢 with correct conditions | Step 4b health signal table |
| Default view: risks on top, projects sorted by health, no Done, untagged last | Step 4b |
| Project detail: health + active + delegated + recently completed (2 weeks, max 5) | Step 5 |
| Alias view: grouped by project, no Done, overdue flagged | Step 6 |
| Closing prompts: reporting-oriented, not action-oriented | Steps 4b, 5, 6 closing prompts |
| No analytics log | Confirmed — no Step for analytics |

- [ ] **Step 2: Run existing tests one final time**

Run:
```bash
cd scripts && npm test
```

Expected: All tests pass. No regressions.

- [ ] **Step 3: Final commit if any fixes were needed**

If the verification found issues and edits were made:
```bash
git add -A
git commit -m "fix: address status command verification findings"
```

If no fixes needed, skip this step.
