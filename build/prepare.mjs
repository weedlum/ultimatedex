// Builds dist/UltimateDex.html (standalone) and dist/artifact.html (body-only,
// for publishing as a Claude Artifact) from src/ + data/.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import url from 'node:url';

const root = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// --- Showdown data ---------------------------------------------------------
// eval() is used deliberately here: Showdown's abilities/items/typechart and
// RRDex's data.js are JavaScript object literals, not JSON. This is a local
// build-time script running over files we downloaded ourselves — nothing user-
// supplied ever reaches it.
function evalExports(src) {
  const exports = {};
  eval(src);
  return exports;
}
const dex = JSON.parse(read('data/pokedex.json'));
const moves = JSON.parse(read('data/moves.json'));
const learnsets = JSON.parse(read('data/learnsets.json'));
const abilities = evalExports(read('data/abilities.js')).BattleAbilities;
const items = evalExports(read('data/items.js')).BattleItems;
const typechart = evalExports(read('data/typechart.js')).BattleTypeChart;

// Trim learnsets: drop encounter/event-only metadata, keep learn codes.
for (const id in learnsets) {
  const e = learnsets[id];
  delete e.encounters;
  delete e.eventData;
  if (!e.learnset) delete learnsets[id];
}

// Icon indexes for alternate formes (base species use their dex number).
const dexData = read('data/battle-dex-data.ts');
const iconMatch = dexData.match(
  /BattlePokemonIconIndexes: \{ \[id: string\]: number \} = (\{[\s\S]*?\n\});/
);
if (!iconMatch) throw new Error('could not extract BattlePokemonIconIndexes');
const iconIdx = eval('(' + iconMatch[1] + ')');

// --- Radical Red (RRDex) ---------------------------------------------------
const rr = eval('(' + read('data/rr-data.js') + ')');
delete rr.trainers; // not used in v1
delete rr.sprites; // official species only; shared icon sheet + remote art cover it
delete rr.scaledLevels;
delete rr.caps;

const payload = { dex, moves, learnsets, abilities, items, typechart, iconIdx, rr };
const json = JSON.stringify(payload);
const gz = zlib.gzipSync(json, { level: 9 });
const b64 = gz.toString('base64');
const icons = fs.readFileSync(path.join(root, 'data/icons.png')).toString('base64');

console.log(`payload: ${(json.length / 1e6).toFixed(2)}MB json -> ${(gz.length / 1024).toFixed(0)}KB gz`);

// --- Assemble --------------------------------------------------------------
// String.prototype.replace treats $ specially; always pass replacer functions.
const style = read('src/style.css');
const app = read('src/app.js');

const inner = read('src/body.html')
  .replace('/*__STYLE__*/', () => style)
  .replace('__ICONS_B64__', () => icons)
  .replace('__DATA_B64__', () => b64)
  .replace('/*__APP__*/', () => app);

const standalone = read('src/shell.html').replace('<!--__BODY__-->', () => inner);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/UltimateDex.html'), standalone);
fs.writeFileSync(path.join(root, 'dist/artifact.html'), inner);
console.log(
  `dist/UltimateDex.html ${(standalone.length / 1e6).toFixed(2)}MB, dist/artifact.html ${(inner.length / 1e6).toFixed(2)}MB`
);
