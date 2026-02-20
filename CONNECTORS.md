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
| productivity:memory-management | ✅ Active | Used for stakeholder follow-up tracking |
| Apple Mail | ✅ Active | Read-only email scanning via osascript. Triggered by /scan-email. Configured account/inbox only — see `integrations/config/email-config.md`. |
| Mac Calendar | ✅ Active | Read-only availability checks via osascript. Used during /schedule and /scan-email for Q2→Q1 escalation logic. Configured calendar — see `integrations/config/calendar-config.md`. |
| Mac Reminders (`~~task_output`) | ✅ Active (v1) | Write-only task push via osascript. Triggered at end of /schedule. Pushes Q1/Q2/Q3 tasks to configured list. Swappable — see `integrations/config/task-output-config.md` and `integrations/adapters/`. |
| TASKS.md | ✅ Active | Local task board in your workspace folder — source of truth |
| Stakeholder Graph (`stakeholders.yaml`) | ✅ Active (v0.4.0) | Local YAML file — gitignored, PII-safe. Powers `/delegate` matching. See `integrations/config/stakeholders.yaml.example` for schema. |

## How to Enable Future Integrations

When a connector becomes available as a Cowork plugin or MCP server, use the
`cowork-plugin-customizer` skill to replace `~~category` placeholders with
the specific tool name throughout this plugin's commands and skills.

For example, replacing `~~chat` with `Slack` would update the intake source
handling to reference Slack-specific context (channels, DM types, reactions).
