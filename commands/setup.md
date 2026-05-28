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

**Write** `config/calendar-config.md`:
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

Until Claude Code injects `${CLAUDE_PLUGIN_ROOT}` into prompt-context Bash env
(it currently injects only into `command:`-type hooks), the plugin still needs
an absolute path on disk to invoke `scripts/cal_query.swift` and friends. Discover
it programmatically rather than asking the user to type — that prompt was the
worst friction in v0.9.3-era setup and the most common source of typo failures.

Run this single discovery command via osascript:

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

## Step 4: Stakeholders bootstrap (conversational)

`/delegate` is the headline differentiator vs Things / Todoist / Sunsama — but
it needs a populated `config/stakeholders.yaml`. Hand-editing
name/alias/role/relationship/domains/capacity_signal/anti_domains for every
report and peer is a 30–60 minute cold-start tax that gates the feature.

This step replaces the manual edit with a one-person-at-a-time conversation
that collects only the minimum fields needed to unblock `/delegate`. Domains
fill in over time via the learn-by-doing log written by `/delegate` itself
(see `commands/delegate.md` Step 5c).

**Ask:**
> "Want to add your team now so /delegate works on day one? I'll ask one
> person at a time — name + role is enough to start. Or skip and I'll seed
> a placeholder file you can edit later.
>
> 1. Add stakeholders now (recommended)
> 2. Use placeholder template (edit yourself later)
> 3. Skip — no /delegate yet"

### Option 1 — Conversational bootstrap

Loop one person at a time. For each, collect minimum-viable fields:

1. **Name and display alias.** "Who's first? Give me a name (e.g. `Jordan
   Vargas`) and how you refer to them in conversation (e.g. `Jordan V.`,
   `Vargas`)."
   - Parse into `name` (full) + `alias` list (display first, shorthand
     after). Single string is allowed; expand to `["Display"]` if the user
     only gives one form.
2. **Relationship.** "Direct report, peer, vendor, or partner?"
3. **Role (optional).** "Job title? (Enter to skip — I'll write `Unknown`.)"
4. **Capacity signal (optional).** "High, medium, low, or unknown?"
   Default `medium` if skipped.
5. **Domains — leave blank.** Tell the user explicitly:
   > "I'll leave domains blank for now. `/delegate` will suggest keywords
   > from real tasks you assign — review them in
   > `memory/domain-suggestions.md` and promote the ones that fit."

After each person:
> "Got [Display Alias] — [role or "no role"], [relationship]. Add another? (yes / done)"

**Loop termination + input normalization** — treat user response
case-insensitively:

- **Continue (yes)** accept: `yes`, `y`, `more`, `another`, `next`, `add`
- **Stop (done)** accept: `done`, `no`, `n`, `stop`, `finish`, `that's it`,
  `that's all`

Anything else → re-prompt: "yes (add another) or done?" Do NOT infer.

**Duplicate alias guard** — before accepting a new entry, compare its
display alias (case-insensitively) against entries collected so far this
session. On collision:
> "You already added '[alias]'. Overwrite the previous entry, or use a
> different display alias? (overwrite / [type new alias])"

**Empty-name guard** — if the user says `yes` to "Add another?" but then
provides no name or a name that is whitespace only, re-prompt once:
"Need a name to proceed — or say `done`."

### YAML write contract (CRITICAL — escape rules)

Hand-constructing YAML for free-text user input is fragile. Follow these
rules without exception when serializing collected entries — apostrophes
(`O'Brien`), colons (`Director: Eng`), brackets, and macOS smart-quote
substitution all break naive output.

1. **Always double-quote** these scalar values: `name`, every element of
   `alias[]`, `role`. Example: `role: "Director of Engineering"`.
2. **Escape embedded double quotes** as `\"`. Example:
   `name: "Ada \"Curly\" Lovelace"`.
3. **Reject smart quotes** — if the user input contains `‘ ’ “ ”` (curly
   quotes that macOS autocorrects from straight quotes), normalize to
   straight `'` / `"` before quoting. Surface a one-line note: "Normalized
   smart quotes in '[field]'."
4. **`domains` is required by the schema** — write `domains: []` literally
   when the user leaves it blank. Do NOT omit the key. The scoring CLI's
   stakeholder type declares `domains: string[]` as non-optional in
   `scripts/delegate-core.ts` — an absent key or YAML null will break
   downstream consumers.
5. **`capacity_signal`** writes `medium` literally when skipped (per the
   default above), not absent.
6. **Skip** `notes`, `contact_hint`, and `anti_domains` on bootstrap.

Preserve the example file's leading comment block verbatim (it documents
the schema), then emit `stakeholders:` followed by one entry per collected
person using the rules above.

Hold the collected list until the user confirms the full setup summary
(Step 5) — do NOT write `config/stakeholders.yaml` mid-loop. If a downstream
preview-before-write step exists (see issue #34), it surfaces the roster
count ("Stakeholders: 4 entries collected") before the write commits.

### Option 2 — Placeholder template

- Read `config/stakeholders.yaml.example`
- Hold its full contents until the Step 5 confirmation, then write to
  `config/stakeholders.yaml`
- After write, say: "Created config/stakeholders.yaml with placeholder
  entries. Edit it with your team's real information before using /delegate."

### Option 3 — Skip

Skip silently. `/delegate` will surface "no stakeholder graph" on first use
and offer to bootstrap then.

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

---

## Error handling

- If an osascript call fails (app not running, permission denied) → tell the user which app needs to be open and ask them to open it, then retry.
- If a `.example` file is missing → say "I can't find the template file for [config]. The plugin may be corrupted. Try reinstalling." and stop.
- Never write a config file with unresolved placeholder values (e.g., `YOUR_CALENDAR_NAME`).
