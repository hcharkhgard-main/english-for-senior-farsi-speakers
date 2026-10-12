#!/usr/bin/env python3
"""Generate the spoken clips listed in audio-src/requests.json.

English: Kokoro (American voices). Farsi: Matcha-TTS (fa_en). Both run locally through
sherpa-onnx, so no paid service or API key is needed. Clips are cached by key in
audio-src/clips/, so re-running only generates what is new.

  python3 tools/gen_audio.py [--models DIR] [--shard i/n] [--lang en|fa]
"""
import argparse, json, os, subprocess, sys, time
import numpy as np
import sherpa_onnx
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cut_word import cut_word, CARRIER

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('--models', default=os.environ.get('HAMRAH_MODELS', os.path.join(ROOT, '..', 'models')))
ap.add_argument('--shard', default='0/1')
ap.add_argument('--lang', default='')
ap.add_argument('--threads', type=int, default=2)
args = ap.parse_args()
M = os.path.abspath(args.models)
shard_i, shard_n = map(int, args.shard.split('/'))

EN_SPEAKERS = {'s': 3, 'm': 6, 'b': 1, 'k': 4, 'a': 5}   # af_sarah (model voice), am_michael, af_bella, af_sky, am_adam
EN_SPEED = {'n': 1.0, 's': 0.78}
FA_SPEED = 0.92

def kokoro():
    d = f'{M}/kokoro-en-v0_19'
    return sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=f'{d}/model.onnx', voices=f'{d}/voices.bin',
            tokens=f'{d}/tokens.txt', data_dir=f'{d}/espeak-ng-data'), num_threads=args.threads)))

def matcha_fa():
    d = f'{M}/matcha-tts-fa_en-khadijah'
    return sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        matcha=sherpa_onnx.OfflineTtsMatchaModelConfig(acoustic_model=f'{d}/model.onnx',
            vocoder=f'{M}/vocos-22khz-univ.onnx', tokens=f'{d}/tokens.txt', data_dir=f'{d}/espeak-ng-data'),
        num_threads=args.threads)))

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

reqs = json.load(open(f'{ROOT}/audio-src/requests.json'))
clips = f'{ROOT}/audio-src/clips'; os.makedirs(clips, exist_ok=True)
def fresh(r):
    """A clip is reused only if it was generated from the same spoken text."""
    base = f"{clips}/{r['key']}"
    if not os.path.exists(base + '.mp3'): return False
    try: return open(base + '.txt', encoding='utf8').read() == r['say']
    except FileNotFoundError: return False

todo = [r for i, r in enumerate(reqs) if i % shard_n == shard_i and (not args.lang or r['lang'] == args.lang)
        and not fresh(r)]
print(f'{len(todo)} clips to generate (shard {args.shard})', flush=True)
engines = {}
t0 = time.time(); total = 0.0
for n, r in enumerate(todo):
    lang = r['lang']
    if lang not in engines: engines[lang] = kokoro() if lang == 'en' else matcha_fa()
    tts = engines[lang]
    samples = None
    if lang == 'en' and r['say'].startswith(CARRIER):
        # a single word: record it at the end of a carrier sentence and cut it out (see cut_word.py)
        for carrier in (r['say'], r['say'].replace(':', ';', 1), 'Okay. ' + r['say']):
            a = tts.generate(carrier, sid=EN_SPEAKERS[r['voice']], speed=EN_SPEED[r['speed']])
            samples = cut_word(a.samples, a.sample_rate)
            if samples is not None: break
        if samples is None:
            print('NOCUT', r['key'], r['text'], flush=True)
            a = tts.generate(r['say'][len(CARRIER):], sid=EN_SPEAKERS[r['voice']], speed=EN_SPEED[r['speed']]); samples = a.samples
    elif lang == 'en': a = tts.generate(r['say'], sid=EN_SPEAKERS[r['voice']], speed=EN_SPEED[r['speed']]); samples = a.samples
    else: a = tts.generate(r['say'], sid=0, speed=FA_SPEED); samples = a.samples
    x = tidy(samples, a.sample_rate)
    if x.size < a.sample_rate * 0.2:
        print('EMPTY', r['key'], r['text'], flush=True); continue
    tmp = f"{clips}/{r['key']}.tmp.mp3"
    encode(x, a.sample_rate, tmp); os.replace(tmp, f"{clips}/{r['key']}.mp3")
    open(f"{clips}/{r['key']}.txt", 'w', encoding='utf8').write(r['say'])
    total += len(x) / a.sample_rate
    if n % 25 == 0: print(f'{n}/{len(todo)} audio={total:.0f}s wall={time.time()-t0:.0f}s', flush=True)
print(f'DONE {len(todo)} clips, {total:.0f}s of audio in {time.time()-t0:.0f}s', flush=True)
