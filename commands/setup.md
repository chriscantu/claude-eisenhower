---
description: Configure or reconfigure claude-eisenhower — calendar, email, Reminders, and stakeholders
argument-hint: [optional: calendar | email | reminders | stakeholders | all]
allowed-tools: Read, Write, Edit, mcp__Control_your_Mac__osascript
---

You are running the SETUP command for the claude-eisenhower plugin.

This command configures the four integration config files that the plugin needs to operate:
- `integrations/config/calendar-config.md` — Mac Calendar name
- `integrations/config/email-config.md` — Apple Mail account and inbox
- `integrations/config/task-output-config.md` — Mac Reminders list name
- `integrations/config/stakeholders.yaml` — Stakeholder graph for /delegate (optional)

All config files are gitignored. Setup writes them from `.example` templates using values you provide. Nothing is committed.

---

## Step 0: Detect current state

Check which config files already exist:

```
integrations/config/calendar-config.md
integrations/config/email-config.md
integrations/config/task-output-config.md
integrations/config/stakeholders.yaml
```

**If all four exist** (manual `/setup` invocation):
> "You're already configured. What would you like to update?
>
> 1. Everything (full reconfiguration)
> 2. Calendar only
> 3. Email only
> 4. Reminders only
> 5. Stakeholders only
> 6. Cancel"

Run only the steps the user selects. Then go to Step 5 (summary).

**If this is a first install** (none or some files missing):
> "Looks like this is your first time using claude-eisenhower. I'll walk you through a quick 2-minute setup before we get started."

Run only the steps for the missing files. Skip steps for files that already exist.

---

## Step 1: Calendar setup

**Ask:**
> "What's the name of your primary work calendar in Mac Calendar? (Open Mac Calendar and check the sidebar if you're not sure.)"

**Validate** — list all calendar names via osascript:

```applescript
tell application "Calendar"
  set calNames to {}
  repeat with cal in calendars
    set end of calNames to name of cal
  end repeat
  return calNames
end tell
```

- If the user's input matches a calendar name exactly (case-insensitive) → proceed.
- If no match → show the list and say: "I didn't find a calendar with that name. Here are the calendars on your Mac: [list]. Which one should I use?"
- Wait for a valid selection before proceeding.

**Write** `integrations/config/calendar-config.md`:
- Read `integrations/config/calendar-config.md.example`
- Replace `YOUR_CALENDAR_NAME` with the validated calendar name
- Write to `integrations/config/calendar-config.md`

---

## Step 2: Email setup

**Ask:**
> "Which email account in Apple Mail should I scan for work tasks? (This is the account name shown in Mail's sidebar, e.g. 'Work', 'Procore', 'Gmail'.)"

**Validate** — list all Mail account names via osascript:

```applescript
tell application "Mail"
  set accountNames to {}
  repeat with acct in accounts
    set end of accountNames to name of acct
  end repeat
  return accountNames
end tell
```

- If the user's input matches (contains) an account name → proceed.
- If no match → show the list and ask the user to pick.

**Auto-detect the inbox name:**

```applescript
tell application "Mail"
  set targetAccount to first account whose name contains "{account_name}"
  set inboxNames to {}
  repeat with mb in mailboxes of targetAccount
    set end of inboxNames to name of mb
  end repeat
  return inboxNames
end tell
```

Use `INBOX` if present, otherwise `Inbox`. If neither exists, ask the user.

**Write** `integrations/config/email-config.md`:
- Read `integrations/config/email-config.md.example`
- Replace `YOUR_MAIL_ACCOUNT_NAME` with the validated account name
- Replace `INBOX` with the detected inbox name
- Write to `integrations/config/email-config.md`

---

## Step 3: Reminders setup

**Ask:**
> "What should I name your task list in Mac Reminders? I'll create it automatically if it doesn't exist yet. (Press Enter to use the default: 'Eisenhower List')"

If the user presses Enter or provides no input → use `Eisenhower List`.

No osascript validation needed — the Reminders adapter creates the list on first push if it doesn't exist.

**Write** `integrations/config/task-output-config.md`:
- Read `integrations/config/task-output-config.md.example`
- Replace only `YOUR_REMINDERS_LIST_NAME` with the user's value (under the `### reminders` block)
- Leave the `Active Adapter` line, all other adapter sections, and all comments unchanged
- Write to `integrations/config/task-output-config.md`

---

## Step 4: Stakeholders starter (optional)

**Ask:**
> "Do you want me to create a starter stakeholders file for /delegate? It'll have placeholder entries — you fill in your team's names, roles, and domains after setup. You can skip this and do it later.
>
> 1. Yes, create a starter file
> 2. No, skip for now"

**If yes:**
- Read `integrations/config/stakeholders.yaml.example`
- Write its full contents as-is to `integrations/config/stakeholders.yaml`
- Say: "Created integrations/config/stakeholders.yaml with placeholder entries. Edit it with your team's real information before using /delegate."

**If no:** skip silently.

---

## Step 5: Confirm and summarize

Show a completion summary of everything that was written this session:

```
✅ Setup complete. Here's what I configured:

  Calendar:     [calendar_name]
  Email:        [account_name] / [inbox_name]
  Reminders:    [list_name]
  Stakeholders: [created with placeholders / skipped]

Config files are saved to integrations/config/ (gitignored — never committed).
```

If setup was triggered automatically by a command that was interrupted, resume it now:
> "All set. Running /[command] now..."

---

## Error handling

- If an osascript call fails (app not running, permission denied) → tell the user which app needs to be open and ask them to open it, then retry.
- If a `.example` file is missing → say "I can't find the template file for [config]. The plugin may be corrupted. Try reinstalling." and stop.
- Never write a config file with unresolved placeholder values (e.g., `YOUR_CALENDAR_NAME`).
