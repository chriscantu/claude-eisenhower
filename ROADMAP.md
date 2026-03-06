# claude-eisenhower — Product Roadmap

**Format**: Near-Term / Long-Term / Won't Do / Open Questions / TODO (Deferred)
**Last updated**: 2026-03-06
**Owner**: Cantu

For a full history of what has shipped, see [CHANGELOG.md](CHANGELOG.md).

---

## Near-Term — v1.1 Remaining

### 1. Slack Intake (`/scan-slack`)

Spec complete: `integrations/specs/slack-intake-spec.md`.

Ship immediately upon Slack MCP connector availability in Cowork. No architectural
work required — the feature plugs directly into the existing intake pipeline using
the same confirmation table pattern as `/scan-email`.

**Dependency**: Slack MCP connector availability in Cowork (blocking).

### 2. YAML Front Matter for TASKS.md

Add YAML front matter to task records. Non-breaking — Markdown remains human-readable.
Enables programmatic filtering by owner, state, and date without regex parsing.

**Timing**: After TASKS.md schema spec is stable and validated by the four-state
test suite. Schema first; structured encoding second.

---

## Long-Term — v1.2+

Strategic bets for when the plugin scales beyond its current single-user, local-first
design. Timing is flexible; direction is set.

### Structured Task Store (YAML → SQLite)

**When**: When TASKS.md filtering becomes the bottleneck — 50+ tasks, cross-owner
queries, date range searches, multi-delegate reporting.

**Design**: YAML front matter (v1.1) is the non-breaking bridge. When the pain
materializes, write a migration script that reads YAML front matter and writes SQLite
rows. TASKS.md becomes a view over the store, not the store itself.

**Triggers**: User reports pain finding tasks by owner/date/state.

### Task Output Adapter Expansion

The Reminders adapter proves the pattern. When the plugin is used in team contexts,
`/schedule` should push to Jira, Linear, or Asana.

**Priority**: Jira first (most common in engineering orgs) → Linear (growing adoption)
→ Asana (cross-functional).

**Dependency**: MCP connectors for each system. Adapter contract interfaces (v0.9.4)
must land first to give these a TypeScript interface to implement against.

### Source Control Integration (GitHub / GitLab)

`/scan-email` handles GitHub notification emails today, but they're lossy (no PR
metadata). A direct GitHub connector would let `/intake` pull PR review requests,
assigned issues, and failing CI with full context — author, branch, PR title, status.

**Dependency**: GitHub MCP connector availability in Cowork.

### Multi-Adapter Fan-Out

Allow `/schedule` to push to multiple adapters simultaneously (e.g., Reminders + Jira).

**Triggers**: User manages tasks in two systems simultaneously and is manually
reconciling between them.

### Memory System as a Queryable Layer

A `/memory` command (or agent) that surfaces: all pending delegations for a given
alias, all follow-ups due this week, overdue check-ins not yet resolved.

**Dependency**: YAML front matter in memory files (or a structured store).

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
| Blocked state | Anti-pattern — creates a holding area with no forcing function. Every stuck task needs an action decision (escalate / re-delegate / drop). |
| **R7** — Fix hardcoded `~/repos/claude-eisenhower/` paths in `integrations/docs/applescript-test-protocol.md` | Low impact: test protocol is a developer reference, not runtime code. Paths are illustrative; fixing them would require templating the doc at every install. Cost > benefit. |

---

## TODO — Deferred Low-Impact Items

Known improvements deliberately deferred. Not regressions, not blockers.
Each has an explicit reason for deferral and should be picked up before a major version bump.

| Item | Description | Why Deferred |
|------|-------------|--------------|
| **R8** — ts-jest `globals` deprecation | `scripts/package.json` uses `globals.ts-jest.tsconfig` which is deprecated in ts-jest v29. Migrate to the `transform` key format. Functional today; will become an error in a future ts-jest major version. | Not broken; migration is mechanical but noisy. Address before next ts-jest major upgrade. |
| **R9** — Stale PRINCIPLES.md reference | `PRINCIPLES.md` line 25 references `integrations/docs/memory-access-layer.md` which is superseded. Should point to `skills/memory-manager/SKILL.md`. | Low risk; the superseded doc still exists with a deprecation notice. Fix in next PRINCIPLES.md edit session. |

---

## Open Questions

1. **Memory system ownership**: Is `productivity:memory-management` the long-term
   stakeholder memory system, or should this plugin own its memory fully? Currently
   both are used. Decouple or consolidate?

2. **YAML front matter timing**: Should YAML front matter land in v1.1 alongside
   the schema spec, or after the spec has been stable for one release cycle?
   Recommendation: spec first — validate field definitions are stable before adding
   parsing complexity.

3. **Behavioral test ceiling**: Should tests cover the full command flow, or is
   pure-function coverage + Gherkin spec the right ceiling for a Claude-operated
   plugin? Recommendation: the latter — you cannot test Claude's judgment in Jest.

4. When a delegate's `capacity_signal` changes, should the plugin prompt a review
   of all open Delegated tasks assigned to them?

5. Should there be a `max_delegations` field in `stakeholders.yaml` to cap how
   many open items one person can hold?
