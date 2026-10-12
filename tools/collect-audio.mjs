// Writes audio-src/requests.json: the list of clips the voice generator must produce.
import fs from 'node:fs';
import path from 'node:path';
import { loadContent, audioRequests, ROOT } from './content.mjs';
import { spoken } from './spoken.mjs';
import { audioKey } from '../src/js/audiokey.js';

const content = loadContent();
const say = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'pronunciation.json'), 'utf8'));

// A single English word, and every chunk of a phrase (the short pieces a phrase is played in, "to check",
// "with cash?"), is recorded at the end of a carrier sentence and cut out afterwards (tools/cut_word.py): said
// on its own, the voice adds a small vowel after a final consonant ("to check" comes out as "to Jackie").
// The key stays the key of the displayed text; only the spoken text ("say") carries the carrier.
// pronunciation.json "carry" lists whole lines that are recorded the same way: in one voice a question that
// begins "Do you…?" loses its "Do" when it starts a recording, and after "Now say:" it keeps it.
const CARRIER = 'Now say: ';
const carryLines = new Set(say.carry || []);
const chunkKeys = new Set();
for (const L of Object.values(content.lessons)) for (const p of L.phrases) if (p.chunks && p.chunks.length > 1) for (const c of p.chunks) chunkKeys.add(audioKey('en', p.voice, 's', c));
const carried = (t, chunk) => {
  t = t.trim();
  if (/\s/.test(t) && !chunk) return t;
  return CARRIER + (/[.?!]$/.test(t) ? t : t.replace(/[,;:]$/, '') + '.');
};
const reqs = audioRequests(content).map((r) => { const t = spoken(r.text, r.lang, say); return { ...r, say: r.lang === 'en' ? carried(t, chunkKeys.has(r.key) || carryLines.has(r.text)) : t }; });
fs.mkdirSync(path.join(ROOT, 'audio-src'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'audio-src', 'requests.json'), JSON.stringify(reqs, null, 1));
const by = (f) => reqs.reduce((m, r) => ((m[f(r)] = (m[f(r)] || 0) + 1), m), {});
console.log('clips:', reqs.length, by((r) => `${r.lang}/${r.voice}/${r.speed}`));
