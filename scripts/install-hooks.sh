#!/usr/bin/env bash
# Installs version-controlled git hooks from scripts/hooks/ into .git/hooks/.
# Run once after cloning: npm run install-hooks  (from the scripts/ directory)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
HOOKS_SRC="$SCRIPT_DIR/hooks"
HOOKS_DST="$REPO_ROOT/.git/hooks"

echo "Installing git hooks from scripts/hooks/ → .git/hooks/"

for hook in "$HOOKS_SRC"/*; do
  name="$(basename "$hook")"
  dest="$HOOKS_DST/$name"

  if [ -f "$dest" ] && [ ! -L "$dest" ]; then
    echo "  ⚠️  $name: existing hook found (not a symlink) — skipping. Back it up and re-run if needed."
    continue
  fi

  ln -sf "$hook" "$dest"
  echo "  ✅ $name → linked"
done

echo "Done. Hooks are active for this repo."
