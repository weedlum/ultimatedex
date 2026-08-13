#!/bin/bash
# Downloads all source data into data/. Run once (or to refresh data).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data

# Pokémon Showdown structured data (canonical, all gens)
for f in pokedex moves; do
  curl -sL -o "data/$f.json" "https://play.pokemonshowdown.com/data/$f.json"
done
# Full learnsets from the simulator repo (gens 3-9 in the main file, 1-2 in the gen2 mod)
curl -sL -o data/learnsets-sim.ts "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/learnsets.ts"
curl -sL -o data/mods/gen2-learnsets.ts "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/gen2/learnsets.ts"

# Per-generation diffs + PokeAPI flavor text
for g in 1 2 3 4 5 6 7 8; do
  for f in pokedex moves typechart; do
    curl -sL -o "data/mods/gen$g-$f.ts" "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/gen$g/$f.ts"
  done
done
mkdir -p data/mods data/csv
for c in pokemon_species_flavor_text pokemon_species_names versions version_groups; do
  curl -sL -o "data/csv/$c.csv" "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/$c.csv"
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
