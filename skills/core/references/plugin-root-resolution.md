# Plugin Root Resolution

Before invoking any script or reading plugin-relative paths, resolve the plugin
root from configuration:

1. Read `config/task-output-config.md`.
2. Find the `plugin_root` value.
3. If present and not equal to the literal placeholder `YOUR_PLUGIN_INSTALL_PATH`:
   use it as the base path for all repo-relative paths.
4. If absent OR equal to the placeholder: stop the command and surface this
   error to the user:

   > "plugin_root is not configured in `config/task-output-config.md`. Run
   > `/setup` — it auto-detects the install path so you don't need to type it.
   > Until then I can't invoke `scripts/cal_query.swift` or the Reminders
   > adapter."

   Do NOT fall back to a hardcoded path. An unconfigured plugin should fail
   loudly the first time, not silently route to a path that may not exist.

5. Construct all paths from the resolved root:
   - Scripts: `{plugin_root}/scripts/{script_name}`
   - Config: `{plugin_root}/config/{config_file}`
   - Memory: `{plugin_root}/memory/{file}`

## Why this field exists

`${CLAUDE_PLUGIN_ROOT}` is injected by Claude Code only into `command:`-type
entries in `hooks/hooks.json` — it is NOT present in the Bash tool / osascript
MCP environment that command prompts use to invoke scripts. Until that gap
closes, commands resolve the install path through this config field.

`/setup` auto-detects the path via a `find` for `.claude-plugin/plugin.json`
across `~/.claude/plugins`, `~/repos`, `~/projects`, and `~/Documents`. The
user is not asked to type the path unless detection turns up zero matches.
