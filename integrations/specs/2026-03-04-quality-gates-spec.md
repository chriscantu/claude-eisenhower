# Spec: Quality Gates — Post-Remediation Hardening
**Version target**: v1.1.0
**Status**: Draft
**Author**: Cantu
**Date**: 2026-03-04
**Source**: Quality convergence analysis after three rounds of SME review (v0.9.5–v0.9.7)
**Scope**: 3 findings across 2 domains (1 security, 1 test coverage, 1 structural consistency)

---

## Overview

After three rounds of SME review culminating in the v0.9.7 remediation, the remaining
highest-ROI quality investment falls into two domains: security hardening of the AppleScript
shell integration layer, and automated guards against the two failure modes that have required
manual review in every session — untested AppleScript logic and prompt-file inconsistency.

These are not bug fixes — the plugin is functionally correct at v0.9.7. These findings
establish quality gates that make future regressions detectable without requiring a full
manual review cycle.

---

## Domain 1 — Security

### S1 — Shell injection audit of `do shell script` calls

**Severity**: Medium

**Problem**: AppleScript scripts call `do shell script` to invoke external commands. The
fix in v0.9.7 (I4) introduced a new `do shell script` call in `complete_reminder.applescript`
using `printf '%s' ` and `quoted form of str`. This is correct. However, the full set of
`do shell script` calls across all AppleScript files has not been systematically audited for
shell injection. Any call that concatenates an unquoted user-controlled value into a shell
command string is a potential injection vector.

The risk surface: task titles and stakeholder aliases flow from user-editable files
(`TASKS.md`, `stakeholders.yaml`) into AppleScript arguments and then into shell commands.
If any `do shell script` call interpolates these values without `quoted form of`, a
specially crafted task title (e.g., `"; rm -rf ~/repos"`) could execute arbitrary shell
commands with the user's privileges.

**Acceptance criteria**:

```
[ ] Every `do shell script` call across all AppleScript files in scripts/ is
    identified and listed.

[ ] Each call is classified as:
    (a) Safe — all user-controlled values use `quoted form of`
    (b) Safe — the string is entirely static (no user-controlled input)
    (c) Unsafe — one or more user-controlled values are concatenated without
        `quoted form of`

[ ] No (c) classifications exist at time of commit.

[ ] For each (a) classification, the audit confirms `quoted form of` is applied
    to the value before concatenation, not after.

[ ] The audit result is documented in integrations/docs/security-audit-applescript.md
    listing each call site, its classification, and the user-controlled inputs involved.
```

**Files affected**: `scripts/complete_reminder.applescript`, `scripts/push_reminder.applescript`,
any other `*.applescript` files in `scripts/`, `integrations/docs/` (new audit doc)

---

## Domain 2 — Test Coverage and Structural Consistency

### Q1 — AppleScript manual test protocol

**Severity**: Medium

**Problem**: The AppleScript scripts (`complete_reminder.applescript`,
`push_reminder.applescript`) cannot be exercised by the Jest test suite. Any regression
in these files — wrong return value format, broken argument handling, encoding issues —
is invisible to CI. The I4 fix (POSIX `tr` for non-ASCII lowercasing) was verified only
by code review, not by execution. There is no documented procedure for manually testing
these scripts before a release.

**Acceptance criteria**:

```
[ ] integrations/docs/applescript-test-protocol.md is created documenting manual
    test procedures for each script.

[ ] The protocol covers at least these test cases for complete_reminder.applescript:
    - ASCII title: existing reminder → expects "success: [title]"
    - ASCII title: already completed → expects "success: [title] (already completed)"
    - ASCII title: not found → expects "skipped: [title] — not found in '[list]'"
    - Non-ASCII title (é, ü, ñ): existing reminder → expects "success: [title]"
    - Wrong list name → expects "error: List '[name]' not found in Reminders"

[ ] The protocol covers at least these test cases for push_reminder.applescript:
    - New reminder → expects push_result: { status: success }
    - Duplicate title → expects push_result: { status: skipped, reason: "Already exists" }
    - Non-existent list (auto-create) → list is created and reminder pushed

[ ] Each test case specifies the exact osascript invocation and expected stdout.

[ ] The protocol is referenced from STRUCTURE.md in the scripts/ section.
```

**Files affected**: `integrations/docs/applescript-test-protocol.md` (new),
`STRUCTURE.md` (cross-reference)

---

### Q2 — Prompt consistency contract test

**Severity**: Medium

**Problem**: The plugin's correctness depends on consistent use of section names, field
names, and status values across all command, skill, and agent files. These are the
vocabulary that Claude uses to read and write `TASKS.md`. If any file uses a different
section name (e.g., `## Unprocessed` instead of `## Inbox`, or `## Q1` instead of
`## Active`), Claude will produce a malformed task file that breaks all downstream
commands.

Three review rounds found inconsistencies of exactly this type (I5: task-prioritizer
writing to `## Q1`; I2: section names in memory blocks). The existing
`tests/agent-contracts.test.ts` checks plugin structure but does not validate the
vocabulary contract. There is no automated guard preventing a future prompt edit from
re-introducing a removed section name.

**Acceptance criteria**:

```
[ ] A new test file tests/prompt-contracts.test.ts is created (or the assertions
    are added to agent-contracts.test.ts) that:

    (a) Reads all files matching commands/*.md, agents/*.md, skills/**/*.md using fs
    (b) For each file, asserts that none of the PROHIBITED section names appear
        as Markdown headers (## header):
        - ## Q1
        - ## Q2
        - ## Q3
        - ## Q4  (bare — ## Q4 — Defer / Eliminate is allowed)
        - ## Unprocessed
        - ## Backlog
    (c) For each command file that contains a memory-write block, asserts that
        the guard line "Do NOT write to memory/stakeholders-log.md if
        productivity:memory-management succeeded." is present.

[ ] The test runs as part of npm test (added to the Jest config or picked up
    by the existing glob pattern).

[ ] All 9 currently existing command/agent/skill files pass on first run
    (no pre-existing violations).

[ ] The test description names the specific file and header when a violation
    is found, so the failure message is immediately actionable.
```

**Files affected**: `tests/prompt-contracts.test.ts` (new),
`scripts/jest.config.js` or `scripts/package.json` (if test glob needs updating)

---

## Decisions Log

| # | Decision | Rationale |
|---|----------|-----------
| 1 | Security audit before test coverage work | Shell injection is the only finding with direct user-safety implications; it should be verified first |
| 2 | Manual test protocol over automated AppleScript tests | AppleScript requires Mac Reminders app; automation would require a CI Mac runner with Reminders configured — cost not justified at current scale |
| 3 | Prompt contract tests in TypeScript (Jest) | Same test runner as existing suite; no new tooling required; fs reads are synchronous and fast |
| 4 | Prohibited-header list over allowed-header list | A denylist is more stable — the set of wrong headers is small and known; the set of valid headers may grow with new features |

---

## Files Changed Summary

| File | Finding addressed |
|------|-------------------|
| `scripts/complete_reminder.applescript` (audit only — no change expected) | S1 |
| `scripts/push_reminder.applescript` (audit only — no change expected) | S1 |
| `integrations/docs/security-audit-applescript.md` | S1 |
| `integrations/docs/applescript-test-protocol.md` | Q1 |
| `STRUCTURE.md` | Q1 |
| `tests/prompt-contracts.test.ts` | Q2 |
