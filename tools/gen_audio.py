#!/usr/bin/env python3
"""Generate the spoken clips listed in audio-src/requests.json.

English: Kokoro (American voices). Farsi: Matcha-TTS (fa_en). Both run locally through
sherpa-onnx, so no paid service or API key is needed. Clips are cached by key in
audio-src/clips/, so re-running only generates what is new.

  python3 tools/gen_audio.py [--models DIR] [--shard i/n] [--lang en|fa] [--threads N]
                             [--only KEYFILE] [--force] [--takes N]

--takes N   listen-back gate: each clip is heard by the recognisers of tools/verify_audio.py as soon as it is
            made; an English take that is not heard as its text is made again (up to N takes), a Farsi clip
            gets N takes. The best-scoring take is kept, and the clip that is already there competes too
            when its spoken text is unchanged. The verdict goes into the listen-back ledger
            (audio-src/listened.json). Kokoro is not deterministic, so a new take is a real second chance.
--only/--force  limit the run to the keys in a file; --force also remakes clips that are up to date.

A single word or a chunk is recorded as "Now say: WORD." and cut out (cut_word.py). Without --takes, if the
cut fails on every carrier and retry, the clip is NOT written (the app then uses the device voice for it) and
the run ends with exit status 1 listing those keys. With --takes, when no carried take is heard as its text, one
recording without the carrier competes as well; if it wins it is kept, printed as NEW-BARE and marked "bare" in
the ledger. A bare recording is never kept silently.
"""
import argparse, json, os, subprocess, sys, time
import numpy as np
import sherpa_onnx
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cut_word import cut_word, CARRIER

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EN_SPEAKERS = {'s': 3, 'm': 6, 'b': 1, 'k': 4, 'a': 5}   # af_sarah (model voice), am_michael, af_bella, af_sky, am_adam
EN_SPEED = {'n': 1.0, 's': 0.78}
FA_SPEED = 0.92

def kokoro(M, threads):
    d = f'{M}/kokoro-en-v0_19'
    return sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=f'{d}/model.onnx', voices=f'{d}/voices.bin',
            tokens=f'{d}/tokens.txt', data_dir=f'{d}/espeak-ng-data'), num_threads=threads)))

def matcha_fa(M, threads):
    d = f'{M}/matcha-tts-fa_en-khadijah'
    return sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        matcha=sherpa_onnx.OfflineTtsMatchaModelConfig(acoustic_model=f'{d}/model.onnx',
            vocoder=f'{M}/vocos-22khz-univ.onnx', tokens=f'{d}/tokens.txt', data_dir=f'{d}/espeak-ng-data'),
        num_threads=threads)))

def tidy(x, sr):
    """Trim silence, add short pads, normalise level."""
    x = np.asarray(x, dtype=np.float32)
    if x.size == 0: return x
    thr = max(0.012, 0.02 * float(np.max(np.abs(x))))
    idx = np.where(np.abs(x) > thr)[0]
    if idx.size:
        a = max(0, idx[0] - int(0.03 * sr)); b = min(len(x), idx[-1] + int(0.06 * sr))
        x = x[a:b]
    peak = float(np.max(np.abs(x))) or 1.0
    x = x * (0.85 / peak)
    fade = int(0.008 * sr)
    if len(x) > 2 * fade:
        x[:fade] *= np.linspace(0, 1, fade); x[-fade:] *= np.linspace(1, 0, fade)
    return np.concatenate([np.zeros(int(0.06 * sr), np.float32), x, np.zeros(int(0.14 * sr), np.float32)])

def encode(x, sr, out):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(sr), '-ac', '1', '-i', 'pipe:0',
                    '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '48k', '-write_xing', '0', '-id3v2_version', '0',
                    '-map_metadata', '-1', out], input=pcm, check=True)

def carriers(say):
    """The carrier sentences tried, in order, for a word or chunk (cut_word expects 'Now say' at the start)."""
    return [say, say.replace(':', '...', 1), say.replace(':', ';', 1)]

def synth(tts, r, rounds=2):
    """One take of request r: (samples, sample_rate), or (None, sr) if a carried word could not be cut out."""
    if r['lang'] == 'fa':
        a = tts.generate(r['say'], sid=0, speed=FA_SPEED); return a.samples, a.sample_rate
    sid, sp = EN_SPEAKERS[r['voice']], EN_SPEED[r['speed']]
    if not r['say'].startswith(CARRIER):
        a = tts.generate(r['say'], sid=sid, speed=sp); return a.samples, a.sample_rate
    # a single word or a chunk: record it at the end of a carrier sentence and cut it out (see cut_word.py).
    # "Now say... WORD." gives a longer pause before a word that starts with a vowel ("It's"). With more than one
    # thread Kokoro gives a slightly different take each time, so a second round can find the pause the first missed.
    sr = None
    for _ in range(rounds):
        for c in carriers(r['say']):
            a = tts.generate(c, sid=sid, speed=sp); sr = a.sample_rate
            cut = cut_word(a.samples, a.sample_rate)
            if cut is not None: return cut, a.sample_rate
    return None, sr

def to16k(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ar', '16000', '-ac', '1', '-f', 'f32le', 'pipe:1'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', default=os.environ.get('HAMRAH_MODELS', os.path.join(ROOT, '..', 'models')))
    ap.add_argument('--shard', default='0/1')
    ap.add_argument('--lang', default='')
    ap.add_argument('--threads', type=int, default=2)
    ap.add_argument('--only', default='')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--takes', type=int, default=0)
    args = ap.parse_args()
    M = os.path.abspath(args.models)
    shard_i, shard_n = map(int, args.shard.split('/'))

    reqs = json.load(open(f'{ROOT}/audio-src/requests.json'))
    clips = f'{ROOT}/audio-src/clips'; os.makedirs(clips, exist_ok=True)
    def fresh(r):
        """A clip is reused only if it was generated from the same spoken text."""
        base = f"{clips}/{r['key']}"
        if not os.path.exists(base + '.mp3'): return False
        try: return open(base + '.txt', encoding='utf8').read() == r['say']
        except FileNotFoundError: return False

    only = set(open(args.only).read().split()) if args.only else None
    todo = [r for i, r in enumerate(reqs) if i % shard_n == shard_i and (not args.lang or r['lang'] == args.lang)
            and (only is None or r['key'] in only) and (args.force or not fresh(r))]
    print(f'{len(todo)} clips to generate (shard {args.shard}{", gate %d takes" % args.takes if args.takes else ""})', flush=True)
    if not todo: return
    judge = None
    if args.takes:
        import verify_audio as V
        judge = V.Judge(M, args.threads, tuple(l for l in ('en', 'fa') if any(r['lang'] == l for r in todo)))
        todo.sort(key=lambda r: r['lang'])      # one Whisper model at a time
        upd = {}       # ledger entries written by this run (merged into the file, which another shard may also write)
    engines = {}
    t0 = time.time(); total = 0.0; nocut = []; still = []
    for n, r in enumerate(todo):
        lang = r['lang']
        if lang not in engines: engines[lang] = kokoro(M, args.threads) if lang == 'en' else matcha_fa(M, args.threads)
        tts = engines[lang]
        final = f"{clips}/{r['key']}.mp3"
        if not judge:
            samples, sr = synth(tts, r)
            if samples is None:
                print('NOCUT', r['key'], r['text'], flush=True); nocut.append(r['key']); continue
            x = tidy(samples, sr)
            if x.size < sr * 0.2:
                print('EMPTY', r['key'], r['text'], flush=True); continue
            tmp = f"{clips}/{r['key']}.tmp.mp3"
            encode(x, sr, tmp); os.replace(tmp, final)
            open(f"{clips}/{r['key']}.txt", 'w', encoding='utf8').write(r['say'])
            total += len(x) / sr
        else:
            # listen-back gate: keep the best take; the existing clip competes when its spoken text is current
            best = None
            if fresh(r):
                res = judge(r, to16k(final)); best = (res['score'] + (0.001 if res['ok'] else 0), final, res, True)
            tries = 0
            while tries < args.takes and not (best and best[2]['ok'] and lang == 'en'):
                tries += 1
                samples, sr = synth(tts, r, rounds=1)
                if samples is None: continue
                x = tidy(samples, sr)
                if x.size < sr * 0.2: continue
                tmp = f"{clips}/{r['key']}.take{tries}.mp3"; encode(x, sr, tmp)
                res = judge(r, to16k(tmp)); total += len(x) / sr
                cand = (res['score'] + (0.001 if res['ok'] else 0), tmp, res, False)
                if best is None or cand[0] > best[0]:
                    if best and not best[3]: os.remove(best[1])
                    best = cand
                else: os.remove(tmp)
            if r['say'].startswith(CARRIER) and not (best and best[2]['ok']):
                # no carried take was heard as its text (the cut can fail, or land inside the word): a recording
                # without the carrier competes too, and is kept only if it is heard better
                bare = {**r, 'say': r['say'][len(CARRIER):]}
                samples, sr = synth(tts, bare)
                x = tidy(samples, sr); tmp = f"{clips}/{r['key']}.bare.mp3"; encode(x, sr, tmp)
                res = judge(r, to16k(tmp)); res['bare'] = True
                cand = (res['score'] + (0.001 if res['ok'] else 0), tmp, res, False)
                if best is None or cand[0] > best[0]:
                    if best and not best[3]: os.remove(best[1])
                    best = cand
                else: os.remove(tmp)
            if best is None:
                print('NOCUT', r['key'], r['text'], flush=True); nocut.append(r['key']); continue
            if not best[3]:
                os.replace(best[1], final); open(f"{clips}/{r['key']}.txt", 'w', encoding='utf8').write(r['say'])
            upd[r['key']] = V.ledger_entry(r, final, best[2])
            if best[2].get('bare'): upd[r['key']]['bare'] = True      # recorded without the carrier (see above)
            tag = 'KEPT-OLD' if best[3] else ('NEW-BARE' if best[2].get('bare') else 'NEW')
            print(f"{'OK  ' if best[2]['ok'] else 'FLAG'} {tag} {best[2]['score']:.2f} {r['key']} {r['lang']}/{r['voice']}/{r['speed']} {r['text'][:60]!r} heard {(best[2].get('heard_careful') or best[2].get('heard_fast'))[:70]!r}", flush=True)
            if not best[2]['ok']: still.append(r['key'])
            if n % 10 == 0: V.save_ledger({**V.load_ledger(), **upd})
        if n % 25 == 0: print(f'{n}/{len(todo)} audio={total:.0f}s wall={time.time()-t0:.0f}s', flush=True)
    if judge:
        V.save_ledger({**V.load_ledger(), **upd})
        print(f'STILL FLAGGED {len(still)}:', ' '.join(still), flush=True)
    print(f'DONE {len(todo)} clips, {total:.0f}s of audio in {time.time()-t0:.0f}s', flush=True)
    if nocut:
        print(f'NOCUT {len(nocut)} clips were NOT written (the carried word could not be cut out):', ' '.join(nocut), flush=True)
        sys.exit(1)

if __name__ == '__main__':
    main()
