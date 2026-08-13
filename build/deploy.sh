#!/bin/bash
# Rebuilds and deploys the app to GitHub Pages (gh-pages branch of the repo)
# and refreshes the iCloud copy.
set -euo pipefail
cd "$(dirname "$0")/.."

node build/prepare.mjs

W=$(mktemp -d)
cp dist/UltimateDex.html "$W/index.html"
cp build/touch-icon.png "$W/icon.png"
cp build/touch-icon.png "$W/icon-v2.png"
cd "$W"
git init -q -b gh-pages
git config http.postBuffer 524288000
git config http.version HTTP/1.1
git add -A
git commit -qm "deploy $(date +%Y-%m-%d_%H:%M)"
for i in 1 2 3 4 5; do
  git push -q --force --no-thin "https://github.com/weedlum/ultimatedex.git" gh-pages && break
  echo "push attempt $i failed; retrying…"
  sleep 3
done
cd - >/dev/null
rm -rf "$W"

ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
[ -d "$ICLOUD" ] && cp dist/UltimateDex.html "$ICLOUD/UltimateDex.html"
echo "deployed: https://weedlum.github.io/ultimatedex/"
