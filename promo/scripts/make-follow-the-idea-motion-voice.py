"""Generate new neural narration and word boundaries; never reads credentials."""
import asyncio, json, pathlib, subprocess
import edge_tts

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/follow-the-idea-motion/audio'
OUT.mkdir(parents=True, exist_ok=True)
SCENES = json.loads((ROOT / 'follow-the-idea-motion/voiceover.json').read_text())

async def main():
    captions, records = [], []
    for s in SCENES:
        boundaries = []
        audio = bytearray()
        c = edge_tts.Communicate(s['text'], 'en-US-AndrewNeural', rate='+0%', boundary='WordBoundary')
        async for part in c.stream():
            if part['type'] == 'audio': audio.extend(part['data'])
            elif part['type'] == 'WordBoundary': boundaries.append(part)
        p = OUT / (s['id'] + '.mp3')
        p.write_bytes(audio)
        duration = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(p)]))
        if duration > s['end']-s['start']-.15: raise RuntimeError(f"Narration too long: {s['id']} {duration}")
        tokens=s['text'].split()
        if len(tokens)!=len(boundaries): raise RuntimeError(f"Caption token mismatch: {s['id']}")
        for b, token in zip(boundaries, tokens):
            start=s['start']*1000+b['offset']/10000
            end=start+b['duration']/10000
            captions.append({'text':' '+token,'startMs':round(start),'endMs':round(end),'timestampMs':round((start+end)/2),'confidence':None})
        records.append({**s,'duration':duration,'voice':'en-US-AndrewNeural','provider':'Microsoft Edge neural TTS','boundaries':len(boundaries)})
        print(s['id'], round(duration,3),flush=True)
    (ROOT/'src/follow-the-idea-motion/captions.json').write_text(json.dumps(captions,indent=2))
    (ROOT/'follow-the-idea-motion/audio-evidence.json').write_text(json.dumps(records,indent=2))
    (ROOT/'follow-the-idea-motion/captions.json').write_text(json.dumps(captions,indent=2))
asyncio.run(main())
