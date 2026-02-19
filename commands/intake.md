---
description: Capture a new task from any source
argument-hint: [describe the task in natural language]
allowed-tools: Read, Write, Edit
---

You are running the INTAKE phase of the Engineering Task Flow.

The user has described a new task: $ARGUMENTS

## Your job

Parse the user's natural language description and extract a structured task record. Be liberal in what you accept — the user may give you one sentence or a whole paragraph.

Extract the following fields:
- **Title**: Short, action-oriented (verb + object). Max 10 words.
- **Description**: What needs to happen and why. 1–3 sentences.
- **Source**: Where this came from. Options: Email, Slack, Meeting, Conversation, Calendar, Jira, Asana, Linear, GitHub, Self, Other. Infer from context if not stated.
- **Requester**: Who asked or who this is for. Include role if known. Use "Self" if self-generated.
- **Urgency signal**: What was said about timing (quote or paraphrase). If nothing stated, write "Not specified."
- **Raw due date**: Any date mentioned. If not mentioned, write "Not specified."

## Format the task record as:

```
---
[ INTAKE — {today's date} ]
Title:       {title}
Description: {description}
Source:      {source}
Requester:   {requester}
Urgency:     {urgency signal}
Due date:    {raw due date}
Status:      Unprocessed
---
```

## Then:

1. Check if a TASKS.md file exists in the workspace folder. Look for it at the root of the mounted workspace (the folder the user has selected in Cowork). If it does not exist, create it with this structure:

```markdown
# Task Board

## Unprocessed

## Q1 — Urgent + Important

## Q2 — Important, Not Urgent

## Q3 — Urgent, Not Important (Delegate)

## Q4 — Defer / Eliminate

## Completed
```

2. Append the formatted task record to the `## Unprocessed` section.

3. Confirm to the user what was captured in a brief, friendly summary. Example: "Got it — I've logged '[title]' as a new task from [source]. Run /prioritize when you're ready to assign it a quadrant."

4. If the source or requester is unclear, ask ONE clarifying question before saving.

Do NOT prioritize or schedule the task yet. Intake only captures. Judgment comes in the next phase.
