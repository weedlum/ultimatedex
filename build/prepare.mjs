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
// The client learnsets.json only covers gen 3+; the simulator's learnsets.ts
// has all nine gens. Imported below (Node strips the TS types natively).
let learnsets;
{
  const tmp = path.join(root, 'data/.tmp-learnsets.ts');
  fs.writeFileSync(tmp, read('data/learnsets-sim.ts'));
  try { learnsets = structuredClone((await import(url.pathToFileURL(tmp).href)).Learnsets); }
  finally { fs.unlinkSync(tmp); }
}
const abilities = evalExports(read('data/abilities.js')).BattleAbilities;
const items = evalExports(read('data/items.js')).BattleItems;
const typechart = evalExports(read('data/typechart.js')).BattleTypeChart;

// Gens 1-2 learn data lives in the gen2 mod's learnsets.ts — merge its codes in.
{
  const tmp = path.join(root, 'data/.tmp-ls2.ts');
  fs.writeFileSync(tmp, read('data/mods/gen2-learnsets.ts'));
  let old;
  try { old = (await import(url.pathToFileURL(tmp).href)).Learnsets; }
  finally { fs.unlinkSync(tmp); }
  for (const id in old) {
    const oldLs = old[id].learnset;
    if (!oldLs) continue;
    const tgt = (learnsets[id] = learnsets[id] || { learnset: {} });
    tgt.learnset = tgt.learnset || {};
    for (const mid in oldLs) {
      tgt.learnset[mid] = [...(tgt.learnset[mid] || []), ...oldLs[mid].filter((c) => c[0] === '1' || c[0] === '2')];
    }
  }
}

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
delete rr.sprites; // official species only; shared icon sheet + remote art cover it
delete rr.scaledLevels;
delete rr.caps;
// Trim trainer parties: keep the set data, drop the 'cap'/meta keys we don't render.
for (const id in rr.trainers) delete rr.trainers[id].cap;
// Pre-render evolution condition texts (RRDex stores them as JS template strings;
// evaluating them here means the app never needs eval/new Function at runtime).
for (const sid in rr.species) {
  const s = rr.species[sid];
  if (!s.evolutions) continue;
  s.evoTexts = s.evolutions.map((evo) => {
    const tpl = rr.evolutions[evo[0]];
    if (!tpl) return 'Special';
    try {
      return new Function('evo', 'items', 'species', 'moves', 'types', 'return ' + tpl)(
        evo, rr.items, rr.species, rr.moves, rr.types);
    } catch { return 'Special'; }
  });
}

// --- Per-generation diffs (Showdown mods) ----------------------------------
// Each gen's mod holds only what CHANGED relative to the next gen up; the app
// applies them cumulatively gen8 -> genN to reconstruct that gen's data.
const SPECIES_FIELDS = ['baseStats', 'types', 'abilities', 'prevo', 'evos', 'evoLevel', 'evoType', 'evoItem', 'evoCondition'];
const MOVE_FIELDS = ['basePower', 'accuracy', 'pp', 'type', 'category', 'priority', 'desc', 'shortDesc', 'isNonstandard', 'secondary', 'critRatio'];
async function loadMod(file, fields) {
  let src;
  try { src = read(file); } catch { return null; }
  if (src.length < 50 || src.startsWith('404')) return null;
  // The mod files are TS modules (with TS-only syntax inside battle callbacks),
  // so lean on Node's native type stripping instead of eval.
  const tmp = path.join(root, 'data/mods/.tmp-' + path.basename(file));
  fs.writeFileSync(tmp, src);
  let obj;
  try {
    const mod = await import(url.pathToFileURL(tmp).href);
    obj = mod.Pokedex || mod.Moves || mod.TypeChart || Object.values(mod)[0];
  } finally { fs.unlinkSync(tmp); }
  if (!obj) return null;
  const out = {};
  for (const id in obj) {
    const src2 = obj[id], dst = {};
    for (const f of fields || Object.keys(src2)) {
      if (src2[f] !== undefined && typeof src2[f] !== 'function') dst[f] = src2[f];
    }
    if (Object.keys(dst).length) out[id] = dst;
  }
  return Object.keys(out).length ? out : null;
}
const mods = {};
for (let g = 1; g <= 8; g++) {
  const dexMod = await loadMod(`data/mods/gen${g}-pokedex.ts`, SPECIES_FIELDS);
  const movesMod = await loadMod(`data/mods/gen${g}-moves.ts`, MOVE_FIELDS);
  const chartMod = await loadMod(`data/mods/gen${g}-typechart.ts`, ['damageTaken']);
  const m = {};
  if (dexMod) m.dex = dexMod;
  if (movesMod) m.moves = movesMod;
  if (chartMod) m.typechart = chartMod;
  if (Object.keys(m).length) mods[g] = m;
}

// --- Dex flavor text + genus (PokeAPI CSV dumps) ----------------------------
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); cell = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const vgGen = {};
for (const r of parseCSV(read('data/csv/version_groups.csv')).slice(1)) vgGen[r[0]] = +r[2];
const verGen = {};
for (const r of parseCSV(read('data/csv/versions.csv')).slice(1)) verGen[r[0]] = vgGen[r[1]];
const genus = {};
for (const r of parseCSV(read('data/csv/pokemon_species_names.csv')).slice(1)) {
  if (r[1] === '9') genus[r[0]] = r[3];
}
// flavor[num] = { g: genus, t: { gen: text } } — best (latest-version) text per gen
const flavor = {};
{
  const best = {}; // num -> gen -> [versionId, text]
  for (const r of parseCSV(read('data/csv/pokemon_species_flavor_text.csv')).slice(1)) {
    const [sid, vid, lang, text] = r;
    if (lang !== '9') continue;
    const gen = verGen[vid];
    if (!gen) continue;
    const b = (best[sid] = best[sid] || {});
    if (!b[gen] || +vid > b[gen][0]) b[gen] = [+vid, text];
  }
  for (const sid in best) {
    const t = {};
    for (const g in best[sid]) t[g] = best[sid][g][1].replace(/[\f\n\r­]+/g, ' ').replace(/ +/g, ' ').trim();
    flavor[sid] = { g: genus[sid] || '', t };
  }
}

// --- Built-in rom-hack dexes (scraped via ydarissep dex sites) --------------
const { default: convertYda } = await import('./convert-yda.mjs');
const hacks = {};
for (const [key, name] of [['unbound', 'Unbound'], ['rowe', 'R.O.W.E'], ['ie', 'Inclement Emerald']]) {
  const file = `data/hacks/${key}.json`;
  try {
    hacks[key] = { name, data: convertYda(JSON.parse(read(file))) };
    console.log(`hack ${name}: ${Object.keys(hacks[key].data.species).length} species, ${Object.keys(hacks[key].data.trainers).length} trainers`);
  } catch (e) { console.warn(`skipping hack ${name}: ${e.message}`); }
}

// --- Pokopia roster (scraped from Serebii's list pages) ---------------------
const dec = (s) => String(s).replace(/&eacute;/g, 'é').replace(/&Eacute;/g, 'É').replace(/&amp;/g, '&')
  .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
function parsePokopia(file, set) {
  let h;
  try { h = read(file); } catch { return []; }
  const out = [];
  for (const c of h.split('<td class="cen">#').slice(1)) {
    const n = parseInt(c);
    const slug = (c.match(/pokedex\/([a-z0-9]+)\.shtml/) || [])[1];
    const name = dec((c.match(/<u>([^<]+)<\/u>/) || [])[1] || '');
    const spec = dec((c.match(/specialty\/[a-z]+\.shtml"><u>([^<]+)<\/u>/) || [])[1] || '');
    if (n && slug && name) out.push({ n, name, slug, spec, set });
  }
  return out;
}
const pokopia = [
  ...parsePokopia('data/pokopia-available.html', 'base'),
  ...parsePokopia('data/pokopia-basin.html', 'basin'),
  ...parsePokopia('data/pokopia-event.html', 'event'),
];
console.log(`pokopia: ${pokopia.filter((x) => x.set === 'base').length} base, ${pokopia.filter((x) => x.set === 'basin').length} basin, ${pokopia.filter((x) => x.set === 'event').length} event`);

// habitat dex: list page for names/descriptions, detail pages for build
// requirements + which Pokémon each habitat attracts
const habitats = [];
try {
  const h = read('data/pokopia-habitats.html');
  const basinAt = h.indexOf('<a name="basin">'), eventAt = h.indexOf('<a name="event">');
  let pos = 0;
  for (const c of h.split('<td class="cen">#').slice(1)) {
    pos = h.indexOf('<td class="cen">#' + c.slice(0, 8), pos) + 1;
    const n = parseInt(c);
    const slug = (c.match(/habitatdex\/([a-z0-9-]+)\.shtml/) || [])[1];
    const name = dec((c.match(/<u>([^<]+)<\/u>/) || [])[1] || '');
    const desc = dec((c.match(/<td class="fooinfo">([^<]+)<\/td>\s*<\/tr>/) || [])[1] || '');
    if (!n || !slug || !name) continue;
    const set = eventAt >= 0 && pos > eventAt ? 'event' : basinAt >= 0 && pos > basinAt ? 'basin' : 'main';
    const entry = { n, slug, name, desc, set, reqs: [], mons: [] };
    try {
      const d = read(`data/pokopia-habitatdex/${slug}.html`);
      const reqSec = d.split('<h2>Requirements</h2>')[1]?.split('</table>')[0] || '';
      for (const m of reqSec.matchAll(/items\/[a-z0-9]+\.shtml"><u>([^<]+)<\/u><\/a><\/td>\s*<td class="fooinfo">(\d+)/g)) {
        entry.reqs.push({ name: dec(m[1]), qty: +m[2] });
      }
      const monSec = d.split('Available Pok')[1] || '';
      entry.mons = [...new Set([...monSec.matchAll(/pokedex\/([a-z0-9]+)\.shtml/g)].map((m) => m[1]))];
    } catch {}
    habitats.push(entry);
  }
} catch (e) { console.warn('habitats skipped:', e.message); }
console.log(`pokopia habitats: ${habitats.length} (${habitats.filter((x) => x.mons.length).length} with mon lists)`);

// crafting/cooking recipe dex
const crafting = [];
for (const [file, defaultCat] of [['data/pokopia-crafting.html', null], ['data/pokopia-cooking.html', 'Meals']]) {
  let h;
  try { h = read(file); } catch { continue; }
  const sections = h.split(/<h2>(?:<a name="[^"]*"><\/a>)?List of /).slice(1);
  for (const sec of sections) {
    const cat = defaultCat || dec(sec.split('</h2>')[0]).replace(/ cookable$/, '');
    for (const row of sec.split('<tr><td class="cen"><a href="items/').slice(1)) {
      const slug = (row.match(/^([a-z0-9]+)\.shtml/) || [])[1];
      const name = dec((row.match(/alt="([^"]+)"/) || [])[1] || '');
      if (!slug || !name) continue;
      const unlock = dec((row.match(/<td class="fooinfo">([\s\S]*?)<\/td>/) || [])[1] || '').slice(0, 120);
      const mats = [];
      for (const m of row.matchAll(/items\/[a-z0-9]+\.shtml"><u>([^<]+)<\/u><\/a> \* (\d+)/g)) {
        mats.push({ name: dec(m[1]), qty: +m[2] });
      }
      crafting.push({ slug, name, cat, unlock, mats });
    }
  }
}
console.log(`pokopia crafting: ${crafting.length} recipes in ${new Set(crafting.map((c) => c.cat)).size} categories`);

const payload = { dex, moves, learnsets, abilities, items, typechart, iconIdx, rr, mods, flavor, hacks,
  pokopia: { roster: pokopia, habitats, crafting } };
const json = JSON.stringify(payload);
const gz = zlib.gzipSync(json, { level: 9 });
const b64 = gz.toString('base64');
const icons = fs.readFileSync(path.join(root, 'data/icons.png')).toString('base64');
const itemicons = fs.readFileSync(path.join(root, 'data/itemicons.png')).toString('base64');

console.log(`payload: ${(json.length / 1e6).toFixed(2)}MB json -> ${(gz.length / 1024).toFixed(0)}KB gz`);

// --- Embedded renders payload (Pokémon HOME webp + forme pixel sprites) -----
function spriteMap(dir, ext) {
  const out = {};
  const p = path.join(root, 'build/sprite-cache', dir);
  if (!fs.existsSync(p)) return out;
  for (const f of fs.readdirSync(p)) {
    if (!f.endsWith(ext)) continue;
    out[f.slice(0, -ext.length)] = fs.readFileSync(path.join(p, f)).toString('base64');
  }
  return out;
}
const sprites = {
  home: spriteMap('webp', '.webp'),
  homeShiny: spriteMap('webp-shiny', '.webp'),
  gen5: spriteMap('gen5', '.png'),
  gen5Shiny: spriteMap('gen5-shiny', '.png'),
};
const spritesJson = JSON.stringify(sprites);
const spritesB64 = zlib.gzipSync(spritesJson, { level: 9 }).toString('base64');
console.log(`sprites: home ${Object.keys(sprites.home).length}/${Object.keys(sprites.homeShiny).length} shiny, gen5 formes ${Object.keys(sprites.gen5).length}/${Object.keys(sprites.gen5Shiny).length} -> ${(spritesB64.length / 1e6).toFixed(2)}MB b64`);

// --- Assemble --------------------------------------------------------------
// String.prototype.replace treats $ specially; always pass replacer functions.
const style = read('src/style.css');
const app = read('src/app.js');

const inner = read('src/body.html')
  .replace('/*__STYLE__*/', () => style)
  .replace('__ICONS_B64__', () => icons)
  .replace('__ITEMICONS_B64__', () => itemicons)
  .replace('__DATA_B64__', () => b64)
  .replace('__SPRITES_B64__', () => spritesB64)
  .replace('/*__APP__*/', () => app);

const standalone = read('src/shell.html').replace('<!--__BODY__-->', () => inner);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/UltimateDex.html'), standalone);
fs.writeFileSync(path.join(root, 'dist/artifact.html'), inner);
console.log(
  `dist/UltimateDex.html ${(standalone.length / 1e6).toFixed(2)}MB, dist/artifact.html ${(inner.length / 1e6).toFixed(2)}MB`
);
