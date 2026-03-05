# Memory Access Layer

**Date**: 2026-03-04
**Status**: Superseded — see `skills/memory-manager/SKILL.md` (v1.0.1)
**Scope**: All commands and skills that read stakeholder delegation entries
**Related**: `memory-system-adr.md` (write contract)

---

> **Superseded in v1.0.1.** The read contract defined here has been unified with write
> and update contracts into the `memory-manager` skill
> (`skills/memory-manager/SKILL.md`). This document is retained as a historical
> record of the read-abstraction design decision. Do not implement the pattern described
> below inline in commands — use the memory-manager skill instead.

---

## Purpose

The write contract (see `memory-system-adr.md`) defines a single-write-target pattern:
`productivity:memory-management` is primary; `memory/stakeholders-log.md` is the fallback.

This document defines the corresponding **read contract** — how commands retrieve
delegation memory entries without knowledge of which backend stored them.

---

## Read Contract

When a command needs to read delegation memory (e.g., check-ins approaching, pending
delegations for a person), it uses the following pattern:

### Step 1 — Attempt skill read

Query `productivity:memory-management` for the relevant entries.
If the skill returns results → use them. Done.

### Step 2 — Fallback: parse local file

If the skill is unavailable or returns no results, read `memory/stakeholders-log.md`.

The local file format (one entry per line):
```
[YYYY-MM-DD] [alias] | [task title] | check-in: [YYYY-MM-DD] | status: pending|resolved
```

Parse each line and filter by the requested criteria (date range, status, alias).

### Step 3 — Return unified shape

Regardless of which backend provided the data, return entries in this shape:

```
{
  alias:          string        // stakeholder alias (display name from stakeholders.yaml)
  task:           string        // task title
  check_in_date:  string        // YYYY-MM-DD
  status:         'pending' | 'resolved'
  logged_date:    string        // YYYY-MM-DD — when the entry was written
}
```

The caller never inspects which backend was used.

---

## Deduplication

When reading for a specific context (e.g., `/review-week` delegated check-ins), cross-
reference the returned memory entries against TASKS.md Delegated records. If the same
`alias + task` pair appears in both:

- Use the TASKS.md record as authoritative (it has the full task schema)
- Suppress the memory-only entry from output
- Do not surface duplicates to the user

---

## Failure Modes

| Condition | Behavior |
|-----------|----------|
| Skill unavailable, local file missing | Return empty list. Non-blocking. |
| Skill unavailable, local file unreadable | Return empty list. Non-blocking. |
| Skill returns error | Fall through to local file read. |
| Both backends fail | Return empty list. Surface no error to user unless the read was the primary purpose of the command. |

---

## Commands Using This Pattern

| Command | Read operation |
|---------|---------------|
| `/review-week` | Fetch pending check-ins within next N business days |

As additional commands need memory reads, add them to this table.

---

## Relationship to Write Contract

The write contract (ADR) ensures entries land in exactly one backend per session.
The read contract ensures retrieval works regardless of which backend was used.
Together they make the memory system transparent to callers.

Do not implement reads that query both backends and merge results — this would re-introduce
the dual-state problem the ADR was designed to eliminate. The read falls through to the
local file only when the skill is unavailable, not as a merge strategy.
