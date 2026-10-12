# Hamrah English · همراه انگلیسی

A Farsi-first English companion for older adults (60+) who have immigrated to the United States and want
to handle everyday life on their own: the doctor, the pharmacy, shopping, the phone, the bank, the bus,
the airport, neighbours, and emergencies.

It is a static website. Put it on GitHub Pages, open it on an iPhone, add it to the home screen. No
account and no server. After the lessons have been downloaded once, they work without a connection.

## Status — read this first

This is a working first version that has been built and tested by machine only.

- **It has not been opened on a real iPhone.** The browser tests run in desktop Chromium at phone sizes.
- **It has not been reviewed by a native Farsi-speaking English teacher.** All lesson text, translations
  and audio were produced by AI models and checked by AI reviewers and scripts.
- **It has not been tried by older learners.**
- The optional live-AI partner has never been run against a real model.
- The licence of the synthetic Farsi voice is not stated by its publisher (see [THIRD-PARTY.md](THIRD-PARTY.md)).

What was checked, what was fixed and what is still open: [docs/STATUS.md](docs/STATUS.md). Lessons that
touch safety, health, money or the law are listed in `review/safety-critical.md` and need a human check
most of all.

It teaches language only. It is not medical, legal, immigration or financial advice.

## What a learner gets

| | |
|---|---|
| Lessons | Short lessons in three stages, all with the same sequence: situation → a few key sentences → listen and understand → say it (optional) → sample dialogue, "what did they say?" and one small grammar pattern → answer a simulated person → real-world task → review → encouragement |
| Conversations | Simulated conversations with a patient scripted partner for everyday situations, including phone calls where the learner hears before reading |
| Words | Everyday words with Farsi meaning, sound guide and example sentence; a review that schedules itself |
| Listening to numbers | Hear a price, time, date or phone number and tap what was said |
| Sentence builder | Assemble new sentences from word tiles, using patterns from the lessons |
| Pronunciation check | Say a sentence; the phone shows which words it understood. It runs on the device — audio is never uploaded |
| Audio | English sentences at natural and slow speed, single words, and Farsi audio for meanings; pre-generated and stored for offline use |
| Emergency | Emergency phrases reachable from every screen and available offline; the app never dials |
| Optional | Free conversation with an AI model, only if the site owner sets up a small service for it and the learner switches it on |

How many of each: `npm run validate` prints the current counts.

Interface: Farsi, right-to-left, large type, four choices on the home screen, Back and Home always in
the same place, no typing needed for learning.

## Put it online (GitHub Pages)

1. Create a repository on GitHub and push this folder to the `main` branch. Use an account or organisation
   that hosts no other Pages sites, or a custom domain (why: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).
2. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/pages.yml`) checks the content, runs the unit tests, confirms that
   `site/` matches the source, and publishes the ready-built `site/` folder. The
   site is then at `https://YOUR-USERNAME.github.io/REPO-NAME/`.
4. On the iPhone: open that address in **Safari → Share → Add to Home Screen**.
5. In the app: **تنظیمات → دانلود همهٔ درس‌ها** (download all lessons) while on Wi-Fi, and optionally the
   pronunciation checker.

More detail, and the optional live-AI partner, in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Work on it

```bash
npm install
npm run validate      # check the curriculum for mistakes and print the counts
npm test              # unit tests
npm run build         # rebuild site/ after changing code or content
npm run serve         # http://localhost:8080
npm run test:e2e      # phone-sized browser tests (needs Chromium via Playwright)
npm run personas      # after changing a conversation: refresh the list used by the optional AI service
```

### Add or change a lesson

Lessons are data, not code. Copy a file in `content/lessons/`, edit the English and Farsi, add its id to
`content/curriculum.json`, then:

```bash
npm run validate
npm run audio:collect && npm run audio:generate && npm run audio:pack   # only new sentences are recorded
npm run build
```

Voice generation runs locally with open models (see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#4-regenerating-audio)); nothing is paid for. New content starts
as an unreviewed draft: see [docs/CONTENT-REVIEW.md](docs/CONTENT-REVIEW.md).

### Layout

```
content/        curriculum: lessons, conversations, words, numbers, patterns, emergency phrases, interface text (all Farsi is here)
src/            the app (plain JavaScript modules, one stylesheet, service worker)
site/           the built website, committed so Pages can serve it as-is (includes audio packs and the pronunciation model)
audio-src/      generated clips (local cache, not in the repository; `npm run audio:generate` recreates it)
tools/          build, validation, audio generation and verification, review export, AI persona list
ai-proxy/       optional server-side proxy for the live AI partner
tests/          unit tests and end-to-end browser tests
docs/           design, deployment, content review, usability test plan, costs, status
review/         spreadsheet export of all content for a Farsi-speaking English teacher
```

## Licence

MIT for code and curriculum. Bundled fonts, the speech model and its runtime have their own licences, and
one build-time voice model has none stated — see [THIRD-PARTY.md](THIRD-PARTY.md).
