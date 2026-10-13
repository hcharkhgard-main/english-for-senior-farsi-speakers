# Content review process

Everything a learner reads or hears lives in `content/` as data, separate from the code.

## Current state

**No human has reviewed the content.** It was written by an AI model, is checked for structure by
`npm run validate`, and its audio was checked by machine (a speech recogniser listening back). In QA
round 1 the English, the Farsi and the safety-related statements were read through again by AI
reviewers and their corrections were applied (their reports are not part of this repository). That is
useful, and it is
not a substitute for the three human reviews below. Treat the Farsi in particular as unreviewed.

Each lesson file carries a review record, and the validator refuses a lesson without one:

```json
"review": { "status": "draft", "language": null, "teaching": null, "safety": null }
```

All of them are `draft`. Some other files have the same record; the conversation files
(`content/roleplays*.json`) and the vocabulary do not yet. When a reviewer signs off one of those, add
the record at the top level of the file in the same form (the app ignores it).

## Who needs to review what

| Review | Reviewer | Looks for |
|---|---|---|
| Language | Native Iranian-Persian speaker fluent in American English, ideally an ESL teacher | Natural Farsi an older reader finds comfortable (not stiff, not slangy); translation accuracy; the Farsi-letter sound guides; natural American English |
| Teaching | ESL teacher with older beginners | Sentence choice and order, whether accepted answers are all acceptable, whether "poor answer" feedback is fair, grammar notes, the listening questions |
| Safety and facts | Someone qualified for the topic | Every item in `review/safety-critical.md`: 911 guidance, scam advice, police stops, immigration, health-related notes, money, and cultural claims such as tipping |

## How to review

1. `npm run review:export` writes `review/content-review.csv` (one row per sentence: location, English,
   Farsi, sound guide, notes, and two empty columns) and `review/safety-critical.md`.
2. Open the CSV in a spreadsheet. Mark each row y/n and write the correction.
3. Apply corrections in the matching `content/` file. Run `npm run validate`.
4. If any English or Farsi sentence changed, regenerate audio (see DEPLOYMENT.md §4).
5. If a conversation changed and the optional AI proxy is in use: `npm run personas`, then deploy the
   proxy again (DEPLOYMENT.md §5).
6. Set the file's record, for example
   `"review": { "status": "reviewed", "language": "N. Reviewer 2026-11-02", "teaching": "…", "safety": null }`.
7. Safety-critical files are done only when all three fields are filled.

## Known weak spots to look at first

- The Farsi-letter sound guides (`ph`) are approximations by design, but several are debatable (th, w, short i).
- The register mixes one colloquial greeting on the home screen (as specified) with standard written Persian elsewhere.
- The Farsi audio is synthetic and reads without vowel marks; expect occasional wrong stress or a mis-read word. Nobody has listened to all of it.
- Automatic grammar corrections (`content/corrections.json`) are pattern rules; they cover common Farsi-speaker errors, not everything.
- Notes that state facts about American life (tipping, 911 interpreters, gift receipts, pay-first gas pumps, urgent care) are general knowledge and vary by place.
- The instructions given to the optional AI partner (`src/js/ai-prompt.js`) are part of the teaching content and have never been tried with a real model.
- Stage 3 promises «گفت‌وگوهای بلندتر», but its lesson dialogues are hardly longer than stage 2's (QA round 4,
  coverage L3: partner lines average 6.7 / 7.5 / 7.0 words in stages 1–3). Each stage-3 dialogue should have one
  partner line of 10–16 words that carries two facts, in the style of "Thank you. We know about the outage in your
  area. A crew is working on it." (`power-weather`). A greeting or a menu does not count. A new line needs new
  recordings, so write it during review, not in passing. State on 2026-10-12 (longest partner line in brackets):
  - **Have one:** `customer-service` (the phone menu, 13), `insurance-coverage` (copay + blood test, 11),
    `power-weather` (16), `driving-police` (too fast + the limit, 11), `immigration-office` (14),
    `work-first-day` (10), `work-delivery` (11).
  - **Need one:** `appointment-change` (7), `pay-bill-phone` (only a greeting, 11; for example "Thank you. You owe
    eighty-two dollars, and it's due on Friday."), `landlord-rent` (10, one fact), `sale-shopping` (9),
    `community-library` (greeting, 9), `senior-center` (greeting, 10), `driving-car` (8), `car-accident` (9),
    `airport-checkin` (9), `on-the-plane` (9), `airport-officer` (7), `job-search` (8), `work-rideshare` (5),
    `work-maintenance` (6), `work-tailor` (6), `work-bridal` (7), `work-customers` (9), `wedding-congrats` (6),
    `condolences` (9).
  - The conversations `rp-car-accident` and `rp-car-trouble` (added in pass 5) already end with such a line.

## Adding content safely

- Keep lessons to five sentences and one pattern.
- For anything touching health, money, police, immigration or emergencies: set `"safetyCritical": true`,
  add a Farsi `note` saying it is language practice and not advice, and never invent a diagnosis, dose,
  legal instruction or real personal detail.
- Practice data must be obviously fictional (555-01xx phone numbers, "25 Oak Street").
- Conversations and the optional AI partner. The AI is only ever offered for everyday small talk. A
  conversation is closed to it automatically when it is `safetyCritical`, when it has `"scripted": true`,
  when any turn is marked `"open": true` (the learner is invited to answer with their own details), or
  when the partner's lines or persona ask the learner for a name, address, phone number, date of birth,
  apartment number or ID. `npm run personas` lists which conversations are open and why the
  others are closed. Read that list after adding a conversation; if one is open that should not be, add
  `"live": false` to it. The `persona` text of a conversation is given to the model as its role, so write
  it as carefully as a line the learner will read, and never put anything in it that invites questions
  about the learner's real life.

## Optional fields (development pass 3)

All of these may be left out; `npm run validate` checks every one that is present. `tools/content.mjs`
(`normaliseLesson`, `normaliseRoleplay`, `normalisePaper`) brings them into the shape the app reads; a field that
is absent or empty in the file is absent in the app's data too.

| Where | Field | Meaning | The validator requires |
|---|---|---|---|
| lesson phrase | `"own": ["Maryam"]` | The words of that sentence that are the sample person's details. The learner says their own, so the speaking check does not score them. | Each entry is a whole word (or run of words) of the phrase's `en` |
| lesson | `"mission": "…"` | One Farsi sentence: a small, safe thing to try in real life. Shown when the lesson is finished; the app asks once, later, whether the learner managed (no penalty), and the list «کارهایی که حالا می‌توانم بکنم» keeps it. No Farsi recording is made for it. | Farsi text |
| lesson | `"variants": [{ "en", "fa", "like", "voice"? }]` | Other ways people really say a line of the lesson. `like` is that line. Heard without text (recorded at both speeds in `voice`, default the lesson's `them.voice`). | `en`, `fa`; `like` not empty (a warning when it is not a line of the lesson); no duplicates |
| lesson | `"grid": { "title", "note"?, "words": [...] }` | A tap-to-hear screen of vocabulary headwords. | `title`; every word is a headword in `vocabulary.json`, once |
| lesson, conversation | `them.voice` | `"s"` is the learner's voice; partners are `"m"`, `"b"`, `"k"` (a second woman) or `"a"` (a second man). | One of the five |
| conversation turn | `"check": { "q"?, "right", "wrong": [a, b] }` | A Farsi question about that turn's partner line, asked before the replies appear. `q` defaults to «چه گفت؟». | One right answer, exactly two wrong ones, all different |
| conversation reply | `"thenCheck": { … }` | The same, about that reply's `then` line. | As above, and the reply has a `then` |
| conversation reply | `"skip": 1` | After this reply the next turn(s) are left out, because the reply makes them moot ("No. I'm hurt." → the other driver calls 911, so the police question is not asked). | A whole number, 1 or more, that leaves at least one turn after it |
| `curriculum.json` | `"essentials": [lesson ids]` | The lessons everybody does first, whatever they answer at the first-run questions. After them, safety-critical lessons of an earlier stage are never skipped either. | Stage 1 lessons that exist; one of them an emergency lesson (warning) |
| `curriculum.json` | `"practice": { lesson: "rp-id" or ["rp-id", …] }` | The conversation(s) offered when the lesson is finished; the first is the main one. | The ids exist |
| `curriculum.json` | `"numbersAfter": [lesson ids]` | Lessons whose last screen also offers «شنیدن عددها». | The ids exist |
| `curriculum.json` | `"mine": { lesson: ["phone", "age", "name", "address", "born"] }` | Which of the learner's own sentences the last screen of that lesson builds from «اطلاعات من» (`src/js/own.js`). | Known lessons and kinds |
| `content/papers.json` (optional file) | `{ "papers": [{ "id", "title", "kind", "stage", "lesson"?, "note"?, "safetyCritical"?, "lines": [{ "en", "fa", "strong"? }], "questions": [{ "fa", "line" }] }] }` | A piece of paper or a screen to read. `kind` is `reminder`, `label`, `bill`, `letter`, `sign`, `receipt` or `form`; `line` is the number of the line that answers the question, counted from 1. Each line is recorded in voice `s` (audio pack `papers`). | Unique lower-case `id`; known `kind`, `stage` and `lesson`; every line has `en` and `fa`; every `line` points at a line |

The learner's own details («اطلاعات من») are never content, and are never saved: they are kept in memory only while
the app is open (`src/js/me.js`). The app says the
learner's own phone number, age, spelled name and date of birth by playing single recordings one after another
(letters, numbers 0–99, ordinals 1st–31st, months, "nineteen", "two thousand"); `tools/content.mjs` asks for those
recordings under the audio pack `me`.
