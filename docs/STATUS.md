# Status

Last updated: 12 October 2026. This page says plainly what has been checked, how, and what is still open.

## In one paragraph

Hamrah is a working app: lessons in three stages, simulated conversations, a word review that plans itself,
number listening, reading practice with real-looking papers, a sentence builder, a pronunciation check that runs
on the phone, the learner's own details (optional, kept only while the app is open, never saved), emergency
phrases, and offline use. Everything was written and checked by
AI (Claude) and by automated tests. **No native Farsi-speaking teacher has reviewed it, it has not been opened on a
real iPhone, and no older learner has tried it yet.** Treat the first weeks of use as a pilot.

## How it was checked

- **Independent AI review rounds.** Separate reviewer agents, who did not write the code or content, read every
  file and drove the app in a phone-sized browser: language (English and Farsi), situation coverage and teaching,
  features and bugs, accessibility for older adults, and security, privacy and content safety. Their reports are
  kept outside the repository; each round's findings were fixed and then re-checked by the next round.
- **Automated tests** (`npm test`, `npm run test:e2e` and the files in `tests/e2e/`): unit tests for scoring speech,
  matching spoken replies (thousands of utterances against every conversation turn), the review schedule, the
  lesson plan, the learner's own sentences and the content files; browser tests for complete lessons,
  conversations, review, papers, the microphone (including that it never stays open after leaving a screen), the
  app shell, the service worker and offline start with the server switched off, and a layout sweep of every screen
  at 320 and 390 px width at normal and 150 % text size.
- **Audio** is generated locally with open voice models and listened back with two speech recognisers; clips that
  are not heard as their text are regenerated or reworded.

Latest review scores (0–10, from the reviewers' own reports):

| Area | Round 2 | Round 3 |
|---|---|---|
| Lesson language, English | 9.4–9.6 | 9.5 |
| Lesson language, Farsi | 9.1–9.3 | 9.2–9.3 |
| Pronunciation aids (Farsi script) | 9.0–9.1 | 9.2–9.7 |
| Conversations: flow / reply matching | 9.0 / 6.8 | 9.3 / rewritten since, being re-reviewed |
| Comprehension checks, papers, numbers | — | 9.4–9.7 |
| Coverage and teaching | 5.5–7.8 | being re-reviewed after a large redesign |
| Security & privacy / content safety | 8.4 / 8.9 | being re-reviewed |

## Known open items

1. **Native-speaker review.** All Farsi, the Farsi-script pronunciation aids, and the safety-related notes (health,
   money, police, immigration, benefits) need a reading by a qualified Farsi-speaking English teacher.
   `npm run review:export` writes `review/content-review.csv` and `review/safety-critical.md` for that purpose.
2. **Real iPhone.** Installation to the home screen, audio after the screen locks, the microphone permission, and
   the date pickers have only been tested in desktop Chromium at phone sizes.
3. **Older learners.** See `docs/USABILITY-TEST-PLAN.md`.
4. **Audio.** Recordings for the most recent text are generated in batches; until a sentence has its recording the
   app uses the phone's own English voice for it.
5. **Licence of the Farsi voice model** used to generate the Farsi audio is not stated by its publisher
   (see `THIRD-PARTY.md`).
6. **The optional live AI partner** has been tested only against a simulated model, never a real one.
7. **Address of its own.** The live site is on `hcharkhgard-main.github.io`, an address shared with every other
   GitHub Pages project of that account: any of them could read what Hamrah keeps on the phone — which is now only
   the learning progress and settings. Personal details («اطلاعات من») are no longer stored at all (kept in memory
   while the app is open, erased from phones that had them saved by an earlier version), but any of those projects
   can replace the stored app, which would then run as Hamrah and could see the details while they are typed (QA
   round 4, security M1). Since then the service worker checks every stored file against this version's list
   (size and SHA-256) each time it serves it, and deletes and re-downloads a copy that is not the listed file, so a
   replaced page, script, lesson file, sound or recogniser file is no longer served. That is a backstop, not a cure:
   such a project can still delete Hamrah's stored files and its service worker (the app then needs a connection
   again, and a site-wide service worker of `hcharkhgard-main.github.io` could take its place), read and change
   the progress, and use the optional AI service. Move it to an account or organisation that hosts nothing else,
   or to a custom domain, before the learners rely on it — progress does not move with the address
   (see `docs/DEPLOYMENT.md`, "Use an address of its own").
