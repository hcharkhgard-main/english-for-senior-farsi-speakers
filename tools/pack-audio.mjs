// Bundles the generated clips into packs (one file per lesson / conversation / word list)
// and writes site/audio/index.json, which maps every clip to a byte range in its pack.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './content.mjs';

const reqs = JSON.parse(fs.readFileSync(path.join(ROOT, 'audio-src', 'requests.json'), 'utf8'));
const clipsDir = path.join(ROOT, 'audio-src', 'clips');
const out = path.join(ROOT, 'site', 'audio');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const byPack = new Map();
const missing = [];
for (const r of reqs) {
  const f = path.join(clipsDir, r.key + '.mp3');
  // a clip is packed only if it was generated from the current spoken text (audio-src/clips/<key>.txt)
  const said = path.join(clipsDir, r.key + '.txt');
  if (!fs.existsSync(f) || !fs.existsSync(said) || fs.readFileSync(said, 'utf8') !== r.say) { missing.push(r); continue; }
  if (!byPack.has(r.pack)) byPack.set(r.pack, []);
  byPack.get(r.pack).push(r);
}

const packs = [], clips = {}, deps = {};
const order = [...byPack.keys()].sort((a, b) => (a === 'core' ? -1 : b === 'core' ? 1 : a.localeCompare(b)));
order.forEach((id, i) => {
  const parts = [];
  let offset = 0;
  for (const r of byPack.get(id)) {
    const buf = fs.readFileSync(path.join(clipsDir, r.key + '.mp3'));
    clips[r.key] = [i, offset, buf.length];
    parts.push(buf); offset += buf.length;
  }
  const all = Buffer.concat(parts);
  const hash = crypto.createHash('sha1').update(all).digest('hex').slice(0, 8);
  const file = `${id}.${hash}.mp3`;
  fs.writeFileSync(path.join(out, file), all);
  packs.push({ id, file, bytes: all.length });
});
// which packs each lesson / conversation needs (a clip shared with another unit lives in that unit's pack)
for (const r of reqs) {
  if (!clips[r.key]) continue;
  const home = packs[clips[r.key][0]].id;
  for (const u of r.users) { (deps[u] ||= new Set()).add(home); }
}
const index = { v: 1, packs, clips, deps: Object.fromEntries(Object.entries(deps).map(([k, v]) => [k, [...v]])) };
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index));
const total = packs.reduce((s, p) => s + p.bytes, 0);
console.log(`packs: ${packs.length}, clips: ${Object.keys(clips).length}/${reqs.length}, ${(total / 1048576).toFixed(1)} MB, largest ${(Math.max(...packs.map((p) => p.bytes)) / 1048576).toFixed(2)} MB`);
if (missing.length) console.log(`MISSING ${missing.length} clips, e.g.:`, missing.slice(0, 5).map((m) => m.text));
// listen-back coverage (tools/verify_audio.py keeps audio-src/listened.json): a clip counts as listened back only
// with the spoken text and the file it was checked in. A warning, not an error: run tools/verify_audio.py --stale.
{
  let led = {};
  try { led = JSON.parse(fs.readFileSync(path.join(ROOT, 'audio-src', 'listened.json'), 'utf8')); } catch { /* no ledger yet */ }
  const h12 = (b) => crypto.createHash('sha1').update(b).digest('hex').slice(0, 12);
  let never = 0, flagged = 0;
  for (const r of reqs) {
    if (!clips[r.key]) continue;
    const e = led[r.key];
    if (!e || e.say !== h12(Buffer.from(r.say, 'utf8')) || e.clip !== h12(fs.readFileSync(path.join(clipsDir, r.key + '.mp3')))) never++;
    else if (!e.ok && !e.accepted) flagged++;
  }
  if (never || flagged) console.log(`LISTEN-BACK: ${never} packed clips were never listened back in their current form, ${flagged} are flagged and not accepted (python3 tools/verify_audio.py --coverage)`);
  else console.log('listen-back: every packed clip was heard as its text, or accepted after review');
}
