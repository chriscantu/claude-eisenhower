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

As of v1.0.1, all memory operations (read, write, update) are consolidated in the
`memory-manager` skill (`skills/memory-manager/SKILL.md`). Commands invoke operations
by intent; the skill owns the try-skill-then-fallback contract.

The 4-step inline pattern described below was the original implementation and has been
removed from all command files:
1. Attempt `productivity:memory-management`
2. If skill succeeds → done. Do not write to `memory/`
3. If skill unavailable → write to `memory/stakeholders-log.md`
4. If both fail → surface non-blocking warning, instruct manual tracking

## Files Using memory-manager (v1.0.1)

- `skills/memory-manager/SKILL.md` — canonical implementation
- `commands/schedule.md` (Steps 3b, 7 — log-delegation)
- `commands/execute.md` (Mark Done → resolve-delegation; Log Progress → update-checkin; Delegate → log-delegation)
- `commands/delegate.md` (Step 8 — log-delegation)
- `commands/review-week.md` (Step 3 — query-pending)
- `skills/claude-eisenhower/SKILL.md` (Stakeholder Memory — references memory-manager)
