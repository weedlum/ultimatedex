#!/bin/bash
# Downloads all source data into data/. Run once (or to refresh data).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data

# Pokémon Showdown structured data (canonical, all gens)
for f in pokedex moves learnsets; do
  curl -sL -o "data/$f.json" "https://play.pokemonshowdown.com/data/$f.json"
done
for f in abilities items typechart; do
  curl -sL -o "data/$f.js" "https://play.pokemonshowdown.com/data/$f.js"
done

# Icon spritesheet + form icon indexes
curl -sL -o data/icons.png "https://play.pokemonshowdown.com/sprites/pokemonicons-sheet.png"
curl -sL -o data/battle-dex-data.ts "https://raw.githubusercontent.com/smogon/pokemon-showdown-client/master/play.pokemonshowdown.com/src/battle-dex-data.ts"

# Radical Red — official RRDex database (dex.radicalred.net)
curl -sL -o data/rr-data.js "https://raw.githubusercontent.com/JwowSquared/Radical-Red-Pokedex/master/data.js"

ls -la data/
