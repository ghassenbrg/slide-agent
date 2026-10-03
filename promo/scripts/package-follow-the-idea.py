"""Produce captions, timed narration, source bundle and delivery records."""
import json, math, pathlib, shutil, subprocess, zipfile, hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'out/follow-the-idea'
SCENES=json.loads((ROOT/'follow-the-idea/voiceover.json').read_text())
WORDS=json.loads((ROOT/'src/follow-the-idea/captions.json').read_text())
pages=[];sentence=[]
def flush():
 global sentence
 if not sentence:return
 count=math.ceil(sum(len(w['text']) for w in sentence)/39)
 for i in range(count):
  n=math.ceil(len(sentence)/(count-i))
  if i<count-1 and n>1 and sentence[n-1]['text'].strip().lower() in ['and','or']:n-=1
  pages.append(sentence[:n]);sentence=sentence[n:]
for w in WORDS:
 if sentence and w['startMs']-sentence[-1]['endMs']>450:flush()
 sentence.append(w)
 if w['text'][-1] in '.!?':flush()
flush()
def stamp(ms):
 ms=int(ms);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
srt='\n'.join(f"{i+1}\n{stamp(p[0]['startMs'])} --> {stamp(p[-1]['endMs']+110)}\n{''.join(w['text'] for w in p).strip()}\n" for i,p in enumerate(pages))
(OUT/'captions.srt').write_text(srt)
(OUT/'captions.json').write_text(json.dumps(WORDS,indent=2))
(OUT/'voiceover-script.md').write_text('# Slide Agent — Follow the idea\n\nProfessional English narration. Synthetic voice: Andrew Neural. 52-second film.\n\n'+'\n\n'.join(f"**{s['start']:02}–{s['end']:02}s · {s['id']}**\n\n{s['text']}" for s in SCENES)+'\n')
# Narration-only WAV uses identical scene starts and frozen rendered audio assets.
args=['ffmpeg','-v','error','-y'];chains=[]
for i,s in enumerate(SCENES):
 args+=['-i',str(ROOT/'public/follow-the-idea/audio'/f"{s['id']}.wav")]
 delay=s['start']*1000;chains.append(f'[{i}:a]adelay={delay}|{delay}[v{i}]')
chains.append(''.join(f'[v{i}]' for i in range(len(SCENES)))+'amix=inputs=8:normalize=0,apad,atrim=duration=52[out]')
args+=['-filter_complex',';'.join(chains),'-map','[out]','-ar','48000','-c:a','pcm_s16le',str(OUT/'voiceover.wav')]
subprocess.run(args,check=True)
# Portable editable project. Existing productions are not bundled.
source=OUT/'source';source.mkdir(exist_ok=True)
for dirname in ['src/follow-the-idea','public/follow-the-idea']:
 shutil.copytree(ROOT/dirname,source/dirname,dirs_exist_ok=True)
for filename in ['package.json','package-lock.json','tsconfig.json','remotion.config.ts','eslint.config.mjs']:
 shutil.copy2(ROOT/filename,source/filename)
(source/'scripts').mkdir(exist_ok=True);(source/'follow-the-idea').mkdir(exist_ok=True)
for filename in ['dsp.mjs','make-follow-the-idea-score.mjs','make-follow-the-idea-voice.py','qa-follow-the-idea.mjs']:
 shutil.copy2(ROOT/'scripts'/filename,source/'scripts'/filename)
for filename in ['CONCEPT.md','voiceover.json','audio-evidence.json']:
 shutil.copy2(ROOT/'follow-the-idea'/filename,source/'follow-the-idea'/filename)
shutil.copy2(ROOT/'src/workbench.ts',source/'src/workbench.ts')
readme='''# Slide Agent — Follow the idea

52 seconds · 1080 × 1350 · 30 fps · H.264 / AAC. Independently authored Remotion composition. Previous videos are preserved in the parent repository.

## Preview and render

Use Node.js 22+ in this directory. Frozen voice files and all actual deck pixels are included; no speech-service access is needed to render.

```sh
npm ci
npx remotion studio src/follow-the-idea/index.ts
npx remotion render src/follow-the-idea/index.ts FollowTheIdea out/film.mp4 --codec=h264 --crf=17 --concurrency=4 --jpeg-quality=100
npx remotion render src/follow-the-idea/index.ts FollowTheIdea out/film-no-music.mp4 --props='{"bgm":false}' --codec=h264 --crf=17 --concurrency=4 --jpeg-quality=100
npx remotion still src/follow-the-idea/index.ts FollowTheIdeaCover out/cover.png
```

The scene files, timeline, captions, camera paths, wording and audio levels are editable. Scene compositions are registered individually. `Film.tsx` is the authored video timeline; the matching timeline constants feed the optional motion workbench. `bgm:false` retains narration and motion cues. The music was written for this production; reusable DSP functions were used only as sound-building utilities.

## Regeneration and provenance

`node scripts/make-follow-the-idea-score.mjs` regenerates the deterministic original score and motion cues. Narration is frozen in 48 kHz WAV and original MP3. To regenerate narration: install Python `edge-tts`, run `scripts/make-follow-the-idea-voice.py`, then normalize each resulting MP3 to WAV with `ffmpeg -i input.mp3 -af loudnorm=I=-16:TP=-2:LRA=9 -ar 48000 output.wav`. Word timestamps come directly from the speech provider; captions preserve script punctuation. Review generated timing before re-rendering.

Actual Slide Agent showcase slides and native PowerPoint files are under `public/follow-the-idea/decks/`. Architecture, Atlas and Growth to Retention are illustrative demonstrations, not customer outcomes. The workflow exchange is a labeled, condensed recreation based on the documented agent tools. The request is representative of the existing architecture deck; it is not a recorded timing benchmark. Motion is promotional choreography made in Remotion, not an animation feature promised for PowerPoint.

The film uses Arial and Georgia available in the tested macOS environment. On another OS ensure equivalent fonts and review text wrapping. All presentation typography is frozen in the real rendered slide assets. Detailed diagrams intentionally alternate between readable close-ups and overview views; fine print is not intended to be read from an overview on a phone.

The live official site and current repo docs were checked. No perfect-result, universal-compatibility or generation-speed promise is made.
'''
(OUT/'RENDERING.md').write_text(readme)
(source/'README.md').write_text(readme)
# Produce a self-contained source ZIP with frozen media and documentation.
with zipfile.ZipFile(OUT/'remotion-source.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(source.rglob('*')):
  if p.is_file():z.write(p,pathlib.Path('slide-agent-follow-the-idea')/p.relative_to(source))
print('Packaged source, script, captions and narration')
