#!/bin/sh
# Contact sheets from a render: one tile every N frames, 6 columns.  usage: qa-one-sentence-sheet.sh in.mp4 outprefix [step] [from] [to]
IN=$1; OUT=$2; STEP=${3:-15}; FROM=${4:-0}; TO=${5:-1650}
ffmpeg -loglevel error -y -i "$IN" -vf "select='between(n\,$FROM\,$TO)*not(mod(n-$FROM\,$STEP))',scale=270:-1,tile=6x4" -vsync vfr "${OUT}-%02d.jpg"
