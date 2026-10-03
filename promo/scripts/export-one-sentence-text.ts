// Exports captions (SRT + JSON) and the voiceover script from the film's single timeline.
// Run: npx tsx scripts/export-one-sentence-text.ts
import {mkdirSync, writeFileSync} from 'node:fs';
import {CAPTIONS} from '../src/one-sentence/captionTrack';
import {LINE_TEXT, SHOTS, VO, WORDS} from '../src/one-sentence/timeline';

const OUT = new URL('../out/one-sentence/', import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});
const ts = (f: number) => {
	const ms = Math.round((f / 30) * 1000);
	const p = (n: number, w = 2) => String(n).padStart(w, '0');
	return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const srt = CAPTIONS.map((c, i) => `${i + 1}\n${ts(c.from)} --> ${ts(c.to)}\n${c.text}\n`).join('\n');
writeFileSync(OUT + 'captions.srt', srt);
writeFileSync(OUT + 'captions.json', JSON.stringify(CAPTIONS.map((c) => ({text: c.text, startMs: Math.round((c.from / 30) * 1000), endMs: Math.round((c.to / 30) * 1000), burnedIn: c.burn})), null, 1));

const scene = (f: number) => (Object.entries(SHOTS).find(([, s]) => f >= s.from && f < s.from + s.duration) ?? ['close'])[0];
const lines = Object.keys(LINE_TEXT).map((id) => {
	const ws = WORDS.filter((w) => w.line === id);
	const at = (ws[0].start).toFixed(1);
	const end = (ws[ws.length - 1].end).toFixed(1);
	return `| ${at}–${end} s | ${scene(Math.round(((ws[0].start + ws[ws.length - 1].end) / 2) * 30))} | ${LINE_TEXT[id]} |`;
});
const md = `# Slide Agent — One Sentence · voiceover script

Voice: Microsoft Edge neural TTS, en-US-AvaNeural, rate +6%, loudness-normalised (−16 LUFS, −2 dBTP) per line.
${VO.length} clips; the depth and range sentences are cut at word boundaries so each phrase lands on its slide.
Total spoken time ≈ ${WORDS.reduce((a, w) => a + (w.end - w.start), 0).toFixed(1)} s of a ${(1650 / 30).toFixed(0)} s film.

| Time | Scene | Line |
|---|---|---|
${lines.join('\n')}

URL is spoken as "slide agent dot ghassen dot io" and written as slide-agent.ghassen.io.
`;
writeFileSync(OUT + 'voiceover-script.md', md);
console.log('wrote captions.srt, captions.json, voiceover-script.md');
