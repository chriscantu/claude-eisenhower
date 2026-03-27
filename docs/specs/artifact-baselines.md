# Artifact Construct Baselines

Recorded: 2026-03-03
Purpose: Floor values — not rolling baselines — for skill-enhancer Phase 6 regression check.
These counts reflect the plugin state at first recording. The regression check flags any
construct count that drops below these values, indicating an accidental removal.

Update these rows when a structural expansion is intentional: a new phase added to a command,
a new guardrail section created, or a new example block deliberately introduced. Do not update
after routine wording changes. When in doubt, leave the floor as-is.

## commands/intake.md
- steps: 9
- examples: 2
- guardrails: 1
- edge cases: 4

## commands/prioritize.md
- steps: 6
- examples: 1
- guardrails: 3
- edge cases: 4

## commands/schedule.md
- steps: 9
- examples: 4
- guardrails: 4
- edge cases: 5

## commands/execute.md
- steps: 5
- examples: 1
- guardrails: 2
- edge cases: 4

## commands/delegate.md
- steps: 9
- examples: 3
- guardrails: 2
- edge cases: 4

## commands/scan-email.md
- steps: 9
- examples: 6
- guardrails: 5
- edge cases: 5

## commands/setup.md
- steps: 6
- examples: 4
- guardrails: 1
- edge cases: 2

## skills/core/SKILL.md
- phases: 4
- steps: 22
- guardrails: 1
- examples: 1

## skills/core/references/eisenhower.md
- rules: 8
- tables: 0
- examples: 1

## skills/core/references/intake-sources.md
- rules: 12
- tables: 1
- examples: 0

## skills/core/references/delegation-guide.md
- rules: 12
- tables: 1
- examples: 0

## skills/core/references/email-patterns.md
- rules: 17
- tables: 1
- examples: 0
