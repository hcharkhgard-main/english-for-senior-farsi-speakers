#!/usr/bin/env bash
# Rebuild, check and publish: audio pack -> build -> review export -> validate -> tests -> commit -> push.
# The GitHub workflow then deploys site/ to GitHub Pages (it refuses a stale site/).
#   tools/publish.sh "message"
set -euo pipefail
cd "$(dirname "$0")/.."
msg="${1:-Update}"
node tools/collect-audio.mjs >/dev/null
node tools/pack-audio.mjs >/dev/null
node tools/build.mjs
npm run -s review:export >/dev/null
node tools/validate-content.mjs | tail -1
npm test 2>&1 | grep -E '^# (pass|fail)'
if npm test 2>&1 | grep -q '^# fail [1-9]'; then echo "tests failed: not publishing"; exit 1; fi
node tools/build.mjs --check
# only what belongs to the project: a file left in the working folder (notes, scratch scripts, caches) is never published
paths=(.github .gitignore LICENSE README.md THIRD-PARTY.md package.json package-lock.json ai-proxy content docs review site src tests tools audio-src/requests.verify.json)
existing=(); for p in "${paths[@]}"; do if [ -e "$p" ] || git ls-files --error-unmatch "$p" >/dev/null 2>&1; then existing+=("$p"); fi; done
git add -A -- "${existing[@]}"
if git diff --cached --quiet; then echo "nothing to publish"; exit 0; fi
git -c user.name="Hamrah" -c user.email="noreply@example.com" commit -q -m "$msg" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
  -m "Claude-Session: https://claude.ai/code/session_015HQUSzC1XqvKaN8XFhNMNn"
git push -q origin main
git log --oneline -1
