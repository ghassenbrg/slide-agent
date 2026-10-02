#!/bin/sh
# Builds the sample deck the launch films show — an unbranded engineering
# review of an AI platform — the way a user's model would: build the first
# draft, read the verdict, answer the finding with an EditOp, finalize. Then
# copies the engine's own output into the Remotion project.
#
#   sh launch/demo/build-film-deck.sh        (from promo/)
#
# make-intent.py writes intent-draft.json (the first draft) and intent.json
# (the same deck after the fix); the script checks the edited deck matches it.
#
# Needs: slide-agent on PATH, Plus Jakarta Sans and JetBrains Mono
# (`slide-agent font --add "<family>"`).
set -e
cd "$(dirname "$0")"

python3 make-intent.py intent.json
python3 make-intent.py intent-draft.json --draft

rm -rf out
# Exit 2 is expected here: the draft's verdict is needs-attention.
slide-agent build --intent intent-draft.json --deck out/ 2>build.log > verdict-1.json || [ $? -eq 2 ]
mkdir -p film
cp out/previews/03-results-*.png film/results-before.png
cp verdict-1.json film/verdict-before.json

# The verdict flags the cost badge's icon as too faint; this is the answer.
slide-agent edit --deck out/ --ops film/edit-results.json 2>edit.log > verdict-2.json
cp out/previews/03-results-*.png film/results-after.png
node -e "
if (JSON.stringify(require('./out/intent.json').slides)!==JSON.stringify(require('./intent.json').slides)) { console.error('edited deck differs from intent.json'); process.exit(1); }"

slide-agent finalize --deck out/ 2>finalize.log > verdict-final.json
node -e "const v=require('./verdict-final.json');console.log('finalize:',(v.verdict||v).state)"

P=../..
rm -rf $P/public/launch/deck && mkdir -p $P/public/launch/deck
for f in out/previews/0*.png; do
	n=$(basename "$f" | sed -E 's/-[0-9a-f]{8}\.png$/.png/')
	cp "$f" "$P/public/launch/deck/$n"
done
cp film/results-before.png film/results-after.png $P/public/launch/deck/
cp out/scene.json $P/src/launch/data/scene.json
cp film/verdict-before.json $P/src/launch/data/verdict-before.json
