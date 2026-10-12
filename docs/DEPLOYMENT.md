# Deployment and upkeep

What has and has not been tried: the site has been built and exercised by automated tests in a
desktop Chromium browser at phone sizes. **It has not been opened on a real iPhone, and the steps in
section 2 were written from how iOS is documented to behave, not from doing them.** Treat the first
installation on a real phone as a test. Current test results are in [STATUS.md](STATUS.md).

## 1. GitHub Pages (the normal way)

The repository already contains the finished website in `site/`. The workflow does not rebuild it: it first checks
the content, runs the unit tests and confirms that `site/` is the build of the current source (`npm run site:check`),
and only then publishes `site/`. A push whose `site/` is out of date is refused, so run `npm run build` before committing.

1. Create a repository and push everything to `main`.
2. **Settings → Pages → Source: GitHub Actions.**
3. Wait for the "Deploy to GitHub Pages" action (`.github/workflows/pages.yml`) to finish. The address is
   shown on the Pages settings screen: `https://USERNAME.github.io/REPO/`.
4. HTTPS is automatic on `github.io`. HTTPS is required for offline use, installation and the microphone.

Size: see `du -sh site site/audio site/asr`. At the time of writing the pronunciation checker is about
53 MB (its largest file is about 30 MB) and the audio about 65 MB and growing with the curriculum. Check
GitHub's current size limits for repositories and Pages sites if you add much more audio.

**Use an address of its own.** Every repository of one GitHub account is served from the same origin
(`USERNAME.github.io`). Any other Pages project of that account could read what this app stores on the
phone — the learning progress and settings — and could use the optional AI service. The learner's personal
details («اطلاعات من»: name, address, phone numbers, date of birth) are no longer stored at all: they are kept
in memory only while the app is open (`src/js/me.js`), and a version that finds them saved by an earlier build
erases them on its first start. Publish Hamrah from an account or organisation that hosts nothing else, or give it
a custom domain.

## 2. On each parent's iPhone (not yet tried on a real device)

1. Open the address in **Safari** (not inside another app).
2. Tap **Share** (square with an arrow) → **Add to Home Screen** → **Add**.
3. Open the new icon. Answer or skip the first questions.
4. On Wi-Fi, go to **تنظیمات** (Settings):
   - **دانلود همهٔ درس‌ها** — downloads all audio so every lesson works without a connection.
   - **دانلود بررسی تلفظ** — downloads the pronunciation checker. The first time the microphone is
     used, the app explains why, and then iOS asks for permission; tap **Allow**.
   - **اطلاعات من** (optional) — their name, address and your phone number in English, which then appear as
     ready-made sentences on the emergency page and at the end of three lessons. These details are **not saved**:
     they are kept only while the app is open and must be typed again after it is closed. Nothing in the app needs
     them. A paper card with the address in English, kept by the phone, does the same job permanently. If they
     would rather not be asked, switch on **هیچ‌وقت نپرس** in the same screen.
5. Set the text size they like on the same screen.

Things to expect on iPhones (from documentation; confirm on the device):

- A home-screen app and Safari may keep **separate storage**. Pick one (the home-screen icon) and always
  use that, or progress will look "lost".
- iOS can clear a website's stored data if it is not opened for a long time. Progress is only on the
  phone; there is no account or backup.
- If there is no sound, check the volume buttons and the ring/silent switch.
- If the microphone was denied once, it has to be allowed again in the iPhone's Settings for Safari
  (the exact path differs between iOS versions).

## 3. Updating

Edit content or code, then:

```bash
npm run validate && npm test
npm run personas          # only if a conversation file changed and you run the AI proxy (section 5)
npm run build             # rewrites site/
```

Commit and push. A phone downloads the new version in the background when the app is opened with a
connection, and switches to it at a quiet moment — on the home screen or at the next start, never in the
middle of a lesson (this is how the code is written; it has been exercised in Chromium only). Audio
packs are named after their content, so only changed packs are downloaded again.

## 4. Regenerating audio

Needed only when English or Farsi sentences change.

```bash
pip install sherpa-onnx soundfile numpy onnxruntime     # plus ffmpeg on the PATH
# download once, into ../models (or set HAMRAH_MODELS):
#   https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v0_19.tar.bz2
#   https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/matcha-tts-fa_en-khadijah.tar.bz2
#   https://github.com/k2-fsa/sherpa-onnx/releases/download/vocoder-models/vocos-22khz-univ.onnx
npm run audio:collect      # list every sentence that needs a clip
npm run audio:generate     # records only the missing ones
python3 tools/verify_audio.py   # optional: listens back with speech recognition and flags mismatches
npm run audio:pack && npm run build
```

Checksums and licences of these models are in [THIRD-PARTY.md](../THIRD-PARTY.md). **The Farsi voice has
no stated licence**; read the open item there before publishing.

`content/pronunciation.json` tells the voice how to read text with digits or abbreviations.

To use a different voice or a paid text-to-speech service, replace `tools/gen_audio.py`; the only contract
is "write `audio-src/clips/<key>.mp3` for each entry in `audio-src/requests.json`".

## 5. Optional: the live AI conversation partner

The built-in conversation partner is scripted, works offline and needs nothing. This section is only
for adding free conversation with an AI model. It is off unless you do all of the following, and each
learner must then switch it on.

**Status — read before relying on it.** The proxy and the app's side of it are unit-tested against a
*simulated* model (`tests/unit/proxy.test.js`). **They have never been run against a real model, and
the Cloudflare deployment below has never been carried out from this project** (the Worker was only
bundled locally and called in a test). Nobody has yet seen how a real model follows the teaching rules
with a real learner. Try it yourself, at length, before giving it to your parents.

### What it is and what leaves the phone

A static site cannot keep an API key secret, so the key lives in a small service you host
(`ai-proxy/`). When a learner uses free conversation, the app sends that service:

- the id of the conversation (for example `rp-store`),
- the learner's level (`beginner` or `elementary`),
- the lines of this practice conversation so far, and the text of what the learner just said or typed.

Never audio, never the personal card, never progress data. The service adds the fixed instructions and
passes the text to the model provider. So the text is seen by your proxy host and by the provider, under
their own logging and retention terms; the proxy code itself writes no logs.

Only everyday small-talk conversations are open to the AI. Conversations marked safety-critical or
scripted, conversations in which the partner asks for a name, address, phone number, date of birth or
ID, and conversations with a turn where the learner is invited to answer with their own details, are
not on the proxy's list and are not offered in the app. `npm run personas` prints which are
open and which are closed, and why. To close one by hand, add `"live": false` to it in its
`content/roleplays*.json` file.

### Set-up

**You need:** an API key from a model provider (billing is with them) and somewhere to run `ai-proxy/`.

1. **Set a monthly spend limit at the provider first.** For Anthropic: Console → Settings → Billing →
   Spend limits. This limit is the real cap on what the service can cost you (see "What protects you").
2. Deploy the proxy. On Cloudflare Workers:

   ```bash
   npm run personas                          # refresh ai-proxy/personas.json from content/
   cd ai-proxy
   # edit wrangler.toml: ALLOWED_ORIGINS = your site's origin, e.g. https://USERNAME.github.io (https, no path)
   npx wrangler login
   npx wrangler secret put AI_API_KEY        # paste the key; it is stored by Cloudflare, never in the repo
   npx wrangler deploy                       # prints the worker's https address
   ```

   Or on any Node host (Node 20 or newer; tried only on Node 22) **behind HTTPS** — the server itself speaks plain HTTP:

   ```bash
   AI_API_KEY=... ALLOWED_ORIGINS=https://USERNAME.github.io PORT=8787 node ai-proxy/node-server.mjs
   ```

   If it runs behind your own reverse proxy, set `CLIENT_IP_HEADER` to the header that proxy writes the
   visitor's address into (for example `x-forwarded-for`); otherwise all visitors count as one for the
   per-visitor limit. Do not set it if requests can reach the server directly: the header could then be faked.
   Also set a connection limit and a header timeout at that reverse proxy (for nginx: `limit_conn` and
   `client_header_timeout 10s`): the Node server alone keeps a connection that sends its headers very slowly open.

   Settings (environment variables / `wrangler.toml` vars): `AI_API_KEY` (secret), `ALLOWED_ORIGINS`
   (comma-separated https origins), optional `AI_MODEL` (default `claude-haiku-4-5-20251001`),
   `AI_PROVIDER` (`anthropic`, or `openai` for any service with the OpenAI chat-completions format) and
   `AI_BASE_URL` (https, for `openai`).
3. Create `config.json` in the repository root with the proxy's **https** address:

   ```json
   { "aiProxyUrl": "https://hamrah-ai-proxy.YOUR-SUBDOMAIN.workers.dev" }
   ```

   An address that is not https is ignored by the app (plain `http://localhost` is accepted for testing
   on your own computer).
4. `npm run build`, commit and push. The build also writes the proxy's address into the page's
   content-security policy, so rebuild whenever `config.json` changes.
5. On the phone: **تنظیمات → «گفت‌وگوی آزاد»** (switch it on and confirm). The switch only appears when a service is
   configured and reachable. The learner is told in Farsi what is sent and not to say real personal
   details. After that, a "گفت‌وگوی آزاد با هوش مصنوعی" button appears on the conversations that are open to it.

**After changing any conversation** (`content/roleplays*.json`): run `npm run personas` and deploy the
proxy again. `npm test` fails while `ai-proxy/personas.json` is missing or out of date.

### What protects you, and what does not

- **The instructions cannot be chosen by the caller.** The proxy accepts a conversation id from its own
  list and builds the role and rules itself, in the provider's system field. Requests with any other
  shape are refused. So the service cannot be used as a general chatbot: the most a stranger can obtain
  is short in-role replies ("The milk is in aisle five.") for the listed everyday scenes.
- **Replies are checked** before they are shown, and a reply that fails is dropped: wrong shape; a web or
  e-mail address, also spelled out ("bob at gmail dot com"); a phone number that is not a 555-01xx practice
  number (in digits, spelled out, or toll-free with letters); a medicine dose, or advice to stop, skip or
  double a medicine, to take a named painkiller, not to call 911 or not to see a doctor; the name of a secret
  (PIN, password, verification code, card, account, Social Security or passport number, date of birth, home
  address); a question for the learner's own details in the usual wordings ("What's your name?", "Where do
  you live?", "When were you born?", "How old are you?"); a texted or on-screen code; remote access
  (AnyDesk, "download this app"); gift-card codes, wire transfers, crypto, "send me money", a grandchild in
  jail who needs money, "don't tell your family", "just sign it". Exactly which lines are refused and which
  must pass is pinned by the lists in `tests/unit/proxy.test.js`. This is a filter of patterns (`unsafeText` in `src/js/ai-prompt.js`, with its test lists in
  `tests/unit/proxy.test.js`), not of meaning: it stops the usual shapes of a harmful line, not every
  harmful sentence a model could write, and it has never been tried against a real model.
- **A conversation ends** after 8 learner turns in the app; the proxy refuses a request that shows more than
  8 learner turns, but a script can simply start a new conversation.
- **The Origin check is not access control.** It stops other *websites* from using your service through
  their visitors' browsers. A script can send any `Origin` header it likes, and your proxy address is
  public (it is in `config.json`).
- **The built-in limits slow abuse down; they do not stop it.** 30 answered turns per visitor address per
  10 minutes, 80 per visitor address per day (an IPv6 visitor is counted by its /64 network, since it can
  take a new address in it for every request) and 600 per day for everybody together — but the counters are kept in memory, start again
  whenever the process or Worker restarts, and on Cloudflare each location counts on its own. Invalid
  requests are refused before they are counted and never reach the model.
- **Therefore the provider's monthly spend limit is the cost control.** With it set, the worst case is
  that the allowance is used up and free conversation stops until next month; the scripted conversations
  are unaffected.
- HTTPS only: the app refuses a proxy address that is not https, the proxy refuses plain-http requests
  (except on `localhost`) and ignores allowed origins that are not https.

### Check it yourself

```bash
# refused: wrong site
curl -i -X POST https://YOUR-PROXY/ -H 'Origin: https://example.org' -H 'Content-Type: application/json' -d '{}'
# refused: not a listed conversation
curl -i -X POST https://YOUR-PROXY/ -H 'Origin: https://USERNAME.github.io' -H 'Content-Type: application/json' \
  -d '{"id":"rp-emergency","said":"Help"}'
# answered (this one calls the model and costs a fraction of a cent)
curl -i -X POST https://YOUR-PROXY/ -H 'Origin: https://USERNAME.github.io' -H 'Content-Type: application/json' \
  -d '{"id":"rp-store","level":"beginner","history":[{"who":"them","en":"Hello! Can I help you find something?"}],"said":"I want buy milk"}'
```

The last one should return JSON with `reply_en`, `reply_fa`, a gentle `correction_en` ("I want to buy
milk.") with `correction_fa`, and two or three `suggestions`. Then hold several whole conversations in
the app: make mistakes, answer off-topic, write in Farsi, mention a real-sounding emergency, and ask it
for medical advice, and read what comes back. Costs are estimated in [COSTS.md](COSTS.md).

## 6. Monitoring and backups

- The site is static files in git: the repository is the backup of the product. Learners' progress
  exists only on their phones.
- GitHub shows deploy failures under **Actions**.
- There is no analytics or error reporting in the app, by design (privacy). The practical monitor is
  asking your parents and watching one session over their shoulder; see
  [USABILITY-TEST-PLAN.md](USABILITY-TEST-PLAN.md).
- If you run the AI proxy, look at the provider's usage page from time to time.
