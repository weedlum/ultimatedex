#!/bin/bash
# Rebuilds and deploys the app to GitHub Pages (gh-pages branch of the repo)
# and refreshes the iCloud copy.
set -euo pipefail
cd "$(dirname "$0")/.."

node build/prepare.mjs

W=$(mktemp -d)
cp dist/UltimateDex.html "$W/index.html"
cp build/touch-icon.png "$W/icon.png"
cd "$W"
git init -q -b gh-pages
git add -A
git commit -qm "deploy $(date +%Y-%m-%d_%H:%M)"
git push -q --force "https://github.com/weedlum/ultimatedex.git" gh-pages
cd - >/dev/null
rm -rf "$W"

ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
[ -d "$ICLOUD" ] && cp dist/UltimateDex.html "$ICLOUD/UltimateDex.html"
echo "deployed: https://weedlum.github.io/ultimatedex/"
