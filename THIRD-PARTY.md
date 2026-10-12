# Third-party components

Checked on 2026-10-11. "Verified" below means: compared byte-for-byte or by SHA-256 on that day.
Anything marked **unconfirmed** could not be established from the files in this project and must be
checked by the owner before the site is published widely.

Only the `site/` folder is published. The licence texts that travel with the published files are
`site/asr/MOONSHINE-LICENSE.txt` and `site/asr/ONNXRUNTIME-LICENSE.txt`. This file is not published.

## Open item — read this first

**The Farsi voice has no stated licence.** The Farsi audio clips in `site/audio` were generated with the
Matcha-TTS voice "khadijah" (details below). Its package contains no licence file; its README only points
to sherpa-onnx issue 1779, and that issue (read on 2026-10-11) states no licence either. Until the
owner has confirmed the model's terms with its author, or replaced the clips, publishing the Farsi audio
is at the owner's risk. The clips are a convenience (hearing the Farsi meaning) and the app works without
them. The simplest replacement is to record them yourself in a familiar voice: the Farsi sentences are
listed in `audio-src/requests.json` (`"lang": "fa"`, created by `npm run audio:collect`), and any MP3 saved
as `audio-src/clips/<key>.mp3` is picked up by `npm run audio:pack`.

## 1. Shipped in the website

### Pronunciation checker — `site/asr/`

| File | SHA-256 | From |
|---|---|---|
| `ort.wasm.min.mjs` | `6ef726f355b791129f7ddf3f62e7877a16b9b777abe87004b8ab306e6b9cf265` | ONNX Runtime Web |
| `ort-wasm-simd-threaded.mjs` | `30dd851d9c00622940500f71ddd2ff8820c5cb65270816080175b958705385a8` | ONNX Runtime Web |
| `ort-wasm-simd-threaded.wasm` | `71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4` | ONNX Runtime Web |
| `encoder_model.ort` | `94e90a4654fc45cdfedb77c4c08e1739f48862998e58fada384b25118134f221` | Moonshine tiny (English) |
| `decoder_model_merged.ort` | `cf524c4862d36e9e5ab032eddc73637efd822d70e868ac575cf1a46e1e4708a0` | Moonshine tiny (English) |
| `tokens.txt` | `2870d843e14c1e187bf1913a521562a63b53933814bd7f2145120468f494a049` | Moonshine tiny (English) |
| `MOONSHINE-LICENSE.txt` | `6148d7574a6554b7379b633cfd4c4fe5840c3f548d13bc83e00b52dc6fa00abd` | `LICENSE` from the Moonshine archive, renamed |
| `ONNXRUNTIME-LICENSE.txt` | `121e4c9d5cf8de3c4a55368c7793966d16cc7ea8548c73f891bbb2a455cce024` | written for this project (MIT text + where the files come from) |

To check a copy: `sha256sum site/asr/*`.

**ONNX Runtime Web 1.22.0** (Microsoft) — runs the speech model in the browser.
- Source: npm package `onnxruntime-web` 1.22.0, `https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.22.0.tgz`
  (integrity in `package-lock.json`: `sha512-Ud/+EBo6mhuaQWt/OjaOk0iNWjXqJoeeMFr6xQEERZdIZH2OWpGzuujz7lfuOBjUa6TEE/sc4nb7Da5dNL34fg==`);
  repository `https://github.com/microsoft/onnxruntime`.
- Verified: the three files are identical to `node_modules/onnxruntime-web/dist/` of that version.
- Licence: MIT (declared in the package's `package.json` and in the header of `ort.wasm.min.mjs`). The npm
  package contains no licence file; the text in `ONNXRUNTIME-LICENSE.txt` was copied from the `LICENSE`
  file of the same project's Python package (onnxruntime 1.29.0, "MIT License, Copyright (c) Microsoft Corporation").
- **Unconfirmed — owner to check before publishing:** the ONNX Runtime project also publishes a
  `ThirdPartyNotices.txt` for code compiled into its binaries. The npm package does not include one, and
  which notices apply to the WebAssembly build was not established.

**Moonshine tiny, English, quantised** (Moonshine AI / Useful Sensors, packaged by the sherpa-onnx project) — on-device speech recognition.
- Source: `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-moonshine-tiny-en-quantized-2026-02-27.tar.bz2`
  (archive SHA-256 `9ec31b342d8fa3240c3b81b8f82e1cf7e3ac467c93ca5a999b741d5887164f8d`).
- Verified: the archive was downloaded again on 2026-10-11 and its `encoder_model.ort`, `decoder_model_merged.ort`,
  `tokens.txt` and `LICENSE` have exactly the checksums in the table.
- Licence: MIT for the English-language models, as stated in the archive's `LICENSE` (shipped as
  `MOONSHINE-LICENSE.txt`; it names `https://github.com/moonshine-ai/moonshine`, copyright 2025 Useful Sensors, Inc.).
  That file also says models for *other* languages are under a non-commercial licence; none of those are used here.

### Fonts — `site/fonts/` (copied from `src/fonts/`)

| File | SHA-256 | Identical to |
|---|---|---|
| `vazirmatn-400.woff2` | `e382101336c6eb32cfb31381c027d02d2e0354bad08f6a395d4088beb3db3d91` | `vazirmatn/fonts/webfonts/Vazirmatn-Regular.woff2` |
| `vazirmatn-600.woff2` | `6a39a3c25eb18503cad590527b95bb5d4062b889a7ebbd3f01b0488d239e0499` | `vazirmatn/fonts/webfonts/Vazirmatn-SemiBold.woff2` |
| `vazirmatn-800.woff2` | `cd67558bbca0ad319b89e3b2edb8a914f87f864951d7a9d24e1404cbf3b45b02` | `vazirmatn/fonts/webfonts/Vazirmatn-ExtraBold.woff2` |
| `atkinson-400.woff2` | `d64ba838ef5472bba248620ec4fd8b5aa7cf0db2908e0bb230600caf279ba7bc` | `@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2` |
| `atkinson-700.woff2` | `140e2bd25a7315c8a062508391426b0d8c3297400c947b8d847be28f73a199f0` | `@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2` |

**Vazirmatn 33.0.3** (Saber Rastikerdar; "Copyright 2015 The Vazirmatn Project Authors") — the Farsi typeface.
- Source: npm package `vazirmatn` 33.0.3, `https://registry.npmjs.org/vazirmatn/-/vazirmatn-33.0.3.tgz`; repository `https://github.com/rastikerdar/vazirmatn`.
- Licence: SIL Open Font License 1.1 (the package's `OFL.txt`).

**Atkinson Hyperlegible** ("Copyright 2020 Braille Institute of America, Inc.") — the English typeface, chosen for legibility.
- Source: npm package `@fontsource/atkinson-hyperlegible` 5.3.0, `https://registry.npmjs.org/@fontsource/atkinson-hyperlegible/-/atkinson-hyperlegible-5.3.0.tgz`
  (a repackaging by the Fontsource project, repository `https://github.com/fontsource/font-files`).
- Licence: SIL Open Font License 1.1 (the package's `LICENSE`).

Both fonts are shipped unmodified. The QA review found the copyright and OFL notices embedded in all five
files; the OFL texts themselves are in the npm packages, not in `site/`. **Owner to consider before
publishing:** copy the two OFL texts next to the fonts so the licence travels with them.

### Audio — `site/audio/`

Every clip was generated by a speech model on the build machine; no recording of a person is included.
The models themselves are not shipped.

| Clips | Generated with | Licence of the model |
|---|---|---|
| English sentences and words | Kokoro, English, v0.19 (see below) | Apache 2.0 according to the `LICENSE` in the model archive |
| Farsi meanings and prompts | Matcha-TTS "khadijah" + Vocos vocoder (see below) | **not stated — open item above** |

## 2. Used to build, not shipped

All three voice files below were downloaded again on 2026-10-11 and matched the copies used for
generation (SHA-256).

**Kokoro English v0.19** (hexgrad; ONNX packaging by sherpa-onnx) — the English voices.
- Source: `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v0_19.tar.bz2`
  (archive SHA-256 `912804855a04745fa77a30be545b3f9a5d15c4d66db00b88cbcd4921df605ac7`; `model.onnx`
  `10ff414106a038ce7e9e0126c6461e4dc8a86efaa89dc91d2009d69fe635e339`; `voices.bin`
  `a372c67b056ef0b695c375d39b99630d23fb07ad4c8d87aa32a19a62fca523ad`).
- Licence: the archive's `LICENSE` is the Apache License 2.0 text. Its `README.md` points to
  `https://huggingface.co/hexgrad/Kokoro-82M`; that page was not read. **Unconfirmed — owner to check before
  publishing:** that the upstream model card states the same licence for the weights and the voices.
- Voices: speaker numbers 3, 6 and 1 (`tools/gen_audio.py`), which that script's comment names af_sarah,
  am_michael and af_bella. The number-to-name mapping is not recorded in the archive — unconfirmed.

**Matcha-TTS Persian/English voice "khadijah"** (ONNX packaging by sherpa-onnx) — the Farsi voice.
- Source: `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/matcha-tts-fa_en-khadijah.tar.bz2`
  (archive SHA-256 `c2320be44132687d8bd1e0935e64a301f7f4066d27785f4c6432338c6392c874`; `model.onnx`
  `f787627c08c782fc47b7d3a8131cfa25e58eb3a9de117a39723f36cab9c682bc`).
- Licence: **not stated.** The archive has no licence file. Its `README.md` says only "This folder is for
  https://github.com/k2-fsa/sherpa-onnx/issues/1779". That issue ("Adding fa/en matcha-tts model for
  android") says the poster trained the model, gives no licence and no dataset source, and links to
  `https://huggingface.co/mah92/Khadijah-FA_EN-Matcha-TTS-Model`, which was not read. **Unconfirmed — owner
  to check before publishing** (see the open item at the top).

**Vocos vocoder, 22 kHz** — turns the Farsi model's output into sound.
- Source: `https://github.com/k2-fsa/sherpa-onnx/releases/download/vocoder-models/vocos-22khz-univ.onnx`
  (SHA-256 `0574a135aa1db2de6e181050db2ec528496cacd4a4701fc5d7faf9f9804c0081`).
- Licence: no licence accompanies the file. **Unconfirmed — owner to check before publishing.**

**eSpeak NG data** — both voice archives contain an `espeak-ng-data` folder that the tooling uses to turn
text into phonemes. No licence file is included in the archives. **Unconfirmed — owner to check before
publishing** (build-time use only; none of it is shipped).

**Whisper "turbo", ONNX packaging by sherpa-onnx** — used only by `tools/verify_audio.py` to listen back to
generated clips. Folder `sherpa-onnx-whisper-turbo` (`turbo-encoder.int8.onnx`
`b02dcdf54f348741e93fe732b67d933c8dcb6735655f710640143081db38878b`, `turbo-decoder.int8.onnx`
`20accd02388482eb3a46bd615631adfdc85e1eb2c7db9ea3f02a40ffe6b81547`). An archive of that name exists at
`https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-turbo.tar.bz2`, but it
was not compared with the local copy, and the folder has no licence file. **Unconfirmed — owner to check.**

| Tool | Version used | Licence (from the package's own metadata) |
|---|---|---|
| sherpa-onnx (Python package, runs the voice models) | 1.13.8 | Apache ("Apache licensed, as found in the LICENSE file"), `https://github.com/k2-fsa/sherpa-onnx` |
| onnxruntime (Python package, used by `verify_audio.py`) | 1.29.0 | MIT |
| esbuild | 0.28.2 | MIT |
| Playwright (browser tests) | 1.56.0 | Apache-2.0 |
| ffmpeg with libmp3lame (MP3 encoding, system program) | 6.1.1 (Ubuntu package) | unconfirmed — depends on how the installed copy was built |

## 3. Optional services

The optional live AI partner (`ai-proxy/`) calls a model provider chosen by whoever deploys it; that
provider's terms apply to them. Nothing of it is bundled with the site.
