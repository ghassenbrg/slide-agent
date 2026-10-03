import asyncio,json,pathlib,subprocess
import edge_tts
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public/ask-for-a-deck/audio'
SCENES=json.loads((ROOT/'ask-for-a-deck/voiceover.json').read_text())
async def main():
    captions,records=[],[]
    for s in SCENES:
        audio=bytearray(); boundaries=[]
        c=edge_tts.Communicate(s['text'],'en-US-AndrewNeural',rate='+8%',boundary='WordBoundary')
        async for p in c.stream():
            if p['type']=='audio':audio.extend(p['data'])
            elif p['type']=='WordBoundary':boundaries.append(p)
        mp3=OUT/(s['id']+'.mp3');mp3.write_bytes(audio)
        duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(mp3)]))
        if duration>s['end']-s['start']:raise RuntimeError(f"Narration exceeds its slot: {s['id']} {duration}")
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(mp3),'-af','loudnorm=I=-18:TP=-3:LRA=8','-ar','48000','-ac','2','-c:a','pcm_s16le','-y',str(OUT/(s['id']+'.wav'))],check=True)
        tokens=s['text'].split()
        if len(tokens)!=len(boundaries):raise RuntimeError(f"Boundary mismatch: {s['id']}")
        for b,t in zip(boundaries,tokens):
            start=s['start']*1000+b['offset']/10000;end=start+b['duration']/10000
            captions.append({'text':' '+t,'startMs':round(start),'endMs':round(end),'timestampMs':round((start+end)/2),'confidence':None})
        records.append({**s,'duration':duration,'voice':'en-US-AndrewNeural','rate':'+8%','provider':'Microsoft Edge neural TTS'})
        print(s['id'],round(duration,3),flush=True)
    (ROOT/'src/ask-for-a-deck/captions.json').write_text(json.dumps(captions,indent=2))
    (ROOT/'ask-for-a-deck/captions.json').write_text(json.dumps(captions,indent=2))
    (ROOT/'ask-for-a-deck/audio-evidence.json').write_text(json.dumps(records,indent=2))
asyncio.run(main())
