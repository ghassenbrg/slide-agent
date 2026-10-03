# One Sentence — rendering

Standalone Remotion entry; no other composition is touched. Remotion 4.0.532, Node 22+, macOS (tested). Run from `promo/`.

```sh
npm ci
npx remotion studio src/one-sentence/index.ts                       # preview and edit
npx remotion render src/one-sentence/index.ts OneSentence out/one-sentence/slide-agent-one-sentence.mp4 --codec=h264 --crf=17
npx remotion render src/one-sentence/index.ts OneSentence out/one-sentence/slide-agent-one-sentence-no-music.mp4 --codec=h264 --crf=17 --props=one-sentence/props-nobgm.json
npx remotion still  src/one-sentence/index.ts OneSentenceCover out/one-sentence/cover.png
npx tsx scripts/export-one-sentence-text.ts                         # captions.srt / captions.json / voiceover-script.md
```

1080 × 1350, 30 fps, 1650 frames (55.0 s). The no-music version keeps narration and sound effects.

## Source map

| File | Role |
|---|---|
| `src/one-sentence/timeline.ts` | Single source of truth: beat grid (122.0 BPM), shot table `SHOTS`, key moments `K`, narration clip placement `VO` |
| `src/one-sentence/Request.tsx` | The carried request sentence (composer → user message → docked chip → re-typed example requests) |
| `src/one-sentence/scenes/*.tsx` | Opening, Install, Workflow, Depth, Range, Deliver, Close |
| `src/one-sentence/kit.tsx` | Slide images, slide-pixel geometry from `geometry.json`, camera |
| `src/one-sentence/Audio.tsx` | Ducked music, narration clips, declarative SFX table (each entry names the action it supports) |
| `src/one-sentence/captionTrack.ts`, `Captions.tsx` | Caption chunks mapped onto spoken word timings |
| `src/one-sentence/workbench.ts` | Manifest for the video-shotcraft workbench |

## Regenerating assets (optional; frozen copies are committed under `public/one-sentence/`)

1. Fern deck (real Slide Agent output): `python3 one-sentence/deck/make_intent.py && slide-agent build --intent one-sentence/deck/intent.json --deck one-sentence/deck/out && slide-agent finalize --deck one-sentence/deck/out --export pdf`. Requires the installed `slide-agent` CLI and LibreOffice + Poppler for the fidelity render. Fonts: Helvetica Neue (macOS system face).
2. Slide rasters and geometry: `python3 scripts/prepare-one-sentence.py` (216 dpi rasters of the LibreOffice PDFs; element frames from each deck's `scene.json`).
3. Narration: `uv run --with edge-tts python scripts/make-one-sentence-voice.py en-US-AvaNeural +6%` (needs network). Re-check `timeline.ts` clip placement afterwards; the overlap check is in the review notes.
4. Beat grid: `uv run --with librosa --with scipy --python 3.11 python scripts/analyze-one-sentence-music.py`.
5. QA contact sheets: `scripts/qa-one-sentence-sheet.sh <video> <prefix> [step] [from] [to]`.

## Fonts

Video type is Avenir Next; slide renders use the decks' own faces (Helvetica Neue, Futura/Gill Sans, Charter, Avenir Next). On a machine without Avenir Next, Chrome substitutes and line breaks in the request bar and captions may move; check `out/one-sentence/qa` frames after rendering elsewhere.
