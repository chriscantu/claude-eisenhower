# Connectors

## How tool references work

Plugin files use `~~category` as a placeholder for tools that can be connected
in future versions of this plugin. The workflow is currently self-contained —
tasks are captured and managed within TASKS.md and Claude's memory system.

When you connect an external tool, the plugin can be customized to pull tasks
directly from that source rather than requiring manual intake.

## Planned Connectors for this plugin

| Category | Placeholder | Future Options |
|----------|-------------|----------------|
| Email | `~~email` | Gmail, Outlook, Apple Mail |
| Chat | `~~chat` | Slack, Microsoft Teams, Discord |
| Project tracker | `~~project tracker` | Jira, Asana, Linear, GitHub Issues |
| Calendar | `~~calendar` | Mac Calendar (via AppleScript), Google Calendar |
| Source control | `~~source control` | GitHub, GitLab, Bitbucket |
| Task output | `~~task_output` | Mac Reminders ✅, Asana, Jira, Linear (swappable adapter) |

## Current Integrations

| Tool | Status | How it works |
|------|--------|-------------|
| Mac Calendar (EventKit) | ✅ Active | Read-only availability checks via the **calendar-query dispatcher** (`scripts/calendar-query.ts`). Dispatcher routes to `adapters/calendar/eventkit.ts` which wraps `cal_query.swift`. Used during `/schedule`, `/scan-email`, `/today`, `/plan-week`, `/review-week`. Configured calendar — see `config/calendar-config.md`. |
| Apple Mail | ✅ Active | Read-only email scanning via osascript. Triggered by `/scan-email`. Configured account/inbox only — see `config/email-config.md`. The `email-scan.ts` dispatcher and `adapters/email/apple-mail.ts` adapter exist as the foundation for cross-provider routing; full `/scan-email` rewire to the dispatcher path is tracked separately (see Open Foundation Gaps below). |
| Mac Reminders (`~~task_output`) | ✅ Active (v1) | Write-only task push via osascript. Triggered at end of `/schedule`. Pushes Q1/Q2/Q3 tasks to configured list. Swappable via task-output dispatcher — see `config/task-output-config.md` and `scripts/adapters/task-output/`. |
| Google Calendar | ✅ Active | Cross-platform read-only calendar adapter via the calendar-query dispatcher. Routes to `adapters/calendar/google.ts` which calls Google Calendar API v3 with the `calendar.readonly` scope. Uses the shared OAuth refresh-token lifecycle in `scripts/google-auth.ts`. Enable by setting `provider: google` + `google_credentials_path` + `google_token_path` in `config/calendar-config.md`. Lands in [#64](https://github.com/chriscantu/claude-eisenhower/issues/64). |
| Gmail | ✅ Adapter ready | Read-only Gmail scan via googleapis SDK + shared OAuth. Registered in email dispatcher under `provider: google`. Scope: `gmail.readonly`. End-to-end `/scan-email` use depends on the command-side rewire ([#68](https://github.com/chriscantu/claude-eisenhower/issues/68)). PII-safe: never logs sender addresses, subjects, or bodies. Lands in [#65](https://github.com/chriscantu/claude-eisenhower/issues/65). |
| Google Tasks | ✅ Active | Cross-platform write-side adapter for non-Mac users. Pushes Q1/Q2/Q3 tasks to a configured Google Tasks list via the Tasks API (scope `tasks`); quadrant encoded as `[Qn]` title prefix (Tasks has no priority field), source/requester appended to notes. Configured via `### google` block in `config/task-output-config.md`. Shares OAuth refresh token with Calendar / Gmail adapters (#67). Lands in [#66](https://github.com/chriscantu/claude-eisenhower/issues/66). |
| TASKS.md | ✅ Active | Local task board in your workspace folder — source of truth |
| Stakeholder Graph (`stakeholders.yaml`) | ✅ Active (v0.4.0) | Local YAML file — gitignored, PII-safe. Powers `/delegate` matching. See `config/stakeholders.yaml.example` for schema. |

## Source-Adapter Architecture (#67 foundation)

As of #67, three adapter families share the same dispatcher pattern:

| Family | Dispatcher | Adapters (current + planned) | Config |
|---|---|---|---|
| calendar-source | `scripts/calendar-query.ts` | `eventkit` (Mac default), `google` (#64 — active) | `config/calendar-config.md` `provider:` |
| email-source | `scripts/email-scan.ts` | `apple-mail` (Mac default), `google` (#65 — adapter ready, command rewire in #68) | `config/email-config.md` `provider:` |
| task-output | `scripts/task-output.ts` | `reminders` (Mac default), `markdown-file`, `google` (#66 — active) | `config/task-output-config.md` `active_adapter:` |

Commands route through a dispatcher — no command invokes `cal_query.swift` or
an adapter file directly. Adapters return shared contract shapes
(`CalendarQueryResult`, `EmailScanResult`, `PushResult`/`CompleteResult`)
defined in `scripts/adapter-types.ts`.

## Google OAuth setup (one-time, shared across #64 / #65 / #66)

The three Google adapter issues share a single OAuth refresh-token lifecycle
implemented in `scripts/google-auth.ts`. Setup is identical for all three.

### 1. Create a Google Cloud Console OAuth client

1. Go to https://console.cloud.google.com/apis/credentials.
2. Create OAuth 2.0 Client ID, application type **Desktop app**.
3. Download `client_secret.json`. Save it outside the repo (e.g.,
   `~/.claude-eisenhower/google-client-secret.json`). Mode 0600 recommended.
4. Enable APIs you intend to use:
   - Google Calendar API (for #64)
   - Gmail API (for #65)
   - Tasks API (for #66)

### 2. Configure the relevant config file

Set `provider: google` and point at the credential + token paths. Examples
live in `config/calendar-config.md.example`, `config/email-config.md.example`,
and `config/task-output-config.md.example` (`### google` block — #66).

### 3. Run the loopback OAuth flow

The first call into any Google adapter will:

1. Bind a loopback HTTP server on `127.0.0.1` to an OS-assigned ephemeral port.
2. Print an auth URL to stdout: `Open this URL in your browser to authorize: <url>`.
3. After you grant consent in the browser, Google redirects to the loopback
   port with an authorization code + CSRF state parameter.
4. The adapter validates state, exchanges the code for an access + refresh
   token, persists `{refresh_token, scopes, created_at}` to the configured
   `google_token_path` (mode 0600), and proceeds with the original request.

Subsequent calls reuse the cached refresh token. The token file is gitignored.

### 4. Scopes used

| Adapter | Scope |
|---|---|
| Google Calendar (#64) | `https://www.googleapis.com/auth/calendar.readonly` |
| Gmail (#65) | `https://www.googleapis.com/auth/gmail.readonly` |
| Google Tasks (#66) | `https://www.googleapis.com/auth/tasks` |

If you start with one adapter and later enable another whose scope is not in
the persisted refresh token, `google-auth.ts` throws with instructions to
re-run the initial flow with the expanded scope union — it does NOT silently
re-auth.

### 5. Revoking access

Revoke at https://myaccount.google.com/permissions or delete the
refresh-token file. The plugin keeps no other auth state.


## Gmail-specific setup (#65)

To switch /scan-email from Apple Mail to Gmail:

1. Complete the **Google OAuth setup** above. Enable the Gmail API in step 1.4. Reuse the client_secret.json you downloaded; no separate credential needed.
2. Copy config/email-config.md.example to config/email-config.md (gitignored).
3. Edit config/email-config.md: set provider: google, account_name: you@gmail.com, inbox_name: INBOX (or another Gmail label — matched case-insensitively against users.labels.list), and uncomment google_credentials_path + google_token_path.
4. First call into the adapter runs the loopback consent flow described above. Subsequent calls reuse the cached refresh token.

The Gmail adapter is read-only (gmail.readonly scope). It returns the same EmailScanResult shape as the Apple Mail adapter, so callers see identical fields (from, subject, received_at, snippet, body_text, thread_id) regardless of provider.

**PII posture.** The adapter never writes sender addresses, subjects, snippets, or message bodies to stdout/stderr — neither in success nor error paths. Errors surface generic strings like Gmail API error: .... Message content is returned only as the function typed return value to the caller.

**End-to-end /scan-email wiring.** As of #65 the adapter is registered with the dispatcher and importable. The /scan-email command itself still drives Apple Mail via inline AppleScript; the command-side rewire ships in [#68](https://github.com/chriscantu/claude-eisenhower/issues/68).

## Open Foundation Gaps

Scoped follow-ups to #67's foundation, deliberately deferred:

- `/scan-email` command rewire — the email-scan dispatcher + apple-mail
  adapter exist; the command still drives Mail via inline AppleScript blocks.
  Tracked as a follow-up to #67.
- CLAUDE.md "Reliability" code-review checklist still mentions
  `scripts/cal_query.swift` directly; the dispatcher now owns that surface.

## How to Enable Future Integrations

When a connector becomes available as a Cowork plugin or MCP server, use the
`cowork-plugin-customizer` skill to replace `~~category` placeholders with
the specific tool name throughout this plugin's commands and skills.

For example, replacing `~~chat` with `Slack` would update the intake source
handling to reference Slack-specific context (channels, DM types, reactions).

## External Skill Dependencies

None. As of v1.9.0 the plugin owns all stakeholder memory locally — see
`docs/adrs/single-backend-memory.md` for the decision to retire the external
`productivity:memory-management` dependency.
