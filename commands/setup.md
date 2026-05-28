---
description: Configure or reconfigure claude-eisenhower — calendar, email, Reminders, and stakeholders
argument-hint: [optional: calendar | email | reminders | stakeholders | all]
allowed-tools: Read, Write, Edit, mcp__Control_your_Mac__osascript
---

You are running the SETUP command for the claude-eisenhower plugin.

This command configures the four integration config files that the plugin needs to operate:
- `config/calendar-config.md` — Mac Calendar name
- `config/email-config.md` — Apple Mail account and inbox
- `config/task-output-config.md` — Mac Reminders list name
- `config/stakeholders.yaml` — Stakeholder graph for /delegate (optional)

All config files are gitignored. Setup writes them from `.example` templates using values you provide. Nothing is committed.

---

## Step 0: Detect current state

Check which config files already exist:

```
config/calendar-config.md
config/email-config.md
config/task-output-config.md
config/stakeholders.yaml
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

**Check for `config/.setup.partial`** (resume marker). If present, read it as
YAML/JSON and resume from the next pending step rather than re-prompting for
values already collected. Tell the user:

> "Found a previous setup in progress — resuming from [step name]."

The marker is written after every successful step (see Step 5) and deleted on
clean completion. If a prior run crashed between calendar validation and write,
the user does NOT have to re-type a calendar name they already confirmed.

---

## Step 0.5: Preview-before-write

After collecting ALL answers for the steps that will run (calendar, email,
Reminders, plugin_root, stakeholders), and BEFORE writing any config file,
present a single preview block and ask for one confirmation:

```
Here's what I'll configure:

  Plugin root:  [detected_or_supplied_path]
  Calendar:     [echo_matched_name]
  Email:        [account_name] / [inbox_name]
  Reminders:    [list_name]
  Stakeholders: [create starter / skip]

Write these? (yes / no — let me change something)
```

On `yes` → proceed to write each config in the original step order, persisting
`config/.setup.partial` between each successful write so a crash mid-write is
recoverable.

On `no` → ask which value to change, re-collect just that one, redraw the
preview. Loop until the user confirms.

This preview gate is the single user-facing point where setup commits to disk.
Earlier per-step prompts collect intent; this step makes intent visible before
state changes.

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

**Echo-back the matched calendar name** verbatim before treating the answer as
final — this catches smart-quote substitution, trailing whitespace, and casing
drift between what the user typed and what AppleScript actually returned:

> "Found calendar named '[exact_matched_name]' — use this? (yes / no)"

On `no`, return to the list-and-pick step. On `yes`, hold the value for the
preview block (Step 0.5). Do NOT write the config here.

**Write** `config/calendar-config.md` (only after Step 0.5 confirmation):
- Read `config/calendar-config.md.example`
- Replace `YOUR_CALENDAR_NAME` with the validated calendar name
- Write to `config/calendar-config.md`

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

**Write** `config/email-config.md`:
- Read `config/email-config.md.example`
- Replace `YOUR_MAIL_ACCOUNT_NAME` with the validated account name
- Replace `INBOX` with the detected inbox name
- Write to `config/email-config.md`

---

## Step 3: Reminders setup

**Ask:**
> "What should I name your task list in Mac Reminders? I'll create it automatically if it doesn't exist yet. (Press Enter to use the default: 'Eisenhower List')"

If the user presses Enter or provides no input → use `Eisenhower List`.

No osascript validation needed — the Reminders adapter creates the list on first push if it doesn't exist.

**Auto-detect the plugin install path** — do NOT ask the user to type it.

**Detection order (first hit wins):**

1. **`${CLAUDE_PLUGIN_ROOT}` env var.** Run via Bash tool:
   ```
   echo "${CLAUDE_PLUGIN_ROOT:-}"
   ```
   If non-empty AND the path contains `.claude-plugin/plugin.json`, take it
   directly — no find scan, no user prompt. This is the cheapest, most
   accurate path when the runtime injects it.

2. **Filesystem find scan.** Used only when step 1 returns empty (older
   runtime, hook context without env injection).

Until Claude Code injects `${CLAUDE_PLUGIN_ROOT}` into all prompt-context Bash
env reliably, the find fallback below remains required. The env-var path is
preferred because it avoids ENOENT noise on machines without `~/repos` or
`~/projects` and eliminates the multi-match disambiguation step.

Run this find command via osascript only when step 1 returned empty:

```applescript
do shell script "find " & ¬
  quoted form of (system attribute "HOME" & "/.claude/plugins") & " " & ¬
  quoted form of (system attribute "HOME" & "/repos") & " " & ¬
  quoted form of (system attribute "HOME" & "/projects") & " " & ¬
  quoted form of (system attribute "HOME" & "/Documents") & ¬
  " -maxdepth 6 -type f -name plugin.json -path '*claude-plugin/plugin.json' 2>/dev/null" & ¬
  " | xargs -I{} sh -c 'grep -l \"\\\"name\\\": \\\"claude-eisenhower\\\"\" {} 2>/dev/null' | head -1"
```

Some users will not have `~/repos` or `~/projects`. The `2>/dev/null` swallows
ENOENT noise so the pipeline only surfaces real hits. Missing search roots are
NOT a failure — the find just skips them.

Interpret the result:

1. **Exactly one match returned** (e.g. `/Users/alice/repos/claude-eisenhower/.claude-plugin/plugin.json`):
   - Strip the trailing `/.claude-plugin/plugin.json` to get the plugin root.
   - Say: "Detected plugin install at `{plugin_root}`. Use this? (yes / no — let me type it)"
   - On `yes` (or equivalent), proceed with the detected path.
   - On `no`, prompt once for the absolute path. No retry loop — if the single
     re-entry is invalid, write `plugin_root: <not detected — see setup>` and
     surface: "I couldn't verify the path. Edit `config/task-output-config.md`
     manually before running /schedule or /today."

2. **Multiple matches returned** (e.g. user has the plugin cloned in two places):
   - Show the list, ask the user to pick by number, proceed with that choice.

3. **No matches returned**:
   - Single fallback prompt: "I couldn't auto-detect the plugin install. What's
     the absolute path to your claude-eisenhower folder?"
   - Accept whatever the user gives — do NOT run the verification retry loop.
     A wrong path will surface clearly the first time the user runs /schedule
     or /today (cal_query.swift will error). Cheaper to recover then than to
     gate setup behind shell ceremony.

**Write** `config/task-output-config.md`:
- Read `config/task-output-config.md.example`
- Replace `YOUR_PLUGIN_INSTALL_PATH` on the `plugin_root:` line with the
  detected (or user-supplied) absolute path
- Replace `YOUR_REMINDERS_LIST_NAME` with the user's value (under the `### reminders` block)
- Leave the `Active Adapter` line, all other adapter sections, and all comments unchanged
- Write to `config/task-output-config.md`

---

## Step 4: Stakeholders starter (optional)

**Ask:**
> "Do you want me to create a starter stakeholders file for /delegate? It'll have placeholder entries — you fill in your team's names, roles, and domains after setup. You can skip this and do it later.
>
> 1. Yes, create a starter file
> 2. No, skip for now"

**If yes:**
- Read `config/stakeholders.yaml.example`
- Write its full contents as-is to `config/stakeholders.yaml`
- Say: "Created config/stakeholders.yaml with placeholder entries. Edit it with your team's real information before using /delegate."

**If no:** skip silently.

---

## Resume marker — `config/.setup.partial`

Between every successful config write inside Step 0.5's write loop, persist a
`config/.setup.partial` file with a minimal YAML body recording which steps are
complete and the validated answers collected so far. Example:

```yaml
# Auto-managed by /setup — do not edit
collected:
  calendar_name: Work
  email_account: Procore
  email_inbox: INBOX
  reminders_list: Eisenhower List
  plugin_root: /Users/cantu/repos/claude-eisenhower
  stakeholders_choice: skip
written:
  - calendar
  - email
```

On clean completion of Step 5, delete `config/.setup.partial`. If a future
`/setup` invocation finds the file, jump straight back to Step 0.5's preview
using the persisted values — only re-prompt for fields not yet collected.

The marker is gitignored along with the rest of `config/`.

---

## Step 5: Confirm and summarize

Show a completion summary of everything that was written this session:

```
✅ Setup complete. Here's what I configured:

  Plugin root:  [plugin_root]
  Calendar:     [calendar_name]
  Email:        [account_name] / [inbox_name]
  Reminders:    [list_name]
  Stakeholders: [created with placeholders / skipped]

Config files are saved to config/ (gitignored — never committed).
```

If setup was triggered automatically by a command that was interrupted, resume it now:
> "All set. Running /[command] now..."

After the summary, delete `config/.setup.partial` if present — setup is done.

---

## Error handling

- If an osascript call fails (app not running, permission denied) → tell the user which app needs to be open and ask them to open it, then retry.
- If a `.example` file is missing → say "I can't find the template file for [config]. The plugin may be corrupted. Try reinstalling." and stop.
- Never write a config file with unresolved placeholder values (e.g., `YOUR_CALENDAR_NAME`).
