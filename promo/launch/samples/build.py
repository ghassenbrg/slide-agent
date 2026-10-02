"""Builds the three sample decks the LinkedIn film shows, with Slide Agent.

    python3 launch/samples/build.py            # build all, print each verdict
    python3 launch/samples/build.py --finalize # also finalize and publish to the film

Each deck is written to launch/samples/<id>/intent.json and built into
launch/samples/<id>/out. With --finalize, each deck is finalized (render,
schema validation, clean-directory rebuild), and its scene.json and previews
are copied into the Remotion project (src/samples, public/samples).
"""

import json
import pathlib
import re
import shutil
import subprocess
import sys

import architecture
import business_review
import keynote

HERE = pathlib.Path(__file__).parent
PROMO = HERE.parent.parent
DECKS = {"business-review": business_review.INTENT, "architecture": architecture.INTENT, "keynote": keynote.INTENT}


def run(args, out):
    with open(out, "w") as fh:
        code = subprocess.run(args, stdout=fh, stderr=subprocess.DEVNULL).returncode
    data = json.loads(pathlib.Path(out).read_text())
    return code, data.get("verdict", data)


def summary(deck, verdict):
    print(f"\n== {deck}: {verdict.get('state')}")
    for issue in verdict.get("issues", []):
        if issue["severity"] != "minor":
            print(f"   {issue['severity']:9} {issue['code']}: {issue.get('where')} — {issue.get('hint')}")
    for edit in verdict.get("suggestedEdits", []):
        print(f"   suggest   {edit['id']}: {edit.get('why')} (≤{edit.get('maxChars')})")
    for adj in verdict.get("adjustments", []):
        print(f"   adjusted  {adj['kind']} ×{adj['count']}: {adj['where'][:4]}")


def main():
    finalize = "--finalize" in sys.argv
    for deck, intent in DECKS.items():
        folder = HERE / deck
        folder.mkdir(exist_ok=True)
        (folder / "intent.json").write_text(json.dumps(intent, indent=2, ensure_ascii=False))
        shutil.rmtree(folder / "out", ignore_errors=True)
        _, verdict = run(["slide-agent", "build", "--intent", str(folder / "intent.json"), "--deck", str(folder / "out")], folder / "verdict.json")
        summary(deck, verdict)
        if not finalize:
            continue
        _, final = run(["slide-agent", "finalize", "--deck", str(folder / "out")], folder / "verdict-final.json")
        print(f"   finalize: {final.get('state')}")
        public = PROMO / "public" / "samples" / deck
        shutil.rmtree(public, ignore_errors=True)
        public.mkdir(parents=True)
        for png in sorted((folder / "out" / "previews").glob("0*.png")):
            shutil.copy(png, public / re.sub(r"-[0-9a-f]{8}\.png$", ".png", png.name))
        data = PROMO / "src" / "samples"
        data.mkdir(parents=True, exist_ok=True)
        shutil.copy(folder / "out" / "scene.json", data / f"{deck}.json")
        shutil.copy(folder / "intent.json", data / f"{deck}.intent.json")


if __name__ == "__main__":
    main()
