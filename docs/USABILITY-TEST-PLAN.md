# Usability test plan

**None of this has been done yet.** The app has been tested by automated scripts in a desktop
Chromium browser at phone sizes only. That shows that it functions there. It does not show that it
works on an iPhone, and it does not show that a 68-year-old who has never used a learning app can use
it alone. This plan is how to find out. For a family, the first participants are simply the two parents.

## Part A — the owner's own check on a real iPhone (before involving any learner)

Do this first, alone, on the phone the learner will use. Each line is something no test has covered.

| # | Check | Look for |
|---|---|---|
| A1 | Open the address in Safari; add to the home screen; open the icon | Opens full-screen in Farsi, right-to-left, nothing cut off at the top or bottom edge |
| A2 | Play a sentence at normal and slow speed, with the silent switch on and off | Sound starts promptly; note whether the silent switch mutes it |
| A3 | Download all lessons and the pronunciation checker on Wi-Fi | Both finish; progress is shown; the phone does not run out of space |
| A4 | Use the pronunciation check once | The app's explanation, then the iOS permission prompt; a result within a few seconds; the microphone indicator goes off afterwards and when you leave the screen |
| A5 | Airplane mode: open the app, do a lesson, open the emergency page | Everything downloaded plays; anything not downloaded gives a Farsi message |
| A6 | During a lesson: lock the screen, take a phone call, switch apps, come back | Returns to the same step; sound can be played again |
| A7 | Each text size in Settings, and the iPhone's own larger text setting | Nothing overlaps, is cut off or scrolls sideways |
| A8 | Dark mode | Everything readable |
| A9 | Close the app completely; open it the next day | Progress and settings are still there |
| A10 | (only if you set up the AI partner) switch it on and hold three whole conversations | Replies are short, in role and kind; corrections are right; nothing personal is asked |

Write down what fails and fix it before Part B.

## Part B — sessions with older learners

### Participants

Five to eight people aged 60+, native Farsi speakers, mixed English level (none / a few words / simple
sentences) and mixed phone confidence. At least two who rarely use apps.

### Setup

- Their own iPhone if possible, otherwise a recent iPhone in Safari. Real device, not a simulator.
- App freshly installed to the home screen, nothing downloaded, text size at default.
- One quiet room; later, repeat two tasks in a noisier place for the microphone.
- The observer speaks Farsi, says as little as possible, and does not touch the phone.

### Tasks (read aloud in Farsi, one at a time, no hints)

| # | Task | Success means |
|---|---|---|
| 1 | "Open the English program." | Finds and opens the icon |
| 2 | "Start today's lesson." | Reaches the first sentence |
| 3 | "Hear the sentence again, then slowly." | Uses both listen buttons |
| 4 | "Find out what it means in Farsi." | Reads or plays the Farsi |
| 5 | "Hear only one word of the sentence." | Finds the word-by-word option and taps a word |
| 6 | "Carry on to the end of the lesson." | Reaches the closing screen, including the listening questions |
| 7 | "Say one sentence to the phone and see what it thinks." | Grants the microphone, records, reads the result |
| 8 | "Practise a conversation at the store." | Finishes a simulated conversation |
| 9 | "Practise hearing prices and times." | Finds the number-listening practice and answers a few |
| 10 | "Make the writing bigger." | Changes text size |
| 11 | "Close it. Now open it and continue where you were." | Resumes |
| 12 | "Find what to say if you need an ambulance." | Opens the emergency page from wherever they are |
| 13 | "Go back to a lesson you already did." | Finds it under situations |
| 14 | "Go over the words you learned." | Opens the review and answers a few |
| 15 | (airplane mode on) "Do a lesson you have not done before." | Lesson plays offline after the download |

### What to record for each task

- Completed alone / completed with one hint / not completed
- Time to complete
- Wrong taps (which control they expected to work)
- Hesitations longer than about ten seconds, and what they were looking at
- Anything said aloud ("where is…?", "what does this mean?")
- After the session: what was confusing, what they liked, whether the Farsi sounded natural, whether the
  voices were clear, whether the pronunciation feedback felt fair or discouraging

### Measures

- Share of participants completing each task unaided (target: at least 4 of 5 for tasks 1–4, 6, 8, 11, 12)
- Navigation errors per task
- Lesson completion in a first session
- Role-play completed without the Farsi help
- Time from tapping the icon to the home screen, and from tapping a listen button to sound

### Fix before adding anything

Rank problems by how many people hit them and whether they stopped the task. Fix the top ones, re-test
with two or three new people, repeat. New lessons and features wait until tasks 1–4, 6, 11 and 12 are easy.

## Longer-term check (the real goal)

After four weeks, ask each learner to do three real things without help and report back: ask where
something is in a store, check in at a clinic or pharmacy, and say their address and "I need an
interpreter". Independence in the real task is the measure, not lessons finished.
