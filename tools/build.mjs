// Builds the site.
//   node tools/build.mjs            -> site/           (static site for GitHub Pages; installable, offline)
//                                      site/audio (from tools/pack-audio.mjs) and site/asr (pronunciation files) are kept as they are
//   node tools/build.mjs artifact   -> dist-artifact/  (single page + audio, for a Claude artifact preview)
//   node tools/build.mjs --check    -> builds into a temporary folder and compares it with site/: exits 1 when site/
//                                      is not what the source builds now (the deploy workflow runs this before publishing):
//                                      app files byte for byte, every sound pack against audio/index.json (size and the
//                                      content hash in its name), site/asr against tools/asr-files.json, and no file in
//                                      site/ that the build does not make
//   node tools/build.mjs --asr-list -> rewrites tools/asr-files.json from site/asr (only after replacing the model on purpose)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { loadContent, ROOT } from './content.mjs';

const target = process.argv[2] === 'artifact' ? 'artifact' : 'pwa';
const checking = process.argv.includes('--check') && target === 'pwa';
const SITE = path.join(ROOT, 'site');
// HAMRAH_OUT=<dir> builds a private copy elsewhere (used by tests); audio and asr are linked from site/
const out = checking ? fs.mkdtempSync(path.join(os.tmpdir(), 'hamrah-check-'))
  : process.env.HAMRAH_OUT ? path.resolve(process.env.HAMRAH_OUT) : path.join(ROOT, target === 'pwa' ? 'site' : 'dist-artifact');
const list = (d) => fs.readdirSync(d).sort();      // sorted: the order a folder is listed in differs between computers, and the result must not
const src = (...p) => path.join(ROOT, 'src', ...p);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

// The pronunciation-checker files are not built here; they are checked. tools/asr-files.json lists each file's
// exact size and SHA-256: a site/asr that differs (a truncated download, a stray file) is refused, and the app
// is given the same list so that a phone never keeps a damaged or substituted copy (src/js/speech.js).
const ASR_LIST = path.join(ROOT, 'tools', 'asr-files.json');
if (process.argv.includes('--asr-list')) {
  const files = {};
  for (const f of list(path.join(SITE, 'asr'))) { const b = fs.readFileSync(path.join(SITE, 'asr', f)); files[f] = { bytes: b.length, sha256: sha256(b) }; }
  const about = JSON.parse(fs.readFileSync(ASR_LIST, 'utf8')).about;
  fs.writeFileSync(ASR_LIST, JSON.stringify({ about, files }, null, 1) + '\n');
  console.log(`tools/asr-files.json: ${Object.keys(files).length} files`);
  process.exit(0);
}
const asrList = JSON.parse(fs.readFileSync(ASR_LIST, 'utf8')).files;
// differences between a folder of pronunciation files and the list ([] when they agree)
function asrProblems(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [], have = list(dir);
  for (const f of have) {
    const want = Object.prototype.hasOwnProperty.call(asrList, f) ? asrList[f] : null;
    if (!want) { out.push(`asr/${f} (not in tools/asr-files.json)`); continue; }
    const b = fs.readFileSync(path.join(dir, f));
    if (b.length !== want.bytes || sha256(b) !== want.sha256) out.push(`asr/${f} (size or content differs from tools/asr-files.json)`);
  }
  for (const f of Object.keys(asrList)) if (!have.includes(f)) out.push(`asr/${f} (missing)`);
  // the runtime files come from the onnxruntime-web package: they must be that package's files
  for (const f of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
    const pkgFile = path.join(ROOT, 'node_modules', 'onnxruntime-web', 'dist', f);
    if (fs.existsSync(pkgFile) && fs.existsSync(path.join(dir, f)) && !fs.readFileSync(pkgFile).equals(fs.readFileSync(path.join(dir, f)))) out.push(`asr/${f} (differs from node_modules/onnxruntime-web)`);
  }
  return out;
}

const content = loadContent();
const version = `${pkg.version} · ${content.version}`;

if (target === 'pwa') { for (const f of ['fonts', 'icons']) fs.rmSync(path.join(out, f), { recursive: true, force: true }); }
else fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
if (out !== SITE && target === 'pwa') for (const d of ['audio', 'asr']) { const to = path.join(out, d); if (!fs.existsSync(to) && fs.existsSync(path.join(ROOT, 'site', d))) fs.symlinkSync(path.join(ROOT, 'site', d), to); }

// The pronunciation-checker files are cached on the phone under a name made from their content,
// so replacing any of them makes phones fetch the new set instead of keeping the old one for ever.
const asrDir = path.join(out, 'asr');
const asrVer = target === 'pwa' && fs.existsSync(asrDir)
  ? crypto.createHash('sha1').update(list(asrDir).filter((f) => /\.(mjs|wasm|ort)$|^tokens\.txt$/.test(f))
    .map((f) => f + ':' + crypto.createHash('sha1').update(fs.readFileSync(path.join(asrDir, f))).digest('hex')).join('|')).digest('hex').slice(0, 10)
  : 'none';
if (target === 'pwa') {
  const bad = asrProblems(asrDir);
  if (bad.length) { console.error('site/asr is not the pronunciation checker listed in tools/asr-files.json: ' + bad.join(', ')); process.exit(1); }
}
// what the app checks each downloaded pronunciation file against: name -> [bytes, sha256]
const asrFiles = Object.fromEntries(Object.entries(asrList).map(([f, v]) => [f, [v.bytes, v.sha256]]));

const js = (await build({
  entryPoints: [src('js', 'main.js')], bundle: true, format: 'esm', minify: true, write: false, target: ['es2020'],
  define: { __TARGET__: JSON.stringify(target), __VERSION__: JSON.stringify(version), __ASR__: JSON.stringify(asrVer), __ASR_FILES__: JSON.stringify(asrFiles) }, legalComments: 'none',
})).outputFiles[0].text;
const css = fs.readFileSync(src('styles.css'), 'utf8');
const fontCss = fs.readFileSync(src('fonts.css'), 'utf8');
const contentJson = JSON.stringify(content);
const copyDir = (from, to) => { if (!fs.existsSync(from)) return 0; fs.cpSync(from, to, { recursive: true }); return fs.readdirSync(to).length; };

if (target === 'pwa') {
  const cfg = path.join(ROOT, 'config.json');
  const cfgText = fs.existsSync(cfg) ? fs.readFileSync(cfg, 'utf8') : '{ "aiProxyUrl": "" }\n';
  // The page's content security policy lets the app talk to its own site only, plus the optional
  // live-partner service named in config.json (https only; plain http for this computer during
  // development — the same rule as safeProxyUrl in src/js/partner.js). Change config.json -> rebuild.
  let connect = '';
  try {
    const u = new URL(String(JSON.parse(cfgText).aiProxyUrl || '').trim());
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
    // a plain host name only: "https://a.com;script-src …" or "https://*.com" must not reach the policy
    if (!u.username && !u.password && /^[a-z0-9.-]+$/i.test(u.hostname.replace(/^\[::1\]$/, 'localhost')) && (u.protocol === 'https:' || (u.protocol === 'http:' && local))) connect = ' ' + u.origin;
  } catch { /* no service configured */ }
  // the page sw.js shows when the app cannot be opened at all without a connection (strings "offline.page.*")
  const offlinePage = (S) => {
    const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[A-Za-z0-9][A-Za-z0-9 .-]*/g, '<bdi>$&</bdi>');
    return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + `<title>${esc(S['app.name'])}</title><style>body{font:20px/1.8 system-ui,-apple-system,sans-serif;margin:0;padding:24px;background:#faf6ee;color:#1d2433}h1{font-size:26px;line-height:1.5}`
      + '@media (prefers-color-scheme:dark){body{background:#151a24;color:#eef1f6}}</style></head><body>'
      + `<h1>${esc(S['offline.page.title'])}</h1><p>${esc(S['offline.page.body'])}</p><p>${esc(S['sos.noCall'])}</p>`
      // an installed app cannot simply be "opened again": a large button tries once more (QA round 5 recheck, L7)
      + `<p><button type="button" onclick="location.reload()" style="font:inherit;min-height:56px;padding:0 24px;border-radius:14px;border:2px solid currentColor;background:transparent;color:inherit">${esc(S['offline.page.retry'])}</button></p></body></html>`;
  };
  const htmlSrc = fs.readFileSync(src('index.html'), 'utf8'), swSrc = fs.readFileSync(src('sw.js'), 'utf8');
  const audioIdx = fs.existsSync(path.join(out, 'audio', 'index.json')) ? fs.readFileSync(path.join(out, 'audio', 'index.json'), 'utf8') : '';
  // everything a phone stores as "one version of the app" goes into the id; any change makes a new version
  const build_id = crypto.createHash('sha1').update([js, css, fontCss, contentJson, htmlSrc, swSrc, audioIdx, asrVer, connect].join('\u0000')).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(out, 'app.js'), js);
  fs.writeFileSync(path.join(out, 'app.css'), fontCss.replaceAll('__FONT__', 'fonts') + css);
  fs.writeFileSync(path.join(out, 'content.json'), contentJson);
  fs.writeFileSync(path.join(out, 'index.html'), htmlSrc.replaceAll('__BUILD__', build_id).replaceAll('__CONNECT__', connect));
  fs.copyFileSync(src('manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));
  copyDir(src('fonts'), path.join(out, 'fonts'));
  copyDir(src('icons'), path.join(out, 'icons'));
  const count = (d) => (fs.existsSync(path.join(out, d)) ? fs.readdirSync(path.join(out, d)).length : 0);
  const nAudio = count('audio'), nAsr = count('asr');
  fs.writeFileSync(path.join(out, 'config.json'), cfgText);
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  const idx = fs.existsSync(path.join(out, 'audio', 'index.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'audio', 'index.json'), 'utf8')) : { packs: [] };
  const offlineFirst = idx.packs.filter((p) => p.id === 'core' || p.id === 'words').map((p) => 'audio/' + p.file);
  const precache = ['index.html', 'app.js', 'app.css', 'content.json', 'manifest.webmanifest', 'audio/index.json',
    ...list(path.join(out, 'fonts')).map((f) => 'fonts/' + f), ...(fs.existsSync(path.join(out, 'icons')) ? list(path.join(out, 'icons')).map((f) => 'icons/' + f) : []), ...offlineFirst];
  // the worker checks every file it stores as "the app" against its exact size and SHA-256: an answer from a Wi-Fi
  // login page or a cut-off download is never kept as a part of the app (src/sw.js)
  const integrity = Object.fromEntries(precache.map((f) => { const b = fs.readFileSync(path.join(out, f)); return [f, [b.length, sha256(b)]]; }));
  // ... and every stored file is checked again each time it is served (another site on the same address can change
  // what is stored): the sound packs and the pronunciation-checker files are listed for that too
  const packSums = Object.fromEntries(idx.packs.filter((p) => fs.existsSync(path.join(out, 'audio', p.file))).map((p) => { const b = fs.readFileSync(path.join(out, 'audio', p.file)); return ['audio/' + p.file, [b.length, sha256(b)]]; }));
  fs.writeFileSync(path.join(out, 'sw.js'), swSrc.replaceAll('__BUILD__', build_id).replaceAll('__ASR__', asrVer).replace('__PRECACHE__', JSON.stringify(precache)).replace('__INTEGRITY__', JSON.stringify(integrity))
    .replace('__OFFLINE_PAGE__', JSON.stringify(offlinePage(content.ui.strings))).replace('__PACK_SUMS__', JSON.stringify(packSums)).replace('__ASR_FILES__', JSON.stringify(target === 'pwa' ? asrFiles : {})));
  if (checking) {
    // site/ is what gets published. It must be exactly what this source builds: same page, script, styles, lessons, worker, fonts and pictures.
    const files = ['index.html', 'app.js', 'app.css', 'content.json', 'sw.js', 'manifest.webmanifest', 'config.json', '.nojekyll',
      ...['fonts', 'icons'].flatMap((d) => [...new Set([...list(path.join(out, d)), ...(fs.existsSync(path.join(SITE, d)) ? list(path.join(SITE, d)) : [])])].map((f) => `${d}/${f}`))];
    const bytes = (f) => (fs.existsSync(f) ? fs.readFileSync(f) : null);
    const differ = files.filter((f) => { const a = bytes(path.join(SITE, f)), b = bytes(path.join(out, f)); return !a || !b || !a.equals(b); });
    fs.rmSync(out, { recursive: true, force: true });
    // the sounds: every pack audio/index.json lists is there, with the listed size and the content hash its name
    // carries (tools/pack-audio.mjs names a pack <id>.<first 8 hex of its SHA-1>.mp3); every clip lies inside its
    // pack; nothing else is in the folder
    const audioDir = path.join(SITE, 'audio');
    let idxSite = null;
    try { idxSite = JSON.parse(fs.readFileSync(path.join(audioDir, 'index.json'), 'utf8')); } catch { differ.push('audio/index.json (missing or not JSON)'); }
    if (idxSite) {
      const packs = Array.isArray(idxSite.packs) ? idxSite.packs : [];
      for (const p of packs) {
        const m = /^[a-z0-9-]+\.([0-9a-f]{8})\.mp3$/.exec(String(p.file)), f = path.join(audioDir, String(p.file));
        if (!m || p.file !== `${p.id}.${m[1]}.mp3`) { differ.push(`audio/${p.file} (not a pack name)`); continue; }
        const b = fs.existsSync(f) ? fs.readFileSync(f) : null;
        if (!b) differ.push(`audio/${p.file} (missing)`);
        else if (b.length !== p.bytes) differ.push(`audio/${p.file} (${b.length} bytes, index says ${p.bytes})`);
        else if (crypto.createHash('sha1').update(b).digest('hex').slice(0, 8) !== m[1]) differ.push(`audio/${p.file} (content does not match the hash in its name)`);
      }
      const outside = Object.entries(idxSite.clips || {}).filter(([, r]) => !packs[r[0]] || r[1] < 0 || r[2] <= 0 || r[1] + r[2] > packs[r[0]].bytes);
      if (outside.length) differ.push(`audio/index.json (${outside.length} clips outside their pack, e.g. ${outside[0][0]})`);
      const listed = new Set(['index.json', ...packs.map((p) => p.file)]);
      for (const f of list(audioDir)) if (!listed.has(f)) differ.push(`audio/${f} (not in audio/index.json)`);
    }
    differ.push(...asrProblems(path.join(SITE, 'asr')));
    // nothing in site/ that the build does not make (notes, source maps, scratch files would be published to everyone)
    const top = new Set([...files.filter((f) => !f.includes('/')), 'audio', 'asr', 'fonts', 'icons']);
    for (const f of list(SITE)) if (!top.has(f)) differ.push(`${f} (not part of the build)`);
    if (differ.length) {
      console.error(`site/ is NOT the build of the current source (${build_id}). Different or missing: ${differ.join(', ')}`);
      console.error('Run "npm run build" (after "npm run audio:pack" if sounds changed) and commit site/.');
      process.exit(1);
    }
    console.log(`site/ is the build of the current source (${build_id}).`);
  } else
  console.log(`${path.relative(ROOT, out) || out}/ built (${build_id}): app.js ${(js.length / 1024).toFixed(0)} KB, content ${(contentJson.length / 1024).toFixed(0)} KB, audio files ${nAudio}, asr files ${nAsr}`);
} else {
  const b64 = (f) => fs.readFileSync(src('fonts', f)).toString('base64');
  const fonts = fontCss.replace(/url\("__FONT__\/([^"]+)"\)/g, (_, f) => `url("data:font/woff2;base64,${b64(f)}")`);
  const page = `<title>Hamrah English</title>
<style>
${fonts}
${css}
html, body { height: 100%; }
</style>
<div id="app"></div>
<script type="application/json" id="hamrah-content">${contentJson.replace(/</g, '\\u003c')}</script>
<script type="module">
document.documentElement.lang = 'fa'; document.documentElement.dir = 'rtl';
${js.replace(/<\/script/gi, '<\\/script')}
</script>
`;
  fs.writeFileSync(path.join(out, 'hamrah.html'), page);
  const n = copyDir(path.join(ROOT, 'site', 'audio'), path.join(out, 'audio'));
  console.log(`dist-artifact/ built: page ${(page.length / 1048576).toFixed(2)} MB, audio files ${n}`);
}
