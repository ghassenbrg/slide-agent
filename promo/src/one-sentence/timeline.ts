// Single source of truth for timing. Music: "House Vibez" (Mixkit), 122.0 BPM,
// grid fitted by least squares (residual ≤ 19 ms): beat n at 0.0889 s + n × 0.49178 s.
// Downbeats fall on n ≡ 2 (mod 4). Film time equals track time (music starts at 0).
import voice from './voice-timing.json';

export const FPS = 30;
const T0 = 0.0889;
const BEAT = 0.49178;
export const beatS = (n: number) => T0 + n * BEAT;
export const beatF = (n: number) => Math.round(beatS(n) * FPS);
const sec = (s: number) => Math.round(s * FPS);

export const SHOTS = {
	opening: {from: 0, duration: beatF(14)},
	install: {from: beatF(14), duration: beatF(24) - beatF(14)},
	workflow: {from: beatF(24), duration: beatF(40) - beatF(24)},
	depth: {from: beatF(40), duration: beatF(60) - beatF(40)},
	range: {from: beatF(60), duration: beatF(84) - beatF(60)},
	deliver: {from: beatF(84), duration: beatF(94) - beatF(84)},
	close: {from: beatF(94), duration: 1650 - beatF(94)},
} as const;
export const TOTAL = 1650;
export type ShotId = keyof typeof SHOTS;

// Key visual moments (absolute frames) that narration and SFX are pinned to.
export const K = {
	typeStart: 4,
	typeEnd: 46,
	send: beatF(4), // click on Send
	firstLand: beatF(6), // first word lands; slide frame complete — hit 1
	brand: beatF(10), // Slide Agent lockup lands
	dock: beatF(23), // icon docks into the composer
	panel: beatF(24),
	deal: beatF(38), // five real slides dealt out of the reply — hit 2
	// depth
	tl: beatF(40) + 14, // timeline slide full
	tlZoom: beatF(44),
	budget: beatF(49),
	risks: beatF(54),
	overview: beatF(58),
	// range
	arch: beatF(60),
	road: beatF(68),
	data: beatF(76),
	deliver: beatF(84),
	close: beatF(94), // lockup — hit 3
};

type Line = {id: string; text: string; duration: number; words: {text: string; start: number; end: number}[]};
const LINES = Object.fromEntries((voice as Line[]).map((l) => [l.id, l]));

/** A narration clip: line id, cut [fromWord, toWord) of that line, placed at an absolute frame. */
export type Clip = {line: string; from: number; at: number; startS: number; endS: number};
const clip = (line: string, at: number, fromWord = 0, toWord?: number): Clip => {
	const w = LINES[line].words;
	const startS = fromWord === 0 ? 0 : (w[fromWord - 1].end + w[fromWord].start) / 2;
	const endS = toWord === undefined || toWord >= w.length ? LINES[line].duration : (w[toWord - 1].end + w[toWord].start) / 2;
	return {line, from: fromWord, at, startS, endS};
};

// depth: "One design system, slide after slide: | the timeline, | the budget, | and the risks."
// range: "Ask for an architecture review, | a strategy roadmap, | or a data story, | and the design changes with it."
export const VO: Clip[] = [
	clip('open', sec(0.3)),
	clip('install', sec(6.83)), // windows (incl. trailing silence) never overlap
	clip('workflow', sec(12.27)),
	clip('depth', K.tl - 4, 0, 6),
	clip('depth', K.tlZoom + 40, 6, 8),
	clip('depth', K.budget + 18, 8, 10),
	clip('depth', K.risks + 14, 10),
	clip('range', K.arch + 6, 0, 5),
	clip('range', K.road + 4, 5, 8),
	clip('range', K.data + 4, 8, 12),
	clip('range', K.data + 62, 12),
	clip('deliver', K.deliver + 8),
	clip('close', K.close + 7),
];

export const clipFrames = (c: Clip) => Math.ceil((c.endS - c.startS) * FPS);

/** Absolute time (s) of each spoken word, for captions and ducking. */
export const WORDS = VO.flatMap((c) => {
	const l = LINES[c.line];
	return l.words
		.map((w, i) => ({w, i}))
		.filter(({w}) => w.start >= c.startS - 1e-3 && w.end <= c.endS + 1e-3)
		.map(({w, i}) => ({line: c.line, index: i, start: c.at / FPS + (w.start - c.startS), end: c.at / FPS + (w.end - c.startS)}));
});

export const LINE_TEXT = Object.fromEntries((voice as Line[]).map((l) => [l.id, l.text]));
