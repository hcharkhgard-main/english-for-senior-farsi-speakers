// Runs every browser suite, one after another, and says which passed.
//   HAMRAH_SITE=<built site> PORT=<port> node tests/e2e/all.mjs        (npm run test:e2e:all)
//   SKIP=overflow ... to leave out a suite (the layout sweep is slow); ONLY=offline,mic to run some.
// Each suite starts and stops its own server on PORT; they never run at the same time.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
const only = list(process.env.ONLY), skip = list(process.env.SKIP);
// the suites (strings.mjs is a helper they share, not a suite); the slow layout sweep last
const ALL = ['run', 'mic', 'shell', 'offline', 'path', 'papers', 'overflow'];
const missing = ALL.filter((s) => !fs.existsSync(path.join(HERE, s + '.mjs')));
if (missing.length) { console.error('missing suite files: ' + missing.join(', ')); process.exit(1); }
const suites = ALL.filter((s) => (!only.length || only.includes(s)) && !skip.includes(s));
const results = [];
for (const s of suites) {
  console.log(`\n==== ${s} ====`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(HERE, s + '.mjs')], { stdio: 'inherit', env: process.env });
  results.push({ s, ok: r.status === 0, min: ((Date.now() - t0) / 60000).toFixed(1) });
}
console.log('\n==== all suites ====');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.s}  (${r.min} min)`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
