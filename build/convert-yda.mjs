// Converts a ydarissep dex-core dump (build/scrape-yda.mjs) into the app's
// internal hack-data schema (the RRDex-shaped format the app already renders).
const TYPES = ['NORMAL','FIRE','WATER','GRASS','ELECTRIC','ICE','FIGHTING','POISON','GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY'];
const TYPE_NAMES = ['Normal','Fire','Water','Grass','Electric','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
const NATURES = ['Hardy','Lonely','Brave','Adamant','Naughty','Bold','Docile','Relaxed','Impish','Lax','Timid','Hasty','Serious','Jolly','Naive','Modest','Mild','Quiet','Bashful','Rash','Calm','Gentle','Sassy','Careful','Quirky'];

const title = (s) => s.toLowerCase().replace(/(^|[ -])([a-z])/g, (m, a, b) => a + b.toUpperCase());
function prettySpecies(constant) {
  let parts = constant.replace(/^SPECIES_/, '').split('_');
  const move = { ALOLAN: 'Alolan', ALOLA: 'Alolan', GALARIAN: 'Galarian', GALAR: 'Galarian', HISUIAN: 'Hisuian', HISUI: 'Hisuian', PALDEAN: 'Paldean', PALDEA: 'Paldean' };
  let prefix = '';
  parts = parts.filter((p) => {
    if (move[p]) { prefix = move[p] + ' '; return false; }
    return true;
  });
  parts = parts.map((p) => (p === 'GIGA' || p === 'GMAX' ? 'Gmax' : title(p)));
  return prefix + parts.join(' ');
}
const pretty = (c) => title(String(c).replace(/^(ITEM|MOVE|ABILITY|NATURE|TRAINER|EGG_GROUP)_/, '').replace(/_/g, ' '));

export default function convertYda(dump) {
  const typeIdx = {};
  TYPES.forEach((t, i) => (typeIdx['TYPE_' + t] = i));

  const types = {};
  TYPE_NAMES.forEach((name, i) => {
    const chart = dump.typeChart && dump.typeChart['TYPE_' + TYPES[i]];
    const matchup = TYPE_NAMES.map((_, d) => {
      const m = chart ? chart['TYPE_' + TYPES[d]] : 1;
      return m === 1 || m == null ? 0 : m === 0 ? 1 : Math.round(m * 10);
    });
    types[i] = { ID: i, name, matchup };
  });

  const moves = {}, mid = {};
  let mi = 1;
  for (const key in dump.moves || {}) {
    const m = dump.moves[key];
    mid[key] = mi;
    moves[mi] = {
      ID: mi,
      name: m.ingameName || pretty(key),
      power: +m.power || 0,
      type: typeIdx[m.type] ?? 0,
      accuracy: +m.accuracy || 0,
      pp: +m.PP || 0,
      priority: +m.priority || 0,
      split: m.split === 'SPLIT_PHYSICAL' ? 0 : m.split === 'SPLIT_SPECIAL' ? 1 : 2,
      description: Array.isArray(m.description) ? m.description.join(' ') : (m.description || ''),
    };
    mi++;
  }
  const abilities = {}, aid = {};
  let ai = 1;
  abilities[0] = { ID: 0, names: ['—'], description: '' };
  for (const key in dump.abilities || {}) {
    const a = dump.abilities[key];
    if (key === 'ABILITY_NONE') { aid[key] = 0; continue; }
    aid[key] = ai;
    abilities[ai] = { ID: ai, names: [a.ingameName || pretty(key)], description: a.description || '' };
    ai++;
  }
  const items = {}, iid = {};
  let ii = 1;
  for (const key in dump.items || {}) {
    if (key === 'ITEM_NONE') { iid[key] = 0; continue; }
    const it = dump.items[key];
    iid[key] = ii;
    items[ii] = { ID: ii, name: it.ingameName || pretty(key), description: it.description || '' };
    ii++;
  }

  // synthetic TM/tutor tables (the app resolves species TM lists through these)
  const tmSet = new Map(), tutorSet = new Map();
  const tmNo = (m) => { if (!tmSet.has(m)) tmSet.set(m, tmSet.size); return tmSet.get(m); };
  const tutNo = (m) => { if (!tutorSet.has(m)) tutorSet.set(m, tutorSet.size); return tutorSet.get(m); };

  const species = {}, sid = {};
  let si = 1;
  const isReal = (s) => s && (+s.baseHP || 0) + (+s.baseAttack || 0) > 0 && !/^SPECIES_(NONE|EGG)$/.test(s.name || '');
  for (const key in dump.species || {}) { if (isReal(dump.species[key])) sid[key] = si++; }

  const evoText = (evo, targetName) => {
    const [method, param] = evo;
    const p = pretty(param || '');
    switch (String(method)) {
      case 'EVO_LEVEL': return 'at Level ' + param;
      case 'EVO_ITEM': case 'EVO_MEGA': case 'EVO_ITEM_HOLD': return 'with a ' + p;
      case 'EVO_TRADE': return 'by Trade';
      case 'EVO_TRADE_ITEM': return 'by Trade holding ' + p;
      case 'EVO_FRIENDSHIP': case 'EVO_FRIENDSHIP_DAY': case 'EVO_FRIENDSHIP_NIGHT':
        return 'with Friendship' + (method.endsWith('DAY') ? ' (Day)' : method.endsWith('NIGHT') ? ' (Night)' : '');
      case 'EVO_MOVE': return 'knowing ' + p;
      case 'EVO_MOVE_TYPE': return 'knowing a ' + p + ' move';
      case 'EVO_LEVEL_DAY': return 'at Level ' + param + ' (Day)';
      case 'EVO_LEVEL_NIGHT': return 'at Level ' + param + ' (Night)';
      case 'EVO_LEVEL_MALE': return 'at Level ' + param + ' (Male)';
      case 'EVO_LEVEL_FEMALE': return 'at Level ' + param + ' (Female)';
      case 'EVO_LEVEL_ATK_GT_DEF': return 'at Level ' + param + ' (Atk > Def)';
      case 'EVO_LEVEL_ATK_LT_DEF': return 'at Level ' + param + ' (Atk < Def)';
      case 'EVO_LEVEL_ATK_EQ_DEF': return 'at Level ' + param + ' (Atk = Def)';
      case 'EVO_GIGANTAMAX': return 'Gigantamax';
      case 'EVO_RAINY_FOGGY_OW': return 'at Level ' + param + ' in Rain/Fog';
      default: return p ? 'with ' + p : 'Special';
    }
  };

  for (const key in dump.species || {}) {
    const s = dump.species[key];
    const num = sid[key];
    if (!num) continue;
    const evolutions = [], evoTexts = [];
    for (const evo of s.evolution || []) {
      const target = sid[evo[2]];
      if (!target) continue;
      evolutions.push([0, 0, target, 0]);
      evoTexts.push(evoText(evo, evo[2]));
    }
    species[num] = {
      ID: num,
      name: prettySpecies(key),
      key,
      dexID: s.ID || num,
      stats: [+s.baseHP || 0, +s.baseAttack || 0, +s.baseDefense || 0, +s.baseSpeed || 0, +s.baseSpAttack || 0, +s.baseSpDefense || 0],
      type: [typeIdx[s.type1] ?? 0, typeIdx[s.type2] ?? typeIdx[s.type1] ?? 0],
      abilities: (s.abilities || []).slice(0, 3).map((a) => [aid[a] ?? 0, 0]),
      items: [iid[s.item1] ?? 0, iid[s.item2] ?? 0],
      levelupMoves: (s.levelUpLearnsets || []).map(([m, l]) => [mid[m], +l]).filter((x) => x[0]),
      tmMoves: [...new Set((s.TMHMLearnsets || []).map((m) => mid[m]).filter(Boolean).map(tmNo))],
      tutorMoves: [...new Set((s.tutorLearnsets || []).map((m) => mid[m]).filter(Boolean).map(tutNo))],
      eggMoves: (s.eggMovesLearnsets || []).map((m) => mid[m]).filter(Boolean),
      evolutions,
      evoTexts,
      ancestor: sid[(s.evolutionLine || [])[0]] || num,
    };
  }

  const tmMoves = {}, tutorMoves = {};
  for (const [m, no] of tmSet) tmMoves[no] = m;
  for (const [m, no] of tutorSet) tutorMoves[no] = m;

  // locations: {area: {Method: {SPECIES: rate%}}} -> areas[] ([sid, -1, -1, rate])
  const areas = [];
  for (const areaName in dump.locations || {}) {
    const area = { name: areaName };
    for (const method in dump.locations[areaName]) {
      const slot = [];
      for (const sp in dump.locations[areaName][method]) {
        if (!sid[sp]) continue;
        slot.push([sid[sp], -1, -1, dump.locations[areaName][method][sp]]);
      }
      if (slot.length) area['wild-' + method.replace(/ /g, '')] = { 0: slot };
    }
    if (Object.keys(area).length > 1) areas.push(area);
  }

  const natures = {};
  NATURES.forEach((n, i) => (natures[i] = n));
  const natIdx = {};
  NATURES.forEach((n, i) => (natIdx['NATURE_' + n.toUpperCase()] = i));

  // trainers (IE-style dumps): {area: {TRAINER_X: {ingameName, party: {Difficulty: [mon]}}}}
  const trainers = {};
  let ti = 1;
  for (const areaName in dump.trainers || {}) {
    for (const tkey in dump.trainers[areaName]) {
      const t = dump.trainers[areaName][tkey];
      if (!t || !t.party) continue;
      const rec = { ID: ti, name: t.ingameName || pretty(tkey), areaName };
      for (const diff in t.party) {
        const mons = (t.party[diff] || []).map((pm) => ({
          species: sid[pm.name],
          level: +pm.lvl || 0,
          nature: natIdx[pm.nature] ?? 0,
          ability: +pm.ability || 0,
          item: iid[pm.item] ?? 0,
          moves: (pm.moves || []).map((m) => mid[m]).filter(Boolean),
          IVs: (pm.ivs || []).map(Number),
          EVs: (pm.evs || []).map(Number),
        })).filter((m) => m.species);
        if (mons.length) rec[diff.toLowerCase() === 'normal' ? 'normal' : diff.toLowerCase()] = mons;
      }
      if (Object.keys(rec).length > 3) trainers[ti++] = rec;
    }
  }

  return { species, moves, abilities, items, types, natures, areas, trainers,
    tmMoves, tutorMoves, splits: { 0: 'Physical', 1: 'Special', 2: 'Status' } };
}
