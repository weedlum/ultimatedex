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
cp build/icon-192.png "$W/icon-192.png" 2>/dev/null || true
cp build/icon-512.png "$W/icon-512.png" 2>/dev/null || true

cat > "$W/manifest.webmanifest" <<'MANIFEST'
{
  "name": "Ultimate Dex",
  "short_name": "UltimateDex",
  "display": "standalone",
  "start_url": "./",
  "background_color": "#0b0e14",
  "theme_color": "#d63413",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
MANIFEST

VERSION="ud-$(date +%Y%m%d%H%M%S)"
cat > "$W/sw.js" <<SW
const CACHE = '$VERSION';
const ASSETS = ['./', './icon-v2.png', './icon-192.png', './icon-512.png', './manifest.webmanifest'];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// stale-while-revalidate: serve instantly from cache, refresh in the background
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req).then((cached) => {
    const net = fetch(req).then((res) => {
      if (res.ok) { const clone = res.clone(); caches.open(CACHE).then((c) => c.put(req, clone)); }
      return res;
    }).catch(() => cached);
    return cached || net;
  }));
});
SW
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
