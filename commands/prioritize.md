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

If $ARGUMENTS is provided, find the matching task in the Unprocessed section and prioritize only that task.

If no argument is provided, prioritize ALL tasks in the `## Unprocessed` section.

If there are no unprocessed tasks, say: "No unprocessed tasks found. Use /intake to add new tasks."

## Step 3: Apply the Eisenhower Matrix

For each task, evaluate:

**Urgency check**: Is action needed within 1–3 days? Consider the urgency signal, due date, and source.
**Importance check**: Does this advance engineering goals, team health, strategic outcomes, or your core Director responsibilities? Is this YOUR work or someone else's urgency?

Map to quadrant:
- **Q1** (Urgent + Important) → Must do now
- **Q2** (Important, Not Urgent) → Schedule for focused work
- **Q3** (Urgent, Not Important) → Delegate if possible
- **Q4** (Not Urgent, Not Important) → Defer or eliminate

## Step 4: Present your recommendation

For each task, show:
```
Task: [title]
Quadrant: Q[X] — [label]
Reasoning: [1–2 sentence explanation]
Recommended action: [Do now / Schedule for [timeframe] / Delegate to [role] / Defer]
```

Then ask: "Does this assignment look right? I'll save it once you confirm — or tell me if any should be reclassified."

## Step 5: Save confirmed assignments

After user confirms (or adjusts), update TASKS.md:
1. Remove each task from `## Unprocessed`
2. Move it to the correct quadrant section
3. Preserve all original task fields
4. Add the quadrant label and recommended action to the task record

Confirm: "Prioritization complete. Run /schedule to assign dates and block time."

## Edge cases

- If a task is ambiguous (could be Q1 or Q2), default to Q2 and flag it: "I've placed this in Q2 but flag it if it's more urgent than I think."
- If the user says "just do them all as Q1" — gently push back: "Happy to mark all as Q1, but that may defeat the purpose. Want to talk through a couple of them first?"
