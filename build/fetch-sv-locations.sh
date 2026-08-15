#!/bin/bash
# Serebii's pokedex-sv pages carry SV + DLC location data that neither
# PokeAPI nor PokemonDB has. Cached in data/sv/<num>.html (404 = not in SV).
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/sv

node -e "
const dex=JSON.parse(require('fs').readFileSync('data/pokedex.json','utf8'));
const seen=new Set();
for(const id in dex){const e=dex[id];
  if(e.forme||e.isCosmeticForme||!e.baseStats||!(e.num>=1))continue;
  if(['CAP','Custom','Pokestar','Future','LGPE'].includes(e.isNonstandard))continue;
  if(seen.has(e.num))continue; seen.add(e.num);
  const slug=e.name.toLowerCase().replace(/[é]/g,'e').normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z.'\- ]/g,'').replace(/[ ]/g,'');
  console.log(e.num+':'+slug);
}" > data/sv/slugs.txt

fetch_sv() {
  for pair in "$@"; do
    num="${pair%%:*}"; s="${pair##*:}"
    f="data/sv/$num.html"
    [ -s "$f" ] || [ -e "data/sv/$num.miss" ] && continue
    if ! curl -sf -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15" \
        -o "$f" "https://www.serebii.net/pokedex-sv/$s/"; then
      rm -f "$f"; touch "data/sv/$num.miss"
    fi
  done
}
export -f fetch_sv
xargs -P 8 -n 10 bash -c 'fetch_sv "$@"' _ < data/sv/slugs.txt

echo "got $(ls data/sv/*.html 2>/dev/null | wc -l | tr -d ' ') pages, $(ls data/sv/*.miss 2>/dev/null | wc -l | tr -d ' ') misses"
echo SV-DONE
