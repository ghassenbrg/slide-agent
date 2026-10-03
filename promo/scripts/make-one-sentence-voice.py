"""Narration for One Sentence: Microsoft Edge neural TTS with word boundaries.
Run: uv run --with edge-tts python scripts/make-one-sentence-voice.py [voice] [rate]"""
import asyncio, json, pathlib, subprocess, sys
import edge_tts

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/one-sentence/audio'
VOICE = sys.argv[1] if len(sys.argv) > 1 else 'en-US-AvaNeural'
RATE = sys.argv[2] if len(sys.argv) > 2 else '+0%'
LINES = json.loads((ROOT / 'one-sentence/voiceover.json').read_text())
# Spoken form of the URL; the captions keep the written form.
SPOKEN = {'slide-agent.ghassen.io.': 'slide agent dot ghassen dot io.'}


async def main():
    meta = []
    for line in LINES:
        text = line['text']
        for k, v in SPOKEN.items():
            text = text.replace(k, v)
        rate = line.get('rate', RATE)
        c = edge_tts.Communicate(text, VOICE, rate=rate, boundary='WordBoundary')
        audio, words = bytearray(), []
        async for part in c.stream():
            if part['type'] == 'audio':
                audio.extend(part['data'])
            elif part['type'] == 'WordBoundary':
                words.append({'text': part['text'], 'start': part['offset'] / 1e7, 'end': (part['offset'] + part['duration']) / 1e7})
        mp3 = OUT / f"{line['id']}.mp3"
        mp3.write_bytes(audio)
        wav = OUT / f"{line['id']}.wav"
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(mp3), '-af', 'loudnorm=I=-16:TP=-2:LRA=9', '-ar', '48000', '-ac', '1', str(wav)], check=True)
        dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(wav)]))
        meta.append({'id': line['id'], 'text': line['text'], 'spoken': text, 'voice': VOICE, 'rate': rate, 'duration': round(dur, 3), 'words': words})
        print(f"{line['id']:9s} {dur:5.2f}s  {len(words)} words")
    for p in (ROOT / 'one-sentence/voice-timing.json', ROOT / 'src/one-sentence/voice-timing.json'):
        p.write_text(json.dumps(meta, indent=1))

asyncio.run(main())
