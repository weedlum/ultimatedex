# Ultimate Dex

A complete Pokédex as **one self-contained HTML file** (~1.7MB). No server, no
accounts, works offline. Covers all official generations plus **Radical Red**
(via the official RRDex database).

## Features

- **Dex profiles**: Gen 1–9, National Dex, or Radical Red — switch from the pill
  in the header. Species lists, forms, movesets, and move pools all respect the
  selected profile (e.g. Megas only appear in Gen 6–7, Gmax only in Gen 8).
- **Pokédex**: search, type filters, sort by number/name/BST/any stat. Detail
  pages show base stats, abilities, type defenses, evolution chains, and full
  learnsets (level/TM/tutor/egg) for the selected generation.
- **Radical Red mode**: RR-modified stats, abilities, movesets, RR evolution
  methods, and **wild encounter locations** straight from the RRDex data.
- **Moves / Abilities / Items** browsers with full descriptions and reverse
  lookups ("learned by", "Pokémon with this ability").
- **Team builder**: 6-slot teams per dex profile with ability/item/nature/level/
  legal-move pickers, **EV/IV spreads with live computed stats**, shiny flag,
  defensive coverage grid, and Showdown-format export. Teams persist in
  localStorage.
- **Game-accurate generations**: gen profiles apply Showdown's per-gen diffs —
  base stat changes, retypings (pre-Fairy Clefairy), move power/accuracy changes
  (95 BP Thunderbolt through Gen 5), the unified Special stat in Gen 1, and
  era-correct type charts. Dex flavor text comes from that generation's games.
- **Trainer browser** (RR/custom hacks): every trainer's full party — Normal and
  Hardcore modes — with items, abilities, natures, EVs/IVs, and moves.
- **Rom-hack importer**: load any RRDex-format `data.js`/JSON (the format behind
  many hack dex sites) from a file; it becomes a selectable dex profile stored
  in IndexedDB, including fakemon sprites if present.
- **3D renders + shinies**: detail pages prefer official Pokémon HOME renders,
  falling back to Showdown's animated models, pixel sprites, then the embedded
  icon sheet. Every species page and team slot has a shiny toggle.

## Build

```sh
./build/fetch.sh        # download data sources into data/ (run once)
node build/prepare.mjs  # -> dist/UltimateDex.html + dist/artifact.html
```

`dist/UltimateDex.html` is the standalone file (open directly in any browser).
`dist/artifact.html` is the same app without the document shell, for publishing
as a Claude Artifact (iPhone home-screen use).

## Data sources

- [Pokémon Showdown](https://play.pokemonshowdown.com/data/) — pokedex, moves,
  learnsets, abilities, items, typechart, icon spritesheet, form icon indexes.
- [JwowSquared/Radical-Red-Pokedex](https://github.com/JwowSquared/Radical-Red-Pokedex)
  — the database behind dex.radicalred.net (species, moves, abilities, items,
  encounters, evolutions).

All data is gzipped and embedded in the HTML at build time; the app inflates it
at runtime with the native `DecompressionStream` API (iOS/Safari 16.4+).
Detail-page sprites load from Showdown's CDN when online and fall back to the
embedded icon sheet offline.

## Known approximations

- Per-gen availability for alternate formes uses forme-name heuristics
  (Alolan→Gen 7+, Galarian/Hisuian→Gen 8+, etc.).
- Gen profiles mean "all Pokémon that existed as of that generation," not any
  specific game's regional dex.
- Abilities/items tabs aren't gen-filtered (items are, by their `gen` field).
