#!/bin/bash
# PokeAPI's dump lacks most gen-9 flavor text; PokemonDB's per-species pages
# aggregate all games. Cached in data/pdb/ (one HTML per base species).
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/pdb

node -e "
const dex=JSON.parse(require('fs').readFileSync('data/pokedex.json','utf8'));
const slug=(n)=>n.toLowerCase().replace(/♀/g,'-f').replace(/♂/g,'-m')
  .replace(/[’'.:]/g,'').replace(/é/g,'e').replace(/ +/g,'-');
const seen=new Set();
for(const id in dex){const e=dex[id];
  if(e.forme||e.isCosmeticForme||!e.baseStats||!(e.num>=1))continue;
  if(['CAP','Custom','Pokestar','Future','LGPE'].includes(e.isNonstandard))continue;
  const s=slug(e.name); if(seen.has(s))continue; seen.add(s);
  console.log(e.num+' '+s);
}" > data/pdb/slugs.txt

fetch_pdb() {
  for pair in "$@"; do
    num="${pair%%:*}"; s="${pair##*:}"
    f="data/pdb/$num.html"
    [ -s "$f" ] && continue
    curl -sf -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15" \
      -o "$f" "https://pokemondb.net/pokedex/$s" || rm -f "$f"
  done
}
export -f fetch_pdb
awk '{print $1":"$2}' data/pdb/slugs.txt | xargs -P 8 -n 12 bash -c 'fetch_pdb "$@"' _

total=$(wc -l < data/pdb/slugs.txt | tr -d ' ')
got=$(ls data/pdb/*.html 2>/dev/null | wc -l | tr -d ' ')
echo "fetched $got / $total"
awk '{print $1}' data/pdb/slugs.txt | while read -r n; do [ -s "data/pdb/$n.html" ] || echo "MISS $n $(grep "^$n " data/pdb/slugs.txt)"; done | head -20
echo PDB-DONE
