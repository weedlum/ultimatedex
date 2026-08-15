(async function () {
'use strict';
const bootEl = document.getElementById('boot');
try {

// ============================== data =====================================
async function inflate(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).json();
}
const D = await inflate(document.getElementById('data-b64').textContent.trim());
// second payload: embedded renders — inflated in the background so boot stays fast
let SP = null;
const spReady = (async () => {
  try {
    const t = document.getElementById('sprites-b64');
    if (t && t.textContent.length > 100) SP = await inflate(t.textContent.trim());
  } catch {}
  if (!SP) SP = {};
})();
document.documentElement.style.setProperty(
  '--icons',
  "url('data:image/png;base64," + document.getElementById('icons-b64').textContent.trim() + "')"
);
document.documentElement.style.setProperty(
  '--itemicons',
  "url('data:image/png;base64," + document.getElementById('itemicons-b64').textContent.trim() + "')"
);

// ============================== constants ================================
const toID = (s) => ('' + s).toLowerCase().replace(/[^a-z0-9]/g, '');
const TYPES = ['Normal','Fire','Water','Grass','Electric','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
const TYPE_COLORS = {
  Normal:'#A8A77A',Fire:'#EE8130',Water:'#6390F0',Electric:'#E0B303',Grass:'#5CA935',Ice:'#69b8b4',
  Fighting:'#C22E28',Poison:'#A33EA1',Ground:'#c2a24c',Flying:'#8f75e0',Psychic:'#F95587',Bug:'#93a512',
  Rock:'#B6A136',Ghost:'#735797',Dragon:'#6F35FC',Dark:'#705746',Steel:'#8f8fad',Fairy:'#cf6d9d',
  Stellar:'#40B5A5','???':'#68A090'
};
// Pre-physical/special-split (gens 1-3): category is determined by the type.
const PHYS_TYPES = new Set(['Normal','Fighting','Flying','Ground','Rock','Bug','Ghost','Poison','Steel']);
const GEN_CAPS = [0,151,251,386,493,649,721,809,905,1025];
const MOVE_CAPS = [0,165,251,354,467,559,621,742,826,100000];
const STAT_KEYS = ['hp','atk','def','spa','spd','spe'];
const STAT_NAMES = {hp:'HP',atk:'Atk',def:'Def',spa:'SpA',spd:'SpD',spe:'Spe'};
const NATURES = ['Hardy','Lonely','Brave','Adamant','Naughty','Bold','Docile','Relaxed','Impish','Lax','Timid','Hasty','Serious','Jolly','Naive','Modest','Mild','Quiet','Bashful','Rash','Calm','Gentle','Sassy','Careful','Quirky'];
const NATURE_ORDER = ['atk','def','spe','spa','spd'];
function natureFx(name) {
  const i = NATURES.indexOf(name);
  if (i < 0) return null;
  const plus = NATURE_ORDER[Math.floor(i / 5)], minus = NATURE_ORDER[i % 5];
  return plus === minus ? null : { plus, minus };
}
const RR_MULT = { 0: 1, 1: 0, 5: 0.5, 20: 2 };
const OFF_MULT = { 0: 1, 1: 2, 2: 0.5, 3: 0 };

// name -> showdown id, for icon/sprite lookups from hack names
const nameToPsId = {};
for (const id in D.dex) nameToPsId[toID(D.dex[id].name)] = id;
function rrPsId(name) {
  let n = name, m;
  if ((m = name.match(/^Mega (.+?)( X| Y)?$/))) n = m[1] + '-Mega' + (m[2] ? '-' + m[2].trim() : '');
  else if ((m = name.match(/^Primal (.+)$/))) n = m[1] + '-Primal';
  else if ((m = name.match(/^Alolan (.+)$/))) n = m[1] + '-Alola';
  else if ((m = name.match(/^Galarian (.+)$/))) n = m[1] + '-Galar';
  else if ((m = name.match(/^Hisuian (.+)$/))) n = m[1] + '-Hisui';
  else if ((m = name.match(/^Paldean (.+)$/))) n = m[1] + '-Paldea';
  for (const c of [toID(n), toID(name)]) if (nameToPsId[c]) return c;
  return null;
}

// ============================== state / profiles =========================
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem('ud.' + k)); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ud.' + k, JSON.stringify(v)); } catch {} },
};

// custom rom-hack profiles live in IndexedDB (too big for localStorage)
let customs = {};
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('ultimatedex', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('profiles', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbAll() {
  const db = await idb();
  return new Promise((res, rej) => {
    const q = db.transaction('profiles').objectStore('profiles').getAll();
    q.onsuccess = () => res(q.result || []);
    q.onerror = () => rej(q.error);
  });
}
async function idbPut(rec) {
  const db = await idb();
  return new Promise((res, rej) => {
    const q = db.transaction('profiles', 'readwrite').objectStore('profiles').put(rec);
    q.onsuccess = res; q.onerror = () => rej(q.error);
  });
}
async function idbDel(id) {
  const db = await idb();
  return new Promise((res, rej) => {
    const q = db.transaction('profiles', 'readwrite').objectStore('profiles').delete(id);
    q.onsuccess = res; q.onerror = () => rej(q.error);
  });
}
// Never let a stalled IndexedDB (private mode, file://, Safari quirks) block boot.
try {
  const loaded = await Promise.race([idbAll(), new Promise((res) => setTimeout(() => res(null), 2000))]);
  if (loaded) for (const p of loaded) customs[p.id] = p;
} catch {}

const state = {
  tab: 'dex',
  profile: store.get('profile', 'nat'),
  teamOpen: null,
  f: {
    dex: { types: [], sort: 'num', dir: 1, q: '' },
    moves: { types: [], cat: null, sort: 'name', dir: 1, q: '' },
    abil: { q: '' },
    items: { q: '', cat: null },
    trainers: { q: '' },
    habitats: { q: '' },
  },
};
function isHack(prof) { prof = prof ?? state.profile; return prof === 'rr' || String(prof).startsWith('h:') || String(prof).startsWith('b:'); }
function HD(prof) {
  prof = prof ?? state.profile;
  if (prof === 'rr') return D.rr;
  if (String(prof).startsWith('b:')) { const h = (D.hacks || {})[prof.slice(2)]; return h ? h.data : null; }
  return customs[prof] ? customs[prof].data : null;
}
if (isHack(state.profile) && !HD(state.profile)) state.profile = 'nat';
function profGen(prof) { const p = prof ?? state.profile; return +p >= 1 && +p <= 9 ? +p : 9; }
function profiles() {
  return [
    ...[1,2,3,4,5,6,7,8,9].map((g) => ({ id: String(g), label: 'Gen ' + g, group: 'Official' })),
    { id: 'nat', label: 'National Dex', group: 'Official' },
    { id: 'pokopia', label: 'Pokopia', group: 'Official' },
    { id: 'rr', label: 'Radical Red', group: 'Rom-hacks' },
    ...Object.entries(D.hacks || {}).map(([k, h]) => ({ id: 'b:' + k, label: h.name, group: 'Rom-hacks' })),
    ...Object.values(customs).map((p) => ({ id: p.id, label: p.name, group: 'Rom-hacks' })),
  ];
}
function profLabel(p) { return (profiles().find((x) => x.id === (p ?? state.profile)) || {}).label || p; }
function typesFor(prof) {
  prof = prof ?? state.profile;
  if (isHack(prof)) {
    const hd = HD(prof);
    return hd ? Object.values(hd.types).map((t) => t.name).filter((n) => n && n !== '???' && n !== 'Mystery') : TYPES;
  }
  const g = profGen(prof);
  if (g === 1) return TYPES.filter((t) => !['Dark', 'Steel', 'Fairy'].includes(t));
  if (g < 6) return TYPES.filter((t) => t !== 'Fairy');
  return TYPES;
}

// ---------- per-generation data (Showdown mod diff chains) ----------
const modCache = {};
function modsFor(prof) {
  prof = prof ?? state.profile;
  if (isHack(prof)) return null;
  const g = profGen(prof);
  if (g >= 9 || (prof ?? state.profile) === 'nat') return null;
  if (modCache[g]) return modCache[g];
  const acc = { dex: {}, moves: {}, typechart: {} };
  for (let x = 8; x >= g; x--) { // lower gens applied later so they win
    const m = D.mods[x];
    if (!m) continue;
    for (const sec in acc) {
      const src = m[sec];
      if (!src) continue;
      for (const id in src) acc[sec][id] = Object.assign({}, acc[sec][id], src[id]);
    }
  }
  return (modCache[g] = acc);
}

// ============================== records ==================================
const abilityByName = {};
for (const id in D.abilities) abilityByName[D.abilities[id].name] = id;

function offSpeciesRec(id, prof) {
  prof = prof ?? state.profile;
  const base = D.dex[id];
  if (!base) return null;
  const ov = (modsFor(prof) || {}).dex;
  const e = ov && ov[id] ? Object.assign({}, base, ov[id]) : base;
  const gen = profGen(prof);
  const abilities = [];
  if (gen >= 3) {
    for (const slot in e.abilities) {
      if (slot === 'H' && gen < 5) continue;
      const nm = e.abilities[slot];
      const a = D.abilities[toID(nm)] || {};
      abilities.push({ name: nm, hidden: slot === 'H', desc: a.shortDesc || a.desc || '' });
    }
  }
  const bstKeys = gen === 1 ? ['hp', 'atk', 'def', 'spa', 'spe'] : STAT_KEYS;
  const bst = bstKeys.reduce((s, k) => s + e.baseStats[k], 0);
  return { key: id, psid: id, name: e.name, num: e.num, dexno: '#' + String(e.num).padStart(4, '0'),
    types: e.types, stats: e.baseStats, bst, abilities, src: 'off', prof, e };
}
function hackSpeciesRec(id, prof) {
  prof = prof ?? state.profile;
  const hd = HD(prof);
  const s = hd && hd.species[id];
  if (!s || !s.name) return null;
  let types = (s.type || []).map((t) => (hd.types[t] || {}).name).filter(Boolean);
  if (types.length === 2 && types[0] === types[1]) types = [types[0]];
  const st = { hp: s.stats[0], atk: s.stats[1], def: s.stats[2], spe: s.stats[3], spa: s.stats[4], spd: s.stats[5] };
  const abilities = [];
  (s.abilities || []).forEach((a, i) => {
    const aid = Array.isArray(a) ? a[0] : a;
    if (!aid) return;
    const ab = hd.abilities[aid];
    if (!ab) return;
    const name = ab.names ? ab.names[0] : ab.name;
    if (abilities.some((x) => x.name === name)) return;
    abilities.push({ name, hidden: i === 2, desc: ab.description || '', hackId: aid });
  });
  const bst = STAT_KEYS.reduce((t, k) => t + st[k], 0);
  return { key: '#' + id, hackId: +id, psid: rrPsId(s.name), name: s.name, num: s.dexID,
    dexno: '#' + String(s.dexID).padStart(3, '0'), types, stats: st, bst, abilities,
    sprite: hd.sprites ? hd.sprites[id] : null, src: 'hack', prof, s };
}
function getSpecies(key, prof) {
  key = String(key);
  if (key[0] === '#') return hackSpeciesRec(key.slice(1), prof);
  if (/^r\d+$/.test(key) && isHack(prof)) return hackSpeciesRec(key.slice(1), prof); // legacy team keys
  return offSpeciesRec(key, prof);
}
function offAvailable(e, gen) {
  if (e.isCosmeticForme || !e.baseStats || !(e.num >= 1)) return false;
  if (['CAP', 'Custom', 'Pokestar', 'Future', 'LGPE'].includes(e.isNonstandard)) return false;
  if (!gen) return true; // national
  const f = e.forme || '';
  if (/Mega|Primal/.test(f)) return gen === 6 || gen === 7;
  if (/Gmax/.test(f)) return gen === 8;
  let fg = 0;
  if (/Alola|Starter/.test(f)) fg = 7;
  else if (/Galar/.test(f)) fg = 8;
  else if (/Hisui/.test(f)) fg = 8;
  else if (/Paldea/.test(f)) fg = 9;
  return e.num <= GEN_CAPS[gen] && fg <= gen;
}
let listCache = {};
function speciesList(prof) {
  prof = prof ?? state.profile;
  const ck = 's:' + prof;
  if (listCache[ck]) return listCache[ck];
  let out = [];
  if (isHack(prof)) {
    const hd = HD(prof);
    if (hd) for (const id in hd.species) { const r = hackSpeciesRec(id, prof); if (r) out.push(r); }
    out.sort((a, b) => a.num - b.num || (a.s.order || 0) - (b.s.order || 0));
  } else if (prof === 'pokopia') {
    const OFFSET = { base: 0, basin: 10000, event: 20000 };
    const LABEL = { base: '#', basin: 'Basin #', event: 'Event #' };
    const seen = new Map();
    for (const e of (D.pokopia || {}).roster || []) {
      const psid = D.dex[e.slug] ? e.slug : rrPsId(e.name);
      if (!psid || !D.dex[psid] || !D.dex[psid].baseStats) continue;
      if (seen.has(psid)) { seen.get(psid).pokopia.sets.push(e.set); continue; }
      const r = offSpeciesRec(psid, prof);
      if (!r) continue;
      r.num = OFFSET[e.set] + e.n;
      r.dexno = LABEL[e.set] + String(e.n).padStart(3, '0');
      r.pokopia = { spec: e.spec, sets: [e.set], slug: e.slug };
      seen.set(psid, r);
      out.push(r);
    }
    out.sort((a, b) => a.num - b.num);
  } else {
    const gen = prof === 'nat' ? 0 : +prof;
    for (const id in D.dex) { const e = D.dex[id]; if (offAvailable(e, gen)) out.push(offSpeciesRec(id, prof)); }
    out.sort((a, b) => a.num - b.num || (a.e.forme ? 1 : 0) - (b.e.forme ? 1 : 0) || a.name.localeCompare(b.name));
  }
  return (listCache[ck] = out);
}

function offMoveRec(id, prof) {
  prof = prof ?? state.profile;
  const base = D.moves[id];
  if (!base) return null;
  const ov = (modsFor(prof) || {}).moves;
  const m = ov && ov[id] ? Object.assign({}, base, ov[id]) : base;
  let cat = m.category;
  if (profGen(prof) <= 3 && cat !== 'Status') cat = PHYS_TYPES.has(m.type) ? 'Physical' : 'Special';
  return { key: id, name: m.name, type: m.type, cat, power: m.basePower || 0,
    acc: m.accuracy === true ? '—' : m.accuracy, pp: m.pp, priority: m.priority,
    desc: m.shortDesc || m.desc || '', longDesc: m.desc || m.shortDesc || '', src: 'off', m };
}
function hackMoveRec(id, prof) {
  prof = prof ?? state.profile;
  const hd = HD(prof);
  id = typeof id === 'object' ? id.ID : id;
  const m = hd && hd.moves[id];
  if (!m || !m.name || m.ID === 0) return null;
  return { key: '#' + id, hackId: +id, name: m.name, type: (hd.types[m.type] || {}).name || '???',
    cat: (hd.splits || {})[m.split] || '—', power: m.power || 0, acc: m.accuracy || '—', pp: m.pp,
    priority: m.priority, desc: m.description || '', longDesc: m.description || '', src: 'hack', m };
}
function getMove(key, prof) {
  key = String(key);
  if (key[0] === '#') return hackMoveRec(key.slice(1), prof);
  if (/^r\d+$/.test(key) && isHack(prof)) return hackMoveRec(key.slice(1), prof);
  return offMoveRec(key, prof);
}
function movesList(prof) {
  prof = prof ?? state.profile;
  const ck = 'm:' + prof;
  if (listCache[ck]) return listCache[ck];
  let out = [];
  if (isHack(prof)) {
    const hd = HD(prof);
    if (hd) for (const id in hd.moves) { const r = hackMoveRec(id, prof); if (r) out.push(r); }
  } else {
    const gen = profGen(prof);
    const nat = prof === 'nat' || prof === 'pokopia';
    for (const id in D.moves) {
      const m = D.moves[id];
      if (['CAP', 'Custom', 'LGPE'].includes(m.isNonstandard)) continue;
      if (m.isMax || m.isZ) continue;
      if (!nat) {
        if (m.num > MOVE_CAPS[gen] || m.num < 1) continue;
        if (gen === 9 && m.isNonstandard === 'Past') continue;
      } else if (m.num < 1) continue;
      out.push(offMoveRec(id, prof));
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return (listCache[ck] = out);
}

function offAbilityRec(id) {
  const a = D.abilities[id];
  if (!a || a.num < 1) return null;
  return { key: id, name: a.name, desc: a.shortDesc || a.desc || '', longDesc: a.desc || a.shortDesc || '', rating: a.rating, src: 'off' };
}
function hackAbilityRec(id, prof) {
  const hd = HD(prof);
  const a = hd && hd.abilities[id];
  if (!a || !a.ID) return null;
  return { key: '#' + id, hackId: +id, name: a.names ? a.names[0] : a.name, desc: a.description || '', longDesc: a.description || '', src: 'hack' };
}
function getAbility(key, prof) {
  key = String(key);
  return key[0] === '#' ? hackAbilityRec(key.slice(1), prof) : offAbilityRec(key);
}
function abilitiesList(prof) {
  prof = prof ?? state.profile;
  const ck = 'a:' + prof;
  if (listCache[ck]) return listCache[ck];
  const out = [];
  if (isHack(prof)) {
    const hd = HD(prof);
    if (hd) for (const id in hd.abilities) { const r = hackAbilityRec(id, prof); if (r) out.push(r); }
  } else { for (const id in D.abilities) { const r = offAbilityRec(id); if (r) out.push(r); } }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return (listCache[ck] = out);
}

function offItemRec(id) {
  const it = D.items[id];
  if (!it || it.isNonstandard === 'CAP' || it.isNonstandard === 'Custom') return null;
  return { key: id, name: it.name, desc: it.shortDesc || it.desc || '', longDesc: it.desc || it.shortDesc || '', gen: it.gen, src: 'off' };
}
function hackItemRec(id, prof) {
  const hd = HD(prof);
  const it = hd && hd.items[id];
  if (!it || !it.ID || !it.name || it.name === '????????') return null;
  return { key: '#' + id, hackId: +id, name: it.name, desc: it.description || '', longDesc: it.description || '', src: 'hack' };
}
function getItem(key, prof) {
  key = String(key);
  return key[0] === '#' ? hackItemRec(key.slice(1), prof) : offItemRec(key);
}
function itemsList(prof) {
  prof = prof ?? state.profile;
  const ck = 'i:' + prof;
  if (listCache[ck]) return listCache[ck];
  const out = [];
  if (isHack(prof)) {
    const hd = HD(prof);
    if (hd) for (const id in hd.items) { const r = hackItemRec(id, prof); if (r) out.push(r); }
  } else {
    const gen = profGen(prof);
    for (const id in D.items) { const r = offItemRec(id); if (r && (!r.gen || r.gen <= gen)) out.push(r); }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return (listCache[ck] = out);
}

// ---------- learnsets ----------
function offLearnset(psid, prof) {
  const gen = profGen(prof), nat = (prof ?? state.profile) === 'nat';
  let id = psid, ls = null, guard = 0;
  while (id && guard++ < 6) {
    const l = D.learnsets[id];
    if (l && l.learnset) { ls = l.learnset; break; }
    const e = D.dex[id];
    const nb = e && (e.changesFrom || e.baseSpecies);
    const nid = nb ? toID(Array.isArray(nb) ? nb[0] : nb) : null;
    if (!nid || nid === id) break;
    id = nid;
  }
  const out = { level: [], machine: [], tutor: [], egg: [], other: [] };
  if (!ls) return out;
  for (const mid in ls) {
    const mv = offMoveRec(mid, prof);
    if (!mv) continue;
    let codes = ls[mid];
    if (nat) { const mx = Math.max(...codes.map((c) => +c[0])); codes = codes.filter((c) => +c[0] === mx); }
    else codes = codes.filter((c) => +c[0] === gen);
    if (!codes.length) continue;
    const lvls = new Set(); let M = false, T = false, E = false, other = false;
    for (const c of codes) {
      const k = c[1];
      if (k === 'L') lvls.add(parseInt(c.slice(2)) || 1);
      else if (k === 'M') M = true;
      else if (k === 'T') T = true;
      else if (k === 'E') E = true;
      else other = true;
    }
    for (const lv of lvls) out.level.push({ lvl: lv, mv });
    if (M) out.machine.push(mv);
    if (T) out.tutor.push(mv);
    if (E) out.egg.push(mv);
    if (!lvls.size && !M && !T && !E && other) out.other.push(mv);
  }
  out.level.sort((a, b) => a.lvl - b.lvl || a.mv.name.localeCompare(b.mv.name));
  for (const k of ['machine', 'tutor', 'egg', 'other']) out[k].sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
function hackLearnset(hackId, prof) {
  const hd = HD(prof);
  const s = hd && hd.species[hackId];
  const out = { level: [], machine: [], tutor: [], egg: [], other: [] };
  if (!s) return out;
  for (const [mid, lvl] of s.levelupMoves || []) { const mv = hackMoveRec(mid, prof); if (mv) out.level.push({ lvl, mv }); }
  out.level.sort((a, b) => a.lvl - b.lvl);
  for (const tm of s.tmMoves || []) { const mv = hackMoveRec(hd.tmMoves[tm], prof); if (mv) out.machine.push(mv); }
  for (const t of s.tutorMoves || []) { const mv = hackMoveRec(hd.tutorMoves[t], prof); if (mv) out.tutor.push(mv); }
  for (const mid of s.eggMoves || []) { const mv = hackMoveRec(mid, prof); if (mv) out.egg.push(mv); }
  for (const k of ['machine', 'tutor', 'egg']) out[k].sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
function getLearnset(rec, prof) { return rec.src === 'hack' ? hackLearnset(rec.hackId, rec.prof ?? prof) : offLearnset(rec.psid, prof); }
function legalMoves(rec, prof) {
  const ls = getLearnset(rec, prof);
  const seen = new Map();
  for (const { mv } of ls.level) seen.set(mv.key, mv);
  for (const k of ['machine', 'tutor', 'egg', 'other']) for (const mv of ls[k]) seen.set(mv.key, mv);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function learnedBy(moveRec, prof) {
  prof = prof ?? state.profile;
  const out = [];
  if (moveRec.src === 'hack') {
    const hd = HD(prof);
    if (!hd) return out;
    const mid = moveRec.hackId;
    const idOf = (v) => (typeof v === 'object' ? v.ID : v);
    const tmNos = Object.keys(hd.tmMoves || {}).filter((k) => idOf(hd.tmMoves[k]) === mid).map(Number);
    const tutNos = Object.keys(hd.tutorMoves || {}).filter((k) => idOf(hd.tutorMoves[k]) === mid).map(Number);
    for (const rec of speciesList(prof)) {
      const s = rec.s;
      if ((s.levelupMoves || []).some((x) => x[0] === mid) ||
          (s.eggMoves || []).includes(mid) ||
          (s.tmMoves || []).some((t) => tmNos.includes(t)) ||
          (s.tutorMoves || []).some((t) => tutNos.includes(t))) out.push(rec);
    }
  } else {
    for (const rec of speciesList(prof)) {
      const ls = D.learnsets[rec.psid];
      if (ls && ls.learnset && ls.learnset[moveRec.key]) out.push(rec);
    }
  }
  return out;
}
function withAbility(abRec, prof) {
  prof = prof ?? state.profile;
  return speciesList(prof).filter((r) => r.abilities.some((a) => a.name === abRec.name));
}

// ---------- type matchups ----------
function defenseProfile(rec, prof) {
  prof = rec.prof ?? prof ?? state.profile;
  const out = {};
  if (rec.src === 'hack') {
    const hd = HD(prof);
    const defIdx = rec.s.type.map(Number);
    for (const aid in hd.types) {
      const t = hd.types[aid];
      if (!t.name || !t.matchup) continue;
      let mult = 1;
      for (const d of new Set(defIdx)) mult *= RR_MULT[t.matchup[d]] ?? 1;
      out[t.name] = mult;
    }
  } else {
    const chartOv = (modsFor(prof) || {}).typechart;
    for (const atk of typesFor(prof)) {
      let mult = 1;
      for (const def of rec.types) {
        const tid = toID(def);
        let taken = (D.typechart[tid] || {}).damageTaken || {};
        if (chartOv && chartOv[tid] && chartOv[tid].damageTaken) taken = Object.assign({}, taken, chartOv[tid].damageTaken);
        mult *= OFF_MULT[taken[atk]] ?? 1;
      }
      out[atk] = mult;
    }
  }
  return out;
}

// ---------- flavor / game-specific info ----------
function natNumOf(rec) {
  const e = rec.psid && D.dex[rec.psid];
  return e ? e.num : rec.src === 'off' ? rec.num : null;
}
function flavorFor(rec, prof) {
  const num = natNumOf(rec);
  const f = num != null && D.flavor[num];
  if (!f) return null;
  const g = profGen(prof);
  let text = null, fromGen = null;
  for (let x = g; x >= 1 && !text; x--) if (f.t[x]) { text = f.t[x]; fromGen = x; }
  if (!text) for (let x = g + 1; x <= 9; x++) if (f.t[x]) { text = f.t[x]; fromGen = x; break; }
  return text ? { genus: f.g, text, fromGen } : (f.g ? { genus: f.g, text: null, fromGen: null } : null);
}
function flavorAll(rec) {
  const num = natNumOf(rec);
  const f = num != null && D.flavor[num];
  if (!f) return [];
  const groups = [];
  for (let g = 1; g <= 9; g++) {
    const t = f.t[g];
    if (!t) continue;
    const last = groups[groups.length - 1];
    if (last && last.text === t) last.gens.push(g);
    else groups.push({ gens: [g], text: t });
  }
  return groups;
}
function hackChanges(rec) {
  if (!rec.psid) return null;
  const off = offSpeciesRec(rec.psid, 'nat');
  if (!off) return null;
  const diffs = [];
  for (const k of STAT_KEYS) if (off.stats[k] !== rec.stats[k]) {
    const d = rec.stats[k] - off.stats[k];
    diffs.push(STAT_NAMES[k] + ' ' + off.stats[k] + ' → ' + rec.stats[k] + ' (' + (d > 0 ? '+' : '') + d + ')');
  }
  if (off.types.join() !== rec.types.join()) diffs.push('Type ' + off.types.join('/') + ' → ' + rec.types.join('/'));
  const oa = off.abilities.map((a) => a.name).sort().join(', ');
  const ra = rec.abilities.map((a) => a.name).sort().join(', ');
  if (oa !== ra) diffs.push('Abilities: ' + (ra || '—') + ' (was ' + (oa || '—') + ')');
  return diffs.length ? diffs : null;
}

// single attacking-type vs single defending-type multiplier in the active ruleset
function atkMult(atkType, defType, prof) {
  prof = prof ?? state.profile;
  if (isHack(prof)) {
    const hd = HD(prof);
    if (!hd) return 1;
    const ai = Object.keys(hd.types).find((k) => hd.types[k].name === atkType);
    const di = Object.keys(hd.types).find((k) => hd.types[k].name === defType);
    if (ai == null || di == null || !hd.types[ai].matchup) return 1;
    return RR_MULT[hd.types[ai].matchup[di]] ?? 1;
  }
  const tid = toID(defType);
  let taken = (D.typechart[tid] || {}).damageTaken || {};
  const chartOv = (modsFor(prof) || {}).typechart;
  if (chartOv && chartOv[tid] && chartOv[tid].damageTaken) taken = Object.assign({}, taken, chartOv[tid].damageTaken);
  return OFF_MULT[taken[atkType]] ?? 1;
}

// ---------- evolutions ----------
function offEvoText(e) {
  const c = e.evoCondition ? ' ' + e.evoCondition : '';
  switch (e.evoType) {
    case 'trade': return 'Trade' + (e.evoItem ? ' holding ' + e.evoItem : '') + c;
    case 'useItem': return 'Use ' + e.evoItem + c;
    case 'levelMove': return 'Level up knowing ' + e.evoMove + c;
    case 'levelExtra': return 'Level up' + c;
    case 'levelFriendship': return 'High Friendship' + c;
    case 'levelHold': return 'Level up holding ' + e.evoItem + c;
    case 'other': return e.evoCondition || 'Special';
    default: return e.evoLevel ? 'Level ' + e.evoLevel : (e.evoCondition || 'Special');
  }
}
function evoChain(rec, prof) {
  if (rec.src === 'hack') {
    const p = rec.prof;
    let rootId = rec.s.ancestor || rec.hackId;
    const hd = HD(p);
    if (!hd.species[rootId]) rootId = rec.hackId;
    return {
      root: hackSpeciesRec(rootId, p),
      kids(r) {
        return (r.s.evolutions || []).map((evo, i) => {
          const target = hackSpeciesRec(evo[2], p);
          return target ? { rec: target, cond: (r.s.evoTexts || [])[i] || 'Special' } : null;
        }).filter(Boolean);
      },
    };
  }
  let e = rec.e, guard = 0;
  while (e.prevo && guard++ < 6) { const p = D.dex[toID(e.prevo)]; if (!p) break; e = p; }
  return {
    root: offSpeciesRec(toID(e.name), prof),
    kids(r) {
      return (r.e.evos || []).map((nm) => {
        const t = offSpeciesRec(toID(nm), prof);
        return t ? { rec: t, cond: offEvoText(t.e) } : null;
      }).filter(Boolean);
    },
  };
}

// ---------- hack encounters ----------
const encCache = {};
function hackEncounters(hackId, prof) {
  prof = prof ?? state.profile;
  if (!encCache[prof]) {
    const idx = {};
    const hd = HD(prof);
    for (const area of (hd && hd.areas) || []) {
      for (const k in area) {
        if (!k.startsWith('wild-')) continue;
        const method = k.slice(5).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
        for (const slot in area[k]) {
          for (const ent of area[k][slot]) {
            const [sid, lo, hi, rate] = ent;
            (idx[sid] = idx[sid] || []).push({ area: area.name, method, lo, hi, rate });
          }
        }
      }
    }
    for (const sid in idx) {
      const merged = {};
      for (const x of idx[sid]) {
        const key = x.area + '|' + x.method;
        if (!merged[key]) merged[key] = x;
        else { merged[key].lo = Math.min(merged[key].lo, x.lo); merged[key].hi = Math.max(merged[key].hi, x.hi); }
      }
      idx[sid] = Object.values(merged);
    }
    encCache[prof] = idx;
  }
  return encCache[prof][hackId] || [];
}

// ---------- trainers ----------
function trainersFor(prof) {
  prof = prof ?? state.profile;
  const hd = HD(prof);
  if (!hd || !hd.trainers) return [];
  const ck = 't:' + prof;
  if (listCache[ck]) return listCache[ck];
  const out = Object.values(hd.trainers).filter((t) => t && t.name)
    .map((t) => {
      const modes = ['normal', 'hardcore'].filter((m) => Array.isArray(t[m]) && t[m].length);
      return modes.length ? { t, modes } : null;
    }).filter(Boolean);
  out.sort((a, b) => (a.t.ID || 0) - (b.t.ID || 0));
  return (listCache[ck] = out);
}

// ============================== teams ====================================
let teams = store.get('teams', []);
function saveTeams() { store.set('teams', teams); }
function newTeam() {
  teams.push({ name: 'New Team', profile: state.profile, mons: [null, null, null, null, null, null] });
  saveTeams();
  return teams.length - 1;
}
const EV_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
function calcStat(k, base, iv, ev, lvl, nature) {
  iv = iv ?? 31; ev = ev ?? 0;
  const core = Math.floor((2 * base + iv + Math.floor(ev / 4)) * lvl / 100);
  if (k === 'hp') return base === 1 ? 1 : core + lvl + 10;
  let v = core + 5;
  const fx = natureFx(nature);
  if (fx) { if (fx.plus === k) v = Math.floor(v * 1.1); else if (fx.minus === k) v = Math.floor(v * 0.9); }
  return v;
}
function exportShowdown(team) {
  const lines = [];
  for (const mon of team.mons) {
    if (!mon) continue;
    const rec = getSpecies(mon.sp, team.profile);
    if (!rec) continue;
    let head = rec.name;
    if (mon.item) head += ' @ ' + mon.item;
    lines.push(head);
    if (mon.ability) lines.push('Ability: ' + mon.ability);
    if (mon.shiny) lines.push('Shiny: Yes');
    if (mon.level && mon.level !== 100) lines.push('Level: ' + mon.level);
    const evs = EV_ORDER.filter((k) => mon.evs && mon.evs[k] > 0).map((k) => mon.evs[k] + ' ' + STAT_NAMES[k]);
    if (evs.length) lines.push('EVs: ' + evs.join(' / '));
    if (mon.nature) lines.push(mon.nature + ' Nature');
    const ivs = EV_ORDER.filter((k) => mon.ivs && mon.ivs[k] != null && mon.ivs[k] !== 31).map((k) => mon.ivs[k] + ' ' + STAT_NAMES[k]);
    if (ivs.length) lines.push('IVs: ' + ivs.join(' / '));
    for (const mk of mon.moves) {
      if (!mk) continue;
      const mv = getMove(mk, team.profile);
      if (mv) lines.push('- ' + mv.name);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

// ============================== DOM helpers ==============================
const app = document.getElementById('app');
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'value') n.value = v;
    else n.setAttribute(k, v);
  }
  for (const c of kids.flat(9)) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : String(c));
  }
  return n;
}
function iconIndexFor(rec) {
  const psid = rec.psid;
  if (psid) {
    if (D.iconIdx[psid] != null) return D.iconIdx[psid];
    const e = D.dex[psid];
    if (e) {
      if (!e.forme && e.num > 0) return e.num;
      const base = e.baseSpecies && D.dex[toID(e.baseSpecies)];
      if (base && base.num > 0) return base.num;
      if (e.num > 0) return e.num;
    }
  }
  return rec.src === 'off' && rec.num > 0 ? rec.num : 0;
}
function iconEl(rec, scale) {
  if (rec.sprite && !rec.psid) { // fakemon from an imported hack: use its own sprite
    const img = el('img', { class: 'picon', src: rec.sprite, alt: '', style: 'object-fit:contain' });
    if (scale) img.style.transform = `scale(${scale})`;
    return img;
  }
  const idx = iconIndexFor(rec);
  const d = el('div', { class: 'picon' });
  d.style.backgroundPosition = `-${(idx % 12) * 40}px -${Math.floor(idx / 12) * 30}px`;
  if (scale) d.style.transform = `scale(${scale})`;
  return d;
}
function spriteFileId(psid) {
  const e = D.dex[psid];
  // Showdown sprite files use base-forme naming: "charizard-megax.png"
  return e && e.forme ? toID(e.baseSpecies) + '-' + toID(e.forme) : psid;
}
function spriteUrls(rec, shiny) {
  const urls = [];
  if (rec.sprite && !shiny) urls.push(rec.sprite);
  const psid = rec.psid;
  if (psid) {
    const e = D.dex[psid];
    const fid = spriteFileId(psid);
    if (e && !e.forme && e.num > 0) {
      // Pokémon HOME official 3D renders (base forms; PokeAPI hosts by dex number)
      urls.push('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/' + (shiny ? 'shiny/' : '') + e.num + '.png');
    }
    // Showdown animated 3D model sprites (cover alternate formes + shiny)
    urls.push('https://play.pokemonshowdown.com/sprites/' + (shiny ? 'ani-shiny' : 'ani') + '/' + fid + '.gif');
    urls.push('https://play.pokemonshowdown.com/sprites/' + (shiny ? 'gen5-shiny' : 'gen5') + '/' + fid + '.png');
  }
  if (rec.sprite && shiny) urls.push(rec.sprite);
  return urls;
}
function embeddedSprite(rec, shiny) {
  if (!SP) return null;
  const psid = rec.psid;
  const e = psid && D.dex[psid];
  if (e && !e.forme && e.num > 0) {
    const m = (shiny ? SP.homeShiny : SP.home) || {};
    if (m[e.num]) return 'data:image/webp;base64,' + m[e.num];
  }
  if (psid) {
    const m = (shiny ? SP.gen5Shiny : SP.gen5) || {};
    const fid = spriteFileId(psid);
    if (m[fid]) return 'data:image/png;base64,' + m[fid];
  }
  if (rec.sprite && !shiny) return rec.sprite;
  return null;
}
function spriteEl(rec, shiny) {
  const holder = el('div', { class: 'art' });
  const show = () => {
    const urls = spriteUrls(rec, shiny);
    const emb = embeddedSprite(rec, shiny);
    if (emb) {
      // embedded render first (instant + works offline/hosted), then try to
      // upgrade to the full-resolution remote version
      const img = el('img', { alt: rec.name, src: emb });
      holder.append(img);
      if (urls.length) {
        const up = new Image();
        up.onload = () => { img.src = up.src; };
        up.src = urls[0];
      }
      return;
    }
    (function tryAt(i) {
      if (i >= urls.length) { holder.textContent = ''; holder.append(iconEl(rec, 2)); return; }
      const img = el('img', { alt: rec.name });
      img.onerror = () => tryAt(i + 1);
      img.src = urls[i];
      holder.textContent = '';
      holder.append(img);
    })(0);
  };
  if (SP !== null) show(); else spReady.then(show);
  return holder;
}
function itemIconEl(nameOrRec) {
  const name = typeof nameOrRec === 'string' ? nameOrRec : nameOrRec.name;
  const rec = typeof nameOrRec === 'string' ? null : nameOrRec;
  let n = rec && rec.src === 'off' ? (D.items[rec.key] || {}).spritenum : null;
  if (n == null) n = (D.items[toID(name)] || {}).spritenum; // hack items: match by name
  const d = el('div', { class: 'iicon' });
  if (n == null) d.style.visibility = 'hidden';
  else d.style.backgroundPosition = `-${(n % 16) * 24}px -${Math.floor(n / 16) * 24}px`;
  return d;
}
function typeBadge(t) { return el('span', { class: 'type', style: 'background:' + (TYPE_COLORS[t] || '#68A090') }, t); }
function typeRow(types) { return el('div', { class: 'types' }, types.map(typeBadge)); }
function chunkList(container, items, renderItem, chunk = 80) {
  let i = 0;
  const sentinel = el('div', { style: 'height:1px;grid-column:1/-1' });
  container.append(sentinel);
  const obs = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) more(); }, { rootMargin: '800px' });
  function more() {
    const frag = document.createDocumentFragment();
    const end = Math.min(items.length, i + chunk);
    for (; i < end; i++) frag.append(renderItem(items[i]));
    container.insertBefore(frag, sentinel);
    if (i >= items.length) { obs.disconnect(); sentinel.remove(); }
  }
  obs.observe(sentinel);
  more();
}

// ---------- sheets (detail overlays) ----------
const sheetStack = [];
function openSheet(title, build) {
  const body = el('main');
  const panel = el('div', { class: 'panel' },
    el('header', {},
      el('div', { class: 'hrow' },
        el('div', { class: 'htitle' },
          el('button', { class: 'back', onclick: () => closeSheet(sheet) }, '‹ Back'),
          el('span', {}, title)),
        el('button', { class: 'back', title: 'Back to the list', onclick: () => closeAllSheets() }, '✕'))),
    body);
  const sheet = el('div', { class: 'sheet', onclick: (ev) => { if (ev.target === sheet) closeSheet(sheet); } }, panel);
  document.body.append(sheet);
  sheetStack.push(sheet);
  build(body, sheet);
  return sheet;
}
function closeSheet(sheet) {
  const i = sheetStack.indexOf(sheet);
  if (i >= 0) sheetStack.splice(i, 1);
  sheet.remove();
}
function closeAllSheets() { while (sheetStack.length) sheetStack.pop().remove(); }
function pickerSheet(title, items, onPick, extras) {
  openSheet(title, (body, sheet) => {
    const list = el('div', { class: 'list' });
    const search = el('input', { type: 'search', placeholder: 'Search…', autocomplete: 'off',
      oninput: () => refresh(search.value) });
    sheet.querySelector('header').append(el('div', { class: 'searchbar' }, el('span', { class: 'icon' }, '🔎'), search));
    body.append(list);
    function refresh(q) {
      list.textContent = '';
      q = toID(q || '');
      const f = q ? items.filter((it) => toID(it.label).includes(q)) : items;
      if (extras && !q) for (const ex of extras) list.append(
        el('button', { class: 'row', onclick: () => { onPick(ex.value); closeSheet(sheet); } },
          el('div', { class: 'body' }, el('div', { class: 'name muted' }, ex.label))));
      chunkList(list, f, (it) =>
        el('button', { class: 'row', onclick: () => { onPick(it.value ?? it); closeSheet(sheet); } },
          it.rec ? iconEl(it.rec) : (it.icon ? it.icon() : null),
          el('div', { class: 'body' },
            el('div', { class: 'name' }, it.label),
            it.sub ? el('div', { class: 'sub' }, it.sub) : null)));
    }
    refresh('');
  });
}

// ============================== views ====================================
function render() {
  closeAllSheets();
  if (state.tab === 'trainers' && !trainersFor().length) state.tab = 'dex';
  if (state.tab === 'habitats' && state.profile !== 'pokopia') state.tab = 'dex';
  app.textContent = '';
  ({ dex: viewDex, moves: viewMoves, abil: viewAbilities, items: viewItems, teams: viewTeams,
    trainers: viewTrainers, habitats: viewHabitats }[state.tab] || viewDex)();
  app.append(buildNav());
}
function buildNav() {
  const tabs = [
    ['dex', '◓', 'Pokédex'], ['moves', '⚡', 'Moves'], ['abil', '✨', 'Abilities'],
    ['items', '🎒', 'Items'],
  ];
  if (trainersFor().length) tabs.push(['trainers', '🥊', 'Trainers']);
  if (state.profile === 'pokopia') tabs.push(['habitats', '🌿', 'Habitats']);
  tabs.push(['teams', '⚔️', 'Teams']);
  return el('nav', {}, tabs.map(([id, ic, label]) =>
    el('button', { class: state.tab === id ? 'on' : '', onclick: () => { state.tab = id; render(); } },
      el('span', { class: 'ni' }, ic), label)));
}

// ---------- profile selector + rom-hack importer ----------
const importInput = el('input', { type: 'file', accept: '.js,.json,.txt', style: 'display:none',
  onchange: () => { const f = importInput.files[0]; if (f) importHackFile(f); importInput.value = ''; } });
document.body.append(importInput);
async function importHackFile(file) {
  let text;
  try { text = await file.text(); } catch { alert('Could not read the file.'); return; }
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!data) {
    // RRDex-style data.js is a JS object literal, not JSON. This runs the
    // user's own chosen file on their own device (same trust as opening it).
    try { data = new Function('return (' + text + ')')(); }
    catch (e) {
      alert('Could not parse this file. If you are using the hosted app, note it cannot parse .js dex files — convert the file to JSON, or use the local UltimateDex.html.');
      return;
    }
  }
  if (!data || !data.species || !data.moves || !data.types || !data.abilities) {
    alert('This does not look like an RRDex-format dex file (needs species, moves, types, abilities).');
    return;
  }
  for (const sid in data.species) { // pre-render evolution texts (same trick as the build)
    const s = data.species[sid];
    if (!s.evolutions || s.evoTexts) continue;
    s.evoTexts = s.evolutions.map((evo) => {
      const tpl = (data.evolutions || {})[evo[0]];
      if (!tpl) return 'Special';
      try { return new Function('evo', 'items', 'species', 'moves', 'types', 'return ' + tpl)(evo, data.items, data.species, data.moves, data.types); }
      catch { return 'Special'; }
    });
  }
  const name = (prompt('Name this dex profile:', file.name.replace(/\.(js|json|txt)$/i, '')) || 'Imported Hack').slice(0, 40);
  const id = 'h:' + Date.now().toString(36);
  const rec = { id, name, data };
  customs[id] = rec;
  try { await idbPut(rec); } catch (e) { alert('Saved for this session only (storage unavailable: ' + e + ')'); }
  listCache = {};
  state.profile = id;
  store.set('profile', id);
  render();
}
function manageProfilesSheet() {
  openSheet('Imported Dexes', (body) => {
    const page = el('div', { class: 'page' });
    const list = Object.values(customs);
    if (!list.length) page.append(el('div', { class: 'empty' }, 'No imported dex profiles. Use “Import rom-hack dex” in the profile menu — it accepts a data.js/JSON file in RRDex format (used by the dex sites of many hacks: Radical Red, Unbound, R.O.W.E., …).'));
    for (const p of list) {
      page.append(el('div', { class: 'card' },
        el('div', { class: 'kv' },
          el('span', {}, p.name),
          el('button', { class: 'back', style: 'color:var(--bad)', onclick: async () => {
            if (!confirm('Remove "' + p.name + '"?')) return;
            delete customs[p.id];
            try { await idbDel(p.id); } catch {}
            if (state.profile === p.id) { state.profile = 'nat'; store.set('profile', 'nat'); }
            listCache = {};
            closeAllSheets(); render();
          } }, 'Remove'))));
    }
    body.append(page);
  });
}
function profileSelect() {
  const sel = el('select', { class: 'profile-pill', onchange: () => {
    const v = sel.value;
    if (v === '__import') { sel.value = state.profile; importInput.click(); return; }
    if (v === '__manage') { sel.value = state.profile; manageProfilesSheet(); return; }
    state.profile = v;
    store.set('profile', v);
    state.f.dex.types = []; state.f.moves.types = []; state.f.moves.cat = null;
    render();
  } });
  const groups = {};
  for (const p of profiles()) {
    if (!groups[p.group]) sel.append(groups[p.group] = el('optgroup', { label: p.group }));
    groups[p.group].append(el('option', { value: p.id }, p.label));
  }
  const acts = el('optgroup', { label: 'Custom' });
  acts.append(el('option', { value: '__import' }, '＋ Import rom-hack dex…'));
  if (Object.keys(customs).length) acts.append(el('option', { value: '__manage' }, '⚙ Manage imported dexes'));
  sel.append(acts);
  sel.value = state.profile;
  return sel;
}
// Rotom Phone skin (kid-approved)
function applyRotom() { document.documentElement.classList.toggle('rotom', !!store.get('rotom', true)); }
applyRotom();
function rotomBtn() {
  return el('button', { class: 'chip', title: 'Rotom Phone mode', onclick: () => {
    store.set('rotom', !store.get('rotom', true));
    applyRotom();
  } }, '🔴');
}
function fullscreenBtn() {
  const doc = document;
  if (!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled)) return null;
  return el('button', { class: 'chip', title: 'Fullscreen', onclick: () => {
    const root = doc.documentElement;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
    } else {
      try { (root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: 'hide' }); }
      catch { try { root.webkitRequestFullscreen(); } catch {} }
    }
  } }, '⛶');
}
function listHeader(title, fkey, chipsBuilder) {
  const f = state.f[fkey];
  const search = el('input', { type: 'search', placeholder: 'Search ' + title.toLowerCase() + '…',
    autocomplete: 'off', value: f.q, oninput: () => { f.q = search.value; refreshers.list && refreshers.list(); } });
  return el('header', {},
    el('div', { class: 'hrow' }, el('div', { class: 'htitle' }, title), fullscreenBtn(), rotomBtn(), profileSelect()),
    el('div', { class: 'searchbar' }, el('span', { class: 'icon' }, '🔎'), search),
    chipsBuilder ? chipsBuilder() : null);
}
const refreshers = {};

// ---------- Pokédex tab ----------
function viewDex() {
  const f = state.f.dex;
  const sortOpts = [['num', 'Number'], ['name', 'Name'], ['bst', 'BST'],
    ...STAT_KEYS.map((k) => [k, STAT_NAMES[k]])];
  function chips() {
    const sortSel = el('select', { class: 'sortsel', onchange: () => { f.sort = sortSel.value; refreshers.list(); } },
      sortOpts.map(([v, l]) => el('option', { value: v }, 'Sort: ' + l)));
    sortSel.value = f.sort;
    const dirBtn = el('button', { class: 'chip', onclick: () => { f.dir = -f.dir; dirBtn.textContent = f.dir === 1 ? '↑' : '↓'; refreshers.list(); } }, f.dir === 1 ? '↑' : '↓');
    return el('div', { class: 'chiprow' }, sortSel, dirBtn,
      typesFor().map((t) => el('button', {
        class: 'chip' + (f.types.includes(t) ? ' on' : ''),
        style: f.types.includes(t) ? 'background:' + (TYPE_COLORS[t] || '#68A090') : '',
        onclick: () => {
          const i = f.types.indexOf(t);
          if (i >= 0) f.types.splice(i, 1); else { f.types.push(t); if (f.types.length > 2) f.types.shift(); }
          render();
        },
      }, t)));
  }
  const list = el('div', { class: 'list' });
  const count = el('div', { class: 'count' });
  refreshers.list = () => {
    list.textContent = '';
    let items = speciesList();
    if (f.types.length) items = items.filter((r) => f.types.every((t) => r.types.includes(t)));
    const q = toID(f.q);
    if (q) items = items.filter((r) => toID(r.name).includes(q) || String(r.num) === f.q.trim().replace(/^#/, ''));
    const key = f.sort;
    items = [...items].sort((a, b) => {
      let d = key === 'num' ? a.num - b.num : key === 'name' ? a.name.localeCompare(b.name)
        : key === 'bst' ? a.bst - b.bst : a.stats[key] - b.stats[key];
      return f.dir * (d || a.num - b.num);
    });
    count.textContent = items.length + ' Pokémon · ' + profLabel();
    chunkList(list, items, speciesRow);
  };
  app.append(listHeader('Pokédex', 'dex', chips), el('main', {}, count, list));
  refreshers.list();
}
function speciesRow(rec) {
  return el('button', { class: 'row', onclick: () => openSpecies(rec) },
    iconEl(rec),
    el('div', { class: 'body' },
      el('div', { class: 'name' }, rec.name),
      el('div', { class: 'sub' }, rec.dexno)),
    el('div', { class: 'end' }, typeRow(rec.types), el('span', { class: 'stat' }, 'BST ' + rec.bst)));
}

function resolveInProfile(rec) {
  // an evolution/form link built from raw official data should land on the
  // ACTIVE dex's entry (Pokopia numbering, roster info, …) when it has one
  if (rec.src !== 'off') return rec;
  const match = speciesList(rec.prof ?? state.profile).find((r) => r.key === rec.key);
  return match || rec;
}
function openSpecies(rec) {
  rec = resolveInProfile(rec);
  openSheet(rec.name, (body, sheet) => {
    const prof = rec.prof ?? state.profile;
    const gen = profGen(prof);
    const flavor = flavorFor(rec, prof);
    let shiny = false;
    let art = spriteEl(rec, shiny);

    const meta = [];
    if (flavor && flavor.genus) meta.push(flavor.genus);
    if (rec.src === 'off') {
      if (rec.e.heightm) meta.push(rec.e.heightm + ' m');
      if (rec.e.weightkg) meta.push(rec.e.weightkg + ' kg');
      if (rec.e.forme) meta.push(rec.e.forme + ' Forme');
    }
    if (prof === 'pokopia' && !rec.pokopia) meta.push('Not in the Pokopia dex');
    const shinyBtn = el('button', { class: 'chip shinybtn', onclick: () => {
      shiny = !shiny;
      shinyBtn.classList.toggle('on', shiny);
      const next = spriteEl(rec, shiny);
      art.replaceWith(next); art = next;
    } }, '✨ Shiny');
    const hero = el('div', { class: 'hero' }, art,
      el('div', { style: 'flex:1' },
        el('div', { class: 'dexno' }, rec.dexno + ' · ' + profLabel(prof)),
        el('h2', {}, rec.name),
        el('div', { style: 'margin-top:6px' }, typeRow(rec.types)),
        meta.length ? el('div', { class: 'meta' }, meta.join(' · ')) : null,
        el('div', { style: 'margin-top:8px' }, shinyBtn)));
    const page = el('div', { class: 'page' }, hero);
    body.append(page);

    // previous / next entry in the active dex
    const listAll = speciesList(prof);
    const idx = listAll.findIndex((r) => r.key === rec.key);
    if (idx >= 0 && listAll.length > 1) {
      const prev = listAll[idx - 1], next = listAll[idx + 1];
      const jump = (r) => { closeSheet(sheet); openSpecies(r); };
      page.append(el('div', { class: 'btnrow' },
        prev ? el('button', { class: 'btn sec', onclick: () => jump(prev) }, '‹ ' + prev.name) : el('span', { style: 'flex:1' }),
        next ? el('button', { class: 'btn sec', onclick: () => jump(next) }, next.name + ' ›') : el('span', { style: 'flex:1' })));
    }

    if (flavor && flavor.text) {
      const card = el('div', { class: 'card' },
        el('h3', {}, 'Dex Entry' + (flavor.fromGen ? ' · Gen ' + flavor.fromGen + ' games' : '')),
        el('div', { class: 'flavor' }, flavor.text));
      const groups = flavorAll(rec).filter((g) => g.text !== flavor.text || g.gens.length > 1);
      if (groups.length) {
        const wrap = el('div', { style: 'display:none' },
          groups.map((g) => [
            el('h3', { style: 'margin-top:12px' },
              'Gen ' + (g.gens.length > 1 ? g.gens[0] + '–' + g.gens[g.gens.length - 1] : g.gens[0])),
            el('div', { class: 'flavor' }, g.text)]));
        const btn = el('button', { class: 'chip', style: 'margin-top:10px', onclick: () => {
          const open = wrap.style.display === 'none';
          wrap.style.display = open ? 'block' : 'none';
          btn.textContent = open ? 'Hide other games' : 'All games (' + groups.length + ')';
        } }, 'All games (' + groups.length + ')');
        card.append(btn, wrap);
      }
      page.append(card);
    }

    if (rec.pokopia) {
      const SETS = { base: 'Base game', basin: 'Bubbly Basin (Expansion Pass)', event: 'Event' };
      const habs = ((D.pokopia || {}).habitats || []).filter((h) => h.mons.includes(rec.pokopia.slug));
      page.append(el('div', { class: 'card' }, el('h3', {}, 'Pokopia'),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Specialty'), el('span', {}, rec.pokopia.spec || '—')),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Available in'), el('span', {}, rec.pokopia.sets.map((s) => SETS[s] || s).join(', '))),
        habs.length ? el('div', { style: 'padding-top:8px' },
          el('div', { class: 'k muted', style: 'font-size:12px;margin-bottom:6px' }, 'Attracted by ' + habs.length + ' habitats'),
          el('div', { class: 'moveinline' }, habs.map((h) =>
            el('button', { class: 'chip', onclick: () => openHabitat(h) }, h.name)))) : null));
    }

    // stats (gen 1 had a unified Special stat)
    const statRows = gen === 1 && rec.src === 'off'
      ? [['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'Spc'], ['spe', 'Spe']]
      : STAT_KEYS.map((k) => [k, STAT_NAMES[k]]);
    page.append(el('div', { class: 'card' }, el('h3', {}, 'Base Stats · ' + profLabel(prof)),
      statRows.map(([k, label]) => {
        const v = rec.stats[k];
        const hue = Math.round(Math.min(v, 150) / 150 * 120);
        return el('div', { class: 'statrow' },
          el('span', { class: 'sn' }, label),
          el('span', { class: 'sv' }, v),
          el('div', { class: 'sbar' }, el('i', { style: `width:${Math.min(100, v / 2)}%;background:hsl(${hue} 70% 48%)` })));
      }),
      el('div', { class: 'bst' }, 'Total: ' + rec.bst)));

    // what this game/hack changed vs. current official data
    if (rec.src === 'hack') {
      const diffs = hackChanges(rec);
      if (diffs) page.append(el('div', { class: 'card' }, el('h3', {}, 'Changed in ' + profLabel(prof)),
        diffs.map((d) => el('div', { class: 'kv' }, el('span', {}, d)))));
    }

    if (rec.abilities.length) {
      page.append(el('div', { class: 'card' }, el('h3', {}, 'Abilities'),
        rec.abilities.map((a) => el('button', { class: 'abil', style: 'display:block;width:100%;text-align:left', onclick: () => {
          const key = a.hackId ? '#' + a.hackId : abilityByName[a.name];
          const ab = key != null ? getAbility(String(key), prof) : null;
          if (ab) openAbility(ab);
        } },
          el('div', { class: 'an' }, a.name, a.hidden ? el('span', { class: 'tag' }, 'Hidden') : null),
          a.desc ? el('div', { class: 'ad' }, a.desc) : null))));
    }

    if (rec.src === 'hack') {
      const held = (rec.s.items || []).filter(Boolean).map((i) => hackItemRec(i, prof)).filter(Boolean);
      if (held.length) page.append(el('div', { class: 'card' }, el('h3', {}, 'Wild Held Items'),
        held.map((it) => el('div', { class: 'kv' },
          el('span', { class: 'k', style: 'display:flex;gap:8px;align-items:center' }, itemIconEl(it), it.name),
          el('span', {}, '')))));
    }

    const def = defenseProfile(rec, prof);
    const groups = [[4, '4×'], [2, '2×'], [0.5, '½×'], [0.25, '¼×'], [0, '0×']];
    const defRows = groups.map(([m, label]) => {
      const ts = Object.keys(def).filter((t) => def[t] === m);
      return ts.length ? el('div', { class: 'defrow' }, el('span', { class: 'mult' }, label), typeRow(ts)) : null;
    }).filter(Boolean);
    page.append(el('div', { class: 'card' }, el('h3', {}, 'Defenses · ' + profLabel(prof)),
      defRows.length ? defRows : el('div', { class: 'muted' }, 'No weaknesses or resistances.')));

    // alternate forms (grouped by shared base species; works for hacks via psid)
    const baseOf = (r) => {
      const e = r.psid && D.dex[r.psid];
      return e ? toID(e.baseSpecies || e.name) : null;
    };
    const myBase = baseOf(rec);
    if (myBase) {
      const forms = speciesList(prof).filter((r) => r.key !== rec.key && baseOf(r) === myBase);
      if (forms.length) {
        page.append(el('div', { class: 'card' }, el('h3', {}, 'Forms'),
          el('div', { class: 'list' }, forms.map((r) =>
            el('button', { class: 'row', onclick: () => openSpecies(r) },
              iconEl(r),
              el('div', { class: 'body' }, el('div', { class: 'name' }, r.name)),
              el('div', { class: 'end' }, typeRow(r.types)))))));
      }
    }

    const chain = evoChain(rec, prof);
    if (chain.root) {
      const seen = new Set();
      const evoWrap = el('div', { class: 'evo' });
      (function walk(node) {
        if (seen.has(node.key)) return;
        seen.add(node.key);
        evoWrap.append(el('button', { class: 'evostep', onclick: () => node.key !== rec.key && openSpecies(node) },
          iconEl(node), el('span', { class: 'en' }, node.name)));
        const kids = chain.kids(node);
        kids.forEach((k, i) => {
          if (i > 0) evoWrap.append(el('span', { style: 'flex-basis:100%' }));
          evoWrap.append(el('span', { class: 'evoarrow' }, k.cond));
          walk(k.rec);
        });
      })(chain.root);
      if (seen.size > 1) page.append(el('div', { class: 'card' }, el('h3', {}, 'Evolution'), evoWrap));
    }

    if (rec.src === 'hack') {
      const enc = hackEncounters(rec.hackId, prof);
      if (enc.length) page.append(el('div', { class: 'card' }, el('h3', {}, 'Locations · ' + profLabel(prof)),
        enc.map((x) => el('div', { class: 'kv' },
          el('span', { class: 'k' }, x.area),
          el('span', {}, x.method + ' · ' + (x.lo < 0
            ? (x.rate != null ? x.rate + '%' : 'Wild')
            : 'Lv ' + (x.lo === x.hi ? x.lo : x.lo + '–' + x.hi)))))));
    }

    // official-game wild locations (base forms; PokeAPI data)
    if (rec.src === 'off' && prof !== 'pokopia' && !rec.e.forme) {
      const all = (D.enc || {})[natNumOf(rec)];
      if (all) {
        const gensAvail = Object.keys(all).map(Number).sort((a, b) => a - b);
        const g = profGen(prof);
        const curGen = all[g] ? g : ((prof ?? state.profile) === 'nat' ? gensAvail[gensAvail.length - 1] : null);
        const encRow = (r) => el('div', { class: 'kv' },
          el('span', { class: 'k' },
            el('span', { style: 'color:var(--text)' }, r[0]),
            el('span', { style: 'display:block;font-size:11px' }, r[4])),
          el('span', { style: 'text-align:right;flex:0 0 auto' }, r[1] + ' · Lv ' + (r[2] === r[3] ? r[2] : r[2] + '–' + r[3])));
        const card = el('div', { class: 'card' }, el('h3', {}, 'Wild Locations' + (curGen ? ' · Gen ' + curGen : '')));
        if (curGen) card.append(...all[curGen].map(encRow));
        else card.append(el('div', { class: 'muted' }, 'Not found in the wild in ' + profLabel(prof) + '.'));
        const others = gensAvail.filter((x) => x !== curGen);
        if (others.length) {
          const wrap = el('div', { style: 'display:none' },
            others.map((og) => [el('h3', { style: 'margin-top:12px' }, 'Gen ' + og), all[og].map(encRow)]));
          const btn = el('button', { class: 'chip', style: 'margin-top:10px', onclick: () => {
            const open = wrap.style.display === 'none';
            wrap.style.display = open ? 'block' : 'none';
            btn.textContent = open ? 'Hide other generations' : 'Other generations (' + others.length + ')';
          } }, 'Other generations (' + others.length + ')');
          card.append(btn, wrap);
        }
        page.append(card);
      }
    }

    const ls = getLearnset(rec, prof);
    const segs = [['level', 'Level Up'], ['machine', 'TM/HM'], ['tutor', 'Tutor'], ['egg', 'Egg']];
    let cur = 'level';
    const lsList = el('div');
    const segBar = el('div', { class: 'seg' }, segs.map(([k, label]) => {
      const b = el('button', { class: k === cur ? 'on' : '', onclick: () => {
        cur = k;
        for (const c of segBar.children) c.classList.toggle('on', c === b);
        drawLs();
      } }, label + (ls[k].length ? ` (${ls[k].length})` : ''));
      return b;
    }));
    function moveRow(mv, lvl) {
      return el('button', { class: 'mrow', onclick: () => openMove(mv) },
        lvl != null ? el('span', { class: 'lvl' }, lvl === 0 ? 'Evo' : lvl) : null,
        el('span', { class: 'mn' }, mv.name),
        typeBadge(mv.type),
        el('span', { class: 'mstat' }, (mv.power || '—') + ' · ' + mv.acc));
    }
    function drawLs() {
      lsList.textContent = '';
      const rows = cur === 'level' ? ls.level.map((x) => moveRow(x.mv, x.lvl)) : ls[cur].map((mv) => moveRow(mv));
      if (!rows.length) lsList.append(el('div', { class: 'empty' }, 'No moves in this category for ' + profLabel(prof) + '.'));
      else rows.forEach((r) => lsList.append(r));
    }
    drawLs();
    page.append(el('div', { class: 'card' }, el('h3', {}, 'Moves · ' + profLabel(prof)), segBar, lsList));
  });
}

// ---------- Moves tab ----------
function viewMoves() {
  const f = state.f.moves;
  function chips() {
    const sortOpts = [['name', 'Name'], ['power', 'Power'], ['acc', 'Accuracy'], ['pp', 'PP']];
    const sortSel = el('select', { class: 'sortsel', onchange: () => { f.sort = sortSel.value; refreshers.list(); } },
      sortOpts.map(([v, l]) => el('option', { value: v }, 'Sort: ' + l)));
    sortSel.value = f.sort;
    return el('div', { class: 'chiprow' }, sortSel,
      ['Physical', 'Special', 'Status'].map((c) =>
        el('button', { class: 'chip' + (f.cat === c ? ' on' : ''), style: f.cat === c ? 'background:var(--accent2)' : '',
          onclick: () => { f.cat = f.cat === c ? null : c; render(); } }, c)),
      typesFor().map((t) => el('button', {
        class: 'chip' + (f.types.includes(t) ? ' on' : ''),
        style: f.types.includes(t) ? 'background:' + (TYPE_COLORS[t] || '#68A090') : '',
        onclick: () => { f.types = f.types.includes(t) ? [] : [t]; render(); },
      }, t)));
  }
  const list = el('div', { class: 'list' });
  const count = el('div', { class: 'count' });
  refreshers.list = () => {
    list.textContent = '';
    let items = movesList();
    if (f.types.length) items = items.filter((m) => f.types.includes(m.type));
    if (f.cat) items = items.filter((m) => m.cat === f.cat);
    const q = toID(f.q);
    if (q) items = items.filter((m) => toID(m.name).includes(q));
    items = [...items].sort((a, b) => {
      if (f.sort === 'name') return a.name.localeCompare(b.name);
      const av = f.sort === 'acc' ? (typeof a.acc === 'number' ? a.acc : 101) : a[f.sort] || 0;
      const bv = f.sort === 'acc' ? (typeof b.acc === 'number' ? b.acc : 101) : b[f.sort] || 0;
      return bv - av || a.name.localeCompare(b.name);
    });
    count.textContent = items.length + ' moves · ' + profLabel();
    chunkList(list, items, (m) =>
      el('button', { class: 'row', onclick: () => openMove(m) },
        el('div', { class: 'body' },
          el('div', { class: 'name' }, m.name),
          el('div', { class: 'sub' }, m.desc || m.cat)),
        el('div', { class: 'end' }, typeRow([m.type]),
          el('span', { class: 'stat' }, m.cat + ' · ' + (m.power || '—') + ' · ' + m.acc))));
  };
  app.append(listHeader('Moves', 'moves', chips), el('main', {}, count, list));
  refreshers.list();
}
function openMove(mv) {
  openSheet(mv.name, (body) => {
    const page = el('div', { class: 'page' },
      el('div', { class: 'hero' },
        el('div', {},
          el('h2', {}, mv.name),
          el('div', { style: 'margin-top:6px;display:flex;gap:6px;align-items:center' },
            typeBadge(mv.type), el('span', { class: 'stat' }, mv.cat + ' · ' + profLabel())))),
      el('div', { class: 'card' }, el('h3', {}, 'Battle Stats'),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Power'), el('span', {}, mv.power || '—')),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Accuracy'), el('span', {}, mv.acc === true ? '—' : mv.acc)),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'PP'), el('span', {}, mv.pp ?? '—')),
        mv.priority ? el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Priority'), el('span', {}, (mv.priority > 0 ? '+' : '') + mv.priority)) : null),
      mv.longDesc ? el('div', { class: 'card' }, el('h3', {}, 'Effect'), el('div', {}, mv.longDesc)) : null);
    const learners = learnedBy(mv);
    const list = el('div', { class: 'list' });
    page.append(el('div', { class: 'card' }, el('h3', {}, `Learned By (${learners.length}) · ` + profLabel()), list));
    body.append(page);
    chunkList(list, learners, speciesRow, 40);
  });
}

// ---------- Abilities tab ----------
function viewAbilities() {
  const f = state.f.abil;
  const list = el('div', { class: 'list' });
  const count = el('div', { class: 'count' });
  refreshers.list = () => {
    list.textContent = '';
    let items = abilitiesList();
    const q = toID(f.q);
    if (q) items = items.filter((a) => toID(a.name).includes(q) || toID(a.desc).includes(q));
    count.textContent = items.length + ' abilities · ' + profLabel();
    chunkList(list, items, (a) =>
      el('button', { class: 'row', onclick: () => openAbility(a) },
        el('div', { class: 'body' },
          el('div', { class: 'name' }, a.name),
          el('div', { class: 'sub' }, a.desc))));
  };
  app.append(listHeader('Abilities', 'abil'), el('main', {}, count, list));
  refreshers.list();
}
function openAbility(a) {
  openSheet(a.name, (body) => {
    const own = withAbility(a);
    const list = el('div', { class: 'list' });
    body.append(el('div', { class: 'page' },
      el('div', { class: 'card' }, el('h3', {}, 'Effect'), el('div', {}, a.longDesc || a.desc || '—')),
      el('div', { class: 'card' }, el('h3', {}, `Pokémon (${own.length}) · ` + profLabel()), list)));
    chunkList(list, own, speciesRow, 40);
  });
}

// ---------- Items tab ----------
function viewItems() {
  if (state.profile === 'pokopia') return viewPokopiaCrafting();
  const f = state.f.items;
  const list = el('div', { class: 'list' });
  const count = el('div', { class: 'count' });
  refreshers.list = () => {
    list.textContent = '';
    let items = itemsList();
    const q = toID(f.q);
    if (q) items = items.filter((a) => toID(a.name).includes(q) || toID(a.desc).includes(q));
    count.textContent = items.length + ' items · ' + profLabel();
    chunkList(list, items, (it) =>
      el('button', { class: 'row', onclick: () => openItem(it) },
        itemIconEl(it),
        el('div', { class: 'body' },
          el('div', { class: 'name' }, it.name),
          el('div', { class: 'sub' }, it.desc))));
  };
  app.append(listHeader('Items', 'items'), el('main', {}, count, list));
  refreshers.list();
}
function viewPokopiaCrafting() {
  const f = state.f.items;
  const all = (D.pokopia || {}).crafting || [];
  const cats = [...new Set(all.map((x) => x.cat))];
  function chips() {
    return el('div', { class: 'chiprow' }, cats.map((c) =>
      el('button', { class: 'chip' + (f.cat === c ? ' on' : ''), style: f.cat === c ? 'background:var(--accent2)' : '',
        onclick: () => { f.cat = f.cat === c ? null : c; render(); } }, c)));
  }
  const list = el('div', { class: 'list' });
  const count = el('div', { class: 'count' });
  refreshers.list = () => {
    list.textContent = '';
    let items = all;
    if (f.cat) items = items.filter((x) => x.cat === f.cat);
    const q = toID(f.q);
    if (q) items = items.filter((x) => toID(x.name).includes(q) || toID(x.mats.map((m) => m.name).join()).includes(q));
    count.textContent = items.length + ' recipes · Pokopia';
    chunkList(list, items, (x) =>
      el('button', { class: 'row', onclick: () => openRecipe(x) },
        el('div', { class: 'body' },
          el('div', { class: 'name' }, x.name),
          el('div', { class: 'sub' }, x.mats.map((m) => m.name + ' ×' + m.qty).join(', ') || x.unlock)),
        el('div', { class: 'end' }, el('span', { class: 'stat' }, x.cat))));
  };
  app.append(listHeader('Crafting', 'items', chips), el('main', {}, count, list));
  refreshers.list();
}
function openRecipe(x) {
  openSheet(x.name, (body) => {
    body.append(el('div', { class: 'page' },
      el('div', { class: 'card' }, el('h3', {}, x.cat),
        x.unlock ? el('div', { class: 'kv' }, el('span', { class: 'k' }, 'How to unlock'), el('span', { style: 'text-align:right' }, x.unlock)) : null),
      x.mats.length ? el('div', { class: 'card' }, el('h3', {}, 'Materials'),
        x.mats.map((m) => el('div', { class: 'kv' }, el('span', { class: 'k' }, m.name), el('span', {}, '×' + m.qty)))) : null));
  });
}
function openItem(it) {
  openSheet(it.name, (body) => {
    body.append(el('div', { class: 'page' },
      el('div', { class: 'hero' },
        el('div', { class: 'art', style: 'width:48px;flex-basis:48px' }, (() => { const i = itemIconEl(it); i.style.transform = 'scale(2)'; return i; })()),
        el('div', {}, el('h2', {}, it.name))),
      el('div', { class: 'card' }, el('h3', {}, 'Effect'), el('div', {}, it.longDesc || it.desc || '—'))));
  });
}

// ---------- Trainers tab ----------
function viewTrainers() {
  const f = state.f.trainers;
  const list = el('div', { class: 'list' });
  const count = el('div', { class: 'count' });
  refreshers.list = () => {
    list.textContent = '';
    let items = trainersFor();
    const q = toID(f.q);
    if (q) items = items.filter((x) => toID(x.t.name).includes(q) || toID(x.t.areaName || '').includes(q));
    count.textContent = items.length + ' trainers · ' + profLabel();
    chunkList(list, items, ({ t, modes }) =>
      el('button', { class: 'row', onclick: () => openTrainer(t, modes) },
        el('div', { class: 'body' },
          el('div', { class: 'name' }, t.name),
          el('div', { class: 'sub' }, [t.areaName, modes.map((m) => m + ' ' + t[m].length).join(' · ')].filter(Boolean).join(' — ')))));
  };
  app.append(listHeader('Trainers', 'trainers'), el('main', {}, count, list));
  refreshers.list();
}
function openTrainer(t, modes) {
  const prof = state.profile;
  const hd = HD(prof);
  openSheet(t.name, (body) => {
    const page = el('div', { class: 'page' });
    body.append(page);
    let mode = modes[0];
    const partyWrap = el('div', { class: 'page' });
    const segBar = modes.length > 1
      ? el('div', { class: 'seg' }, modes.map((m) => {
          const b = el('button', { class: m === mode ? 'on' : '', onclick: () => {
            mode = m;
            for (const c of segBar.children) c.classList.toggle('on', c === b);
            drawParty();
          } }, m[0].toUpperCase() + m.slice(1));
          return b;
        }))
      : null;
    page.append(el('div', { class: 'card' },
      el('h3', {}, (t.areaName ? t.areaName + ' · ' : '') + profLabel(prof)),
      segBar, partyWrap));
    function setLine(label, value) {
      return value ? el('div', { class: 'kv' }, el('span', { class: 'k' }, label), el('span', {}, value)) : null;
    }
    function drawParty() {
      partyWrap.textContent = '';
      for (const pm of t[mode] || []) {
        const rec = hackSpeciesRec(pm.species, prof);
        if (!rec) continue;
        const abSlot = (rec.s.abilities || [])[pm.ability];
        const abName = abSlot ? ((hd.abilities[Array.isArray(abSlot) ? abSlot[0] : abSlot] || {}).names || [])[0] : null;
        const itemRec = pm.item ? hackItemRec(pm.item, prof) : null;
        const item = itemRec ? el('span', { style: 'display:flex;gap:8px;align-items:center' }, itemIconEl(itemRec), itemRec.name) : null;
        const nature = hd.natures ? hd.natures[pm.nature] : null;
        const evs = (pm.EVs || []).some((v) => v > 0)
          ? 'HP ' + pm.EVs[0] + ' / Atk ' + pm.EVs[1] + ' / Def ' + pm.EVs[2] + ' / Spe ' + pm.EVs[3] + ' / SpA ' + pm.EVs[4] + ' / SpD ' + pm.EVs[5] : null;
        const ivs = (pm.IVs || []).some((v) => v !== 31)
          ? 'HP ' + pm.IVs[0] + ' / Atk ' + pm.IVs[1] + ' / Def ' + pm.IVs[2] + ' / Spe ' + pm.IVs[3] + ' / SpA ' + pm.IVs[4] + ' / SpD ' + pm.IVs[5] : null;
        partyWrap.append(el('div', { class: 'card inner' },
          el('button', { class: 'row', style: 'border:none;padding:0 0 6px;background:none', onclick: () => openSpecies(rec) },
            iconEl(rec),
            el('div', { class: 'body' },
              el('div', { class: 'name' }, rec.name + (pm.shiny ? ' ✨' : '') + ' · ' + (pm.level > 0 ? 'Lv ' + pm.level : 'Lv scales')),
              el('div', { class: 'sub' }, rec.types.join(' / '))),
            el('div', { class: 'end' }, typeRow(rec.types))),
          setLine('Item', item),
          setLine('Ability', abName),
          setLine('Nature', nature),
          setLine('EVs', evs),
          setLine('IVs', ivs),
          el('div', { class: 'moveinline' },
            (pm.moves || []).filter(Boolean).map((mid) => {
              const mv = hackMoveRec(mid, prof);
              return mv ? el('button', { class: 'chip', onclick: () => openMove(mv) }, mv.name) : null;
            }))));
      }
      if (!partyWrap.children.length) partyWrap.append(el('div', { class: 'empty' }, 'No party data.'));
    }
    drawParty();
  });
}

// ---------- Pokopia habitats ----------
function pokopiaSpeciesBySlug() {
  const map = new Map();
  for (const r of speciesList('pokopia')) if (r.pokopia) map.set(r.pokopia.slug, r);
  return map;
}
function viewHabitats() {
  const f = state.f.habitats;
  const list = el('div', { class: 'list' });
  const count = el('div', { class: 'count' });
  refreshers.list = () => {
    list.textContent = '';
    let items = (D.pokopia || {}).habitats || [];
    const q = toID(f.q);
    if (q) items = items.filter((x) => toID(x.name).includes(q) || toID(x.desc).includes(q));
    count.textContent = items.length + ' habitats · Pokopia';
    chunkList(list, items, (x) =>
      el('button', { class: 'row', onclick: () => openHabitat(x) },
        el('div', { class: 'body' },
          el('div', { class: 'name' }, x.name + (x.set !== 'main' ? ' · ' + (x.set === 'basin' ? 'Basin' : 'Event') : '')),
          el('div', { class: 'sub' }, x.desc)),
        el('div', { class: 'end' }, el('span', { class: 'stat' }, x.mons.length + ' mons'))));
  };
  app.append(listHeader('Habitats', 'habitats'), el('main', {}, count, list));
  refreshers.list();
}
function openHabitat(x) {
  openSheet(x.name, (body) => {
    const bySlug = pokopiaSpeciesBySlug();
    const mons = x.mons.map((s) => bySlug.get(s)).filter(Boolean);
    const list = el('div', { class: 'list' });
    body.append(el('div', { class: 'page' },
      el('div', { class: 'card' }, el('h3', {}, 'Habitat #' + String(x.n).padStart(3, '0') + (x.set !== 'main' ? ' · ' + x.set : '')),
        el('div', { class: 'flavor' }, x.desc || '—')),
      x.reqs.length ? el('div', { class: 'card' }, el('h3', {}, 'Build Requirements'),
        x.reqs.map((r) => el('div', { class: 'kv' }, el('span', { class: 'k' }, r.name), el('span', {}, '×' + r.qty)))) : null,
      el('div', { class: 'card' }, el('h3', {}, `Attracts (${mons.length})`), list)));
    chunkList(list, mons, speciesRow, 40);
  });
}

// ---------- Teams tab ----------
function viewTeams() {
  if (state.teamOpen != null && teams[state.teamOpen]) return viewTeamEditor(state.teamOpen);
  const list = el('div', { class: 'list' });
  teams.forEach((t, i) => {
    const mons = t.mons.filter(Boolean);
    list.append(el('button', { class: 'row', onclick: () => { state.teamOpen = i; render(); } },
      el('div', { class: 'body' },
        el('div', { class: 'name' }, t.name),
        el('div', { class: 'sub' }, profLabel(t.profile) + ' · ' + mons.length + '/6')),
      el('div', { class: 'end' },
        el('div', { style: 'display:flex' },
          mons.slice(0, 6).map((m) => {
            const rec = getSpecies(m.sp, t.profile);
            return rec ? iconEl(rec, 0.8) : null;
          })))));
  });
  if (!teams.length) list.append(el('div', { class: 'empty' }, 'No teams yet. Build your first squad!'));
  app.append(
    el('header', {}, el('div', { class: 'hrow' }, el('div', { class: 'htitle' }, 'Teams'), fullscreenBtn(), rotomBtn(), profileSelect())),
    el('main', {}, el('div', { class: 'page' },
      el('button', { class: 'btn', onclick: () => { state.teamOpen = newTeam(); render(); } }, '+ New Team (' + profLabel() + ')'),
      el('button', { class: 'btn sec', onclick: openDamageCalc }, '⚔ Damage Calculator'),
      list)));
}

// ---------- damage calculator ----------
function openDamageCalc() {
  const prof = state.profile;
  const side = (label) => ({ rec: null, level: 100, invest: true, boostNature: false, label });
  const A = side('Attacker'), B = side('Defender');
  let move = null, crit = false, itemMod = 1, screen = false, weatherMod = 1;

  openSheet('Damage Calculator', (body) => {
    const out = el('div', { class: 'card' }, el('h3', {}, 'Result'),
      el('div', { class: 'muted' }, 'Pick an attacker, a move, and a defender.'));

    function calc() {
      out.textContent = '';
      out.append(el('h3', {}, 'Result'));
      if (!A.rec || !B.rec || !move) {
        out.append(el('div', { class: 'muted' }, 'Pick an attacker, a move, and a defender.'));
        return;
      }
      if (!move.power) {
        out.append(el('div', { class: 'muted' }, move.name + ' deals no direct damage.'));
        return;
      }
      const phys = move.cat === 'Physical';
      const atkKey = phys ? 'atk' : 'spa', defKey = phys ? 'def' : 'spd';
      const atkStat = calcStat(atkKey, A.rec.stats[atkKey], 31, A.invest ? 252 : 0, A.level,
        A.boostNature ? NATURES[NATURE_ORDER.indexOf(atkKey) * 5 + (NATURE_ORDER.indexOf(atkKey) + 1) % 5] : 'Hardy');
      const defStat = calcStat(defKey, B.rec.stats[defKey], 31, B.invest ? 252 : 0, B.level,
        B.boostNature ? NATURES[NATURE_ORDER.indexOf(defKey) * 5 + (NATURE_ORDER.indexOf(defKey) + 1) % 5] : 'Hardy');
      const hp = calcStat('hp', B.rec.stats.hp, 31, B.invest ? 252 : 0, B.level, 'Hardy');
      const stab = A.rec.types.includes(move.type) ? 1.5 : 1;
      let eff = 1;
      for (const t of B.rec.types) eff *= atkMult(move.type, t, prof);
      const base = Math.floor(Math.floor((2 * A.level / 5 + 2) * move.power * atkStat / defStat) / 50) + 2;
      const mods = (crit ? 1.5 : 1) * itemMod * (screen && !crit ? 0.5 : 1) * weatherMod * stab * eff;
      const lo = Math.floor(base * 0.85 * mods), hi = Math.floor(base * mods);
      const loP = (lo / hp * 100), hiP = (hi / hp * 100);
      const ko = hiP <= 0 ? '' : loP >= 100 ? 'Guaranteed OHKO' : hiP >= 100 ? 'Possible OHKO'
        : loP >= 50 ? 'Guaranteed 2HKO' : hiP >= 50 ? 'Possible 2HKO'
        : 'Needs ' + Math.ceil(100 / hiP) + '–' + Math.ceil(100 / Math.max(loP, 0.01)) + ' hits';
      if (eff === 0) {
        out.append(el('div', {}, B.rec.name + ' is immune to ' + move.type + ' moves.'));
        return;
      }
      out.append(
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Damage'), el('span', {}, lo + ' – ' + hi + ' (of ' + hp + ' HP)')),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, '%'), el('span', {}, loP.toFixed(1) + '% – ' + hiP.toFixed(1) + '%')),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Effectiveness'), el('span', {}, '×' + eff + (stab > 1 ? ' + STAB' : ''))),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Verdict'), el('span', {}, ko)),
        el('div', { class: 'muted', style: 'font-size:11px;margin-top:8px' },
          'Approximate: 31 IVs, no abilities/stat stages. Investment toggle = 252 EVs in the relevant stat.'));
    }

    function sideCard(S, isAtk) {
      const pickBtn = el('button', { class: 'fsel', onclick: () => {
        pickerSheet('Choose ' + S.label,
          speciesList(prof).map((r) => ({ label: r.name, sub: r.dexno + ' · BST ' + r.bst, rec: r, value: r })),
          (r) => {
            S.rec = r;
            pickBtn.firstChild.textContent = r.name;
            if (isAtk) { move = null; moveBtn.firstChild.textContent = 'Choose move…'; }
            calc();
          });
      } }, el('span', { class: 'v' }, 'Choose Pokémon…'), el('span', { class: 'muted' }, '›'));
      const lvl = el('input', { class: 'fsel', type: 'number', min: 1, max: 100, value: S.level,
        oninput: () => { S.level = Math.max(1, Math.min(100, +lvl.value || 100)); calc(); } });
      const investBtn = el('button', { class: 'chip on', style: 'background:var(--accent2)', onclick: () => {
        S.invest = !S.invest;
        investBtn.classList.toggle('on', S.invest);
        investBtn.style.background = S.invest ? 'var(--accent2)' : '';
        calc();
      } }, '252 EVs');
      const natBtn = el('button', { class: 'chip', onclick: () => {
        S.boostNature = !S.boostNature;
        natBtn.classList.toggle('on', S.boostNature);
        natBtn.style.background = S.boostNature ? 'var(--accent2)' : '';
        calc();
      } }, '+Nature');
      const kids = [
        el('div', { class: 'field' }, el('label', {}, 'Pokémon'), pickBtn),
        el('div', { class: 'field' }, el('label', {}, 'Level'), lvl),
        el('div', { class: 'moveinline' }, investBtn, natBtn),
      ];
      return el('div', { class: 'card' }, el('h3', {}, S.label), kids);
    }

    const moveBtn = el('button', { class: 'fsel', onclick: () => {
      if (!A.rec) { alert('Pick the attacker first.'); return; }
      const legal = legalMoves(A.rec, prof).filter((mv) => mv.power > 0);
      pickerSheet('Choose Move',
        legal.map((mv) => ({ label: mv.name, sub: mv.type + ' · ' + mv.cat + ' · ' + mv.power + ' BP', value: mv })),
        (mv) => { move = mv; moveBtn.firstChild.textContent = mv.name + ' (' + mv.power + ' BP ' + mv.type + ')'; calc(); });
    } }, el('span', { class: 'v' }, 'Choose move…'), el('span', { class: 'muted' }, '›'));

    const toggles = el('div', { class: 'moveinline' },
      [['Crit', () => { crit = !crit; return crit; }],
       ['Item ×1.5', () => { itemMod = itemMod === 1.5 ? 1 : 1.5; return itemMod > 1; }],
       ['Screen', () => { screen = !screen; return screen; }],
       ['Weather +', () => { weatherMod = weatherMod === 1.5 ? 1 : 1.5; return weatherMod > 1; }],
       ['Weather −', () => { weatherMod = weatherMod === 0.5 ? 1 : 0.5; return weatherMod < 1; }],
      ].map(([label, fn]) => {
        const b = el('button', { class: 'chip', onclick: () => {
          const on = fn();
          b.classList.toggle('on', on);
          b.style.background = on ? 'var(--accent2)' : '';
          calc();
        } }, label);
        return b;
      }));

    body.append(el('div', { class: 'page' },
      sideCard(A, true),
      el('div', { class: 'card' }, el('h3', {}, 'Move'),
        el('div', { class: 'field' }, el('label', {}, 'Attacker’s move'), moveBtn),
        toggles),
      sideCard(B, false),
      out));
  });
}
function viewTeamEditor(ti) {
  const team = teams[ti];
  const nameInput = el('input', { class: 'fsel', value: team.name,
    onchange: () => { team.name = nameInput.value || 'Team'; saveTeams(); } });
  const page = el('div', { class: 'page' });

  const slots = el('div', { class: 'teamslots' });
  function redraw() { render(); }
  team.mons.forEach((mon, si) => {
    if (!mon) {
      slots.append(el('button', { class: 'slot', onclick: () => pickSpecies(team, si, redraw) },
        el('span', { class: 'plus' }, '+'), el('span', { class: 'si' }, 'Add Pokémon')));
      return;
    }
    const rec = getSpecies(mon.sp, team.profile);
    if (!rec) {
      slots.append(el('button', { class: 'slot', onclick: () => { team.mons[si] = null; saveTeams(); redraw(); } },
        el('span', { class: 'si' }, 'Unavailable in ' + profLabel(team.profile)), el('span', { class: 'si' }, 'Tap to clear')));
      return;
    }
    slots.append(el('button', { class: 'slot filled', onclick: () => openMonEditor(team, si, redraw) },
      iconEl(rec, 1.2),
      el('span', { class: 'sn' }, rec.name + (mon.shiny ? ' ✨' : '')),
      el('span', { class: 'si' }, [mon.item, mon.ability].filter(Boolean).join(' · ') || 'Tap to edit')));
  });

  const filledMons = team.mons.filter(Boolean);
  const covered = filledMons.map((m) => getSpecies(m.sp, team.profile)).filter(Boolean);
  const cov = el('div', { class: 'covgrid' });
  for (const t of typesFor(team.profile)) {
    let weak = 0, res = 0;
    for (const rec of covered) {
      const m = defenseProfile(rec, team.profile)[t];
      if (m > 1) weak++; else if (m < 1) res++;
    }
    cov.append(el('div', { class: 'covcell', style: 'background:' + (TYPE_COLORS[t] || '#68A090') },
      el('div', { class: 'ct' }, t.slice(0, 3)),
      el('div', { class: 'cv' }, weak + ' / ' + res)));
  }

  // offensive: attack types = damaging chosen moves, else STAB fallback
  const atkTypesPer = filledMons.map((mon) => {
    const rec = getSpecies(mon.sp, team.profile);
    if (!rec) return [];
    const moveTypes = (mon.moves || []).filter(Boolean)
      .map((k) => getMove(k, team.profile)).filter((mv) => mv && mv.power > 0).map((mv) => mv.type);
    return moveTypes.length ? [...new Set(moveTypes)] : rec.types;
  });
  const offCov = el('div', { class: 'covgrid' });
  for (const t of typesFor(team.profile)) {
    let hitters = 0;
    for (const types of atkTypesPer) {
      if (types.some((a) => atkMult(a, t, team.profile) > 1)) hitters++;
    }
    offCov.append(el('div', { class: 'covcell', style: 'background:' + (TYPE_COLORS[t] || '#68A090') },
      el('div', { class: 'ct' }, t.slice(0, 3)),
      el('div', { class: 'cv' }, String(hitters))));
  }

  page.append(
    el('div', { class: 'field' }, el('label', {}, 'Team name'), nameInput),
    slots,
    covered.length ? el('div', { class: 'card' }, el('h3', {}, 'Defensive Coverage (weak / resist)'), cov) : null,
    covered.length ? el('div', { class: 'card' },
      el('h3', {}, 'Offensive Coverage (hit super-effectively by)'),
      offCov,
      el('div', { class: 'muted', style: 'font-size:11px;margin-top:8px' }, 'Uses each member’s damaging moves; STAB types when no moves are set.')) : null,
    el('div', { class: 'btnrow' },
      el('button', { class: 'btn sec', onclick: async () => {
        const txt = exportShowdown(team);
        try { await navigator.clipboard.writeText(txt); alert('Copied to clipboard (Showdown format).'); }
        catch { prompt('Copy your team:', txt); }
      } }, 'Export'),
      el('button', { class: 'btn danger', onclick: () => {
        if (confirm('Delete "' + team.name + '"?')) { teams.splice(ti, 1); saveTeams(); state.teamOpen = null; render(); }
      } }, 'Delete')));

  app.append(
    el('header', {},
      el('div', { class: 'hrow' },
        el('div', { class: 'htitle' },
          el('button', { class: 'back', onclick: () => { state.teamOpen = null; render(); } }, '‹ Teams'),
          el('span', {}, team.name)),
        el('span', { class: 'chip' }, profLabel(team.profile)))),
    el('main', {}, page));
}
function pickSpecies(team, si, done) {
  pickerSheet('Choose Pokémon',
    speciesList(team.profile).map((r) => ({ label: r.name, sub: r.dexno + ' · BST ' + r.bst, rec: r, value: r })),
    (r) => {
      team.mons[si] = { sp: r.key, ability: r.abilities[0] ? r.abilities[0].name : '', item: '',
        nature: 'Hardy', level: 100, shiny: false, moves: [null, null, null, null],
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } };
      saveTeams();
      done();
    });
}
function openMonEditor(team, si, done) {
  const mon = team.mons[si];
  mon.evs = mon.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  mon.ivs = mon.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
  const rec = getSpecies(mon.sp, team.profile);
  openSheet(rec.name, (body, sheet) => {
    const page = el('div', { class: 'page' });
    const save = () => saveTeams();

    let art = spriteEl(rec, !!mon.shiny);
    const shinyBtn = el('button', { class: 'chip shinybtn' + (mon.shiny ? ' on' : ''), onclick: () => {
      mon.shiny = !mon.shiny; save();
      shinyBtn.classList.toggle('on', !!mon.shiny);
      const next = spriteEl(rec, !!mon.shiny);
      art.replaceWith(next); art = next;
    } }, '✨ Shiny');
    page.append(el('div', { class: 'hero' }, art,
      el('div', { style: 'flex:1' },
        el('div', { class: 'dexno' }, rec.dexno),
        el('h2', {}, rec.name),
        el('div', { style: 'margin-top:6px' }, typeRow(rec.types)),
        el('div', { style: 'margin-top:8px' }, shinyBtn))));

    const abSel = el('select', { class: 'fsel', onchange: () => { mon.ability = abSel.value; save(); } },
      rec.abilities.map((a) => el('option', { value: a.name }, a.name + (a.hidden ? ' (Hidden)' : ''))));
    abSel.value = mon.ability || (rec.abilities[0] || {}).name || '';

    const itemBtn = el('button', { class: 'fsel', onclick: () => {
      pickerSheet('Choose Item',
        itemsList(team.profile).map((it) => ({ label: it.name, sub: it.desc, value: it.name, icon: () => itemIconEl(it) })),
        (v) => { mon.item = v === '__none' ? '' : v; save(); itemBtn.firstChild.textContent = mon.item || 'None'; },
        [{ label: 'No Item', value: '__none' }]);
    } }, el('span', { class: 'v' }, mon.item || 'None'), el('span', { class: 'muted' }, '›'));

    const natSel = el('select', { class: 'fsel', onchange: () => { mon.nature = natSel.value; save(); updateCalc(); } },
      NATURES.map((n) => {
        const fx = natureFx(n);
        return el('option', { value: n }, n + (fx ? ` (+${STAT_NAMES[fx.plus]} −${STAT_NAMES[fx.minus]})` : ' (neutral)'));
      }));
    natSel.value = mon.nature || 'Hardy';
    const lvl = el('input', { class: 'fsel', type: 'number', min: 1, max: 100, value: mon.level || 100,
      onchange: () => { mon.level = Math.max(1, Math.min(100, +lvl.value || 100)); save(); updateCalc(); } });

    // ---- EV / IV / computed stats ----
    const calcCells = {}, evTotalEl = el('div', { class: 'evtotal' });
    function updateCalc() {
      let total = 0;
      for (const k of STAT_KEYS) {
        total += mon.evs[k] || 0;
        if (calcCells[k]) calcCells[k].textContent = calcStat(k, rec.stats[k], mon.ivs[k], mon.evs[k], mon.level || 100, mon.nature);
      }
      evTotalEl.textContent = 'EVs used: ' + total + ' / 510';
      evTotalEl.classList.toggle('over', total > 510);
    }
    const evGrid = el('div', { class: 'evgrid' },
      el('span', { class: 'evh' }, 'Stat'), el('span', { class: 'evh' }, 'Base'),
      el('span', { class: 'evh' }, 'EV'), el('span', { class: 'evh' }, 'IV'), el('span', { class: 'evh' }, '@Lv'),
      STAT_KEYS.map((k) => {
        const evIn = el('input', { type: 'number', inputmode: 'numeric', min: 0, max: 252, value: mon.evs[k] || 0,
          oninput: () => { mon.evs[k] = Math.max(0, Math.min(252, +evIn.value || 0)); save(); updateCalc(); } });
        const ivIn = el('input', { type: 'number', inputmode: 'numeric', min: 0, max: 31, value: mon.ivs[k] ?? 31,
          oninput: () => { mon.ivs[k] = Math.max(0, Math.min(31, +ivIn.value || 0)); save(); updateCalc(); } });
        calcCells[k] = el('span', { class: 'evcalc' }, '');
        return [el('span', { class: 'evh' }, STAT_NAMES[k]), el('span', { class: 'evbase' }, rec.stats[k]), evIn, ivIn, calcCells[k]];
      }));

    const legal = legalMoves(rec, team.profile);
    const moveBtns = el('div', { class: 'movegrid' });
    mon.moves.forEach((mk, mi) => {
      const cur = mk ? getMove(mk, team.profile) : null;
      const b = el('button', { class: 'fsel', onclick: () => {
        pickerSheet('Move ' + (mi + 1),
          legal.map((mv) => ({ label: mv.name, sub: mv.type + ' · ' + mv.cat + ' · ' + (mv.power || '—') + ' BP', value: mv.key })),
          (v) => {
            mon.moves[mi] = v === '__none' ? null : v;
            save();
            const nm = mon.moves[mi] ? getMove(mon.moves[mi], team.profile).name : '—';
            b.firstChild.textContent = nm;
          },
          [{ label: 'Clear slot', value: '__none' }]);
      } }, el('span', { class: 'v' }, cur ? cur.name : '—'), el('span', { class: 'muted' }, '›'));
      moveBtns.append(b);
    });

    page.append(
      el('div', { class: 'card' },
        el('h3', {}, 'Set'),
        el('div', { class: 'field' }, el('label', {}, 'Ability'), abSel),
        el('div', { class: 'field' }, el('label', {}, 'Held Item'), itemBtn),
        el('div', { class: 'field' }, el('label', {}, 'Nature'), natSel),
        el('div', { class: 'field' }, el('label', {}, 'Level'), lvl),
        el('div', { class: 'field' }, el('label', {}, 'Moves (' + legal.length + ' legal)'), moveBtns)),
      el('div', { class: 'card' },
        el('h3', {}, 'EVs · IVs · Stats'),
        evGrid, evTotalEl),
      el('div', { class: 'btnrow' },
        el('button', { class: 'btn sec', onclick: () => { closeSheet(sheet); openSpecies(rec); } }, 'View Dex Entry'),
        el('button', { class: 'btn danger', onclick: () => {
          team.mons[si] = null; save(); closeSheet(sheet); done();
        } }, 'Remove')));
    body.append(page);
    updateCalc();
    sheet.querySelector('.back').addEventListener('click', done);
  });
}

// ============================== boot =====================================
bootEl.remove();
render();

// offline support when self-hosted (sw.js only exists on the Pages deploy;
// registration failing elsewhere is expected and harmless)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

} catch (err) {
  if (bootEl) bootEl.textContent = '';
  const msg = document.createElement('div');
  msg.className = 'empty';
  msg.textContent = 'Failed to start: ' + (err && err.message ? err.message : err);
  (bootEl || document.body).append(msg);
  console.error(err);
}
})();
