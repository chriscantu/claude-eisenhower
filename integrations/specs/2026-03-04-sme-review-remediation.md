# Spec: SME Review Remediation
**Version target**: v1.0.0
**Status**: Draft
**Author**: Cantu
**Date**: 2026-03-04
**Source**: AI SME technical review — 2026-03-04
**Scope**: 9 findings across 3 domains (4 runtime bugs, 3 behavioral consistency gaps, 2 structural items)

---

## Overview

This spec captures all critical and important findings from the AI SME codebase review
conducted at v0.9.6. Findings are grouped into three implementation domains so related
work can be batched together. Each finding includes a problem statement, acceptance
criteria, and the files that must change.

---

## Domain 1 — Runtime Bugs

These findings cause silent failures or wrong output at runtime. They are the highest
implementation priority.

---

### C1 — Email message index drift in `/scan-email`

**Severity**: High

**Problem**: `/scan-email` Step 3 fetches email subjects and senders using positional
indices (message 1–10, 11–20, etc.) in one AppleScript batch. Step 5 then fetches
the body of matched emails using those same saved indices in a separate call. If any
message arrives, is deleted, or moves between those two calls, the indices shift and
Step 5 reads the body of the wrong message — silently, with no error or warning.

A secondary defect: the documented batch sequence skips messages 31–40 entirely
(batches listed as 1–10, 11–20, 21–30, 41–50).

**Acceptance criteria**:

```gherkin
Scenario C1-001: Body fetch uses a stable message identifier
  Given a batch of email subjects has been fetched using positional indices
  When a new email arrives before the body fetch step
  Then the body fetch retrieves the correct originally-matched email
  And does not read the body of a different message

Scenario C1-002: No emails are skipped in the batch scan
  Given an inbox with 50 unread messages
  When /scan-email scans all batches
  Then messages 1 through 50 are all evaluated
  And no batch range is skipped
```

**Files affected**: `commands/scan-email.md`

---

### C2 — Unguarded YAML parse in `match-delegate.ts`

**Severity**: High

**Problem**: `yaml.load(raw)` in `loadStakeholders()` throws an unhandled exception
when `stakeholders.yaml` contains invalid YAML syntax. The exception propagates as a
raw stack trace to stdout. Claude receives unparseable output instead of a structured
JSON response, the `/delegate` flow has no `status` field to branch on, and the
delegation command fails with no actionable user-facing message.

**Acceptance criteria**:

```gherkin
Scenario C2-001: Malformed stakeholders.yaml returns a clean JSON error
  Given stakeholders.yaml exists but contains invalid YAML syntax
  When match-delegate.ts is run
  Then stdout contains: { "status": "no_graph", "candidates": [], "message": "<reason>" }
  And no stack trace is written to stdout
  And the process exits with a non-zero code

Scenario C2-002: Valid stakeholders.yaml is unaffected
  Given stakeholders.yaml is well-formed
  When match-delegate.ts is run
  Then the output is unchanged from current behavior
```

**Files affected**: `scripts/match-delegate.ts`

---

### I3 — Silent error swallowing in `/scan-email` body fetch

**Severity**: Medium

**Problem**: The body-fetch AppleScript block in Step 5 uses a bare `try`/`end try`
with no error capture. Any failure — encrypted message, MIME encoding error, app
timeout — produces an empty `preview` string. Claude then attempts to classify
the task from subject alone, potentially assigning the wrong quadrant with no
indication that the body was unavailable.

**Acceptance criteria**:

```gherkin
Scenario I3-001: Body fetch failure is surfaced in the confirmation table
  Given a matched email whose body cannot be retrieved
  When the body-fetch AppleScript runs
  Then it returns an explicit marker that the body was unavailable
  And Claude notes "body unavailable — classified on subject only"
    in the confirmation table for that email
  And the task is still logged to TASKS.md (non-blocking)

Scenario I3-002: Successful body fetch is unaffected
  Given a matched email whose body is readable
  When the body-fetch AppleScript runs
  Then the preview is returned as before
  And no warning is shown in the confirmation table
```

**Files affected**: `commands/scan-email.md`

---

### I4 — ASCII-only `lower()` in `complete_reminder.applescript`

**Severity**: Medium

**Problem**: The `lower()` helper function converts only A–Z characters. Stakeholder
aliases or task titles containing non-ASCII characters (é, ü, ñ, etc.) do not
lowercase correctly. The case-insensitive title match in Step 2 fails silently,
returning a `skipped:` result even when the reminder exists. Risk is low today
because the plugin generates these titles itself, but any stakeholder alias with
an accented character will cause a permanent match failure.

**Acceptance criteria**:

```gherkin
Scenario I4-001: Reminder lookup succeeds for titles with non-ASCII characters
  Given a reminder named "Check in: André re: API review" exists in the list
  When complete_reminder.applescript is called with that title
  Then the reminder is found and marked complete
  And the result is "success: Check in: André re: API review"

Scenario I4-002: ASCII titles are unaffected
  Given a reminder named "Check in: Alex E. re: Deploy pipeline" exists in the list
  When complete_reminder.applescript is called with that title
  Then the reminder is found and marked complete (existing behavior preserved)
```

**Implementation note**: Replace the hand-rolled `lower()` with AppleScript's
built-in `do shell script "echo " & quoted form of str & " | tr '[:upper:]' '[:lower:]'"`,
which handles the full POSIX locale character set.

**Files affected**: `scripts/complete_reminder.applescript`

---

## Domain 2 — Behavioral Consistency

These findings create gaps between what different plugin artifacts tell Claude to do.
Behavior varies depending on which file Claude loads in a session.

---

### C3 — Q4 staging behavior inconsistency

**Severity**: Medium

**Problem**: `skills/claude-eisenhower/SKILL.md` Phase 3 describes Q4 elimination as
a single step: move the task directly to `## Done`. `commands/schedule.md` Step 3
implements a deliberate two-step staging flow: park in `## Q4 — Defer / Eliminate`
for two weeks, then move to `## Done` at weekly review. These are materially different
behaviors. Users who invoke via the skill see immediate elimination; users who invoke
via `/schedule` see staged deferral. The command behavior is correct and intentional
(per the four-state model spec). The skill description must match it.

**Acceptance criteria**:

```gherkin
Scenario C3-001: Q4 behavior is consistent across skill and /schedule command
  Given a task is classified Q4
  When /schedule or the claude-eisenhower skill handles it
  Then the task is moved to ## Q4 — Defer / Eliminate
  And a Deferred: date and Review on: date are added
  And the task is NOT moved directly to ## Done in the same step
  And the SKILL.md Phase 3 description matches this two-step behavior

Scenario C3-002: Explicit user elimination still works
  Given a task is in ## Q4 — Defer / Eliminate
  When the user explicitly confirms "eliminate it now"
  Then the task is moved to ## Done with Note: "Eliminated — Q4 cut {date}"
  And this behavior is consistent whether invoked via skill or command
```

**Files affected**: `skills/claude-eisenhower/SKILL.md`

---

### C4 — Authority flag patterns duplicated across code and command prompts

**Severity**: Medium

**Problem**: `delegate-core.ts` exports `AUTHORITY_PATTERNS` as the canonical source
of truth used by the CLI and the test suite. `commands/delegate.md` Step 2 and
`commands/prioritize.md` Step 3 each repeat the same four patterns inline as
natural-language prose. Since command files cannot import from TypeScript, this
duplication is architecturally unavoidable — but the two copies can silently diverge
when `AUTHORITY_PATTERNS` is updated in code without a corresponding update to the
command prompts.

**Acceptance criteria**:

```
[ ] commands/delegate.md Step 2 includes a cross-reference comment immediately
    after the pattern list:
    "Canonical source: AUTHORITY_PATTERNS in scripts/delegate-core.ts.
     Update both locations if patterns change."

[ ] commands/prioritize.md Step 3 includes the same cross-reference comment.

[ ] The four inline patterns in both command files exactly match the current
    AUTHORITY_PATTERNS export in delegate-core.ts at time of commit.

[ ] A test in tests/agent-contracts.test.ts (or delegation.test.ts) verifies
    the count and values of AUTHORITY_PATTERNS so future changes require a
    deliberate test update.
```

**Files affected**: `commands/delegate.md`, `commands/prioritize.md`,
`scripts/delegate-core.ts` (comment only), `tests/` (new assertion)

---

### I5 — `task-prioritizer` agent writes to Q1/Q2/Q3/Q4 section headers

**Severity**: Medium

**Problem**: `agents/task-prioritizer.md` Step 5 instructs Claude to move tasks to
their "confirmed quadrant section" — which in context means `## Q1`, `## Q2`, etc.
These sections were removed in v0.9.0 when the four-state model replaced quadrant
labels as status drivers. The agent would create nonexistent sections in any current
TASKS.md, breaking the section structure that all other commands depend on.

**Acceptance criteria**:

```gherkin
Scenario I5-001: task-prioritizer writes to four-state sections
  Given a TASKS.md with ## Inbox, ## Active, ## Delegated, ## Done sections
  When task-prioritizer classifies and saves tasks after user confirmation
  Then Q1 and Q2 tasks are moved to ## Active with Owner: me
  And Q3 tasks are moved to ## Delegated with a Check-by date
  And Q4 tasks are moved to ## Q4 — Defer / Eliminate with a Review on: date
  And no ## Q1 / ## Q2 / ## Q3 / ## Q4 section headers are written or created

Scenario I5-002: task-prioritizer output table still shows quadrant labels
  Given a batch of inbox tasks
  When task-prioritizer presents its analysis table
  Then the table columns still show Q1/Q2/Q3/Q4 as the Quadrant value
  And the quadrant label is used for reasoning only, not as a section header
```

**Files affected**: `agents/task-prioritizer.md`

---

## Domain 3 — Structural / DevOps

These findings have no immediate runtime impact but create repo hygiene debt and
architectural inconsistency that compounds over time.

---

### I1 — Build artifacts committed to source control

**Severity**: Low

**Problem**: `dist/` (compiled TypeScript output) and historical `.plugin` archive
files are present in source control. Compiled artifacts drift from source between
rebuilds, cause unnecessary merge conflicts, and inflate the repository. The GitHub
Actions release workflow already runs `npm run build` before packaging — `dist/`
provides no value at commit time. The `.gitignore` does not currently exclude `*.plugin`
files, which the build spec says should be gitignored.

**Acceptance criteria**:

```
[ ] dist/ is added to .gitignore
[ ] *.plugin is added to .gitignore
[ ] dist/ is removed from git tracking via git rm --cached -r dist/
[ ] All *.plugin files at the repo root are removed from git tracking
[ ] CI test workflow passes after removal (no dependency on committed dist/)
[ ] CI release workflow passes after removal (builds dist/ fresh before packaging)
[ ] STRUCTURE.md note for dist/ is updated to reflect gitignored status
```

**Files affected**: `.gitignore`, `dist/` (removed from tracking),
`*.plugin` files (removed from tracking), `STRUCTURE.md`

---

### I2 — Dual memory system with no reconciliation path

**Severity**: Medium

**Decision**: Option B — `productivity:memory-management` is the single write target.
Local `memory/stakeholders-log.md` is the fallback used only when the skill is
unavailable. Commands must check for skill availability first and write to exactly
one system per session — never both.

**Problem**: `commands/schedule.md`, `commands/execute.md`, `commands/delegate.md`,
and `skills/claude-eisenhower/SKILL.md` all write to both `productivity:memory-management`
and local `memory/` in sequence. When both succeed, the same delegation is logged
twice. When one fails and the other succeeds, state is split across two systems with
no reconciliation path. The fallback copy in the commands (four separate identical
blocks) also violates DRY — a change to the fallback format requires updates in four
places.

**Acceptance criteria**:

```
[ ] All four artifacts (schedule.md, execute.md, delegate.md, SKILL.md) follow
    this exact pattern:
      1. Attempt to log via productivity:memory-management
      2. If skill is available and succeeds: done — do NOT also write to memory/
      3. If skill is unavailable: fall through to memory/stakeholders-log.md
      4. If both fail: surface a non-blocking warning and instruct manual tracking

[ ] No artifact writes to both systems in the same session under any condition.

[ ] The fallback block text is identical across all four artifacts (DRY — copy
    from a single canonical reference in this spec or in SKILL.md).

[ ] An ADR entry is added to integrations/docs/ recording the Option B decision
    and its rationale (single source of truth, fallback for skill-unavailable users).
```

**Files affected**: `commands/schedule.md`, `commands/execute.md`,
`commands/delegate.md`, `skills/claude-eisenhower/SKILL.md`,
`integrations/docs/` (new ADR entry)

---

## Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | One consolidated spec for all 9 findings | Findings span multiple files; a single release patch is more efficient than 9 separate specs |
| 2 | Grouped by domain, not severity | Clusters related work; maps to how an engineer batches changes |
| 3 | I2 resolved as Option B | `productivity:memory-management` as primary, local fallback only when skill absent. Avoids dual-write without removing fallback support for users without the skill. |
| 4 | Q4 behavior: two-step staging is canonical | Consistent with four-state-task-model-spec.md and schedule.md. SKILL.md must align. |

---

## Files Changed Summary

| File | Findings addressed |
|------|--------------------|
| `commands/scan-email.md` | C1, I3 |
| `scripts/match-delegate.ts` | C2 |
| `scripts/complete_reminder.applescript` | I4 |
| `skills/claude-eisenhower/SKILL.md` | C3, I2 |
| `commands/delegate.md` | C4, I2 |
| `commands/prioritize.md` | C4 |
| `commands/schedule.md` | I2 |
| `commands/execute.md` | I2 |
| `agents/task-prioritizer.md` | I5 |
| `.gitignore` | I1 |
| `STRUCTURE.md` | I1 |
| `tests/` | C4 (new assertion) |
| `integrations/docs/` | I2 (new ADR) |
