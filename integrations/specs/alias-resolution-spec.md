# Alias Resolution — Feature Specification

**Status**: Approved for implementation
**Version target**: v0.5.0
**Author**: Cantu
**Created**: 2026-02-21
**Depends on**: `delegate-core.ts` (Stakeholder interface), `stakeholders.yaml`

---

## Problem Statement

The `alias` field in `stakeholders.yaml` is currently a single string (e.g. `"Jordan V."`).
In real work contexts, people are referred to by last name, nickname, or shorthand that
differs from the formal alias — e.g. "Vargas" instead of "Jordan V." for a VP of Product.

This causes friction at every point in the workflow:
- `/intake` — requester names from Slack/email/meetings don't resolve to known stakeholders
- `/delegate` — you can't refer to a candidate by the name you actually use
- Output in TASKS.md — formal aliases may not match how you think about people

**Root cause**: The system has a 1:1 mapping between a person and their lookup key.
Real working language is 1:many.

---

## Goals

1. Allow each stakeholder to have one **display alias** (what appears in TASKS.md and output) plus zero or more **lookup terms** (last name, nickname, shorthand).
2. Resolution must be **system-wide** — intake, delegation matching, and any future command that references a stakeholder by name.
3. **Single source of truth** — resolution logic lives in `delegate-core.ts` only, imported everywhere.
4. **Backward-compatible schema** — a string `alias` in an existing file is treated as a single-item array. No migration required.

---

## Out of Scope

- Fuzzy/approximate matching (typo tolerance) — exact case-insensitive match only in v0.5
- Auto-population of nicknames from task history
- UI for managing the stakeholder graph

---

## Data Model Change

### Before

```yaml
alias: "Jordan V."   # single string, display + lookup
```

```typescript
alias: string;  // in Stakeholder interface
```

### After

```yaml
alias:
  - "Jordan V."   # first item = display name (shown in TASKS.md, output)
  - "Vargas"       # additional lookup terms
  - "jordan v"      # case-insensitive; partial name acceptable
```

```typescript
alias: string | string[];  // union — backward compat; string treated as [string]
```

**Display rule**: `alias[0]` (or `alias` if string) is always the display name.
**Lookup rule**: All items in `alias` are matched against input, case-insensitive.

---

## New Function: `resolveAlias`

Added to `delegate-core.ts` (single source of truth).

```typescript
/**
 * Given a raw name string (from user input, email, Slack message),
 * return the display alias of the matching stakeholder, or null if no match.
 *
 * Matching: case-insensitive, exact token match against all alias entries.
 */
export function resolveAlias(
  input: string,
  stakeholders: Stakeholder[]
): string | null
```

**Behavior:**
- Normalize both `input` and each alias entry: lowercase, trim, collapse whitespace
- Match if any alias entry equals the normalized input
- Return `getDisplayAlias(stakeholder)` on match, `null` if no match
- If multiple stakeholders match (unlikely but possible), return first match

**Helper:**

```typescript
export function getDisplayAlias(s: Stakeholder): string {
  return Array.isArray(s.alias) ? s.alias[0] : s.alias;
}
```

---

## Affected Files

| File | Change |
|------|--------|
| `scripts/delegate-core.ts` | `alias: string → string \| string[]`; add `resolveAlias()`, `getDisplayAlias()` |
| `scripts/match-delegate.ts` | Use `getDisplayAlias()` for all output display |
| `integrations/config/stakeholders.yaml.example` | Update all entries to array alias format; add comments |
| `commands/intake.md` | Add alias resolution step before writing Requester field |
| `tests/delegation.test.ts` | Add TEST-DEL-203 series: alias resolution tests |

---

## Gherkin Scenarios

### Feature: Stakeholder alias resolution

```gherkin
Background:
  Given stakeholders.yaml contains:
    | name            | alias                            | role           |
    | JORDAN_VARGAS | ["Jordan V.", "Vargas", "JV"]  | VP of Product  |
    | SARAH_EVANS     | ["Sarah E."]                     | Staff Engineer |

Scenario: TEST-DEL-203-A — Resolve by primary alias
  When I call resolveAlias("Jordan V.", stakeholders)
  Then the result is "Jordan V."

Scenario: TEST-DEL-203-B — Resolve by last name shorthand
  When I call resolveAlias("Vargas", stakeholders)
  Then the result is "Jordan V."

Scenario: TEST-DEL-203-C — Resolve case-insensitive
  When I call resolveAlias("Vargas", stakeholders)
  Then the result is "Jordan V."

Scenario: TEST-DEL-203-D — Resolve by initials shorthand
  When I call resolveAlias("JV", stakeholders)
  Then the result is "Jordan V."

Scenario: TEST-DEL-203-E — Unknown name returns null
  When I call resolveAlias("Bob", stakeholders)
  Then the result is null

Scenario: TEST-DEL-203-F — Backward compat: string alias resolves correctly
  Given stakeholders.yaml has alias: "Sarah E." (string, not array)
  When I call resolveAlias("Sarah E.", stakeholders)
  Then the result is "Sarah E."

Scenario: TEST-DEL-203-G — /intake resolves requester name
  Given the intake source contains "Requested by: Vargas"
  When /intake processes the task
  Then TASKS.md contains "Requester: Jordan V."
  And the full name "JORDAN_VARGAS" does not appear in TASKS.md

Scenario: TEST-DEL-203-H — /intake passes through unknown requester verbatim
  Given the intake source contains "Requested by: Bob Unknown"
  When /intake processes the task
  Then TASKS.md contains "Requester: Bob Unknown"
  And no error is raised
```

---

## `/intake` Command Change

**Step: Requester Normalization** (inserted before writing to TASKS.md)

After extracting the requester name from source text:

1. Load `stakeholders.yaml`
2. Call `resolveAlias(extractedRequesterName, stakeholders)` — conceptually; Claude performs this lookup
3. If resolved: use the display alias in the `Requester:` field
4. If not resolved: write the extracted name verbatim (no blocking, no error)

**Why not block on unresolved names?** The stakeholder graph is intentionally incomplete.
Not every requester will be a known delegate. Writing verbatim is safe since TASKS.md is gitignored.

---

## Architecture Notes

### DRY compliance
`resolveAlias` and `getDisplayAlias` live in `delegate-core.ts` only.
Neither `match-delegate.ts` nor any command duplicates the resolution logic.

### SOLID compliance
- `delegate-core.ts` gains two new pure functions — no I/O, no side effects (SRP preserved)
- Existing `scoreDelegate` is unchanged — it already uses `alias` only for output
- `match-delegate.ts` switches from direct `alias` access to `getDisplayAlias()` call (OCP: open for extension)

### PII safety
- `resolveAlias` returns display alias only — never `name`
- The `name` field remains internal to `stakeholders.yaml`, never surfaced by any function

### Backward compatibility
- `alias: "string"` in yaml is handled by `Array.isArray()` guard in `getDisplayAlias`
- Existing `stakeholders.yaml` files with string aliases continue to work without migration

---

## Test Naming Convention

New tests follow existing convention from `tests/delegation-regression.md`:

| ID | Description |
|----|-------------|
| TEST-DEL-203-A | Resolve primary alias |
| TEST-DEL-203-B | Resolve last name shorthand |
| TEST-DEL-203-C | Case-insensitive resolution |
| TEST-DEL-203-D | Resolve initials/abbreviation |
| TEST-DEL-203-E | Unknown name returns null |
| TEST-DEL-203-F | Backward compat — string alias |
| TEST-DEL-203-G | /intake resolves known requester |
| TEST-DEL-203-H | /intake passes through unknown requester |

---

## Decisions Log

| Decision | Rationale |
|----------|-----------|
| `alias` is `string \| string[]` not `string[]` only | Backward compat — avoids forced migration of existing stakeholders.yaml files |
| First array item = display name | Convention over configuration; no separate `display_alias` field needed |
| Exact match only (no fuzzy) | Fuzzy matching adds false-positive risk for names; user controls the alias list |
| `resolveAlias` returns `null` not throw | Unknown names are expected — not all requesters are stakeholders |
| No separate `nicknames` field | Simpler schema; alias already carries both display and lookup semantics |
