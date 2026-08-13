#!/bin/bash
# Downloads Pokémon HOME renders (normal+shiny) for all base species and
# gen5 pixel sprites (normal+shiny) for alternate formes, then recompresses
# the HOME renders to small WebP for embedding. Results in build/sprite-cache/.
set -uo pipefail
cd "$(dirname "$0")/.."
C=build/sprite-cache
mkdir -p "$C/home" "$C/home-shiny" "$C/webp" "$C/webp-shiny" "$C/gen5" "$C/gen5-shiny"
export C

fetch_home() {
  for n in "$@"; do
    [ -s "$C/home/$n.png" ] || curl -sf -o "$C/home/$n.png" \
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/$n.png" || rm -f "$C/home/$n.png"
    [ -s "$C/home-shiny/$n.png" ] || curl -sf -o "$C/home-shiny/$n.png" \
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/shiny/$n.png" || rm -f "$C/home-shiny/$n.png"
  done
}
fetch_gen5() {
  for id in "$@"; do
    [ -s "$C/gen5/$id.png" ] || curl -sf -o "$C/gen5/$id.png" \
      "https://play.pokemonshowdown.com/sprites/gen5/$id.png" || rm -f "$C/gen5/$id.png"
    [ -s "$C/gen5-shiny/$id.png" ] || curl -sf -o "$C/gen5-shiny/$id.png" \
      "https://play.pokemonshowdown.com/sprites/gen5-shiny/$id.png" || rm -f "$C/gen5-shiny/$id.png"
  done
}
towebp() {
  local outdir=$1; shift
  for f in "$@"; do
    local out="$C/$outdir/$(basename "$f" .png).webp"
    [ -s "$out" ] || cwebp -quiet -q 68 -resize 128 128 "$f" -o "$out"
  done
}
export -f fetch_home fetch_gen5 towebp

MAXNUM=$(node -e "
const dex=JSON.parse(require('fs').readFileSync('data/pokedex.json','utf8'));
let mx=0; for(const id in dex){const e=dex[id]; if(e.num>mx) mx=e.num;} console.log(mx);")

seq 1 "$MAXNUM" | xargs -P 12 -n 16 bash -c 'fetch_home "$@"' _

node -e "
const dex=JSON.parse(require('fs').readFileSync('data/pokedex.json','utf8'));
for(const id in dex){const e=dex[id];
  if(e.isCosmeticForme||!e.baseStats||!(e.num>=1))continue;
  if(['CAP','Custom','Pokestar','Future','LGPE'].includes(e.isNonstandard))continue;
  if(e.forme){
    const toID=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
    console.log(toID(e.baseSpecies)+'-'+toID(e.forme));
  }
}" | xargs -P 12 -n 16 bash -c 'fetch_gen5 "$@"' _

ls "$C/home"/*.png 2>/dev/null | xargs -P 8 -n 16 bash -c 'towebp webp "$@"' _
ls "$C/home-shiny"/*.png 2>/dev/null | xargs -P 8 -n 16 bash -c 'towebp webp-shiny "$@"' _

echo "home: $(ls $C/home | wc -l | tr -d ' ')  shiny: $(ls $C/home-shiny | wc -l | tr -d ' ')"
echo "webp: $(ls $C/webp | wc -l | tr -d ' ')  webp-shiny: $(ls $C/webp-shiny | wc -l | tr -d ' ')"
echo "gen5 formes: $(ls $C/gen5 | wc -l | tr -d ' ')  gen5-shiny: $(ls $C/gen5-shiny | wc -l | tr -d ' ')"
du -sh $C/webp $C/webp-shiny $C/gen5 $C/gen5-shiny 2>/dev/null
echo SPRITES-DONE
