#!/usr/bin/env bash
set -e
echo ""
echo "  RV Agent — installer"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  ✗ Node.js is not installed."
  echo "    Get it from https://nodejs.org (choose the LTS version), then run this again."
  exit 1
fi

MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 18 ]; then
  echo "  ✗ Node $(node -v) is too old — version 18 or newer is required."
  exit 1
fi
echo "  ✓ Node $(node -v)"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if npm link >/dev/null 2>&1; then
  echo "  ✓ installed the 'rv' command"
else
  echo "  ! could not link globally (permissions)."
  echo "    Add this to your ~/.zshrc instead:"
  echo "      alias rv='node $DIR/src/cli.js'"
fi

echo ""
echo "  Next:  rv setup"
echo ""
