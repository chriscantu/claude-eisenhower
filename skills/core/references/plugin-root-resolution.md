# Plugin Root Resolution

Before invoking any script in `scripts/`, resolve the plugin root path:

1. Read `config/task-output-config.md`
2. Find the `plugin_root` value
3. If present: use it as the base path for all script invocations
4. If absent: use `~/repos/claude-eisenhower` as the default and emit this warning
   to the user:

   > "plugin_root not configured in config/task-output-config.md — using default
   > path ~/repos/claude-eisenhower. Run /setup to configure."

5. Store the resolved path for the remainder of this command's execution.
   All script paths are constructed as: `{plugin_root}/scripts/{script_name}`
