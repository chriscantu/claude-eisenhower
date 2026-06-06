# Architecture Overview

**Last updated**: 2026-03-06
**Version**: v1.1.3

Three diagrams, each answering a different architectural question:

1. **System Architecture** — what components exist and how they relate
2. **Task State Machine** — how a task moves from intake to done
3. **Memory Manager** — how delegation memory is read/written transparently via the unified skill

---

## 1. System Architecture

```mermaid
flowchart TD
    %% ── Input Sources ──────────────────────────────────────────
    subgraph INP["Input Sources"]
        direction LR
        User(["👤 Director"])
        Mail(["📧 Apple Mail"])
    end

    %% ── Commands ───────────────────────────────────────────────
    subgraph CMD["Commands"]
        direction LR
        intake["/intake"]
        prioritize["/prioritize"]
        schedule["/schedule"]
        execute["/complete-task"]
        delegate["/delegate"]
        scanemail["/scan-email"]
        reviewweek["/review-week"]
        setup["/setup"]
    end

    %% ── Support Layer ──────────────────────────────────────────
    subgraph SUP["Support Layer"]
        direction LR
        eis["claude-eisenhower\nSKILL"]
        enh["skill-enhancer\nSKILL"]
        memmgr["memory-manager\nSKILL"]
        agent["task-prioritizer\nAgent"]
        sshook["SessionStart Hook"]
    end

    %% ── Scripts ────────────────────────────────────────────────
    subgraph SCR["Scripts"]
        direction LR
        delcore["delegate-core.ts\ndate-helpers.ts\nadapter-types.ts"]
        calq["cal_query.swift\n(EventKit)"]
        remscripts["push_reminder.applescript\ncomplete_reminder.applescript"]
    end

    %% ── Configuration ──────────────────────────────────────────
    subgraph CFG["Configuration  (gitignored)"]
        direction LR
        calcfg["calendar-config.md"]
        emailcfg["email-config.md"]
        taskcfg["task-output-config.md"]
        stk["stakeholders.yaml"]
    end

    %% ── Data Stores ─────────────────────────────────────────────
    subgraph DAT["Data Stores  (gitignored)"]
        direction LR
        tasks[("TASKS.md")]
        mem[("memory/\nglossary.md · people/\nreview-log.md")]
    end

    %% ── External Systems ────────────────────────────────────────
    subgraph EXT["External Systems"]
        direction LR
        maccal[("🗓 Mac Calendar")]
        macrem[("✅ Mac Reminders")]
        pmm(["productivity:\nmemory-management"])
    end

    %% ── Infrastructure ──────────────────────────────────────────
    subgraph INF["Infrastructure"]
        direction LR
        jest["Jest  196 tests"]
        gh["GitHub Actions\nCI · Release"]
    end

    %% ── Connections ─────────────────────────────────────────────

    %% Inputs → Commands
    User -->|"runs"| CMD
    Mail --> scanemail

    %% Commands → core data
    CMD -->|"reads · writes"| tasks
    sshook -->|"reads"| tasks

    %% Calendar integration
    schedule --> calcfg
    scanemail --> calcfg
    reviewweek --> calcfg
    calcfg --> calq --> maccal

    %% Email config
    scanemail --> emailcfg

    %% plugin_root path
    schedule & execute & delegate & reviewweek --> taskcfg

    %% Delegation scoring
    schedule & delegate --> stk --> delcore

    %% Reminders
    schedule --> remscripts --> macrem
    execute --> remscripts

    %% Memory operations — all routed through memory-manager (v1.0.1)
    schedule & execute & delegate & reviewweek -->|"memory ops"| memmgr
    memmgr -->|"primary"| pmm
    memmgr -.->|"fallback"| mem
    reviewweek -->|"analytics"| mem

    %% Infrastructure
    jest -->|"tests"| delcore
    gh -->|"runs"| jest
    gh -->|"packages"| gh
```

---

## 2. Task State Machine

Four states drive every task record in TASKS.md. The Eisenhower quadrant (Q1–Q4) is
preserved as `Priority:` metadata but is no longer the state driver.

```mermaid
stateDiagram-v2
    [*] --> Inbox : /intake · /scan-email

    Inbox --> Active : /prioritize\n(Q1 · Q2 work)

    Inbox --> Delegated : /prioritize\n(Q3 — delegate)

    Inbox --> Done : /prioritize\n(Q4 — eliminate)

    Active --> Delegated : /complete-task\n(reassign mid-flight)

    Active --> Done : /complete-task\n(mark complete)

    Delegated --> Done : /complete-task\n(close out · resolve check-in)

    Delegated --> Delegated : /schedule · /review-week\n(overdue check-in surfaced)

    note right of Delegated
        Check-by date required.
        No check-by = blocked from
        entering Delegated state.
    end note

    note right of Done
        Terminal. Reminders adapter
        synced on /complete-task completion.
    end note
```

---

## 3. Memory Manager

Introduced in v1.0.1; consolidated to a single backend in v1.9.0. All delegation
memory operations (read, write, update) flow through the `memory-manager` skill
(`skills/memory-manager/SKILL.md`), which writes to local markdown files only.

See `single-backend-memory.md` for the current architectural decision. The prior
`memory-system-adr.md` and `memory-access-layer.md` are superseded — they
described a dual-backend pattern (external `productivity:memory-management`
skill primary, local files fallback) that silently disabled the scoring
algorithm's `PENDING_PENALTY` whenever the abstraction "worked."

```mermaid
flowchart TD
    subgraph WRITE["Memory Write  (schedule · execute · delegate)"]
        direction LR
        wcmd["Command needs\nto log delegation"]
        wglossary["Append row to\nmemory/glossary.md"]
        wpeople["Append row to\nmemory/people/{alias}.md"]
        wfail["Surface warning —\ntrack manually"]

        wcmd --> wglossary
        wglossary --> wpeople
        wpeople -->|"write fails"| wfail
    end

    subgraph READ["Memory Read  (review-week · match-delegate)"]
        direction LR
        rcmd["Command needs\npending check-ins\nor pending counts"]
        rparse["Parse\nmemory/glossary.md"]
        rmerge["Deduplicate against\nTASKS.md Delegated records"]
        rout["Return entry list\nor {alias: count} map"]

        rcmd --> rparse
        rparse --> rmerge
        rmerge --> rout
    end

    subgraph ANALYTICS["Analytics Write  (review-week only)"]
        alog["Append to\nmemory/review-log.md\none line per run · no PII"]
    end

    WRITE ~~~ READ
    READ ~~~ ANALYTICS
```

---

## Component Inventory

| Layer | Components |
|-------|-----------|
| Commands | `/intake` `/prioritize` `/schedule` `/complete-task` `/delegate` `/scan-email` `/review-week` `/setup` |
| Skills | `claude-eisenhower` (end-user routing) · `skill-enhancer` (developer self-improvement) |
| Agents | `task-prioritizer` (autonomous Inbox triage) |
| Hooks | `SessionStart` (task board briefing) |
| TypeScript | `delegate-core.ts` · `match-delegate.ts` · `date-helpers.ts` · `adapter-types.ts` |
| AppleScript | `push_reminder.applescript` · `complete_reminder.applescript` |
| Swift | `cal_query.swift` (EventKit — O(1) calendar query) |
| Config | `calendar-config.md` · `email-config.md` · `task-output-config.md` · `stakeholders.yaml` |
| Data (runtime) | `TASKS.md` · `memory/` (stakeholders-log, review-log, people/, glossary) |
| External | Mac Calendar · Mac Reminders |
| Adapters | `reminders.md` (active) · `jira.md` · `linear.md` · `asana.md` (planned) |
| Infrastructure | Jest (196 tests) · GitHub Actions (CI + tag-based release) |

---

## Key Design Decisions

| Decision | Rationale | Reference |
|----------|-----------|-----------|
| EventKit Swift script instead of AppleScript `whose` | AppleScript `whose` is O(n) and times out on large calendars | `calendar-performance-fix.md` |
| Four-state model (Inbox/Active/Delegated/Done) | Separates action state from Eisenhower priority classification | `four-state-task-model-spec.md` |
| Single-backend memory (markdown only) | Restores `PENDING_PENALTY` end-to-end; eliminates the dual-backend illusion where the scoring axis silently no-op'd whenever the abstraction "worked" | `single-backend-memory.md` |
| `delegate-core.ts` as shared module | DRY: scoring logic, types, and constants imported by CLI and tests; never duplicated | `docs/PRINCIPLES.md` |
| No Blocked state | Anti-pattern — creates a holding area with no forcing function; every stuck task needs an action | `four-state-task-model-spec.md` |
