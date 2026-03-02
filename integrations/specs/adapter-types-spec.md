# Spec: Adapter Contract Interfaces
**Version**: v1.0.0 (planned)
**Status**: Draft
**Author**: Cantu
**Date**: 2026-03-02

---

## Problem Statement

The `task_output_record` and `push_result` contracts that govern all task output
adapters are documented in `integrations/adapters/README.md` as prose. No TypeScript
interfaces exist. When new adapters are built (Jira, Linear, Asana), they have no
compiler-enforced contract to implement against — a developer building a new adapter
must read documentation and hope their implementation matches what `/schedule` expects.

This spec defines the TypeScript interfaces that formalize the adapter contract. The
interfaces are the authoritative source; the adapter README is updated to reference
them.

---

## Goals

1. Formalize `task_output_record` and `push_result` as exported TypeScript interfaces
2. Give future adapter implementations a compiler-enforced contract
3. Create a single import target for any code that constructs or consumes these shapes
4. Preserve backward compatibility — the Reminders adapter must satisfy the new interfaces without changes

---

## Implementation

### File to create: `scripts/adapter-types.ts`

This file exports two interfaces and no logic. It has zero dependencies within the
codebase and can be imported by `delegate-core.ts`, future adapter scripts, and tests.

```typescript
/**
 * adapter-types.ts
 *
 * TypeScript interfaces for the task output adapter contract.
 * These are the authoritative definitions — integrations/adapters/README.md
 * references this file.
 *
 * Contract defined in: integrations/specs/adapter-types-spec.md
 */

/**
 * The input record passed from /schedule to any task output adapter.
 * Quadrant rules are applied before this record is constructed:
 * - Q4 tasks are never passed to an adapter
 * - Q3 task titles are already prefixed: "Check in: [alias] re: [original title]"
 */
export interface TaskOutputRecord {
  title: string;           // Short action-oriented label. Q3 already prefixed by /schedule.
  description: string;     // Full task description including Source and Requester if known
  due_date: string | null; // ISO date YYYY-MM-DD, or null if not set
  quadrant: "Q1" | "Q2" | "Q3";  // Q4 is never pushed
  priority: "high" | "medium";   // Q1 = high; Q2 and Q3 = medium
  source: string;          // Where the task originated (e.g., "Email (Procore)")
  requester: string | null; // Person who requested the task, if known
  list_name: string;       // Target list/project name in the external system
}

/**
 * The result returned by any task output adapter after a push attempt.
 */
export interface PushResult {
  status: "success" | "skipped" | "error";
  reason: string;  // e.g., "Created", "Already exists", "List not found"
  id: string;      // External system ID (Reminder name, Jira key, etc.) or ""
}
```

### Update: `integrations/adapters/README.md`

Add a reference to `scripts/adapter-types.ts` as the authoritative interface source.
The prose descriptions in the README remain for human readability; the TypeScript
interfaces are the enforcement mechanism.

---

## Quadrant Rules (enforced by /schedule before adapter call)

Adapters receive records that have already had quadrant rules applied. Adapters do
not need to re-apply these rules:

| Quadrant | Passed to adapter? | Title modification | due_date |
|----------|--------------------|--------------------|----------|
| Q1 | Yes | None | Today (YYYY-MM-DD) |
| Q2 | Yes | None | Confirmed focus block date |
| Q3 | Yes | Prefixed: `"Check in: [alias] re: [original title]"` | Check-in date (2–3 business days) |
| Q4 | **No** | — | — |

---

## Gherkin Scenarios

### ADAPTER-001: TaskOutputRecord contains all required fields

```gherkin
Given /schedule has confirmed a Q1, Q2, or Q3 task
When it constructs a TaskOutputRecord to pass to the adapter
Then the record contains: title, description, due_date, quadrant, priority, source, list_name
And the quadrant field is "Q1", "Q2", or "Q3" — never "Q4"
And the priority field is "high" for Q1 and "medium" for Q2 and Q3
```

### ADAPTER-002: Q4 tasks are never passed to an adapter

```gherkin
Given a Q4 task has been classified
When /schedule processes it
Then no TaskOutputRecord is constructed for it
And no adapter call is made
And the TASKS.md record does not receive a Synced field from an adapter push
```

### ADAPTER-003: Q3 task titles are prefixed before the adapter call

```gherkin
Given a Q3 task with title "Review API contract" delegated to "Jordan V."
When /schedule constructs the TaskOutputRecord
Then the title field is "Check in: Jordan V. re: Review API contract"
And the adapter receives this prefixed title, not the original
```

### ADAPTER-004: PushResult status drives the Synced field in TASKS.md

```gherkin
Given an adapter returns a PushResult
When /schedule processes the result
Then status "success" writes: Synced: {adapter} ({list}) — {date}
And status "skipped" writes: Synced: skipped (already exists)
And status "error" writes: Synced: failed — {reason}
```

### ADAPTER-005: Adapter deduplication prevents duplicate records

```gherkin
Given a reminder with the same title already exists in the target list
When the adapter receives a TaskOutputRecord with that title
Then the adapter returns PushResult with status "skipped" and reason "Already exists"
And no new reminder is created
And the id field is ""
```

### ADAPTER-006: New adapter satisfies TypeScript interfaces

```gherkin
Given a developer creates a new adapter (e.g., Jira, Linear)
When they implement the adapter's push function
Then the function must accept a TaskOutputRecord parameter
And return a PushResult
And the TypeScript compiler must accept the implementation without errors
```

---

## Decisions Log

1. **Interfaces in `scripts/adapter-types.ts`, not `delegate-core.ts`** — `delegate-core.ts`
   owns the delegation algorithm. Adapter types are a separate concern. Keeping them
   in their own file makes the import graph cleaner and the purpose of each file
   obvious.

2. **`due_date` is `string | null`, not `Date`** — Adapters receive ISO strings
   because they pass the value directly to external systems (AppleScript, API calls).
   No date parsing is needed inside the adapter — `/schedule` has already done it.

3. **`quadrant` excludes `"Q4"`** — The type system enforces the rule that Q4 tasks
   are never pushed. A `"Q1" | "Q2" | "Q3"` union makes it a compile-time error to
   construct a Q4 record.

4. **`id` is always `string`, never `null`** — An empty string `""` is used for
   skipped or failed results. This avoids null checks in every consumer. The Reminders
   adapter returns the reminder name as the id on success.
