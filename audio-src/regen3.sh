#!/bin/bash
cd /home/claude/hamrah
while [ ! -f audio-src/logs/round2.done ]; do sleep 5; done
python3 tools/gen_audio.py --models /home/claude/models --shard 0/2 --threads 1 > audio-src/logs/i0.log 2>&1 &
python3 tools/gen_audio.py --models /home/claude/models --shard 1/2 --threads 1 > audio-src/logs/i1.log 2>&1 &
wait
echo done > audio-src/logs/round3.done
