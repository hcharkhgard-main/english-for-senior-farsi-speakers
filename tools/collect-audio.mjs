// Writes audio-src/requests.json: the list of clips the voice generator must produce.
import fs from 'node:fs';
import path from 'node:path';
import { loadContent, audioRequests, ROOT } from './content.mjs';
import { spoken } from './spoken.mjs';

const content = loadContent();
const say = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'pronunciation.json'), 'utf8'));

// A single English word is recorded at the end of a carrier sentence and cut out afterwards (tools/cut_word.py):
// said on its own, the voice adds a small vowel after the last consonant.
const CARRIER = 'Now say: ';
const carried = (t) => (/\s/.test(t.trim()) ? t : CARRIER + (/[.?!]$/.test(t.trim()) ? t.trim().replace(/,$/, '') : t.trim().replace(/[,;:]$/, '') + '.'));
const reqs = audioRequests(content).map((r) => { const t = spoken(r.text, r.lang, say); return { ...r, say: r.lang === 'en' ? carried(t) : t }; });
fs.mkdirSync(path.join(ROOT, 'audio-src'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'audio-src', 'requests.json'), JSON.stringify(reqs, null, 1));
const by = (f) => reqs.reduce((m, r) => ((m[f(r)] = (m[f(r)] || 0) + 1), m), {});
console.log('clips:', reqs.length, by((r) => `${r.lang}/${r.voice}/${r.speed}`));
