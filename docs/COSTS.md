# Recurring costs

| Item | Cost | Notes |
|---|---|---|
| Hosting (GitHub Pages) | $0 | Static files |
| Lessons, conversations, words, sentence builder, listening practice, review, offline use | $0 | Everything is pre-generated and runs in the browser |
| Pronunciation checker | $0 | Runs on the phone (one download of about 53 MB per phone) |
| Voice generation when you add lessons | $0 | Open models on your own computer |
| **Optional** live AI partner | pay-per-use | Only if you deploy `ai-proxy/` and a learner switches it on |

Without the optional AI partner there is no recurring cost and no account anywhere except GitHub.

## If you turn on the live AI partner

These are estimates from the size of the text, **not measurements**: the proxy has never been run
against a real model from this project.

One learner turn sends the fixed instructions (about 5,000 characters) plus the conversation so far (up
to about 1,000 characters), and receives a short JSON reply with English and Farsi text. As a rough
guide that is 1,400–1,800 input tokens and 150–300 output tokens per turn.

With Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) at $1 per million input tokens and $5 per million
output tokens (read on 2026-10-11 at https://platform.claude.com/docs/en/about-claude/pricing — prices
change; look again before relying on this):

- one turn ≈ $0.002–0.003
- one conversation (8 turns, the cap) ≈ $0.02–0.03
- two learners, two AI conversations each per day ≈ **$3 per month**

The proxy itself fits a free hosting tier at this volume (Cloudflare Workers' free plan at the time of
writing; check the current terms).

### What bounds the cost

1. **The monthly spend limit you set at the provider** (Anthropic: Console → Settings → Billing → Spend
   limits). This is the only hard bound. Set it to a few dollars.
2. The proxy's own limits — 8 turns per conversation, 30 answered turns per visitor address per
   10 minutes, 600 per day in total — reduce accidental and casual overuse. They are kept in memory and
   reset when the service restarts, and its address is public, so do not count on them against deliberate
   abuse: at the daily limit alone, a month of sustained misuse would be roughly $50, and the limit is
   not strict on Cloudflare. See [DEPLOYMENT.md](DEPLOYMENT.md#what-protects-you-and-what-does-not).

## What was deliberately not used

- Paid text-to-speech or speech-recognition services: the open models were judged good enough by
  machine listen-back checks (no human has reviewed the audio yet), and avoiding them removes both cost
  and the need to send voices off the device.
- Accounts, databases, sync: not needed for a family, and they would add cost, privacy risk and things
  to break.
