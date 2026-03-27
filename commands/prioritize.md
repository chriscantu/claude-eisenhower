---
description: Prioritize unprocessed tasks using Eisenhower matrix
argument-hint: [optional: task title or number to prioritize one task]
allowed-tools: Read, Write, Edit
---

You are running the PRIORITIZE phase of the Engineering Task Flow.

## Step 1: Load the task board

Read TASKS.md from the root of the user's mounted workspace folder.
If the file does not exist, inform the user: "No task board found. Run /intake to add tasks first."

## Step 2: Identify what to prioritize

If $ARGUMENTS is provided, find the matching task in the Inbox section and prioritize only that task.
If no argument is provided, prioritize ALL tasks in the `## Inbox` section.
If there are no Inbox tasks, say: "No inbox tasks found. Use /intake to add new tasks."

## Step 3: Apply the Eisenhower Matrix

For each task, evaluate:

**Urgency check**: Is action needed within 1–3 days? Consider the urgency signal, due date, and source.
**Importance check**: Does this advance engineering goals, team health, strategic outcomes, or your core Director responsibilities? Is this YOUR work or someone else's urgency?

Map to quadrant (used as Priority metadata, not status):
- **Q1** (Urgent + Important) → State: Active, Owner: me — must do now
- **Q2** (Important, Not Urgent) → State: Active, Owner: me — schedule for focused work
- **Q3** (Urgent, Not Important) → State: Delegated, Owner: delegate alias — requires Check-by date
- **Q4** (Not Urgent, Not Important) → State: Done, Note: "Eliminated — Q4 cut {date}"

**Authority flag**: If a task description contains language like "requires your sign-off", "executive decision", "personnel decision", or "sensitive communication on your behalf", flag it before classifying Q3. Say: "This may require your authority — consider Q1 instead." Ask the user to confirm Q1 or keep Q3.
<!-- Canonical source: AUTHORITY_PATTERNS in scripts/delegate-core.ts.
     Update both this list AND delegate-core.ts if patterns change. -->

## Step 4: Present your recommendation

For each task, show:

```
Task: [title]
Priority: Q[X] — [label]
State: [Active / Delegated / Done]
Owner: [me / delegate alias]
Reasoning: [1–2 sentence explanation]
Recommended action: [Do now / Schedule for [timeframe] / Delegate to [alias] / Eliminate]
```

Then ask: "Does this look right? I'll save it once you confirm — or tell me if any should be reclassified."

## Step 4b: For each Q3 task — score delegates via CLI

After classifying a task as Q3, before saving:

1. **Resolve plugin_root** following `skills/core/references/plugin-root-resolution.md`.

2. **Check for stakeholder graph**: Read `{plugin_root}/config/stakeholders.yaml`.

   - If the file does not exist: say "No stakeholder graph found. Copy `config/stakeholders.yaml.example` to `stakeholders.yaml` and fill in your delegates to enable delegation suggestions." Save the task with `Delegate to: [not yet assigned — see stakeholders.yaml]` and continue.
   - If the file exists but the `stakeholders` list is empty: say "Stakeholder graph is empty — no delegates configured." Save with the same placeholder and continue.

3. **Invoke the scoring CLI**:

   ```
   do shell script "cd " & quoted form of "{plugin_root}/scripts" & " && npx ts-node match-delegate.ts " & quoted form of "{task_title}: {task_description}" & " " & quoted form of "" & " 2>&1"
   ```

   Note: the CLI reads `config/stakeholders.yaml` and `memory/glossary.md` relative
   to the working directory. The `cd` ensures it runs from the scripts directory.
   If `memory/glossary.md` does not exist, pending counts default to 0 (no error).

4. **Parse the JSON output**. The CLI returns a JSON object with:
   - `candidates[]` — ranked by score, each with `alias`, `score`, `role`, and `reasons[]`
   - `warnings[]` — advisory messages (e.g., high pending count)
   - `status` — `match`, `no_match`, `empty_graph`, or `no_graph`

5. **Surface results**:
   - `status: match` with one clear top scorer → suggest by alias with reasoning from `reasons[]`
   - `status: match` with tied scores → surface both, prefer `direct_report` on tiebreak, ask user to choose
   - `status: no_match` → say "No clear domain match in your stakeholder graph." Ask: "Who should own this?"
   - If any `warnings[]` mention low capacity → add: "Note: [alias] is currently showing low capacity — confirm they can take this on."
   - If any `warnings[]` mention pending delegations → surface the count as advisory

6. **Ask for confirmation** before recording the delegate — never auto-assign:
   "Does [alias] make sense for this, or would you like to assign someone else?"

7. **Record the result** in the task entry as `Suggested delegate: [alias]` (confirmed at schedule time).

## Step 5: Save confirmed assignments

After user confirms (or adjusts), update TASKS.md:
1. Remove each task from `## Inbox`
2. Move it to the correct state section (`## Active`, `## Delegated`, or `## Done`)
3. Preserve all original task fields
4. Add the following fields to the task record:
   - `Priority:` Q1 / Q2 / Q3 / Q4
   - `State:` Active / Delegated / Done
   - `Owner:` me / delegate alias
5. For Delegated: require a `Check-by:` date before saving. If not provided, ask: "What date should I check in on this?" Do not save without it.
6. For Q3: add `Owner: [alias]` (or `Owner: [not yet assigned — see stakeholders.yaml]` if no graph)
7. For Q4: add `Note: Eliminated — Q4 cut {today's date}` and move to `## Done`

Confirm: "Prioritization complete. Run /schedule to assign dates and block time."

## Edge cases

- If a task is ambiguous (could be Q1 or Q2), default to Q2 / Active and flag it: "I've placed this in Active (Q2) but flag it if it's more urgent than I think."
- If the user says "just do them all as Q1" — gently push back: "Happy to mark all as Active, but that may defeat the purpose. Want to talk through a couple of them first?"
- If a Q3 task description signals it requires the user's personal authority, flag it for reclassification to Q1 / Active before proceeding (see Step 3 Authority flag).
- If a user reports a task is blocked: do NOT create a Blocked state. Instead, update the task's `Note:` field with the blocker context, ensure a `Check-by:` date is set, and keep the task in its current state (Active or Delegated). The forcing function is the check-by date — not a label.
