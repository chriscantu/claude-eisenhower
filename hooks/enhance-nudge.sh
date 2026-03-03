#!/bin/bash
# enhance-nudge.sh
# PostToolUse hook — nudges developer to run skill-enhancer after editing
# command or skill artifact files. Fires once per file per session.
#
# Injected env vars from Claude Code PostToolUse hook:
#   CLAUDE_TOOL_INPUT_FILE_PATH — path of the file just written or edited

FILEPATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"

# Gate 1: must be a plugin artifact (commands/ or skills/)
if ! echo "$FILEPATH" | grep -qE '/(commands|skills)/.+\.md$'; then
  exit 0
fi

# Gate 2: must be source repo — not deployed plugin cache
REPO_ROOT=$(git -C "$(dirname "$FILEPATH")" rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi

REMOTE=$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null)
if ! echo "$REMOTE" | grep -q "claude-eisenhower"; then
  exit 0
fi

if echo "$REPO_ROOT" | grep -q ".claude/plugins/cache"; then
  exit 0
fi

# Gate 3: session dedup — only fire once per file per session
FILE_HASH=$(echo "$FILEPATH" | md5sum | cut -d' ' -f1)
DEDUP_FILE="/tmp/skill-enhancer-nudge-${FILE_HASH}.lock"

if [ -f "$DEDUP_FILE" ]; then
  exit 0
fi

touch "$DEDUP_FILE"

# Emit nudge
FILENAME=$(basename "$FILEPATH")
echo "You've modified ${FILENAME} this session. Consider running the skill-enhancer on it before committing."
