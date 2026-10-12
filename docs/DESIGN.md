# Design

The test for every decision: *does this help an older Farsi-speaking immigrant understand someone, say
what they need, finish an everyday task, or depend less on family?*

This document describes how the product is meant to work and how it is built. What has actually been
checked, and what is still open after each QA round, is recorded in [STATUS.md](STATUS.md). Three things
are open by their nature and no amount of code changes them: the app **has not been used on a real
iPhone, has not been reviewed by a native Farsi-speaking English teacher, and has not been tried by
older learners.**

## Who it is for

Adults of 60 and over, native Farsi speakers, living in the United States, with little English, little
patience for technology, and often reduced eyesight, hearing or finger precision. They are capable
adults with a lifetime of experience; nothing in the product should feel like a children's game.

## User journeys

1. **First visit.** Farsi welcome → three optional questions (how much English, listening only or
   listening and speaking, which situation first), with a step counter, a way back, and "skip" → a short
   plan → home. The emergency button is there from the first screen.
2. **A daily session.** Home → *درس امروز* → the lesson's steps → "you can now …" → the conversation that
   practises the same situation.
3. **Interrupted session.** Phone rings, screen locks, app is closed. Next time, home says *ادامهٔ درس* and
   returns to the same screen. The position is kept per lesson, so looking at another lesson does not lose it.
   Conversations and sentence-builder sessions are short and are not resumed; they start again.
4. **Before a real appointment.** Home → *موقعیت‌های روزمره* → for example "Doctor and pharmacy" → pick the
   lesson or the simulated conversation and rehearse.
5. **Review.** Home → *یادگیری کلمات* → the day's first or second short set: hear (or read the Farsi and
   say it), think, reveal, "knew it / not yet".
6. **Understanding numbers.** *یادگیری کلمات* → *شنیدن عددها*: hear a price, time, date or phone number and
   tap what was said.
7. **Making their own sentences.** *جمله‌سازی* → Farsi prompt → tap English word tiles in order.
8. **Something goes wrong in real life.** Any screen → *اضطراری* → emergency phrases with large play
   buttons. If the learner entered their name, address and a family number in this session, they appear as
   ready sentences; otherwise the generic phrases ("My address is …") come with a short tip to keep the address
   in English on paper by the phone. Works offline. The app never dials.

## Rules the interface follows

These are the rules the code is written to. Where an automated check exists it is named; a rule without
one has been checked only by reading the code and by the QA rounds.

- **Farsi first, right-to-left.** Every English sentence is its own left-to-right block (`lang="en"
  dir="ltr"`). English words, prices and phone numbers inside Farsi text are isolated automatically
  (`bidi.js`, unit-tested) so mixed text cannot scramble.
- **Type.** Learning content is large at the default size; Settings offers four text sizes; Atkinson
  Hyperlegible for English (distinct I/l/1), Vazirmatn for Farsi. Pinch-zoom is not restricted.
- **Touch.** Primary actions are at least 56 px high. Secondary controls (single tappable words, small
  replay buttons) are smaller.
- **Navigation.** Back, Emergency and Home are in the same three places on every inner screen; a lesson
  has one primary action in a fixed bar at the bottom. The deepest path is home → situations → one
  situation → lesson.
- **Home screen.** Four choices, plus settings and the emergency link. No streaks, badges, timers, ads or pop-ups.
- **Few controls at once.** A sentence card shows play, slow play and the Farsi meaning; word-by-word
  listening, chunked playback and saving sit behind one labelled "more" button.
- **Colour is never the only signal.** Right answers get a check mark and words; set-aside answers get a
  different border and words.
- **Mistakes are never punished.** A wrong tap is set aside and the learner tries again. Speech the phone
  could not understand is reported as "I'm not sure I heard correctly", never as an error. No timers.
- **No typing in the learning flows.** Typing exists only for the optional personal card and the optional AI chat.
- **Personal details are never required and never pressed for.** Every invitation to fill in «اطلاعات من» (the end
  of the three "my information" lessons, the emergency page) has an equal "no, continue without" button; after a no
  it is not shown again until the app is opened again, and Settings «هیچ‌وقت نپرس» (stored) turns all of them off.
  Nothing waits for the details.
- **Calm.** No animation beyond the microphone level bar; light and dark themes.
- **Destructive actions are confirmed** in a sheet whose safe choice comes first and which ignores a
  second tap that arrives immediately.
- **Interface text is data.** All Farsi is in `content/ui.fa.json`; none is written in the code.

Checks that exist: unit tests (`npm test`) for speech scoring, review scheduling, bidirectional text,
saved-state migration and the AI service; browser tests (`npm run test:e2e`) that walk the main flows in
Chromium at phone sizes, including an offline run and a fake microphone. They do not run in Safari.

## Curriculum structure

Three stages — *survival*, *everyday independence*, *confident communication*. The stages and the order
of lessons are in `content/curriculum.json`; lessons are grouped by everyday situation
(`content/scenarios.json`). Current numbers: `npm run validate`.

Every lesson has the same sequence, so the learner never has to learn the interface twice:

1. Situation (picture, Farsi explanation, safety note where relevant, and an honest "about 9 to 13 minutes")
2. Reminder — from the second lesson on: up to three "how do you say this in English?" questions on
   sentences of earlier lessons, the ones due in review first; the answer counts as that sentence's review
3. The five key sentences, one card each: English, natural and slow audio, Farsi, optional Farsi-letter
   sound guide (labelled as approximate; shown by default in stage 1 only), when to use it — and under the
   card one button, "now you say it" (record, on-device check, word-level feedback; optional). There are no
   separate speaking screens. A word that stands for the learner's own name, address, date or number
   (`own`) is not scored: saying one's own is the right answer. Two lessons add a page of words to tap and
   hear here (`grid`: the numbers, the days of the week)
4. Listen and understand: three of the sentences with the English hidden; choose the Farsi meaning
5. Sample dialogue with two voices and "what did they say?" — a line played without text. In stage 1 the
   two questions follow the dialogue; from stage 2 one is asked before the dialogue is shown. Then, where
   the lesson has them, "the same thing in other words" (`variants`: "When were you born?"), heard without
   text; then one small grammar pattern, whose check comes before the mistake and the right form are
   shown side by side
6. Respond to a simulated person: several answers are accepted, next to one or two that do not fit
7. Real-world task: "you are in this situation — what do you say?" (two)
8. Review of whatever was hard (Farsi to English first), and building one sentence from tiles
9. A "you can now …" statement and the next small step

`plan()` in `views/lesson.js` is the one place that decides this. A full lesson is 20 to 24 screens
(it was 28) and a short one 12 to 15; every sentence is asked at least once, by ear or in a situation,
before it goes to review. The short mode — one switch on the first screen of every lesson, the first
included — has three sentences, two reminder questions and one question of each kind, and leaves out the
grammar note and the sentence-building.

Progress is described in abilities ("you can now ask where something is"), not scores.

**Conversations** (`content/roleplays*.json`) are scripted: the partner's lines and several acceptable
replies for each turn are written out, so they work offline and cannot say anything unsafe. Phone-call
conversations play sound first and show text on request. Once a conversation has been completed, the
partner's text starts hidden ("listen first"). `curriculum.practice` says which conversation follows
which lesson.

A spoken answer is matched to one of the written replies by `pickReply` (`match.js`), under one rule:
a reply is never chosen for something that means something else. "I don't understand", "Again,
please", "What?", "Please speak slowly" are never an answer — the partner says the line again (slowly
when that helps) and the turn stays where it is, unless the turn itself offers that request as a reply.
"I don't know" is not "No"; the opposite of a reply, another number, day or part of the body, or a word
that belongs to a different reply all rule a reply out. Where it cannot be told, the learner is asked to
say it again or to tap — never told they were wrong. On "open" turns (name, address, date, their own
problem) an answer that differs from the sample is shown in the learner's own words.
`tests/unit/replies.test.js` checks this against every turn of every conversation, with a hand-read
table of utterances (`tests/unit/replies.table.js`) that has to be reviewed when a turn is edited.

**Words** carry a Farsi meaning, sound guide, audio and an example sentence. **Review** uses spaced
repetition (`srs.js`). The plan the learner is told is the plan the code keeps: two short sets a day, one
in the morning and one in the evening, fifteen cards (about five minutes) each; the home screen names the
next set and its length, and after the second set the day's review is done. What was known comes back
later each time (after 1, 4, 12, 30, 75 and 180 days); "not yet" brings it back the next day, two steps
lower. A new word the learner already knew goes straight to the 12-day wait; something still known after
a much longer wait than planned skips a step. In a set, what is due comes first — the most recently
learned first, with four places kept for whatever has waited longest — and new words fill the places
that are left, six a day at most; only the 120 first words have three places a day kept for them. Two
sets a day keep up with a lesson a day; one set a day is enough for the lesson sentences and the first
120 words, and whatever does not fit waits without the learner ever being shown a count
(`node tools/simulate-review.mjs` prints the 120-day simulation; `tests/unit/srs.test.js` holds the plan to
it). A card is not always the same question: a new or missed item shows the English with its sound; once
known it is heard first, without text; and every other time a lesson sentence (and a word from its third
step on) is asked from the Farsi — "how do you say this in English?". A word's picture is on the back of
the card, never beside the English question.
The order of new words is data (`content/review-order.json`, applied by `reviewPool` in `learn.js`): the
most useful everyday words first for everyone (numbers to twenty, money, days, months, the clinic and the
pharmacy); then the word groups take turns, three words each, the groups of finished lessons first and
easier words before harder ones; the alphabet comes last (its category is marked `"last"` in
`vocabulary.json`), because the learner spells their own name from their own card. A word's id is its
position in `vocabulary.json`, so words are only ever added at the end of that file.

**Sentence builder**: reusable patterns from which the learner assembles sentences that were never shown.

**Listening to numbers**: prices, times, dates and phone numbers with plausible wrong options (15/50).

## Personalisation (kept deliberately small)

- The stated level decides where the learner starts; a beginner always starts at the first stage, and
  the essentials (hello, "I don't understand", calling 911) come first for everyone.
- "Listening only" hides the microphone by default.
- The chosen situation comes early.
- Sentences answered wrongly reappear in the lesson's review and enter the review queue.
- Conversation help (Farsi under the suggested replies) is shown for the first runs of a conversation,
  then tucked behind a button.

## Privacy

- No account, no analytics, no cookies. Progress and settings are one entry in the browser's storage on the
  phone, and can be reset or wiped from Settings.
- **The optional personal card («اطلاعات من»: name, address, own and family phone numbers, date of birth) is
  never saved on the device** (the owner's decision). It lives in one in-memory object (`src/js/me.js`) for as
  long as the page is open; closing or reloading the app forgets it, and the screen says so. The boundary is in
  `store.js`: `toStored` writes only the fields of `blank()`, which has no `me`; `migrate` drops a `me` saved by
  an earlier build and the store rewrites the entry at once on the first start (other copies of the app on the
  same address are cleaned of it too); the cross-tab sync never carries it; «پاک کردن همه‌چیز» clears it.
  `tests/unit/me.test.js` fills every field, saves in every way the app saves, and checks the stored text holds
  none of the values.
- The microphone opens only after the learner presses its button, and is released when the check ends
  or the learner leaves the screen. Speech is recognised on the phone; audio is never uploaded or stored.
- The only thing that can leave the phone is text in the optional AI conversation, and only after the
  learner has switched it on (below).

## Architecture

```
content/*.json ──► tools/content.mjs ──► site/content.json           (curriculum, validated)
                         │
                         └─► audio-src/requests.json ─► gen_audio.py ─► clips ─► pack-audio.mjs ─► site/audio/*.mp3 + index.json
src/js/*  ──► esbuild ──► site/app.js      src/styles.css ─► site/app.css      src/sw.js ─► site/sw.js
content/roleplays*.json ──► tools/make-personas.mjs ──► ai-proxy/personas.json   (optional AI service only)
```

- **No framework.** Plain JavaScript modules bundled by esbuild, one stylesheet. Fewer moving parts to
  maintain and nothing to keep upgrading.
- **Router** (`main.js`): a small in-memory stack mirrored in the address hash. Views are functions that
  return DOM; state that must survive a re-render lives in `app.ui`, state that must survive a restart
  lives in the store.
- **Store** (`store.js`): one versioned JSON document in `localStorage`, guarded for blocked storage,
  with a migration for older saved data. The personal card is not in it (`me.js`, memory only).
- **What comes next** (`learn.js`, `srs.js`): plain functions that choose today's lesson, the review
  sitting and the order of answer options.
- **Audio** (`audio.js`): clips are byte ranges inside per-lesson "packs", so a lesson is one download and
  one cache entry. Text that has no recording (AI replies, a few fallbacks) is spoken by the browser's own voice.
- **Speech** (`speech.js`, `moonshine.js`): microphone → 16 kHz samples → Moonshine tiny (ONNX Runtime
  Web, WebAssembly) → text → `match.js` scores it against the target, tolerant of contractions, numbers
  and near-misses, and says "not sure" rather than "wrong" when recognition is doubtful.
- **Offline** (`sw.js`): the app and curriculum are stored on first visit; audio packs on first use or all
  at once from Settings; the pronunciation files when downloaded.
- **Provider independence**: speech synthesis is a build step behind a file contract ("write one MP3 per
  requested clip"); the live model sits behind a small adapter with Anthropic and OpenAI-compatible forms.

### The optional live AI partner

Off by default, and absent unless the site owner deploys a service for it (DEPLOYMENT.md §5).

- `partner.js` has two back ends. Inside a Claude artifact it uses the page's own "ask Claude"
  capability and builds the prompt locally. On the static site it posts to the owner's proxy
  (`ai-proxy/`), whose https address comes from `config.json`.
- The app sends the proxy a conversation **id**, the learner's level and the lines of the practice
  conversation. The proxy looks the id up in `ai-proxy/personas.json` — generated from the conversation
  files — and builds the instructions itself, in the provider's system field. The caller cannot supply
  role text.
- Only everyday small talk is open to it. Safety-critical and scripted conversations, and any in which
  the learner is asked for, or invited to give, their own details, are excluded by one shared rule
  (`liveBlock` in `ai-prompt.js`) that the app, the list generator and the tests all use.
- The instructions (`ai-prompt.js`) carry the teaching rules: understand what the learner meant, answer
  it naturally in very simple English, show at most one gentle correction with a one-sentence Farsi
  explanation, keep going; never ask for real personal, medical, banking or immigration details; stay in
  the role; stop after eight learner turns. Everything from the learner is passed as conversation text,
  not as instructions.
- Replies are checked for shape and for things that must not be shown (links, real-looking phone
  numbers, doses) before the learner sees them.
- It has been tested only against a simulated model. How well a real model keeps to these rules with a
  real learner is unknown.

## Scope decisions

- *No accounts, sync or analytics.* A family tool does not need them and they are the main source of
  privacy risk and cost.
- *Scripted conversations first.* They work offline, cost nothing, and cannot say anything unsafe. The
  live model is an add-on.
- *On-device speech recognition.* A download of about 53 MB in exchange for privacy, offline use, and
  working inside an installed home-screen app.
- *Emoji for word pictures, drawn line icons for navigation.* Emoji are recognisable and free on
  iPhones; commissioned illustrations would be an improvement.
- *Synthetic voices.* Consistent and free; a human recording of the Farsi prompts would sound warmer, and
  would also settle the open licence question about the Farsi voice (THIRD-PARTY.md).
- *Not built:* hands-free play-through of a whole lesson; resuming an interrupted conversation;
  synchronising progress between devices.
