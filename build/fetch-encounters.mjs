// Downloads official-game wild encounter data from PokeAPI, one JSON per
// species, into data/encounters/ (cached; safe to re-run).
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'data/encounters');
fs.mkdirSync(outDir, { recursive: true });

const dex = JSON.parse(fs.readFileSync(path.join(root, 'data/pokedex.json'), 'utf8'));
let maxNum = 0;
for (const id in dex) if (dex[id].num > maxNum) maxNum = dex[id].num;

const nums = [];
for (let n = 1; n <= maxNum; n++) {
  if (!fs.existsSync(path.join(outDir, n + '.json'))) nums.push(n);
}
console.log(`fetching ${nums.length} of ${maxNum}`);

let done = 0, failed = 0;
async function worker() {
  while (nums.length) {
    const n = nums.shift();
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${n}/encounters`);
      if (!res.ok) throw new Error(res.status);
      fs.writeFileSync(path.join(outDir, n + '.json'), await res.text());
    } catch { failed++; }
    if (++done % 100 === 0) console.log(`  ${done} done`);
    await new Promise((r) => setTimeout(r, 60));
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`done; failed: ${failed}`);
