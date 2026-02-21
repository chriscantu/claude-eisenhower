# claude-eisenhower — Product Roadmap

**Format**: Now / Next / Later
**Last updated**: 2026-02-20
**Owner**: Cantu

---

## Now — Shipped and Stable

These features are complete, tested, and committed. The plugin is in active use.

### Core Workflow (v0.1–v0.3)
The four-phase task management loop is fully operational.

- **`/intake`** — captures tasks from any source (Slack, email, meetings, self) in natural language; extracts title, source, requester, urgency automatically
- **`/prioritize`** — Eisenhower matrix classification (Q1–Q4) with reasoning shown before saving; authority flag detects tasks that require Director sign-off
- **`/schedule`** — quadrant-specific scheduling rules (Q1 = today, Q2 = focus block, Q3 = delegate + check-in, Q4 = eliminate); Step 1b surfaces overdue delegations before scheduling
- **`/execute`** — mark done, log progress, delegate, create follow-ups; delegation-aware close-out updates memory and suppresses duplicate reminders
- **`/scan-email`** — reads Apple Mail inbox, classifies actionable emails into Q1–Q3, checks calendar availability before proposing dates; read-only

### Integrations (v0.2–v0.3)
- **Mac Calendar** — real-time availability check via EventKit Swift script (no AppleScript `whose` clause — O(1) regardless of calendar size)
- **Mac Reminders** — swappable adapter pushes confirmed tasks with correct title format, priority, and due date; Q3 tasks pushed as `"Check in: [alias] re: [title]"`
- **Apple Mail** — configurable account and inbox; three scan modes (admin, escalations, all)

### Delegation Engine (v0.4.0–v0.4.3)
Full stakeholder graph with weighted scoring, tested end-to-end.

- **Stakeholder graph** (`stakeholders.yaml`) — local, gitignored, PII-safe; alias used everywhere, full name never leaves the file
- **Weighted scoring algorithm** — domain match (+3 each), relationship (direct_report +2, peer +1, vendor 0), capacity (high +2, medium +1, low −1); top candidate + runner-up within 2 points surfaced
- **Authority flag** — detects "requires your sign-off", "executive decision", "personnel decision" in task descriptions; proposes Q1 reclassification before delegating
- **Lifecycle management** — dedup guard (`Synced:` field as source of truth), delegation close-out on Mark Done, overdue check-in detection, follow-up auto-creation on "still in progress"
- **24-test Jest suite** — 24/24 passing; covers Phase 0 (graph init), Phase 1 (scoring, ranking, edge cases, PII safety), and end-to-end chain

### Engineering Foundation (v0.4.1)
- **`PRINCIPLES.md`** — DRY, SOLID, TDD, PII safety rules; read at every session
- **`delegate-core.ts`** — single source of truth for all shared types and scoring functions; CLI and tests both import from it (zero duplication)
- **Self-healing test setup** — `postinstall`/`pretest` npm hooks auto-create `tests/node_modules` symlink; `npm test` works cold after any fresh clone

---

## Next — Planned (1–3 months)

These are scoped and prioritized. The "what" is clear; sequencing is flexible.

### ~~1. PII Aliasing in `/intake` (Requester field)~~ ✅ Shipped in v0.5.0
Expanded in scope to system-wide alias resolution. `alias` is now an array — first item is display name, additional items are lookup terms (last name, nickname, shorthand). `resolveAlias()` and `getDisplayAlias()` added to `delegate-core.ts` as single source of truth. `/intake` resolves requester names against the graph before writing to TASKS.md.

### 2. `/delegate` as a Direct Entry Point — v0.5.1 *(Specced)*
**Why**: Currently delegation only runs via `/prioritize` (Q3 classification) or `/execute delegate`. There's no way to ask "who should own this?" outside the full workflow. This is open question #2 from the delegation spec.
**What**: New `/delegate [task title or description]` command that runs the scoring CLI, surfaces candidates with reasoning, and writes a confirmed Q3 entry to TASKS.md. Includes Reminders push and memory log inline — no `/schedule` run needed for a directly delegated task.
**Scope**: New `commands/delegate.md` + `tests/delegate-entry.test.ts`. Calls existing `scripts/match-delegate.ts` — no algorithm changes.
**Spec**: `integrations/specs/delegate-entry-point-spec.md`
**Version target**: v0.5.1

### ~~3. Capacity Signal Review Prompt~~ ✅ Shipped in v0.5.2
During `/schedule` Step 1b (Part B), after the overdue check-in scan: if any delegate has 2+ open Q3 tasks with at least one older than 5 business days, surface an advisory prompt before scheduling. No auto-update; user decides whether to adjust `capacity_signal` in `stakeholders.yaml`. Pure detection logic covered by `tests/schedule-capacity.test.ts` (15 tests, TEST-CAP-6xx).

### 4. Regression Test Coverage for Phase 2–3 (`/schedule` + `/execute`)
**Why**: Levels 1–3 validated the delegation chain behaviorally, but Phase 2–3 tests (TEST-DEL-020–032) are documented as manual/behavioral only. No automated Jest coverage for the command layer.
**What**: Extend `tests/delegation.test.ts` (or a new `tests/schedule.test.ts`) to cover: dedup guard logic, follow-up title format, overdue detection date arithmetic. These are pure functions that can be extracted and tested without the LLM layer.
**Scope**: New test file + possible small extraction from command logic into a testable helper.

---

## Later — Strategic Direction (3–6+ months)

These are intentional bets. Timing and scope are flexible; direction is set.

### Task Output Adapter Expansion
The Reminders adapter works but Reminders is a personal tool. For teams, `/schedule` should push to Jira, Asana, or Linear. The adapter interface is already defined in `integrations/adapters/README.md` — it's a matter of building the adapter files and connectors.
**Priority order**: Jira (most common in engineering orgs) → Linear (growing adoption) → Asana (cross-functional).

### Slack / Chat Capture
`/intake` supports Slack as a source label, but there's no direct Slack connector — you copy-paste the message. A Slack MCP connector would let `/intake` pull unread DMs and channel mentions directly, with source attribution preserved.
**Dependency**: Slack MCP connector availability in Cowork.

### Anti-Domain Support in Stakeholder Graph
Open question #1 from the delegation spec. Some delegates should never receive certain types of work (e.g., a vendor shouldn't own internal architecture decisions). Add an optional `anti_domains` field to `stakeholders.yaml` schema — domains that score a hard 0 for this person regardless of keyword match.
**Scope**: Schema addition + 2–3 new test cases in `delegation.test.ts`.

### Weekly Review Automation
The `mac-calendar-planner` plugin already surfaces calendar availability. A `weekly-review` command (or hook) could combine: overdue delegations from TASKS.md + calendar load for the coming week + unprocessed tasks + memory entries approaching check-in date. One command to start the week oriented.
**Dependency**: `mac-calendar-planner` integration pattern already established via `integrations/docs/mac-calendar-planner-override.md`.

### Source Control Integration (GitHub / GitLab)
`/scan-email` handles GitHub notification emails today, but they're lossy (no PR metadata). A direct GitHub connector would let `/intake` pull PR review requests, assigned issues, and failing CI notifications with full context — author, branch, PR title, status.
**Dependency**: GitHub MCP connector availability in Cowork.

---

## Won't Do (Explicit Cuts)

These were considered and deliberately excluded to keep the plugin focused.

| Item | Reason |
|------|--------|
| Auto-send delegation messages (Slack/email) | Delegation is a human conversation — the plugin suggests, you act |
| Live capacity checking (Jira/Asana bandwidth) | Too much integration complexity for v1; manual `capacity_signal` is sufficient |
| Multi-delegate splitting of a single task | Adds coordination overhead; better to break the task at `/intake` |
| Building stakeholder graph from task history | Interesting v2 idea; requires enough history to be useful — premature now |
| Automatic follow-up scheduling (no user prompt) | Follow-up cadence is a judgment call; always ask before creating |

---

## Open Questions

1. ~~Should `/delegate` be a command or a flag on `/prioritize`?~~ → Resolved: dedicated command (see `integrations/specs/delegate-entry-point-spec.md`, Decisions Log item #1)
2. When a delegate's `capacity_signal` changes, should the plugin prompt a review of all open Q3 tasks assigned to them?
3. Should there be a `max_delegations` field in `stakeholders.yaml` to cap how many open items one person can hold?
4. Is the `Requester:` field in TASKS.md worth aliasing, or is it acceptable to have source-verbatim names there since TASKS.md is gitignored?

---

## Version History Summary

| Version | What shipped |
|---------|-------------|
| v0.1.0 | Core workflow: intake, prioritize, schedule, execute |
| v0.2.0 | scan-email command, Apple Mail integration |
| v0.3.0 | integrations/ structure, Mac Calendar EventKit, Mac Reminders adapter, STRUCTURE.md |
| v0.4.0 | Delegation engine: stakeholder graph, scoring CLI, 24-test Jest suite |
| v0.4.1 | DRY refactor (delegate-core.ts), PRINCIPLES.md, self-healing test setup |
| v0.4.2 | Delegation lifecycle: dedup guard, Mark Done close-out, follow-up auto-creation |
| v0.4.3 | Full regression validation: TEST-DEL-100/201/202; PII fix in TASKS.md |
| v0.5.0 | Alias resolution: `alias` array schema, `resolveAlias()`, `/intake` normalization, 35-test suite |
| v0.5.1 | `/delegate` direct entry point: new command, inline Reminders push, memory log, 31-test suite |
| v0.5.2 | Capacity signal review prompt: `/schedule` Step 1b Part B, 15-test suite (TEST-CAP-6xx) |
