---
description: Capture a new task from any source
argument-hint: [describe the task in natural language]
allowed-tools: Read, Write, Edit
---

You are running the INTAKE phase of the Engineering Task Flow.

The user has described a new task: $ARGUMENTS

## Your job

Parse the user's natural language description and extract a structured task record. Be liberal in what you accept — the user may give you one sentence or a whole paragraph.

Extract the following fields. Track for each whether the value was **stated**
explicitly by the user or **inferred** from context — you'll surface this
distinction in the confirmation block below.

- **Title**: Short, action-oriented (verb + object). Max 10 words.
- **Description**: What needs to happen and why. 1–3 sentences.
- **Source**: Where this came from. Options: Email, Slack, Meeting, Conversation, Calendar, Jira, Asana, Linear, GitHub, Self, Other. Infer from context if not stated — mark as `(inferred)`.
- **Requester**: Who asked or who this is for. Include role if known. Use "Self" if self-generated. See alias resolution step below — resolve to display alias before writing. Mark `(stated)` or `(inferred)` based on whether the user named them.
- **Urgency signal**: What was said about timing (quote or paraphrase). If nothing stated, write "Not specified."
- **Raw due date** (ISO format: `YYYY-MM-DD`): If any temporal phrase appears in the input ("by Thursday", "before EOW", "next Tuesday", "end of month"), **parse it to an ISO date relative to the current session date** (the date injected by the harness — see `# currentDate` in CLAUDE.md, e.g. "Today's date is 2026-05-27"). Use that date as the anchor for every parse; do NOT use a hardcoded calendar date from this prompt. Surface the parse origin AND the anchor so silent mis-anchoring is visible at confirmation time:
  - Format: `Due date: {ISO} (parsed from "{phrase}", anchor {today's ISO})`
  - Examples (symbolic — substitute the actual session date for {TODAY}):
    - Input "by Thursday" → `Due date: {next Thursday on/after TODAY} (parsed from "by Thursday", anchor {TODAY})`
    - Input "next week" → `Due date: {TODAY+7} (parsed from "next week", anchor {TODAY})`
    - Input "Friday" → `Due date: {next Friday on/after TODAY} (parsed from "Friday", anchor {TODAY})`
  - No date mentioned → `Due date: Not specified`

## Format the task record as:

```
---
[ INTAKE — {today's date} ]
Title:        {title}
Description:  {description}
Source:       {source}
Requester:    {requester}
Urgency:      {urgency signal}
Due date:     {raw due date}
State:        Inbox
---
```

## Requester Alias Resolution

Before writing the task record, resolve the requester name against the stakeholder graph:

1. Load `config/stakeholders.yaml` (if it exists).
2. For the extracted requester name, check each stakeholder's `alias` entries (all items, case-insensitive). The first item in `alias` is the display name; additional items are lookup terms (last name, nickname, shorthand).
3. **If a match is found**: use the display alias (first item) as the `Requester:` value.
4. **If no match is found**: write the extracted name verbatim. Do not block or error — not every requester is a known stakeholder.
5. **If stakeholders.yaml does not exist**: write verbatim. Skip silently.

Example: source says "Vargas asked for this" → alias entries include "Vargas" → write `Requester: Jordan V.`

## Then:

1. Check if a TASKS.md file exists in the workspace folder. Look for it at the root of the mounted workspace (the folder the user has selected in Cowork). If it does not exist, create it with this structure:

```markdown
# Task Board

## Inbox

## Active

## Delegated

## Done
```

2. **Show the confirmation block to the user BEFORE writing** to TASKS.md.
   Render every extracted field with its `(stated)` or `(inferred)` marker
   so the user can correct silent inferences. Use this confirmation block
   shape:

   ```
   I've extracted:
     Title:        [title]
     Description:  [description]
     Source:       [source]  (stated | inferred)
     Requester:    [requester]  (stated | inferred)
     Urgency:      [urgency signal]  (stated | not mentioned)
     Due date:     [ISO date]  (parsed from "[phrase]" | stated | not mentioned)

   Save / edit / cancel?
   ```

   - **save**: append to `## Inbox` and confirm "Got it — logged '[title]'."
   - **edit**: prompt for which field to change; re-render the block.
   - **cancel**: drop the record, no write.

3. Only after explicit "save" (or equivalent: "yes", "looks good"), append
   the formatted task record to the `## Inbox` section.

4. Do NOT silently infer. Every `(inferred)` field must be visible in the
   confirmation block. If a value cannot reasonably be inferred (e.g., the
   source is genuinely ambiguous and context provides no signal), leave it
   blank in the block and ask the user inline before save.

Do NOT prioritize or schedule the task yet. Intake only captures. Judgment comes in the next phase.
