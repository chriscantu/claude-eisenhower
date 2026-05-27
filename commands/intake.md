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
- **Due date** (ISO format: `YYYY-MM-DD`): apply the rules below.

### Due date — anchor and origin

The session date (today's actual ISO date) is injected by the harness as a
`# currentDate` block in your system context (e.g. "Today's date is
2026-05-27"). Use that date as the anchor for every temporal-phrase parse.

**If `# currentDate` is NOT present in your context** (custom harness, dev
session, etc.), STOP and ask the user: "What is today's date?" Do NOT
fall back to internal training-cutoff dates and do NOT use any example
ISO from this prompt as the anchor — the examples are illustrative only.

For each input, the Due date renders in exactly ONE of these forms:

| User input contains                                | Output format                                                  | Origin marker        |
|----------------------------------------------------|----------------------------------------------------------------|----------------------|
| Verbatim ISO date (`2026-06-04`)                   | `Due date: 2026-06-04 (verbatim)`                              | `(verbatim)`         |
| Temporal phrase (`by Thursday`, `EOW`, `next week`) | `Due date: {ISO} (parsed from "{phrase}", anchor {TODAY-ISO})` | `(parsed from ...)`  |
| No date or phrase                                  | `Due date: Not specified`                                      | `(not mentioned)`    |

Notes:
- The three markers are mutually exclusive — pick exactly one. Verbatim
  ISO wins over phrase-parse even when both rules could apply (a user
  who typed `2026-06-04` does not need the parse origin trail).
- The anchor field is REQUIRED on `(parsed from ...)` outputs — without
  it, silent mis-anchoring cannot be detected at confirmation time.
- Examples are SYMBOLIC. Substitute the actual session date for
  {TODAY-ISO}; do NOT use any example date below as a live anchor:
  - Input "by Thursday" → `Due date: {next Thursday on/after TODAY} (parsed from "by Thursday", anchor {TODAY-ISO})`
  - Input "next week" → `Due date: {TODAY+7} (parsed from "next week", anchor {TODAY-ISO})`

## Format the task record as:

`{TODAY-ISO}` below is the session date from `# currentDate` (same source
used for the Due-date anchor above). The `Due date:` line MUST carry the
origin marker established in the previous section (`(verbatim)`,
`(parsed from "...", anchor {TODAY-ISO})`, or `Not specified`) so the
anchor is durable in the persisted record — not just visible at confirmation.

```
---
[ INTAKE — {TODAY-ISO} ]
Title:        {title}
Description:  {description}
Source:       {source}
Requester:    {requester}
Urgency:      {urgency signal}
Due date:     {ISO date with origin marker, or "Not specified"}
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
     Due date:     [ISO date]  (verbatim | parsed from "[phrase]", anchor [TODAY-ISO] | not mentioned)

   Save / edit / cancel?
   ```

   The Due date marker is exactly ONE of the three forms above (verbatim
   ISO, parsed phrase with anchor, or not mentioned) per the table in the
   "Due date — anchor and origin" section.

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
