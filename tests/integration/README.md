# Integration tests

Opt-in suites that exercise real external systems. Skipped by default so
`npm test` stays cross-platform and side-effect-free.

## How to run

Set `RUN_INTEGRATION=1` before invoking jest:

```fish
set -x RUN_INTEGRATION 1
cd scripts && npm test -- ../tests/integration
```

```bash
RUN_INTEGRATION=1 npm test --prefix scripts -- ../tests/integration
```

## What lives here

| Suite | Hits | Required tooling |
|-------|------|------------------|
| `push_reminder.test.ts` | macOS Reminders.app via `osascript` | macOS host, `osascript` on PATH |

## Why opt-in

These tests mutate real macOS Reminders state (create a disposable list, push
a reminder, mark it complete, delete the list). They are not safe to run
inside CI on Linux, and they leave artifacts in the local Reminders.app if a
case fails halfway through. Each suite tries to clean up after itself but
the cleanup is best-effort.

If you add a new integration suite, gate it with the same `RUN_INTEGRATION`
env-var check used by `push_reminder.test.ts` and document it in the table
above.
