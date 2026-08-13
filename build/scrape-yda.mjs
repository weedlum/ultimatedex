// Extracts rom-hack dex data by running ydarissep's dex sites headlessly and
// letting THEIR parsers build the data from each hack's source repos, then
// dumping the resulting globals. Usage: node build/scrape-yda.mjs [probe|dump] <url> <outfile>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import CDP from 'chrome-remote-interface';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [mode, url, outfile] = process.argv.slice(2);
const port = 9333;

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`,
  '--user-data-dir=/tmp/ud-scrape-profile', 'about:blank',
], { stdio: 'ignore' });

async function connect() {
  for (let i = 0; i < 50; i++) {
    try { return await CDP({ port }); } catch { await new Promise((r) => setTimeout(r, 300)); }
  }
  throw new Error('could not connect to chrome');
}

try {
  const client = await connect();
  const { Page, Runtime } = client;
  await Page.enable();
  await Runtime.enable();
  await Page.navigate({ url });

  const evaljs = async (expr) => (await Runtime.evaluate({ expression: expr, returnByValue: true, awaitPromise: true })).result.value;

  // wait for their pipeline to finish: species global populated and stable
  let last = 0, stable = 0;
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const n = await evaljs(`(() => { const s = window.species; if (!s) return 0;
      return Array.isArray(s) ? s.length : Object.keys(s).length; })()`);
    if (n > 100 && n === last) { if (++stable >= 5) break; } else stable = 0;
    last = n;
    if (i % 15 === 14) console.error(`  waiting… species entries: ${n}`);
  }
  console.error(`species entries settled at ${last}`);

  if (mode === 'probe') {
    const probe = await evaljs(`(() => {
      const out = {};
      for (const k of Object.keys(window)) {
        const v = window[k];
        if (!v || typeof v !== 'object' || v.nodeType || v === window) continue;
        const n = Array.isArray(v) ? v.length : Object.keys(v).length;
        if (n > 30) out[k] = (Array.isArray(v) ? 'array:' : 'object:') + n;
      }
      return out;
    })()`);
    console.log(JSON.stringify(probe, null, 1));
    const sample = await evaljs(`(() => {
      const s = window.species; if (!s) return null;
      const k = Object.keys(s)[9];
      return JSON.stringify(s[k]).slice(0, 3000);
    })()`);
    console.log('SAMPLE species[9]:', sample);
  } else {
    const globals = ['species', 'moves', 'abilities', 'locations', 'items', 'trainers', 'typeChart', 'sprites'];
    const out = {};
    for (const g of globals) {
      const chunkCount = await evaljs(`(() => {
        if (!window['${g}']) return 0;
        window.__dump = JSON.stringify(window['${g}']);
        return Math.ceil(window.__dump.length / 5e6);
      })()`);
      if (!chunkCount) continue;
      let s = '';
      for (let c = 0; c < chunkCount; c++) s += await evaljs(`window.__dump.slice(${c * 5e6}, ${(c + 1) * 5e6})`);
      out[g] = JSON.parse(s);
      console.error(`  dumped ${g}: ${(s.length / 1e6).toFixed(1)}MB`);
    }
    fs.writeFileSync(outfile, JSON.stringify(out));
    console.error(`wrote ${outfile}`);
  }
  await client.close();
} finally { chrome.kill(); }
