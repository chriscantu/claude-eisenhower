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

## Current Integrations

| Tool | Status | How it works |
|------|--------|-------------|
| productivity:memory-management | ✅ Active | Used for stakeholder follow-up tracking |
| Apple Mail (Procore/Inbox) | ✅ Active | Read-only email scanning via osascript. Triggered by /scan-email. Procore/Inbox only — no other mailboxes touched. |
| Mac Calendar | ✅ Active | Read-only availability checks via osascript. Used during /schedule and /scan-email for Q2→Q1 escalation logic. |
| TASKS.md | ✅ Active | Local task board in your workspace folder |

## How to Enable Future Integrations

When a connector becomes available as a Cowork plugin or MCP server, use the
`cowork-plugin-customizer` skill to replace `~~category` placeholders with
the specific tool name throughout this plugin's commands and skills.

For example, replacing `~~chat` with `Slack` would update the intake source
handling to reference Slack-specific context (channels, DM types, reactions).
