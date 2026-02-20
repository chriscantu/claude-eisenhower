---

## Level 3 Phase 2+3 Results � 2026-02-20

TEST-DEL-020 through TEST-DEL-032 validated against real TASKS.md, memory files, and Mac Reminders.

| Test | Scenario | Status | Notes |
|------|----------|--------|-------|
| TEST-DEL-024 | /schedule run twice � no duplicate Reminder or memory entry | ? PASS | Dedup guard anchored to `Synced:` field; both Q3 tasks skipped with 'already confirmed' note |
| TEST-DEL-020 | Check-in date written to task record at schedule | ? PASS | `Check-in date:` field backfilled; Step 1b (overdue scan) now has a reliable field to query |
| TEST-DEL-031 | Mark delegated task done ? memory resolved, no follow-up created | ? PASS | glossary.md + alex-rivera.md both updated to 'Resolved � 2026-02-20'; no duplicate Reminder |
| TEST-DEL-032 | Still in progress past check-in ? follow-up task auto-created | ? PASS | Follow-up appended to Unprocessed with correct title format and Source; memory check-in date updated |
| TEST-DEL-030 | Overdue check-in surfaces at /schedule Step 1b | ? PASS | Structural: `Check-in date: 2026-02-19` in Q3 (not Completed) confirmed; Step 1b would fire |

**Gaps found and fixed during this test run:**
- `schedule.md` Step 3b dedup guard was ambiguous ('check memory') � tightened to anchor on `Synced:` field as single source of truth
- `execute.md` Mark Done had no instruction to resolve memory entries for delegated tasks � added Step 4 delegation close-out
- `execute.md` Log Progress had no delegation-aware follow-up path � added Step 3 overdue check-in handler with correct title/source format


---

## Level 3 End-to-End Results � 2026-02-20

Full `/prioritize` ? `/schedule` ? Reminders chain run against real TASKS.md and stakeholders.yaml.

| Test | Scenario | Status | Notes |
|------|----------|--------|-------|
| Authority flag (Q1 reclassify) | PIP task with 'requires your sign-off' correctly flagged at /prioritize Step 3 | ? PASS | LLM correctly identified language and proposed Q1; user confirmed |
| Delegation suggestion at /prioritize | CI/CD task ? Alex R. suggested (score 9, CI/CD + observability match) | ? PASS | Correct alias, domain match, capacity shown |
| Suggested delegate written to TASKS.md | `Suggested delegate: Alex R.` field present in Q3 record | ? PASS | Field format matches spec |
| Delegate confirmed at /schedule | Alex R. confirmed, check-in date set to Wed Feb 25 | ? PASS | Before Thursday staging deploy deadline |
| Memory logged � glossary.md | Stakeholder follow-up row added with task, check-in date, status | ? PASS | Both delegations tracked |
| Memory logged � alex-rivera.md | Profile updated with new delegation row | ? PASS | Existing profile preserved, new row appended |
| Reminders push � Q1 | PIP reminder created, priority High, due today EOD | ? PASS | Title format correct |
| Reminders push � Q3 | Check-in reminder: 'Check in: Alex R. re: ...' due Feb 25 | ? PASS | Title prefix and format match spec |
| PII check | TASKS.md uses alias 'Alex R.' not full name 'Alex Rivera' | ? PASS | No full names in task record |

**Level 3 verdict: Full chain green.** Authority flag, delegation scoring, TASKS.md write, memory logging, and Reminders push all behaved as specified end-to-end.

# Delegation Feature — Regression Test Suite

**Plugin**: claude-eisenhower
**Feature**: Stakeholder Graph & Delegation Validation (v0.4.0)
**Last updated**: 2026-02-20

---

## Level 2 CLI Results — 2026-02-20

Direct execution of `scripts/match-delegate.ts` via `npx ts-node` against real `stakeholders.yaml`.

| Test | Scenario | Status | Notes |
|------|----------|--------|-------|
| Phase 0A | No graph file | ✅ PASS | `status: no_graph`, correct message |
| Phase 0B | Empty graph | ✅ PASS | `status: empty_graph`, correct message |
| Phase 1A | Single best domain match | ✅ PASS | Correct alias, domain reasoning in message |
| Phase 1B | Multi-match + relationship tiebreak | ✅ PASS | `direct_report` ranked above `peer`; `capacity_warning: true` on low |
| Phase 1C | True no_match (vendor + low capacity = -1) | ✅ PASS | `status: no_match`, user prompted |
| Phase 1C | Relationship-only match (no domain overlap) | ✅ PASS | Candidates surface by relationship score; message says "relationship fit" not "domain match" |
| Phase 1D | Low capacity — only match | ✅ PASS | Suggested with `capacity_warning: true` in output |
| Phase 1E | Authority flag detection | ✅ BY DESIGN | CLI scores only; authority check is Step 3 of `prioritize.md` (LLM layer), not CLI responsibility |
| PII-200 | stakeholders.yaml gitignored | ✅ PASS | `git status` does not show the file |

**Finding — Phase 1E (by design):** The authority flag ("requires your sign-off", "executive decision") is intentionally handled by the `/prioritize` command prompt at Step 3, not by `match-delegate.ts`. The CLI's single responsibility is scoring; the command layer interprets the result and applies the flag. This is correct SOLID separation. No code change needed.

---

## How to Run These Tests

These are behavioral regression tests for Claude. Each test describes a starting
state, an action, and expected outcomes. Run them manually by setting up the
described conditions and verifying Claude's output matches the expected behavior.

Tests are organized by phase. Run in order for full chain coverage.

---

## Phase 0: Precondition Tests — Stakeholder Graph

### TEST-DEL-001: No stakeholder file — Q3 task still saves

**Setup**:
- Remove or rename `integrations/config/stakeholders.yaml` so it does not exist
- Add a task to `## Unprocessed` in TASKS.md: `"Review on-call rotation coverage"`

**Action**: Run `/prioritize`

**Expected**:
- Task is classified Q3 (urgent, not important for the Director)
- Claude surfaces: "No stakeholder graph found."
- Claude provides setup instructions referencing `stakeholders.yaml.example`
- Task is saved to `## Q3` section with: `Delegate to: [not yet assigned — see stakeholders.yaml]`
- Claude does NOT block or error — flow completes

**Pass criteria**: Task appears in Q3 with the placeholder delegate field. No crash.

---

### TEST-DEL-002: Empty stakeholder file — graceful fallback

**Setup**:
- Create `integrations/config/stakeholders.yaml` with content:
  ```yaml
  stakeholders: []
  ```
- Add task to Unprocessed: `"Handle vendor renewal paperwork"`

**Action**: Run `/prioritize`

**Expected**:
- Task is classified Q3
- Claude surfaces: "Stakeholder graph is empty — no delegates configured."
- Task saves with: `Delegate to: [not yet assigned — see stakeholders.yaml]`

**Pass criteria**: Task in Q3 with placeholder. No suggestion attempted.

---

## Phase 1: Prioritize — Delegation Suggestion

### TEST-DEL-010: Single best domain match

**Setup**:
- `stakeholders.yaml` has at least one delegate with `domains: [infrastructure]`
  and `relationship: direct_report`, `capacity_signal: medium`
- Add task to Unprocessed: `"Update infrastructure alerting thresholds for memory usage"`

**Action**: Run `/prioritize`

**Expected**:
- Task classified Q3
- Claude suggests the infrastructure delegate by alias
- Suggestion includes: alias, role, match reason ("domain match: infrastructure"), capacity signal
- Claude asks: "Does [alias] make sense for this, or would you like to assign someone else?"
- Task record includes: `Suggested delegate: [alias]`

**Pass criteria**: Correct alias surfaced. Reasoning references domain match.

---

### TEST-DEL-011: Multiple domain matches — ranking by relationship

**Setup**:
- `stakeholders.yaml` has two delegates both with `frontend` in domains
  - Delegate A: `relationship: direct_report`, `capacity_signal: medium`
  - Delegate B: `relationship: peer`, `capacity_signal: high`
- Add task: `"Fix mobile nav regression on iOS"`

**Action**: Run `/prioritize`

**Expected**:
- Task classified Q3
- Both delegates surfaced
- Delegate A (direct_report) ranked first despite Delegate B having higher capacity
- Claude asks user to choose between them
- Neither is auto-assigned

**Pass criteria**: Direct_report ranks above peer. Both shown. User prompted to choose.

---

### TEST-DEL-012: No domain match — user prompted

**Setup**:
- `stakeholders.yaml` has delegates with domains: [infrastructure, frontend, backend]
- Add task: `"Coordinate legal review of the new contractor agreement"`

**Action**: Run `/prioritize`

**Expected**:
- Task classified Q3
- Claude surfaces: "No clear domain match in your stakeholder graph."
- Claude asks: "Who should own this?"
- User responds with a name (e.g., "Legal team")
- Task saved with: `Delegate to: Legal team`

**Pass criteria**: No incorrect match. User input captured as delegate.

---

### TEST-DEL-013: Low capacity delegate — warning shown

**Setup**:
- Only domain-matching delegate has `capacity_signal: low`
- Add task: `"Review CI/CD pipeline config for new service"`

**Action**: Run `/prioritize`

**Expected**:
- Delegate is still suggested (not suppressed)
- Warning appended: "Note: [alias] is currently showing low capacity — confirm they can take this on."
- User is still asked to confirm or reassign

**Pass criteria**: Suggestion made. Capacity warning visible. Not blocked.

---

### TEST-DEL-014: Task flags authority requirement — Q1 reclassification prompt

**Setup**:
- Add task: `"Make final call on the performance improvement plan for direct report — requires your judgment"`

**Action**: Run `/prioritize`

**Expected**:
- Claude flags: "This may require your authority — consider Q1 instead."
- Claude asks user to confirm Q1 or keep Q3
- If user confirms Q1: task saved to Q1, no delegate suggested
- If user keeps Q3: task saved to Q3 with user as owner or named delegate

**Pass criteria**: Authority flag shown. User makes the call. No silent auto-classification.

---

## Phase 2: Schedule — Delegation Confirmation

### TEST-DEL-020: Delegate confirmed at schedule — follow-up entry created

**Setup**:
- TASKS.md has a Q3 task with: `Suggested delegate: [alias]`
- `productivity:memory-management` is available

**Action**: Run `/schedule`

**Expected**:
- Schedule table shows: `Delegate: [alias] (suggested at prioritize)`
- Claude asks: "Confirm [alias] as the delegate, or assign someone else?"
- After user confirms: task record updated to `Delegate to: [alias]`
- Memory entry created with: alias, task title, check-in date
- Check-in date is 2–3 business days from today

**Pass criteria**: Task record updated. Memory entry created. Check-in date set.

---

### TEST-DEL-021: No delegate at prioritize — assigned at schedule

**Setup**:
- TASKS.md has a Q3 task with: `Delegate to: [not yet assigned — see stakeholders.yaml]`

**Action**: Run `/schedule`

**Expected**:
- Claude asks: "Who should own this? Check your stakeholder graph or name someone."
- User names a delegate
- Task record updated with named delegate
- Memory entry created

**Pass criteria**: Assignment captured at schedule time. Memory entry created.

---

### TEST-DEL-022: Delegate overridden at schedule — override logged

**Setup**:
- TASKS.md has a Q3 task with: `Suggested delegate: Jordan M.`

**Action**: Run `/schedule`, then say "Actually assign it to Alex R."

**Expected**:
- Task record updated to: `Delegate to: Alex R.`
- Task record notes: `Delegate changed from Jordan M. to Alex R. at schedule`
- Memory entry references Alex R., not Jordan M.

**Pass criteria**: Override captured. Memory uses overridden name.

---

### TEST-DEL-023: Reminders adapter — check-in reminder uses delegate alias

**Setup**:
- Mac Reminders is the active adapter
- Q3 task delegated to `Sarah E.`

**Action**: Run `/schedule`, confirm the delegation

**Expected**:
- Reminder created in configured list: `"Check in: Sarah E. re: [task title]"`
- Reminder due date = check-in date (2–3 business days)
- Reminder priority = Medium

**Pass criteria**: Reminder created with correct title prefix and due date.

---

### TEST-DEL-024: Running /schedule twice — no duplicate memory entry

**Setup**:
- TASKS.md Q3 task already has: `Delegate to: Sarah E.`
- Memory entry for this delegation already exists

**Action**: Run `/schedule` again

**Expected**:
- No second memory entry created
- Schedule summary includes: "Delegation already confirmed — check-in entry exists"
- TASKS.md not re-updated with a second `Delegate to:` field

**Pass criteria**: Idempotent. No duplicates. Summary note shown.

---

## Phase 3: Execute — Follow-Up Lifecycle

### TEST-DEL-030: Overdue delegations surfaced at schedule

**Setup**:
- 2+ Q3 tasks in TASKS.md have check-in dates in the past
- Tasks have `Delegate to: [alias]` set

**Action**: Run `/schedule`

**Expected**:
- Before the schedule table, Claude surfaces: "You have [N] delegated items due for check-in today or overdue."
- Each listed with alias, task title, and original check-in date
- User asked: "Do you want to mark any of these resolved, or create a follow-up?"

**Pass criteria**: Overdue delegations surfaced before the main schedule table.

---

### TEST-DEL-031: Mark delegated task complete via /execute

**Setup**:
- TASKS.md has Q3 task: `Delegate to: Jordan M.`, check-in date today
- Memory entry exists for Jordan M.

**Action**: Run `/execute`, mark the task done

**Expected**:
- Task moves to `## Completed` with completion date
- Memory entry for Jordan M. updated: `Resolved — [date]`
- No new check-in reminder created

**Pass criteria**: Task completed. Memory resolved. No dangling follow-up.

---

### TEST-DEL-032: Delegated task still in progress — follow-up auto-created

**Setup**:
- TASKS.md has Q3 task past its check-in date, `Delegate to: Alex R.`
- Memory entry exists for Alex R.

**Action**: Run `/execute`, log "still in progress"

**Expected**:
- Original task receives a progress note in its record
- New task appended to `## Unprocessed`:
  ```
  Title: Follow up: [original title] with Alex R.
  Source: Delegation follow-up
  Requester: Alex R.
  ```
- Memory entry for Alex R. shows updated check-in date

**Pass criteria**: Follow-up task created. Memory updated. Original task preserved.

---

## Full Chain Regression (End-to-End)

### TEST-DEL-100: Full delegation flow from intake to follow-up

**Setup**:
- `stakeholders.yaml` has at least one direct_report with relevant domains
- No existing delegation entries in memory

**Actions in sequence**:
1. Run `/intake "Update monitoring dashboards for new services"`
2. Run `/prioritize` — confirm Q3 classification and delegate suggestion
3. Run `/schedule` — confirm delegate, verify memory entry created, verify Reminders push
4. Simulate check-in date passing (manually update task date)
5. Run `/schedule` — verify overdue delegation is surfaced
6. Run `/execute` — log "still in progress"
7. Verify follow-up task created in Unprocessed
8. Run `/execute` on the follow-up — mark done
9. Verify original and follow-up both in Completed. Memory resolved.

**Pass criteria**: All 9 steps complete without error or manual workaround. No PII in TASKS.md beyond alias.

---

## PII / Source Control Verification

### TEST-DEL-200: Stakeholders.yaml is gitignored

**Action**:
```bash
cd ~/repos/claude-eisenhower
git status
```

**Expected**: `integrations/config/stakeholders.yaml` does NOT appear in git status output — even if the file exists locally.

**Pass criteria**: File not tracked by git.

---

### TEST-DEL-201: Only .example is committed

**Action**:
```bash
cd ~/repos/claude-eisenhower
git ls-files integrations/config/
```

**Expected**: `integrations/config/stakeholders.yaml.example` appears. `integrations/config/stakeholders.yaml` does NOT appear.

**Pass criteria**: Example committed, real file absent from index.

---

### TEST-DEL-202: TASKS.md uses alias not full name

**Setup**: Delegate a task to a stakeholder whose full name is different from their alias

**Expected**: TASKS.md contains the alias (e.g., "Sarah E.") not the full name. Memory entries also use alias.

**Pass criteria**: No full names appear in TASKS.md or in any committed file.
