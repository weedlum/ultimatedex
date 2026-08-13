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
document.documentElement.style.setProperty(
  '--icons',
  "url('data:image/png;base64," + document.getElementById('icons-b64').textContent.trim() + "')"
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
const PROFILES = [
  ...[1,2,3,4,5,6,7,8,9].map((g) => ({ id: String(g), label: 'Gen ' + g })),
  { id: 'nat', label: 'National Dex' },
  { id: 'rr', label: 'Radical Red' },
];

// name -> showdown id, for icon/sprite lookups from RR names
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

// ============================== state ====================================
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem('ud.' + k)); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ud.' + k, JSON.stringify(v)); } catch {} },
};
const state = {
  tab: 'dex',
  profile: store.get('profile', 'nat'),
  teamOpen: null, // index of team being edited
  f: {
    dex: { types: [], sort: 'num', dir: 1, q: '' },
    moves: { types: [], cat: null, sort: 'name', dir: 1, q: '' },
    abil: { q: '' },
    items: { q: '' },
  },
};
function profGen(prof) { const p = prof ?? state.profile; return p === 'nat' || p === 'rr' ? 9 : +p; }
function profLabel(p) { return (PROFILES.find((x) => x.id === (p ?? state.profile)) || {}).label || p; }

// ============================== records ==================================
const abilityByName = {};
for (const id in D.abilities) abilityByName[D.abilities[id].name] = id;

function offSpeciesRec(id) {
  const e = D.dex[id];
  if (!e) return null;
  const abilities = [];
  for (const slot in e.abilities) {
    const nm = e.abilities[slot];
    const a = D.abilities[toID(nm)] || {};
    abilities.push({ name: nm, hidden: slot === 'H', desc: a.shortDesc || a.desc || '' });
  }
  const bst = STAT_KEYS.reduce((s, k) => s + e.baseStats[k], 0);
  return { key: id, psid: id, name: e.name, num: e.num, dexno: '#' + String(e.num).padStart(4, '0'),
    types: e.types, stats: e.baseStats, bst, abilities, src: 'off', e };
}
function rrSpeciesRec(id) {
  const s = D.rr.species[id];
  if (!s || !s.name) return null;
  let types = s.type.map((t) => (D.rr.types[t] || {}).name).filter(Boolean);
  if (types.length === 2 && types[0] === types[1]) types = [types[0]];
  const st = { hp: s.stats[0], atk: s.stats[1], def: s.stats[2], spe: s.stats[3], spa: s.stats[4], spd: s.stats[5] };
  const abilities = [];
  (s.abilities || []).forEach((a, i) => {
    const aid = Array.isArray(a) ? a[0] : a;
    if (!aid) return;
    const ab = D.rr.abilities[aid];
    if (!ab) return;
    const name = ab.names ? ab.names[0] : ab.name;
    if (abilities.some((x) => x.name === name)) return;
    abilities.push({ name, hidden: i === 2, desc: ab.description || '', rrId: aid });
  });
  const bst = STAT_KEYS.reduce((t, k) => t + st[k], 0);
  return { key: 'r' + id, rrId: +id, psid: rrPsId(s.name), name: s.name, num: s.dexID,
    dexno: '#' + String(s.dexID).padStart(3, '0'), types, stats: st, bst, abilities, src: 'rr', s };
}
function getSpecies(key, prof) {
  return String(key)[0] === 'r' && (prof ?? state.profile) === 'rr' || String(key)[0] === 'r'
    ? rrSpeciesRec(String(key).slice(1)) : offSpeciesRec(key);
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
const listCache = {};
function speciesList(prof) {
  prof = prof ?? state.profile;
  const ck = 's:' + prof;
  if (listCache[ck]) return listCache[ck];
  let out = [];
  if (prof === 'rr') {
    for (const id in D.rr.species) { const r = rrSpeciesRec(id); if (r) out.push(r); }
    out.sort((a, b) => a.num - b.num || (a.s.order || 0) - (b.s.order || 0));
  } else {
    const gen = prof === 'nat' ? 0 : +prof;
    for (const id in D.dex) { const e = D.dex[id]; if (offAvailable(e, gen)) out.push(offSpeciesRec(id)); }
    out.sort((a, b) => a.num - b.num || (a.e.forme ? 1 : 0) - (b.e.forme ? 1 : 0) || a.name.localeCompare(b.name));
  }
  return (listCache[ck] = out);
}

function offMoveRec(id) {
  const m = D.moves[id];
  if (!m) return null;
  return { key: id, name: m.name, type: m.type, cat: m.category, power: m.basePower || 0,
    acc: m.accuracy === true ? '—' : m.accuracy, pp: m.pp, priority: m.priority,
    desc: m.shortDesc || m.desc || '', longDesc: m.desc || m.shortDesc || '', src: 'off', m };
}
function rrMoveRec(id) {
  id = typeof id === 'object' ? id.ID : id;
  const m = D.rr.moves[id];
  if (!m || !m.name || m.ID === 0) return null;
  return { key: 'r' + id, rrId: +id, name: m.name, type: (D.rr.types[m.type] || {}).name || '???',
    cat: D.rr.splits[m.split] || '—', power: m.power || 0, acc: m.accuracy || '—', pp: m.pp,
    priority: m.priority, desc: m.description || '', longDesc: m.description || '', src: 'rr', m };
}
function getMove(key) { return String(key)[0] === 'r' && !D.moves[key] ? rrMoveRec(String(key).slice(1)) : offMoveRec(key); }
function movesList(prof) {
  prof = prof ?? state.profile;
  const ck = 'm:' + prof;
  if (listCache[ck]) return listCache[ck];
  let out = [];
  if (prof === 'rr') {
    for (const id in D.rr.moves) { const r = rrMoveRec(id); if (r) out.push(r); }
  } else {
    const gen = prof === 'nat' ? 9 : +prof;
    const nat = prof === 'nat';
    for (const id in D.moves) {
      const m = D.moves[id];
      if (['CAP', 'Custom', 'LGPE'].includes(m.isNonstandard)) continue;
      if (m.isMax || m.isZ) continue;
      if (!nat) {
        if (m.num > MOVE_CAPS[gen] || m.num < 1) continue;
        if (gen === 9 && m.isNonstandard === 'Past') continue;
      } else if (m.num < 1) continue;
      out.push(offMoveRec(id));
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
function rrAbilityRec(id) {
  const a = D.rr.abilities[id];
  if (!a || !a.ID) return null;
  return { key: 'r' + id, rrId: +id, name: a.names ? a.names[0] : a.name, desc: a.description || '', longDesc: a.description || '', src: 'rr' };
}
function getAbility(key) { return String(key)[0] === 'r' && !D.abilities[key] ? rrAbilityRec(String(key).slice(1)) : offAbilityRec(key); }
function abilitiesList(prof) {
  prof = prof ?? state.profile;
  const ck = 'a:' + prof;
  if (listCache[ck]) return listCache[ck];
  const out = [];
  if (prof === 'rr') { for (const id in D.rr.abilities) { const r = rrAbilityRec(id); if (r) out.push(r); } }
  else { for (const id in D.abilities) { const r = offAbilityRec(id); if (r) out.push(r); } }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return (listCache[ck] = out);
}

function offItemRec(id) {
  const it = D.items[id];
  if (!it || it.isNonstandard === 'CAP' || it.isNonstandard === 'Custom') return null;
  return { key: id, name: it.name, desc: it.shortDesc || it.desc || '', longDesc: it.desc || it.shortDesc || '', gen: it.gen, src: 'off' };
}
function rrItemRec(id) {
  const it = D.rr.items[id];
  if (!it || !it.ID || !it.name || it.name === '????????') return null;
  return { key: 'r' + id, rrId: +id, name: it.name, desc: it.description || '', longDesc: it.description || '', src: 'rr' };
}
function getItem(key) { return String(key)[0] === 'r' && !D.items[key] ? rrItemRec(String(key).slice(1)) : offItemRec(key); }
function itemsList(prof) {
  prof = prof ?? state.profile;
  const ck = 'i:' + prof;
  if (listCache[ck]) return listCache[ck];
  const out = [];
  if (prof === 'rr') { for (const id in D.rr.items) { const r = rrItemRec(id); if (r) out.push(r); } }
  else {
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
    const mv = offMoveRec(mid);
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
function rrLearnset(rrId) {
  const s = D.rr.species[rrId];
  const out = { level: [], machine: [], tutor: [], egg: [], other: [] };
  if (!s) return out;
  for (const [mid, lvl] of s.levelupMoves || []) { const mv = rrMoveRec(mid); if (mv) out.level.push({ lvl, mv }); }
  out.level.sort((a, b) => a.lvl - b.lvl);
  for (const tm of s.tmMoves || []) { const mv = rrMoveRec(D.rr.tmMoves[tm]); if (mv) out.machine.push(mv); }
  for (const t of s.tutorMoves || []) { const mv = rrMoveRec(D.rr.tutorMoves[t]); if (mv) out.tutor.push(mv); }
  for (const mid of s.eggMoves || []) { const mv = rrMoveRec(mid); if (mv) out.egg.push(mv); }
  for (const k of ['machine', 'tutor', 'egg']) out[k].sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
function getLearnset(rec, prof) { return rec.src === 'rr' ? rrLearnset(rec.rrId) : offLearnset(rec.psid, prof); }
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
  if (moveRec.src === 'rr') {
    const mid = moveRec.rrId;
    const tmNos = Object.keys(D.rr.tmMoves).filter((k) => {
      const v = D.rr.tmMoves[k]; return (typeof v === 'object' ? v.ID : v) === mid;
    }).map(Number);
    const tutNos = Object.keys(D.rr.tutorMoves).filter((k) => {
      const v = D.rr.tutorMoves[k]; return (typeof v === 'object' ? v.ID : v) === mid;
    }).map(Number);
    for (const rec of speciesList('rr')) {
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
function defenseProfile(rec) {
  const out = {};
  if (rec.src === 'rr') {
    const defIdx = rec.s.type.map(Number);
    for (const aid in D.rr.types) {
      const t = D.rr.types[aid];
      let mult = 1;
      for (const d of new Set(defIdx)) mult *= RR_MULT[t.matchup[d]] ?? 1;
      out[t.name] = mult;
    }
  } else {
    for (const atk of TYPES) {
      let mult = 1;
      for (const def of rec.types) {
        const row = D.typechart[toID(def)];
        if (row) mult *= OFF_MULT[row.damageTaken[atk]] ?? 1;
      }
      out[atk] = mult;
    }
  }
  return out;
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
function rrEvoText(evo) {
  const tpl = D.rr.evolutions[evo[0]];
  if (!tpl) return 'Special';
  try {
    // Templates ship as backtick strings inside RRDex's own data file (baked in
    // at build time, never user input), e.g. "`at Level ${evo[1]}`".
    const fn = new Function('evo', 'items', 'species', 'moves', 'types', 'return ' + tpl);
    return fn(evo, D.rr.items, D.rr.species, D.rr.moves, D.rr.types).replace(/^at |^on |^with /, (m) => m);
  } catch { return 'Special'; }
}
function evoChain(rec) {
  // returns {root, kids(key)->[{rec, cond}]}
  if (rec.src === 'rr') {
    let rootId = rec.s.ancestor || rec.rrId;
    if (!D.rr.species[rootId]) rootId = rec.rrId;
    return {
      root: rrSpeciesRec(rootId),
      kids(r) {
        return (r.s.evolutions || []).map((evo) => {
          const target = rrSpeciesRec(evo[2]);
          return target ? { rec: target, cond: rrEvoText(evo) } : null;
        }).filter(Boolean);
      },
    };
  }
  let e = rec.e, guard = 0;
  while (e.prevo && guard++ < 6) { const p = D.dex[toID(e.prevo)]; if (!p) break; e = p; }
  return {
    root: offSpeciesRec(toID(e.name)),
    kids(r) {
      return (r.e.evos || []).map((nm) => {
        const t = offSpeciesRec(toID(nm));
        return t ? { rec: t, cond: offEvoText(t.e) } : null;
      }).filter(Boolean);
    },
  };
}

// ---------- RR encounters ----------
let rrEncIndex = null;
function rrEncounters(rrId) {
  if (!rrEncIndex) {
    rrEncIndex = {};
    for (const area of D.rr.areas || []) {
      for (const k in area) {
        if (!k.startsWith('wild-')) continue;
        const method = k.slice(5).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
        for (const slot in area[k]) {
          for (const ent of area[k][slot]) {
            const [sid, lo, hi] = ent;
            (rrEncIndex[sid] = rrEncIndex[sid] || []).push({ area: area.name, method, lo, hi });
          }
        }
      }
    }
    for (const sid in rrEncIndex) {
      const merged = {};
      for (const x of rrEncIndex[sid]) {
        const key = x.area + '|' + x.method;
        if (!merged[key]) merged[key] = x;
        else { merged[key].lo = Math.min(merged[key].lo, x.lo); merged[key].hi = Math.max(merged[key].hi, x.hi); }
      }
      rrEncIndex[sid] = Object.values(merged);
    }
  }
  return rrEncIndex[rrId] || [];
}

// ============================== teams ====================================
let teams = store.get('teams', []);
function saveTeams() { store.set('teams', teams); }
function newTeam() {
  teams.push({ name: 'New Team', profile: state.profile, mons: [null, null, null, null, null, null] });
  saveTeams();
  return teams.length - 1;
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
    if (mon.level && mon.level !== 100) lines.push('Level: ' + mon.level);
    if (mon.nature) lines.push(mon.nature + ' Nature');
    for (const mk of mon.moves) {
      if (!mk) continue;
      const mv = getMove(mk);
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
  const idx = iconIndexFor(rec);
  const d = el('div', { class: 'picon' });
  d.style.backgroundPosition = `-${(idx % 12) * 40}px -${Math.floor(idx / 12) * 30}px`;
  if (scale) d.style.transform = `scale(${scale})`;
  return d;
}
function typeBadge(t) { return el('span', { class: 'type', style: 'background:' + (TYPE_COLORS[t] || '#68A090') }, t); }
function typeRow(types) { return el('div', { class: 'types' }, types.map(typeBadge)); }
function chunkList(container, items, renderItem, chunk = 80) {
  let i = 0;
  const sentinel = el('div', { style: 'height:1px' });
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
  const sheet = el('div', { class: 'sheet' },
    el('header', {},
      el('div', { class: 'hrow' },
        el('div', { class: 'htitle' },
          el('button', { class: 'back', onclick: () => closeSheet(sheet) }, '‹ Back'),
          el('span', {}, title)))),
    body);
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
  // items: [{label, sub, rec?, value}]
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
          it.rec ? iconEl(it.rec) : null,
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
  app.textContent = '';
  ({ dex: viewDex, moves: viewMoves, abil: viewAbilities, items: viewItems, teams: viewTeams }[state.tab] || viewDex)();
  app.append(buildNav());
}
function buildNav() {
  const tabs = [
    ['dex', '◓', 'Pokédex'], ['moves', '⚡', 'Moves'], ['abil', '✨', 'Abilities'],
    ['items', '🎒', 'Items'], ['teams', '⚔️', 'Teams'],
  ];
  return el('nav', {}, tabs.map(([id, ic, label]) =>
    el('button', { class: state.tab === id ? 'on' : '', onclick: () => { state.tab = id; render(); } },
      el('span', { class: 'ni' }, ic), label)));
}
function profileSelect() {
  const sel = el('select', { class: 'profile-pill', onchange: () => {
    state.profile = sel.value;
    store.set('profile', state.profile);
    state.f.dex.types = []; state.f.moves.types = []; state.f.moves.cat = null;
    render();
  } }, PROFILES.map((p) => el('option', { value: p.id }, p.label)));
  sel.value = state.profile;
  return sel;
}
function listHeader(title, fkey, chipsBuilder) {
  const f = state.f[fkey];
  const search = el('input', { type: 'search', placeholder: 'Search ' + title.toLowerCase() + '…',
    autocomplete: 'off', value: f.q, oninput: () => { f.q = search.value; refreshers.list && refreshers.list(); } });
  return el('header', {},
    el('div', { class: 'hrow' }, el('div', { class: 'htitle' }, title), profileSelect()),
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
      TYPES.map((t) => {
        const b = el('button', {
          class: 'chip' + (f.types.includes(t) ? ' on' : ''),
          style: f.types.includes(t) ? 'background:' + TYPE_COLORS[t] : '',
          onclick: () => {
            const i = f.types.indexOf(t);
            if (i >= 0) f.types.splice(i, 1); else { f.types.push(t); if (f.types.length > 2) f.types.shift(); }
            render();
          },
        }, t);
        return b;
      }));
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

function spriteEl(rec) {
  const holder = el('div', { class: 'art' });
  if (rec.psid) {
    const img = el('img', { alt: rec.name, loading: 'lazy' });
    img.onerror = () => { img.remove(); holder.append(iconEl(rec, 2)); };
    img.src = 'https://play.pokemonshowdown.com/sprites/gen5/' + rec.psid + '.png';
    holder.append(img);
  } else holder.append(iconEl(rec, 2));
  return holder;
}
function openSpecies(rec) {
  openSheet(rec.name, (body) => {
    const prof = state.profile;
    // hero
    const meta = [];
    if (rec.src === 'off') {
      if (rec.e.heightm) meta.push(rec.e.heightm + ' m');
      if (rec.e.weightkg) meta.push(rec.e.weightkg + ' kg');
      if (rec.e.forme) meta.push(rec.e.forme + ' Forme');
    }
    body.append(el('div', { class: 'page' },
      el('div', { class: 'hero' }, spriteEl(rec),
        el('div', {},
          el('div', { class: 'dexno' }, rec.dexno + (rec.src === 'rr' ? ' · Radical Red' : '')),
          el('h2', {}, rec.name),
          el('div', { style: 'margin-top:6px' }, typeRow(rec.types)),
          meta.length ? el('div', { class: 'meta' }, meta.join(' · ')) : null))));
    const page = body.firstChild;

    // stats
    page.append(el('div', { class: 'card' }, el('h3', {}, 'Base Stats'),
      STAT_KEYS.map((k) => {
        const v = rec.stats[k];
        const hue = Math.round(Math.min(v, 150) / 150 * 120);
        return el('div', { class: 'statrow' },
          el('span', { class: 'sn' }, STAT_NAMES[k]),
          el('span', { class: 'sv' }, v),
          el('div', { class: 'sbar' }, el('i', { style: `width:${Math.min(100, v / 2)}%;background:hsl(${hue} 70% 48%)` })));
      }),
      el('div', { class: 'bst' }, 'Total: ' + rec.bst)));

    // abilities
    if (rec.abilities.length) {
      page.append(el('div', { class: 'card' }, el('h3', {}, 'Abilities'),
        rec.abilities.map((a) => el('button', { class: 'abil', style: 'display:block;width:100%;text-align:left', onclick: () => {
          const key = a.rrId ? 'r' + a.rrId : abilityByName[a.name];
          const ab = key != null ? getAbility(String(key)) : null;
          if (ab) openAbility(ab);
        } },
          el('div', { class: 'an' }, a.name, a.hidden ? el('span', { class: 'tag' }, 'Hidden') : null),
          a.desc ? el('div', { class: 'ad' }, a.desc) : null))));
    }

    // held items (RR)
    if (rec.src === 'rr') {
      const held = (rec.s.items || []).filter(Boolean).map((i) => rrItemRec(i)).filter(Boolean);
      if (held.length) page.append(el('div', { class: 'card' }, el('h3', {}, 'Wild Held Items'),
        held.map((it) => el('div', { class: 'kv' }, el('span', { class: 'k' }, it.name), el('span', {}, '')))));
    }

    // defenses
    const def = defenseProfile(rec);
    const groups = [[4, '4×'], [2, '2×'], [0.5, '½×'], [0.25, '¼×'], [0, '0×']];
    const defRows = groups.map(([m, label]) => {
      const ts = Object.keys(def).filter((t) => def[t] === m);
      return ts.length ? el('div', { class: 'defrow' }, el('span', { class: 'mult' }, label), typeRow(ts)) : null;
    }).filter(Boolean);
    page.append(el('div', { class: 'card' }, el('h3', {}, 'Defenses'),
      defRows.length ? defRows : el('div', { class: 'muted' }, 'No weaknesses or resistances.')));

    // evolutions
    const chain = evoChain(rec);
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

    // encounters (RR)
    if (rec.src === 'rr') {
      const enc = rrEncounters(rec.rrId);
      if (enc.length) page.append(el('div', { class: 'card' }, el('h3', {}, 'Locations (Radical Red)'),
        enc.map((x) => el('div', { class: 'kv' },
          el('span', { class: 'k' }, x.area),
          el('span', {}, x.method + ' · Lv ' + (x.lo === x.hi ? x.lo : x.lo + '–' + x.hi))))));
    }

    // learnset
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
      if (!rows.length) lsList.append(el('div', { class: 'empty' }, 'No moves in this category' + (rec.src === 'off' ? ' for ' + profLabel(prof) : '') + '.'));
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
      TYPES.map((t) => el('button', {
        class: 'chip' + (f.types.includes(t) ? ' on' : ''),
        style: f.types.includes(t) ? 'background:' + TYPE_COLORS[t] : '',
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
            typeBadge(mv.type), el('span', { class: 'stat' }, mv.cat)))),
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
        el('div', { class: 'body' },
          el('div', { class: 'name' }, it.name),
          el('div', { class: 'sub' }, it.desc))));
  };
  app.append(listHeader('Items', 'items'), el('main', {}, count, list));
  refreshers.list();
}
function openItem(it) {
  openSheet(it.name, (body) => {
    body.append(el('div', { class: 'page' },
      el('div', { class: 'card' }, el('h3', {}, 'Effect'), el('div', {}, it.longDesc || it.desc || '—'))));
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
    el('header', {}, el('div', { class: 'hrow' }, el('div', { class: 'htitle' }, 'Teams'), profileSelect())),
    el('main', {}, el('div', { class: 'page' },
      el('button', { class: 'btn', onclick: () => { state.teamOpen = newTeam(); render(); } }, '+ New Team (' + profLabel() + ')'),
      list)));
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
    if (!rec) { team.mons[si] = null; return; }
    slots.append(el('button', { class: 'slot filled', onclick: () => openMonEditor(team, si, redraw) },
      iconEl(rec, 1.2),
      el('span', { class: 'sn' }, rec.name),
      el('span', { class: 'si' }, [mon.item, mon.ability].filter(Boolean).join(' · ') || 'Tap to edit')));
  });

  // type coverage: how many members are weak / resistant per attacking type
  const covered = team.mons.filter(Boolean).map((m) => getSpecies(m.sp, team.profile)).filter(Boolean);
  const cov = el('div', { class: 'covgrid' });
  const typeNames = team.profile === 'rr'
    ? Object.values(D.rr.types).map((t) => t.name) : TYPES;
  for (const t of typeNames) {
    let weak = 0, res = 0;
    for (const rec of covered) {
      const m = defenseProfile(rec)[t];
      if (m > 1) weak++; else if (m < 1) res++;
    }
    cov.append(el('div', { class: 'covcell', style: 'background:' + (TYPE_COLORS[t] || '#68A090') },
      el('div', { class: 'ct' }, t.slice(0, 3)),
      el('div', { class: 'cv' }, weak + ' / ' + res)));
  }

  page.append(
    el('div', { class: 'field' }, el('label', {}, 'Team name'), nameInput),
    slots,
    covered.length ? el('div', { class: 'card' }, el('h3', {}, 'Defensive Coverage (weak / resist)'), cov) : null,
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
        nature: 'Hardy', level: 100, moves: [null, null, null, null] };
      saveTeams();
      done();
    });
}
function openMonEditor(team, si, done) {
  const mon = team.mons[si];
  const rec = getSpecies(mon.sp, team.profile);
  openSheet(rec.name, (body, sheet) => {
    const page = el('div', { class: 'page' });
    const save = () => saveTeams();

    page.append(el('div', { class: 'hero' }, spriteEl(rec),
      el('div', {},
        el('div', { class: 'dexno' }, rec.dexno),
        el('h2', {}, rec.name),
        el('div', { style: 'margin-top:6px' }, typeRow(rec.types)))));

    // ability
    const abSel = el('select', { class: 'fsel', onchange: () => { mon.ability = abSel.value; save(); } },
      rec.abilities.map((a) => el('option', { value: a.name }, a.name + (a.hidden ? ' (Hidden)' : ''))));
    abSel.value = mon.ability || (rec.abilities[0] || {}).name || '';

    // item
    const itemBtn = el('button', { class: 'fsel', onclick: () => {
      pickerSheet('Choose Item',
        itemsList(team.profile).map((it) => ({ label: it.name, sub: it.desc, value: it.name })),
        (v) => { mon.item = v === '__none' ? '' : v; save(); itemBtn.firstChild.textContent = mon.item || 'None'; },
        [{ label: 'No Item', value: '__none' }]);
    } }, el('span', { class: 'v' }, mon.item || 'None'), el('span', { class: 'muted' }, '›'));

    // nature + level
    const natSel = el('select', { class: 'fsel', onchange: () => { mon.nature = natSel.value; save(); } },
      NATURES.map((n) => {
        const fx = natureFx(n);
        return el('option', { value: n }, n + (fx ? ` (+${STAT_NAMES[fx.plus]} −${STAT_NAMES[fx.minus]})` : ' (neutral)'));
      }));
    natSel.value = mon.nature || 'Hardy';
    const lvl = el('input', { class: 'fsel', type: 'number', min: 1, max: 100, value: mon.level || 100,
      onchange: () => { mon.level = Math.max(1, Math.min(100, +lvl.value || 100)); save(); } });

    // moves
    const legal = legalMoves(rec, team.profile);
    const moveBtns = el('div', { class: 'movegrid' });
    mon.moves.forEach((mk, mi) => {
      const cur = mk ? getMove(mk) : null;
      const b = el('button', { class: 'fsel', onclick: () => {
        pickerSheet('Move ' + (mi + 1),
          legal.map((mv) => ({ label: mv.name, sub: mv.type + ' · ' + mv.cat + ' · ' + (mv.power || '—') + ' BP', value: mv.key })),
          (v) => {
            mon.moves[mi] = v === '__none' ? null : v;
            save();
            const nm = mon.moves[mi] ? getMove(mon.moves[mi]).name : '—';
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
      el('div', { class: 'btnrow' },
        el('button', { class: 'btn sec', onclick: () => { closeSheet(sheet); openSpecies(rec); } }, 'View Dex Entry'),
        el('button', { class: 'btn danger', onclick: () => {
          team.mons[si] = null; save(); closeSheet(sheet); done();
        } }, 'Remove')));
    body.append(page);
    const origClose = sheet.querySelector('.back');
    origClose.addEventListener('click', done);
  });
}

// ============================== boot =====================================
bootEl.remove();
render();

} catch (err) {
  if (bootEl) bootEl.textContent = '';
  const msg = document.createElement('div');
  msg.className = 'empty';
  msg.textContent = 'Failed to start: ' + (err && err.message ? err.message : err);
  (bootEl || document.body).append(msg);
  console.error(err);
}
})();
