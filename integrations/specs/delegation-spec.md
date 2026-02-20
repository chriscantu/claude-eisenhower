# Stakeholder Graph & Delegation Validation — Feature Spec

**Plugin**: claude-eisenhower
**Version**: 0.4.0 (planned)
**Status**: Draft
**Last updated**: 2026-02-20

---

## Problem Statement

The Eisenhower workflow correctly classifies Q3 tasks as "Delegate," but the delegation action has no foundation to stand on. There is no stakeholder graph, so the system cannot suggest who to delegate to, and there is no validation step to confirm the right person was chosen. Q3 tasks either stall or require the user to mentally resolve the delegation problem themselves — defeating the purpose of the quadrant.

---

## Goals

- Build a local stakeholder graph (YAML) that encodes each delegate's domain, relationship type, and capacity signal
- Wire `/prioritize` to read the graph at Q3 classification and suggest the best match with reasoning
- Wire `/schedule` to confirm the delegate and create a follow-up tracking entry
- Protect all PII from source control: stakeholder data is gitignored, only a `.example` template is committed
- Provide a regression test suite that validates the full delegation chain

---

## Out of Scope (v1)

- Automatic capacity checking (no live Jira/Asana bandwidth reads)
- Auto-sending delegation messages to Slack or email
- Building the stakeholder graph from task history (v2)
- Multi-delegate splitting of a single task

---

## New File: `integrations/config/stakeholders.yaml`

User-maintained file, **gitignored**. Only `stakeholders.yaml.example` is committed.

### Schema

```yaml
stakeholders:
  - name: string                  # Full name — stored locally only, never committed
    alias: string                 # Short label used in TASKS.md (e.g., "Sarah E.")
    role: string                  # Job title or description
    relationship: direct_report | peer | vendor | partner
    domains:                      # List of work areas this person can own
      - string
    capacity_signal: high | medium | low   # Your subjective read, updated manually
    contact_hint: string          # Optional: how to reach them (gitignored)
    notes: string                 # Optional: context, preferences, caveats
```

---

## User Stories (Gherkin)

### Feature: Stakeholder Graph Initialization

```gherkin
Feature: Stakeholder graph initialization

  Scenario: First-time setup with no stakeholder file
    Given the stakeholder graph file does not exist at integrations/config/stakeholders.yaml
    When I run /prioritize
    And a task is classified as Q3
    Then Claude should notify me: "No stakeholder graph found."
    And Claude should say: "Copy integrations/config/stakeholders.yaml.example to stakeholders.yaml and fill in your delegates to enable delegation suggestions."
    And the Q3 task should still be saved without a delegate assigned
    And the task record should include: "Delegate to: [not yet assigned — see stakeholders.yaml]"

  Scenario: Stakeholder graph exists but is empty
    Given integrations/config/stakeholders.yaml exists
    And the stakeholders list is empty
    When I run /prioritize
    And a task is classified as Q3
    Then Claude should notify me: "Stakeholder graph is empty — no delegates configured."
    And the Q3 task should be saved with: "Delegate to: [not yet assigned — see stakeholders.yaml]"
```

### Feature: Delegation Suggestion at Prioritize Time

```gherkin
Feature: Suggest delegate when task is classified Q3

  Scenario: Single best match found
    Given integrations/config/stakeholders.yaml has 5 configured delegates
    And I have an unprocessed task "Review infrastructure alerting thresholds"
    When I run /prioritize
    And the task is classified as Q3
    Then Claude should suggest the delegate whose domains include "infrastructure"
    And the suggestion should include the delegate alias, role, match reason, and capacity signal
    And Claude should ask: "Does [alias] make sense for this, or would you like to assign someone else?"

  Scenario: Multiple domain matches found
    Given two delegates both have "frontend" in their domains
    And one has relationship: direct_report and the other has relationship: peer
    And I have an unprocessed task "Fix mobile nav regression"
    When I run /prioritize
    And the task is classified as Q3
    Then Claude should surface both candidates ranked by score
    And the direct_report should rank above the peer
    And ask: "Both [alias A] and [alias B] match on frontend. Who should own this?"

  Scenario: No domain match found
    Given no delegate has a domain matching the task content
    When I run /prioritize
    And a task is classified as Q3
    Then Claude should say: "No clear domain match in your stakeholder graph."
    And Claude should ask: "Who should own this? I will record them as the delegate."
    And the user response should be stored as the delegate alias in the task record

  Scenario: Best domain match has low capacity
    Given the only domain-matching delegate has capacity_signal: low
    When I run /prioritize
    And the task is classified as Q3
    Then Claude should still suggest that delegate
    And append a capacity warning: "Note: [alias] is currently showing low capacity — confirm they can take this on."

  Scenario: Task content signals it requires the user's own authority
    Given a task description includes language like "requires your sign-off" or "executive decision"
    When I run /prioritize
    And the task would otherwise score as Q3
    Then Claude should flag: "This may require your authority — consider Q1 instead."
    And ask: "Should this stay Q3 (delegate) or be reclassified as Q1?"
```

### Feature: Delegation Confirmation at Schedule Time

```gherkin
Feature: Confirm delegate and create follow-up at schedule time

  Scenario: Delegate was suggested at prioritize and confirmed at schedule
    Given a Q3 task with "Suggested delegate: Sarah E." in the task record
    When I run /schedule
    And I process the Q3 task
    Then Claude should display: "Delegate: Sarah E. (suggested at prioritize)"
    And ask: "Confirm Sarah E. as the delegate, or assign someone else?"
    And after confirmation update the task record to: "Delegate to: Sarah E."
    And create a follow-up memory entry via productivity:memory-management
    And the memory entry should contain stakeholder alias, task title, and check-in date

  Scenario: Delegate was not assigned at prioritize
    Given a Q3 task with "Delegate to: [not yet assigned]"
    When I run /schedule
    And I process the Q3 task
    Then Claude should ask: "Who should own this? Check your stakeholder graph or name someone."
    And after the user names a delegate, update the task record
    And create the follow-up memory entry

  Scenario: User overrides the suggested delegate at schedule time
    Given a Q3 task with "Suggested delegate: Jordan M." in the task record
    When I run /schedule
    And the user says to assign it to Alex R. instead
    Then the task record should be updated to: "Delegate to: Alex R."
    And the follow-up memory entry should reference Alex R. not Jordan M.
    And the record should note: "Delegate changed from Jordan M. to Alex R. at schedule"

  Scenario: Q3 task is pushed to task output adapter with delegate alias
    Given a Q3 task delegated to "Sarah E."
    And Mac Reminders is the active task output adapter
    When /schedule pushes the task to the adapter
    Then the reminder title should be: "Check in: Sarah E. re: [task title]"
    And the reminder due date should be the confirmed check-in date
    And the reminder priority should be Medium

  Scenario: Running /schedule twice does not duplicate the follow-up entry
    Given a Q3 task already has "Delegate to: Sarah E." confirmed in TASKS.md
    And a memory entry for this delegation already exists
    When I run /schedule again for the same task
    Then no duplicate memory entry should be created
    And the schedule summary should note: "Delegation already confirmed — check-in entry exists"
```

### Feature: Delegation Follow-Up Tracking

```gherkin
Feature: Surface and close out delegated task follow-ups

  Scenario: Schedule session surfaces overdue delegations
    Given 3 Q3 tasks were delegated in the past week
    And their check-in dates are today or earlier
    When I run /schedule
    Then Claude should surface: "You have [N] delegated items due for check-in today or overdue."
    And list each with: delegate alias, task title, and original check-in date
    And ask: "Do you want to mark any of these resolved, or create a follow-up?"

  Scenario: Delegated task marked complete via /execute
    Given a Q3 task delegated to "Jordan M." with check-in date today
    When I run /execute
    And I mark the task as done
    Then the task should move to the Completed section in TASKS.md with completion date
    And the memory entry for Jordan M. should be updated: "Resolved — [date]"
    And no further check-in reminders should be created

  Scenario: Delegated task still in progress past check-in date
    Given a Q3 task delegated to "Alex R." is past its check-in date
    When I run /execute
    And I log: "still in progress"
    Then a new follow-up task should be appended to Unprocessed in TASKS.md
    And the title should be: "Follow up: [original title] with Alex R."
    And the Source should be: "Delegation follow-up"
    And the original task record should receive a progress note
    And the memory entry for Alex R. should show the updated check-in date
```

---

## Matching Algorithm

When a task is classified Q3, read `integrations/config/stakeholders.yaml` and score each delegate:

| Signal | Points |
|--------|--------|
| Domain keyword found in task title or description | +3 per match |
| `relationship: direct_report` | +2 |
| `relationship: peer` | +1 |
| `relationship: vendor` or `partner` | 0 |
| `capacity_signal: high` | +2 |
| `capacity_signal: medium` | +1 |
| `capacity_signal: low` | −1 (still surfaced with warning) |

**Tiebreak**: prefer `direct_report` over `peer` at equal score.
**If highest score is 0 or negative**: surface "no clear match" and ask the user.
**Always ask for confirmation** — never auto-assign without user approval.

---

## Files to Create

| File | Purpose |
|------|---------|
| `integrations/specs/delegation-spec.md` | This spec |
| `integrations/config/stakeholders.yaml.example` | Committed template with anonymized placeholder values |
| `integrations/config/stakeholders.yaml` | Gitignored — user fills in real delegates |
| `tests/delegation-regression.md` | Regression test suite covering the full delegation chain |

## Files to Update

| File | Change |
|------|--------|
| `.gitignore` | Add `integrations/config/stakeholders.yaml` |
| `commands/prioritize.md` | Add Steps 4b–4c: read stakeholder graph, suggest delegate for Q3 |
| `commands/schedule.md` | Add Step 3b: confirm/override delegate; add dedup guard to Step 7 |
| `README.md` | Document delegation validation under workflow and active integrations |
| `STRUCTURE.md` | Add stakeholders files to config table; bump version to v0.4.0 |
| `CONNECTORS.md` | Add stakeholder graph as a local data source |

---

## Decisions Log

| # | Question | Decision |
|---|----------|----------|
| 1 | Where does the stakeholder graph live? | `integrations/config/stakeholders.yaml` — follows existing config pattern |
| 2 | Format: YAML or Markdown? | YAML — structured, parseable, avoids markdown table fragility |
| 3 | PII protection method | Gitignore actual file; commit only `.example` with placeholder values |
| 4 | When does suggestion happen? | At Q3 classification (prioritize) and confirmed at schedule |
| 5 | Matching strategy | Weighted scoring: domain match + relationship type + capacity signal |
| 6 | What if no match? | Surface "no match" and ask user — never block, never auto-assign |
| 7 | How is delegate stored in TASKS.md? | As `alias` (short label) not full name — minimizes PII in task board |
| 8 | Follow-up tracking | Uses existing `productivity:memory-management` — no new system needed |

---

## Open Questions

1. Should the stakeholder graph support "anti-domains" (work types a delegate should never receive)?
2. Should there be a dedicated `/delegate` command as a direct entry point?
3. When a delegate's `capacity_signal` changes, should the system prompt review of all open Q3 tasks assigned to them?
