# ADR: Single-Backend Memory (Markdown Only)

**Date**: 2026-05-27
**Status**: Accepted
**Scope**: All commands and skills that read or write stakeholder delegation memory
**Supersedes**: `docs/adrs/memory-system-adr.md`, `docs/adrs/memory-access-layer.md`
**Issue**: #28

---

## Decision

The plugin owns stakeholder delegation memory fully. There is exactly one backend:
local markdown files under `memory/`. No external skill primary, no fallback chain.

- **Write path** (`memory-manager: log-delegation` / `resolve-delegation` /
  `update-checkin`): append or update rows in `memory/glossary.md` and
  `memory/people/{alias}.md`.
- **Read path A** (`memory-manager: query-pending`): parse `memory/glossary.md`.
- **Read path B** (`scripts/match-delegate.ts: loadPendingCounts`): parse
  `memory/glossary.md`.

Both read paths target the same file. Both write paths target the same files.

## Context

The prior architecture (recorded in `memory-system-adr.md` and
`memory-access-layer.md`) defined `productivity:memory-management` as a primary
backend with local files as a fallback. The `memory-manager` skill abstracted
the choice so callers were "backend-agnostic."

The abstraction had a structural defect documented but not resolved in
`memory-system-adr.md` itself (section "Known Limitation: Scoring in
Primary-Backend Mode"):

> When `productivity:memory-management` is active (primary backend), delegation
> entries are written to the external skill's store — not to `memory/glossary.md`.
> As a result, `loadPendingCounts()` returns `{}` and the pending-count penalty
> in `scoreDelegate()` is inoperative for those users.

`PENDING_PENALTY` in `scripts/delegate-core.ts` is the implementation of the
"Capacity" axis the README and `docs/specs/delegation-spec.md` present as a
first-class scoring factor. Under the prior architecture the axis silently
returned 0 whenever the abstraction "worked" and only fired when the
abstraction "failed." That inverted dependency direction — the algorithm
depended on the abstraction's failure mode — was the opposite of the
dependency-inversion principle in `docs/PRINCIPLES.md`.

## Rationale

Three options were considered:

1. **Markdown only (this ADR).** Plugin owns memory. Single source of truth.
   `PENDING_PENALTY` fires for every user. No external dependency.
2. **External primary with a query interface.** Add a read API to the external
   skill so `loadPendingCounts()` could query it. Requires upstream changes
   the plugin cannot make.
3. **Dual-write.** Both backends, every time. Re-introduces the split-state
   problem `memory-system-adr.md` was created to eliminate.

Option 1 wins on every axis the plugin actually optimizes for:

- **Behavior consistency.** Scoring fires the same way for every user.
- **Local-first.** The plugin already targets a single-user, local-first
  workflow (see `ROADMAP.md` Long-Term — Structured Task Store).
- **Test coverage.** Markdown files are trivial to fixture in Jest;
  external-skill mocks are not.
- **Cost.** Zero. No upstream dependency to coordinate.

Option 2 only becomes interesting if/when the plugin scales to a multi-user
team context where memory must be shared. At that point the ADR can be
revisited.

## Implementation

- `scripts/match-delegate.ts: loadPendingCounts` reads `memory/glossary.md`
  unconditionally. The prior "KNOWN LIMITATION — local fallback only" comment
  block is removed.
- `skills/memory-manager/SKILL.md` is rewritten as markdown-only. All
  "Attempt via `productivity:memory-management`" steps are deleted along with
  the "Do NOT write to local memory files if productivity:memory-management
  succeeded" guard line (no longer applicable — there is only one target).
- `skills/core/references/delegation-guide.md` no longer instructs the user
  to install the external skill.
- `docs/CONNECTORS.md` removes `productivity:memory-management` from the
  current-integrations table and the External Skill Dependencies section.
- `docs/architecture.md` updates the Memory Manager diagram to show a single
  write path and a single read path.
- `docs/PRINCIPLES.md` updates the DRY section to cite this ADR instead of
  the superseded read-abstraction ADR.

## Consequences

**Positive:**

- `PENDING_PENALTY` is enforced end-to-end for every user. The end-to-end
  regression `tests/pending-counts.test.ts` PENDING-005 covers the wiring.
- One fewer external dependency to document, install, or fail.
- Memory schema is fully owned in-repo (`docs/specs/memory-schema-spec.md`).

**Negative:**

- Users who previously stored stakeholder follow-ups in the external skill's
  store will not see those entries surfaced by `/review-week`, `/today`, or
  `/status`. The plugin starts fresh from `memory/glossary.md`. No migration
  path is provided — the external skill's store format is not part of this
  plugin's contract.
- If a multi-user team context emerges in the future, this ADR will need to
  be revisited (see Option 2 above).

## Verification

- `tests/pending-counts.test.ts` PENDING-005 — end-to-end: writes a real
  glossary.md, runs `loadPendingCounts` + `runMatch`, asserts the penalty
  axis fires (overloaded delegate outranked by less-loaded peer).
- `tests/pending-counts.test.ts` PENDING-005 also covers graceful degradation
  when `glossary.md` is absent (first-run state).
- `tests/prompt-contracts.test.ts` Q2-002 is dropped — the memory guard line
  is no longer needed because no file references the external skill.
