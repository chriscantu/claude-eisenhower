# Slack Intake Integration — Feature Spec

**Plugin**: claude-eisenhower
**Version**: 1.0.0 (planned)
**Status**: Draft
**Last updated**: 2026-02-22
**Author**: Cantu

---

## Problem Statement

Slack is where a significant portion of real work lands — direct messages, channel mentions, escalations, and requests from stakeholders. Today, acting on these requires manual copy-paste into `/intake`. Items that arrive in Slack but don't get manually logged are dropped, deprioritized by default, or duplicated across tools. For a platform team leader interfacing with 60+ teams, the volume of Slack signals is high enough that a manual intake path is not sustainable — the cost is missed tasks, slow responses, and stakeholder trust erosion.

---

## Goals

1. **Surface actionable Slack signals without manual copy-paste** — A single `/scan-slack` command replaces the copy-paste intake path for DMs and channel mentions.
2. **Preserve read-only integrity** — The integration never posts, reacts, marks as read, or modifies Slack state in any way.
3. **Produce intake records identical to manual `/intake` output** — Tasks logged from Slack are structurally indistinguishable from hand-typed tasks; the same prioritization and scheduling flow applies.
4. **Respect the optional nature of the integration** — Users who do not have Slack or do not connect it experience zero degradation. All other commands continue to function normally.
5. **Deduplicate across scan runs** — Running `/scan-slack` twice in the same day does not produce duplicate TASKS.md entries.

---

## Non-Goals

1. **No posting, reacting, or replying** — The integration is strictly read-only. Suggesting replies or drafting responses is out of scope for v1. This preserves stakeholder trust and prevents unintended Slack actions.
2. **No group/channel mention scanning (`@here`, `@channel`)** — Broadcast mentions are low signal-to-noise and rarely require personal action. Out of scope for v1 based on user input; may be a v2 addition.
3. **No reaction-flagged message scanning** — Emoji-based flagging patterns are team-specific and would require per-team configuration. Deferred to a future version.
4. **No auto-scheduling** — `/scan-slack` captures and writes intake records only. Prioritization and scheduling remain separate commands, consistent with the email integration pattern.
5. **No historical backfill** — The scan covers a configurable recent window (default: last 48 hours). Scanning full message history is out of scope; it introduces PII surface area and performance concerns.

---

## User Stories

**As a platform team leader**, I want to scan my Slack DMs and mentions in one command so that I can log actionable requests to my task board without manually copying each message.

**As a platform team leader**, I want to see a confirmation table of matched messages before anything is written to TASKS.md so that I can catch mis-classifications and exclude noise before it becomes a task.

**As a platform team leader**, I want `/scan-slack` to skip messages I've already logged so that I don't end up with duplicate tasks from the same Slack thread.

**As a plugin user who doesn't use Slack**, I want all existing commands to continue working unchanged when Slack is not configured so that the integration doesn't break my current workflow.

**As a setup user**, I want `/setup` to offer a Slack configuration step so that I can connect Slack once and not re-enter credentials each time I run `/scan-slack`.

---

## Requirements

### P0 — Must Have (v1 cannot ship without these)

**1. Slack MCP connector integration**
The command uses the Slack MCP connector (available via the Cowork plugin registry) to read messages. All Slack API calls route through this connector — no direct HTTP calls, no token storage in config files, no hardcoded credentials. The connector handles authentication and scoping.

*Acceptance criteria*:
- [ ] `/scan-slack` errors gracefully with a clear setup prompt if the Slack MCP connector is not installed or not authenticated
- [ ] No Slack tokens, bot tokens, or OAuth credentials are written to any config file or TASKS.md

**2. Scan scope: direct mentions and DMs only**
The scan covers two signal types:
- **Direct messages**: 1:1 messages sent to the user in the configured time window
- **Direct mentions**: Messages in any channel where the user is explicitly tagged (`@username`)

The scan does NOT cover group mentions (`@here`, `@channel`), reactions, or messages the user sent.

*Acceptance criteria*:
- [ ] DMs from the past 48 hours (configurable) are fetched and processed
- [ ] Channel messages containing `@{user}` are fetched and processed
- [ ] Messages sent by the user are excluded from results
- [ ] Group mentions (`@here`, `@channel`) are excluded from results

**3. Deduplication against TASKS.md**
Before writing any record, check TASKS.md for existing tasks with `Source: Slack` and a matching message timestamp + sender pair. Skip silently if a match is found.

*Acceptance criteria*:
- [ ] Running `/scan-slack` twice on the same day produces no duplicate entries in TASKS.md
- [ ] Deduplication key is: `sender + message timestamp` (not message text, which may be edited)

**4. Message classification — two categories**

**Category 1 — Direct Request**
A message where the sender is explicitly asking the user to do something, decide something, or respond to something.

Detection signals:
- Message contains action-oriented language: "can you", "could you", "please", "need you to", "waiting on you", "your call", "decision needed", "can we sync", "review this", "approve"
- Sender is in the stakeholder graph (any relationship type)
- Message is a DM (weight: higher baseline urgency)

Default quadrant assignment:
- DM from a known stakeholder with urgency language → **Q1**
- DM from a known stakeholder, no urgency → **Q2**
- DM from an unknown sender (not in stakeholders.yaml) → **Q2** (user reclassifies at confirmation table if needed)
- Channel mention with action language → **Q2**
- Channel mention without clear action → flag as "Review manually" (do not write to TASKS.md)

**Category 2 — FYI / Escalation Signal**
A message that doesn't ask for direct action but signals something the user should be aware of — an escalation, a problem, or a status change that may require follow-up.

Detection signals:
- Message contains: "heads up", "FYI", "thought you should know", "escalating", "not working", "blocked on", "issue with", "breaking"
- Sender title or stakeholder role is VP/Director/Senior leadership

Default quadrant assignment:
- Escalation signal from a known stakeholder → **Q2** (note: "monitor — may require action")
- FYI with no clear follow-up needed → **Q3**

*Acceptance criteria*:
- [ ] Each matched message is classified into one of the two categories
- [ ] Each category produces a correct default quadrant assignment per the rules above
- [ ] Messages that don't match either category are surfaced separately as "Review manually"

**5. Confirmation table before writing**
Before writing any tasks, present a confirmation table identical in structure to `/scan-email`:

```
| # | From        | Preview (truncated)        | Category          | Quadrant | Recommended Action   |
|---|-------------|---------------------------|-------------------|----------|----------------------|
| 1 | Jordan V.   | "Can you review the arch…" | Direct Request    | Q2       | Schedule review block|
| 2 | Alex M.     | "Heads up — deploy broke…" | FYI/Escalation    | Q2       | Monitor and follow up|
| 3 | Sam T.      | "Hi just checking in on…" | Review manually   | —        | Decide: log or skip  |
```

Ask: "Does this look right? I'll add these to your task board once you confirm — or let me know if any need reclassifying."

If no actionable messages were found: "No new actionable Slack messages found in the past 48 hours. Your task board is up to date."

*Acceptance criteria*:
- [ ] Table is shown before any write occurs
- [ ] User must explicitly confirm before TASKS.md is modified
- [ ] User can reclassify any row before confirming
- [ ] "Review manually" rows require explicit opt-in — they are not written by default

**6. TASKS.md record format**
Each confirmed Slack task uses the standard intake format with Slack-specific source attribution:

```
---
[ INTAKE — {scan date} | Slack scan ]
Title:       {extracted title}
Description: {extracted description}
Source:      Slack ({workspace_name})
Requester:   {sender alias from stakeholder graph, or verbatim display name}
Urgency:     {urgency language from message, or "Not specified"}
Due date:    {explicit date if found, or "Not specified"}
Category:    {Direct Request | FYI/Escalation}
State:       Inbox
---
```

*Acceptance criteria*:
- [ ] All fields are populated for every written record
- [ ] Requester resolves against stakeholders.yaml using the existing `resolveAlias()` function
- [ ] Source field includes the workspace name from `slack-config.md`
- [ ] State is always written as `Inbox` (consistent with four-state task model)

---

### P1 — Nice to Have (fast follow after v1)

**7. Configurable scan window**
`slack-config.md` includes a `scan_window_hours` field (default: 48). Users who run `/scan-slack` infrequently may want a wider window (e.g., 72 hours after a weekend).

**8. Channel allowlist / blocklist**
`slack-config.md` supports optional `include_channels` and `exclude_channels` lists. Useful for users who want to limit mention scanning to specific high-signal channels (e.g., only `#incidents`, `#platform-requests`) or exclude noisy ones.

**9. Requester role inference from Slack profile**
If the sender is not in `stakeholders.yaml`, attempt to read their Slack display title or role from their profile. Use this to populate the `Requester:` field with more context than display name alone.

**10. `/setup` Slack step**
Add a Step 6 to the existing `/setup` command that asks: "Do you want to connect Slack for message scanning?" and writes `integrations/config/slack-config.md` with the workspace name and authenticated connection status.

---

### P2 — Future Considerations (design-safe, not built in v1)

**11. Group mention scanning with noise filtering**
`@here` and `@channel` mentions are high volume and low precision. A future version could scan these with a stricter keyword filter and only surface messages that contain explicit action language directed at the user.

**12. Reaction-flagged message support**
Allow users to configure a "flag emoji" (e.g., 🔴, ⚡) that they or their team uses to mark messages needing action. Any message with that reaction in a channel the user is a member of would be included in the scan.

**13. Thread context inclusion**
When a DM or mention is part of a thread, include the last 3 messages of the thread as context in the extracted description field. Helps Claude generate a more accurate title and urgency signal for threaded conversations.

---

## Configuration

A new config file `integrations/config/slack-config.md` is added, following the existing pattern. It is gitignored.

**Template (`slack-config.md.example`)**:
```markdown
# Slack Integration Config

workspace_name: YOUR_WORKSPACE_NAME
scan_window_hours: 48
```

This file is written by `/setup` (Step 6, P1) or manually by the user. Its absence causes `/scan-slack` to prompt for setup rather than erroring.

---

## Success Metrics

**Leading indicators** (1–2 weeks post-launch):

- Adoption: Does the user run `/scan-slack` at least once per week?
- Capture rate: What % of Slack messages that manually get logged via `/intake` with `Source: Slack` could have been captured automatically?
- Confirmation rate: What % of the confirmation table rows does the user accept vs. skip? (High skip rate signals poor classification)

**Lagging indicators** (1–2 months post-launch):

- Reduction in manual `/intake` calls with `Source: Slack` — indicates the scan is replacing the copy-paste workflow
- No increase in duplicate TASKS.md entries — validates deduplication logic

**Failure signal**: If the user frequently edits or deletes Slack-sourced tasks after writing them, the classification rules need tuning.

---

## Open Questions

1. **What Slack MCP connector is available?** The Slack connector must be confirmed in the Cowork plugin registry before implementation begins. The command spec assumes a read-only connector that exposes DMs and mentions. *(Blocking — must resolve before Step 1 of implementation)*

2. **How should the scan window interact with timezone?** "Past 48 hours" should be computed in the user's local timezone, not UTC. Confirm how the MCP connector exposes message timestamps. *(Non-blocking — resolve during implementation)*

3. **What happens when the user has no stakeholders.yaml configured?** Requester alias resolution silently falls back to verbatim display name per existing `/intake` behavior. Confirm this is acceptable for v1 or whether we want a prompt to set up stakeholders. *(Non-blocking — aligns with existing behavior)*

4. **Should DMs from unknown senders (not in stakeholders.yaml) default to a lower quadrant?** ✅ **Resolved**: Unknown-sender DMs default to **Q2**. This prevents high-signal messages (e.g., a VP DM from someone not yet in the stakeholder graph) from being silently buried in "Review manually." The user can reclassify downward at the confirmation table if needed.

---

## Dependency

**Slack MCP connector availability in Cowork** is the sole external dependency for this feature. All other components (intake record format, alias resolution, TASKS.md writes, confirmation table pattern) are already implemented and reused directly from the existing email integration.

This spec was tracked as a "Later" item in ROADMAP.md under "Slack / Chat Capture" with this exact dependency noted. No architectural work is required — the feature plugs directly into the existing intake pipeline.

---

## Files to Create or Update

| File | Action | Purpose |
|------|--------|---------|
| `commands/scan-slack.md` | Create | New `/scan-slack` command definition |
| `integrations/config/slack-config.md.example` | Create | Config template (gitignored at runtime) |
| `integrations/config/slack-config.md` | Create at setup | Written by `/setup` Step 6 or manually |
| `integrations/specs/slack-intake-spec.md` | Create | This document |
| `CONNECTORS.md` | Update | Mark Slack as Active once shipped |
| `ROADMAP.md` | Update | Move "Slack / Chat Capture" from Later → Next |
| `commands/setup.md` | Update (P1) | Add Step 6: optional Slack config |
| `README.md` | Update | Document the new command |
