# First-Run Setup & Reconfiguration — Feature Spec

**Plugin**: claude-eisenhower
**Version**: 0.8.0 (planned)
**Status**: Decisions resolved — ready for implementation
**Last updated**: 2026-02-21
**Author**: Cantu

---

## Problem Statement

The plugin today requires manual config file setup: copy four `.example` files, edit each one, and get the exact values right before any command works. This is a viable setup path for a single engineer who built the plugin, but it is a blocker for sharing. Anyone who installs the plugin hits a blank config state with no guidance — commands silently fail or error on missing files.

There is also no recovery path when a user changes their calendar, switches email accounts, or joins a new company. The only option today is to manually edit the config files, which requires knowing they exist and understanding the format.

---

## Goals

1. **Zero-friction first install** — A new user installs the plugin, runs any command, and is walked through setup conversationally before the command executes. No manual file editing required.
2. **Auto-detect missing config** — Every command checks for required config files before running. If any are missing, setup runs automatically in-line.
3. **`/setup` as a standalone reconfiguration command** — Users who want to change their calendar, email account, or Reminders list can run `/setup` at any time to re-run the conversational flow.
4. **Write config files, never commit them** — Setup writes the four gitignored config files from user input. The `.example` templates remain the committed source of truth.
5. **Validate before writing** — Setup confirms values exist (calendar name matches a real calendar, mail account matches a real account in Apple Mail) before writing config.

---

## Non-Goals

1. **No GUI or web form** — Setup is fully conversational via Claude. No browser, no Electron window.
2. **No automatic migration** — If a user already has valid config files, setup does not overwrite them unless explicitly invoked via `/setup`.
3. **No stakeholders.yaml setup** — Stakeholder configuration is complex and PII-sensitive. It remains a separate manual step, documented in README.md.
4. **No network calls** — All validation is local (Apple Mail accounts, Mac Calendar names, Reminders lists).
5. **No telemetry or analytics** — No data leaves the machine during setup.

---

## User Stories (Gherkin)

### Scenario 1: First-time user runs a command before setup

```gherkin
Feature: Auto-detect missing config and run setup

  Scenario: New user runs /scan-email before setup
    Given the plugin is installed
    And integrations/config/email-config.md does not exist
    When the user runs /scan-email
    Then Claude detects the missing config
    And Claude says "Looks like this is your first time using claude-eisenhower. Let me walk you through a quick setup — it takes about 2 minutes."
    And Claude runs the conversational setup flow
    And after setup completes, Claude resumes /scan-email automatically
```

### Scenario 2: User runs /setup to reconfigure

```gherkin
Feature: /setup as a manual reconfiguration command

  Scenario: User changes their calendar and re-runs setup
    Given all config files exist and are valid
    When the user runs /setup
    Then Claude says "You're already set up. Want to reconfigure everything, or just update one setting?"
    And Claude presents the reconfiguration options
    And Claude updates only the selected config files
    And Claude confirms what changed
```

### Scenario 3: Partial config — some files present, some missing

```gherkin
Feature: Partial config detection

  Scenario: User has calendar config but not email config
    Given integrations/config/calendar-config.md exists
    And integrations/config/email-config.md does not exist
    When the user runs /scan-email
    Then Claude detects that email-config.md is missing
    And Claude runs setup for only the missing config files
    And Claude skips questions for config files that already exist
```

### Scenario 4: Validation catches a bad calendar name

```gherkin
Feature: Validate calendar name before writing config

  Scenario: User enters a calendar name that doesn't exist
    Given Claude asks "What is the name of your Mac Calendar?"
    And the user enters "Work"
    And no calendar named "Work" exists in Mac Calendar
    Then Claude lists the available calendars
    And Claude asks the user to pick from the list or confirm the name
    And Claude does not write calendar-config.md until the name is confirmed valid
```

---

## Setup Flow — Step by Step

### Detection (runs before every command)

Before executing any command that reads a config file, check whether the required config files exist:

```
Required for all commands:     (none — TASKS.md is created on first write)
Required for /scan-email:      integrations/config/email-config.md
Required for /schedule:        integrations/config/calendar-config.md
                               integrations/config/task-output-config.md
Required for /intake:          (none)
Required for /prioritize:      (none)
Required for /delegate:        integrations/config/stakeholders.yaml (handled separately)
```

If any required file is missing → pause the command, run setup for the missing files only, then resume the command.

If all required files exist → proceed normally.

---

### Step 1 — Welcome (first install only)

If **all four** config files are missing:

> "Looks like this is your first time using claude-eisenhower. I'll walk you through a quick 2-minute setup before we get started."

If **some** files are missing:

> "I need a couple more settings before I can run [command]. Let me ask you a few quick questions."

If invoked via `/setup` with all files present:

> "You're already configured. Want to update everything, or just change one setting?"
> Options: Everything / Calendar only / Email only / Reminders only / Cancel

---

### Step 2 — Calendar setup

**Ask:**
> "What's the name of your primary work calendar in Mac Calendar? (Open Mac Calendar and check the sidebar if you're not sure.)"

**Validate** — list calendars via osascript and confirm the name matches:

```applescript
tell application "Calendar"
  set calNames to {}
  repeat with cal in calendars
    set end of calNames to name of cal
  end repeat
  return calNames
end tell
```

If the name matches exactly → proceed.
If no match → show the list and ask the user to pick one or confirm spelling.

**Write** `integrations/config/calendar-config.md` from `calendar-config.md.example`, replacing `YOUR_CALENDAR_NAME` with the validated value.

---

### Step 3 — Email setup

**Ask:**
> "Which email account in Apple Mail should I scan for work tasks? (This is the account name as it appears in Mail's sidebar.)"

**Validate** — list accounts via osascript and confirm the name matches:

```applescript
tell application "Mail"
  set accountNames to {}
  repeat with acct in accounts
    set end of accountNames to name of acct
  end repeat
  return accountNames
end tell
```

If the name matches (contains) → proceed. Auto-detect the inbox name (INBOX vs Inbox).
If no match → show the list and ask the user to pick.

**Write** `integrations/config/email-config.md` from `email-config.md.example`, replacing `YOUR_MAIL_ACCOUNT_NAME` with the validated value and `INBOX` with the detected inbox name.

---

### Step 4 — Task output setup

**Ask:**
> "What should I name your task list in Mac Reminders? I'll create it if it doesn't exist yet. (Default: 'Eisenhower List')"

No osascript validation needed — Reminders list is created automatically if it doesn't exist.

**Write** `integrations/config/task-output-config.md` from `task-output-config.md.example`, replacing `YOUR_REMINDERS_LIST_NAME` with the user's value.

---

### Step 5 — Stakeholders starter (optional)

**Ask:**
> "Do you want me to create a starter stakeholders file for `/delegate`? It'll have placeholder entries you can fill in with your team. (You can skip this and do it later.)"

If yes → write `integrations/config/stakeholders.yaml` from the content of `integrations/config/stakeholders.yaml.example`, replacing nothing (user edits it manually after setup).

Tell the user:
> "Created integrations/config/stakeholders.yaml with placeholder entries. Edit it to add your team before using /delegate."

If no → skip silently.

---

### Step 6 — Confirm and summarize

Show a summary of what was written:

```
✅ Setup complete. Here's what I configured:

  Calendar:       [calendar_name]
  Email:          [account_name] / [inbox_name]
  Reminders:      [list_name]
  Stakeholders:   [created / skipped]

Config files written to integrations/config/ (gitignored — not committed).
```

If setup was triggered by a command, resume it automatically:

> "All set. Running /scan-email now..."

---

## Files to Create

| File | Purpose |
|------|---------|
| `commands/setup.md` | `/setup` command definition — conversational reconfiguration |
| `commands/scan-email.md` | Add config guard: check `email-config.md` before Step 1 |
| `commands/schedule.md` | Add config guard: check `calendar-config.md` + `task-output-config.md` before Step 1 |
| `commands/delegate.md` | Add config guard: check `stakeholders.yaml` before Step 1 |

---

## Decisions

1. **Per-command guard** — Config detection lives at the top of each command that requires config, not in the SessionStart hook. Reason: more robust — catches missing config mid-session and is explicit about which config each command requires. Boilerplate is acceptable given the small number of affected commands.

2. **Interactive menu for `/setup`** — When all config files exist, `/setup` always shows the menu: "Update everything / Calendar only / Email only / Reminders only / Cancel". No argument syntax. Keeps it discoverable and consistent with the conversational design principle.

3. **Starter `stakeholders.yaml`** — Setup offers to write a starter `stakeholders.yaml` with placeholder entries (using the `.example` template format). This prevents `/delegate` from hard-failing on first install. The user is told to edit it with real names before using `/delegate`. The file remains gitignored.
