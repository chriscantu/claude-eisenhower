---
description: Org status — project health, delegation portfolio, risk view
argument-hint: [project-name] or [alias] (optional)
allowed-tools: Read, Write, Edit
---

You are running the STATUS command of the Engineering Task Flow.

This command provides an on-demand org-wide status view grouped by project/initiative.
It surfaces project health, delegation portfolios, and risk signals. The only write
is tagging untagged tasks with `Project:` during triage — it never modifies task state,
dates, or delegation fields.

---

## Step 1: Load the task board

No config check needed — /status reads TASKS.md and delegation memory only.
No scripts, adapters, or calendar integration involved.

Read TASKS.md from the root of the workspace.
If TASKS.md does not exist: show "No task board found. Run /intake to get started." and stop.

Extract all task records across all sections (Inbox, Active, Delegated, Done).
For each task, read: title, State, Priority, Due date, Scheduled, Owner,
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

## Step 3: Triage untagged tasks

Triage runs on every invocation (any query mode) when untagged non-Done tasks exist.
This ensures project/alias views always reflect correctly tagged data.

Scan all non-Done tasks for a missing `Project:` field.

**If no untagged tasks exist:** skip triage entirely — proceed to Step 4 (Resolve argument).

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

---

## Step 4: Resolve argument (if provided)

If the user provided an argument (e.g., `/status auth-migration` or `/status alex`):

1. Collect all unique `Project:` values from TASKS.md task records
2. Collect all delegate aliases from Delegated tasks and memory-manager results
3. Check the argument against project names (case-insensitive partial match)
4. Check the argument against delegate aliases (case-insensitive partial match)
5. Resolution:
   - **Matches a project only** → proceed to Step 6 (Project Detail View)
   - **Matches an alias only** → proceed to Step 7 (Alias View)
   - **Matches both** → ask the user: "'{arg}' matches both project '{project}' and delegate '{alias}'. Which did you mean?"
   - **Matches neither** → "No project or delegate found matching '{arg}'."

If no argument was provided, proceed to Step 5 (Default View).

---

## Step 5: Build the default view

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
| 🟢 | All delegations in this project are on track (includes projects with no delegations) |

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

Proceed to Step 8 (Done).

---

## Step 6: Project detail view

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

Proceed to Step 8 (Done).

---

## Step 7: Alias view

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

Proceed to Step 8 (Done).

---

## Step 8: Done

The command is complete. Do not prompt for further action beyond the closing line
in the rendered view. The user drives any follow-on commands.
