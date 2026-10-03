import json,math,pathlib,shutil,subprocess,zipfile,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]; OUT=ROOT/'out/follow-the-idea-motion'; OUT.mkdir(exist_ok=True)
SCENES=json.loads((ROOT/'follow-the-idea-motion/voiceover.json').read_text());WORDS=json.loads((ROOT/'src/follow-the-idea-motion/captions.json').read_text())
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
(OUT/'captions.srt').write_text('\n'.join(f"{i+1}\n{stamp(p[0]['startMs'])} --> {stamp(p[-1]['endMs']+110)}\n{''.join(w['text'] for w in p).strip()}\n" for i,p in enumerate(pages)))
(OUT/'captions.json').write_text(json.dumps(WORDS,indent=2));(OUT/'voiceover-script.md').write_text('# Slide Agent — Ask. See. Shape. Present.\n\n52 seconds. Professional English. Synthetic Andrew Neural voice.\n\n'+'\n\n'.join(f"**{s['start']:02}–{s['end']:02}s · {s['id']}**\n\n{s['text']}" for s in SCENES)+'\n')
args=['ffmpeg','-v','error','-y'];chains=[]
for i,s in enumerate(SCENES):
 args+=['-i',str(ROOT/'public/follow-the-idea-motion/audio'/f"{s['id']}.wav")];delay=s['start']*1000;chains.append(f'[{i}:a]adelay={delay}|{delay}[v{i}]')
chains.append(''.join(f'[v{i}]' for i in range(8))+'amix=inputs=8:normalize=0,apad,atrim=duration=52[out]');args+=['-filter_complex',';'.join(chains),'-map','[out]','-ar','48000','-c:a','pcm_s16le',str(OUT/'voiceover.wav')];subprocess.run(args,check=True)
source=OUT/'source';source.mkdir(exist_ok=True)
for dirname in ['src/follow-the-idea-motion','public/follow-the-idea-motion']:
 shutil.copytree(ROOT/dirname,source/dirname,dirs_exist_ok=True)
# Shared frozen assets only, with no dependency on an older composition.
common=source/'public/follow-the-idea';common.mkdir(parents=True,exist_ok=True)
shutil.copytree(ROOT/'public/follow-the-idea/decks',common/'decks',dirs_exist_ok=True);shutil.copy2(ROOT/'public/follow-the-idea/icon.png',common/'icon.png');(common/'audio').mkdir(exist_ok=True);shutil.copy2(ROOT/'public/follow-the-idea/audio/music.wav',common/'audio/music.wav')
(source/'src/workbench.ts').write_text("export {WORKBENCH} from './follow-the-idea-motion/workbench';\n")
for filename in ['package.json','package-lock.json','tsconfig.json','remotion.config.ts','eslint.config.mjs']:shutil.copy2(ROOT/filename,source/filename)
pkg=json.loads((source/'package.json').read_text())
pkg['scripts']={'dev':'remotion studio src/follow-the-idea-motion/index.ts','build':'remotion bundle src/follow-the-idea-motion/index.ts','render':'remotion render src/follow-the-idea-motion/index.ts SlideAgentActions out/film.mp4 --codec=h264 --crf=17 --jpeg-quality=100','cover':'remotion still src/follow-the-idea-motion/index.ts SlideAgentActionsCover out/cover.png','typecheck':'tsc --noEmit'}
(source/'package.json').write_text(json.dumps(pkg,indent=2)+'\n')
(source/'scripts').mkdir(exist_ok=True)
for filename in ['dsp.mjs','make-follow-the-idea-motion-sfx.mjs','make-follow-the-idea-motion-voice.py','qa-follow-the-idea-motion.mjs','check-follow-the-idea-motion-audio.py','package-follow-the-idea-motion.py']:shutil.copy2(ROOT/'scripts'/filename,source/'scripts'/filename)
shutil.copytree(ROOT/'follow-the-idea-motion',source/'follow-the-idea-motion',dirs_exist_ok=True)
for f in ['CONCEPT.md','QUALITY-REVIEW.md','INDEPENDENT-REVIEW.md']:
 p=ROOT/'follow-the-idea-motion'/f if f=='CONCEPT.md' else OUT/f
 if p.exists():shutil.copy2(p,OUT/f) if p!=OUT/f else None;shutil.copy2(p,source/f)
readme='''# Slide Agent — Ask. See. Shape. Present.

52 seconds · 1080 × 1350 · 30 fps. Standalone action-focused composition; Atlas is the hero. Existing videos remain intact.

```sh
npm ci
npx remotion studio src/follow-the-idea-motion/index.ts
npx remotion render src/follow-the-idea-motion/index.ts SlideAgentActions out/film.mp4 --codec=h264 --crf=17 --concurrency=4 --image-format=jpeg --jpeg-quality=100
npx remotion render src/follow-the-idea-motion/index.ts SlideAgentActions out/film-no-music.mp4 --props='{"bgm":false}' --codec=h264 --crf=17 --concurrency=4 --image-format=jpeg --jpeg-quality=100
npx remotion still src/follow-the-idea-motion/index.ts SlideAgentActionsCover out/cover.png
```

Use Node.js 22+; tested with Node 24 and Remotion 4.0.532 on macOS. Frozen narration, captions, real deck assets and music are included. No API key is needed to render. Source is in `Scenes.tsx`, `kit.tsx`, `Film.tsx`, and `Captions.tsx`. The film and optional workbench use the same SHOTS timing; `src/workbench.ts` is the portable manifest. `bgm:false` retains voiceover and SFX.

All presentation screenshots are actual Slide Agent output. The Atlas edit is a real CLI edit and LibreOffice render, saved with its operations/results under `follow-the-idea-motion/evidence`. Workflow and setup are labeled condensed illustrative recreations of the supported agent interaction. They do not show real generation duration. Example project data is fictional. Video choreography does not promise animated PowerPoint output.

Narration is Microsoft Edge Andrew Neural, normalized to 48 kHz WAV with loudnorm I=-16:TP=-2:LRA=9. To regenerate, install Python edge-tts and ffmpeg, run `scripts/make-follow-the-idea-motion-voice.py`, normalize the MP3s to WAV, then review word timing before rendering. Procedural SFX are reproducible with `node scripts/make-follow-the-idea-motion-sfx.mjs`. The original music is a frozen asset reused from the earlier independently authored production, not either reference film.

Fonts are Arial. On another platform review wrapping after ensuring the font is available. Detailed full-slide views communicate design consistency; close-ups support reading. Subjective listening was not available in the automated review; objective waveform synchronization, loudness and clipping checks are recorded in QUALITY-REVIEW.md.
'''
(OUT/'RENDERING.md').write_text(readme);(source/'README.md').write_text(readme)
shutil.copy2(ROOT/'public/follow-the-idea-motion/atlas-edited.pptx',OUT/'Project-Atlas.pptx')
with zipfile.ZipFile(OUT/'remotion-source.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(source.rglob('*')):
  if p.is_file():z.write(p,pathlib.Path('slide-agent-actions')/p.relative_to(source))
print('Packaged complete editable source, captions, voiceover and real Atlas PPTX')
