# ADR: Memory System — Single Write Target (Option B)

**Date**: 2026-03-04
**Status**: Accepted
**Scope**: All commands and skills that log stakeholder delegation entries

## Decision

`productivity:memory-management` is the single write target for stakeholder
delegation entries. Local memory files are a fallback used only when the skill
is unavailable in the current session.

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
3. If skill unavailable → write to the two local fallback files:
   - `memory/glossary.md` — global follow-up table (one row per delegation)
   - `memory/people/{alias-filename}.md` — per-delegate delegation log
   See `integrations/specs/memory-schema-spec.md` for the canonical schema of
   both files, including column definitions and filename derivation rules.
4. If both fail → surface non-blocking warning, instruct manual tracking

## Files Using memory-manager (v1.0.1)

- `skills/memory-manager/SKILL.md` — canonical implementation
- `commands/schedule.md` (Steps 3b, 7 — log-delegation)
- `commands/execute.md` (Mark Done → resolve-delegation; Log Progress → update-checkin; Delegate → log-delegation)
- `commands/delegate.md` (Step 8 — log-delegation)
- `commands/review-week.md` (Step 3 — query-pending)
- `skills/claude-eisenhower/SKILL.md` (Stakeholder Memory — references memory-manager)

## Read Paths

There are two distinct read paths for delegation memory, serving different consumers:

| Path | Consumer | What it reads | When it works |
|------|----------|---------------|---------------|
| `memory-manager: query-pending` | `/review-week` Step 3 | Primary backend or `glossary.md` | Both backends |
| `loadPendingCounts()` in `scripts/match-delegate.ts` | Delegate scoring algorithm | `memory/glossary.md` only | Local fallback only |

The scoring read path (`loadPendingCounts`) is implemented in TypeScript and cannot call the
prompt-layer memory-manager skill. It reads `glossary.md` directly and validates the header
against `GLOSSARY_COLUMNS` (defined in `scripts/delegate-core.ts`).

## Known Limitation: Scoring in Primary-Backend Mode

When `productivity:memory-management` is active (primary backend), delegation entries are
written to the external skill's store — not to `memory/glossary.md`. As a result,
`loadPendingCounts()` returns `{}` and the pending-count penalty in `scoreDelegate()` is
inoperative for those users.

**Impact:** `capacity_warning` still fires from the static `capacity_signal` field in
`stakeholders.yaml`; only the live overload adjustment (`PENDING_PENALTY × overload`) is
absent. This is acceptable degradation — the algorithm still functions, it just lacks
the real-time workload signal.

**Not a dual-write fix:** The correct long-term solution would be an API-callable query
interface on the primary backend, not writing to both systems. Until that interface exists,
pending-count scoring is a best-effort signal in primary-backend mode.
