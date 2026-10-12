#!/bin/bash
# waits for running generators, then generates whatever requests.json now lists
cd /home/claude/hamrah
while pgrep -f "tools/gen_audio.py" >/dev/null; do sleep 5; done
python3 tools/gen_audio.py --models /home/claude/models --shard 0/2 --threads 1 > audio-src/logs/h0.log 2>&1 &
python3 tools/gen_audio.py --models /home/claude/models --shard 1/2 --threads 1 > audio-src/logs/h1.log 2>&1 &
wait
echo ROUND2DONE > audio-src/logs/round2.done
