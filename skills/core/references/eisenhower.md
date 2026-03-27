# Eisenhower Matrix — Detailed Rules

## Definitions

**Urgent**: Has a real or perceived time pressure within the next 1–3 days. Someone is waiting, a deadline is imminent, or delay causes measurable harm.

**Important**: Directly advances strategic goals, team health, product quality, or your core responsibilities as a Director of Engineering. Not just someone else's priority.

## Quadrant Decision Tree

```
Is the task time-sensitive (action needed within 1-3 days)?
├─ YES → Is it important to YOUR goals or engineering outcomes?
│         ├─ YES → Q1: Do it now
│         └─ NO  → Q3: Delegate or handle asynchronously
└─ NO  → Is it important to YOUR goals or engineering outcomes?
          ├─ YES → Q2: Schedule for focused work
          └─ NO  → Q4: Defer or eliminate
```

## Edge Cases and Examples

### Q1 — Critical, Do Now
- Production outage response
- A report the CTO needs in 2 hours
- A team member in crisis needing your immediate support
- A missed deadline with real consequences if not addressed today
- Interview feedback due before a decision is made

### Q2 — Strategic, Schedule It
- Writing a technical roadmap
- 1:1 prep and career development conversations
- Architecture reviews before a new project starts
- Hiring process improvements
- Cross-functional relationship building
- Learning or skill development

### Q3 — Someone Else's Urgent
- "Can you review my PR real quick?" (when your engineer can get another reviewer)
- A meeting request you could send a delegate to
- Status update requests that a direct report can answer
- Low-stakes approvals that can wait or be delegated

### Q4 — Eliminate or Defer
- Meetings with no clear agenda or outcome
- Reports nobody reads
- Tasks that no longer connect to current goals
- "Nice to have" tasks with no real deadline or owner

## Reclassification Signals

Reassign a task's quadrant if:
- A Q2 task is now within 2 days of its deadline → promote to Q1
- A Q1 crisis has been resolved but needs a post-mortem → reclassify to Q2
- A Q3 task has been successfully delegated → move to Q3 with delegate name
- A Q4 task comes up repeatedly → question if it should be eliminated or automated

## Special Cases for Engineering Directors

**Meetings**: Default to Q3 unless it's a strategic decision meeting you must drive. Ask: could a direct report represent you?

**Escalations from engineers**: Default to Q1 (they escalated for a reason), then reclassify after initial triage.

**Vendor and partner requests**: Default to Q3 unless it's blocking engineering work.

**Recruiting and interviews**: Q2 (strategic), but hard interview deadlines become Q1.
