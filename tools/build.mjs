// Builds the site.
//   node tools/build.mjs            -> site/           (static site for GitHub Pages; installable, offline)
//                                      site/audio (from tools/pack-audio.mjs) and site/asr (pronunciation files) are kept as they are
//   node tools/build.mjs artifact   -> dist-artifact/  (single page + audio, for a Claude artifact preview)
//   node tools/build.mjs --check    -> builds into a temporary folder and compares it with site/: exits 1 when site/
//                                      is not what the source builds now (the deploy workflow runs this before publishing)
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

const js = (await build({
  entryPoints: [src('js', 'main.js')], bundle: true, format: 'esm', minify: true, write: false, target: ['es2020'],
  define: { __TARGET__: JSON.stringify(target), __VERSION__: JSON.stringify(version), __ASR__: JSON.stringify(asrVer) }, legalComments: 'none',
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
    if (!u.username && !u.password && (u.protocol === 'https:' || (u.protocol === 'http:' && local))) connect = ' ' + u.origin;
  } catch { /* no service configured */ }
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
  fs.writeFileSync(path.join(out, 'sw.js'), swSrc.replaceAll('__BUILD__', build_id).replaceAll('__ASR__', asrVer).replace('__PRECACHE__', JSON.stringify(precache)));
  if (checking) {
    // site/ is what gets published. It must be exactly what this source builds: same page, script, styles, lessons, worker, fonts and pictures.
    const files = ['index.html', 'app.js', 'app.css', 'content.json', 'sw.js', 'manifest.webmanifest', 'config.json', '.nojekyll',
      ...['fonts', 'icons'].flatMap((d) => [...new Set([...list(path.join(out, d)), ...(fs.existsSync(path.join(SITE, d)) ? list(path.join(SITE, d)) : [])])].map((f) => `${d}/${f}`))];
    const bytes = (f) => (fs.existsSync(f) ? fs.readFileSync(f) : null);
    const differ = files.filter((f) => { const a = bytes(path.join(SITE, f)), b = bytes(path.join(out, f)); return !a || !b || !a.equals(b); });
    fs.rmSync(out, { recursive: true, force: true });
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
