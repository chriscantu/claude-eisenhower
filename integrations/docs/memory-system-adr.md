# ADR: Memory System — Single Write Target (Option B)

**Date**: 2026-03-04
**Status**: Accepted
**Scope**: All commands and skills that log stakeholder delegation entries

## Decision

`productivity:memory-management` is the single write target for stakeholder
delegation entries. Local `memory/stakeholders-log.md` is a fallback used only
when the skill is unavailable in the current session.

Commands and skills must never write to both systems in the same session.

## Rationale

The prior pattern (write to skill, then also write to local memory/) created
duplicate entries when both succeeded, and split state when one failed. The
Option B pattern (primary → fallback) preserves offline/no-skill support
while eliminating dual-write.

## Implementation

Each memory-write block in commands and skills follows this pattern:
1. Attempt `productivity:memory-management`
2. If skill succeeds → done. Do not write to `memory/`
3. If skill unavailable → write to `memory/stakeholders-log.md`
4. If both fail → surface non-blocking warning, instruct manual tracking

## Files Updated

- `commands/schedule.md` (Steps 3b, 7)
- `commands/execute.md` (Mark Done, Delegate sections)
- `commands/delegate.md` (Step 8)
- `skills/claude-eisenhower/SKILL.md` (Stakeholder Memory section)
