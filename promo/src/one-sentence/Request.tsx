import React from 'react';
import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {Note} from './kit';
import {C, FONT, clamp, inOut, lerp, tween} from './theme';
import {K, SHOTS} from './timeline';

// The carried element: one request sentence. It is typed in the opening, becomes the
// user's message in the agent session, docks above the deck, and later re-types its
// noun so each change of words produces a different real deck.

export const FERN: [string, string] = ['Create a launch plan for our new app:', 'timeline, budget and risks.'];
export const EXAMPLES: [string, string][] = [
	['Create an architecture review', 'of our AI platform.'],
	['Create a three-year roadmap', 'for becoming AI-native.'],
	['Create a data story about', 'growth and retention.'],
];
export const KEYWORDS = ['timeline', 'budget', 'risks'] as const;

// ── text measurement (canvas, deterministic for an installed system face) ──
let ctx: CanvasRenderingContext2D | null = null;
export const textW = (s: string, size: number, weight = 600) => {
	if (!ctx) ctx = document.createElement('canvas').getContext('2d');
	ctx!.font = `${weight} ${size}px "Avenir Next"`;
	return ctx!.measureText(s).width;
};

// Composer geometry in each state.
type St = {x: number; y: number; w: number; fs: number; lh: number; padX: number; padY: number; bg: number; blue: number; dark: number; radius: number; header: number};
const COMPOSER: St = {x: 60, y: 92, w: 960, fs: 44, lh: 58, padX: 36, padY: 26, bg: 0.07, blue: 0, dark: 0, radius: 32, header: 1};
const BUBBLE: St = {x: 170, y: 318, w: 820, fs: 36, lh: 48, padX: 34, padY: 24, bg: 0, blue: 1, dark: 0, radius: 30, header: 0};
const CHIP: St = {x: 60, y: 40, w: 960, fs: 32, lh: 42, padX: 30, padY: 18, bg: 0, blue: 0, dark: 1, radius: 26, header: 0};
const mix = (a: St, b: St, t: number): St => Object.fromEntries(Object.keys(a).map((k) => [k, lerp(a[k as keyof St], b[k as keyof St], t)])) as St;

const stateAt = (f: number): St => {
	const toBubble = tween(f, SHOTS.workflow.from - 4, 22, inOut);
	const toChip = tween(f, SHOTS.depth.from, 22, inOut);
	if (toChip > 0) return mix(BUBBLE, CHIP, toChip);
	return mix(COMPOSER, BUBBLE, toBubble);
};

/** Screen box of a keyword in line 2 of the Fern request while in the composer state. */
export const keywordBox = (word: (typeof KEYWORDS)[number]) => {
	const s = COMPOSER;
	const line = FERN[1];
	const i = line.indexOf(word);
	const x = s.x + s.padX + textW(line.slice(0, i), s.fs);
	const y = s.y + s.padY + 52 + s.lh; // header row is 52px tall
	return {x, y, w: textW(word, s.fs), h: s.lh};
};

/** Text shown at frame f: types, then later re-types to the example requests. */
const textAt = (f: number): {lines: [string, string]; caret: boolean} => {
	const full = FERN.join('\n');
	if (f < SHOTS.range.from) {
		const n = Math.floor(interpolate(f, [K.typeStart, K.typeEnd], [0, full.length], clamp));
		const t = full.slice(0, n).split('\n');
		return {lines: [t[0] ?? '', t[1] ?? ''], caret: f < K.send + 2};
	}
	// retype: delete back to "Create a", then type the new request
	const starts = [K.arch, K.road, K.data];
	let idx = 0;
	for (let i = 0; i < starts.length; i++) if (f >= starts[i] - 16) idx = i;
	const prev = (idx === 0 ? FERN : EXAMPLES[idx - 1]).join('\n');
	const next = EXAMPLES[idx].join('\n');
	const s0 = starts[idx] - 16;
	let common = 0;
	while (common < Math.min(prev.length, next.length) && prev[common] === next[common]) common++;
	const del = prev.length - common;
	const add = next.length - common;
	const dF = 7, aF = 16;
	let s: string;
	if (f < s0) s = prev;
	else if (f < s0 + dF) s = prev.slice(0, prev.length - Math.round((del * (f - s0)) / dF));
	else s = next.slice(0, common + Math.round(Math.min(1, (f - s0 - dF) / aF) * add));
	const t = s.split('\n');
	return {lines: [t[0] ?? '', t[1] ?? ''], caret: f < s0 + dF + aF + 6};
};

const Highlighted: React.FC<{line: string; on: number[]; fs: number}> = ({line, on, fs}) => {
	// Highlight the three keywords with a teal underlay whose strength follows `on`.
	const parts: React.ReactNode[] = [];
	let rest = line;
	let key = 0;
	KEYWORDS.forEach((k, i) => {
		const j = rest.indexOf(k);
		if (j < 0) return;
		parts.push(<span key={key++}>{rest.slice(0, j)}</span>);
		const a = on[i];
		parts.push(
			<span key={key++} style={{position: 'relative', color: a > 0.5 ? C.white : undefined}}>
				<span style={{position: 'absolute', left: -6, right: -6, top: fs * 0.08, bottom: fs * 0.02, borderRadius: 10, background: C.teal, opacity: 0.55 * a, transform: `scaleX(${0.6 + 0.4 * a})`}} />
				<span style={{position: 'relative'}}>{k}</span>
			</span>,
		);
		rest = rest.slice(j + k.length);
	});
	parts.push(<span key={key++}>{rest}</span>);
	return <>{parts}</>;
};

export const RequestBar: React.FC = () => {
	const f = useCurrentFrame();
	if (f >= SHOTS.deliver.from + 20) return null;
	const s = stateAt(f);
	const {lines, caret} = textAt(f);
	const fade = 1 - tween(f, SHOTS.deliver.from - 2, 20, inOut);
	const enter = 1;
	const sent = tween(f, K.send, 8);
	const press = f >= K.send && f < K.send + 6 ? 0.88 : 1;
	// keyword emphasis: in the opening after Send; in depth, follow the slide on screen
	const kw = [0, 1, 2].map((i) => {
		if (f < SHOTS.workflow.from) return tween(f, K.send + 4 + i * 4, 8);
		if (f < SHOTS.depth.from) return 0.35;
		const on = [K.tl, K.budget, K.risks][i];
		const offAt = [K.budget, K.risks, K.overview][i];
		return tween(f, on, 10) * (1 - tween(f, offAt, 10)) + (f >= K.overview && f < SHOTS.range.from ? tween(f, K.overview, 10) : 0);
	});
	const docked = tween(f, K.dock + 10, 10);
	const blink = caret && Math.floor(f / 8) % 2 === 0;
	const note = tween(f, SHOTS.depth.from + 16, 12);
	const noteText = f < SHOTS.range.from - 10 ? 'Built in this session · fictional example data' : 'Example requests · real Slide Agent decks · fictional data';
	const isFern = f < K.arch;
	return (
		<div style={{position: 'absolute', left: s.x, top: s.y + (1 - enter) * 24, width: s.w, opacity: enter * fade, fontFamily: FONT}}>
			<div
				style={{
					borderRadius: s.radius,
					padding: `${s.padY}px ${s.padX}px`,
					background: s.blue > 0.01 ? `rgba(47,91,255,${0.92 * s.blue})` : s.dark > 0.01 ? `rgba(11,24,64,${0.96 * s.dark})` : `rgba(255,255,255,${s.bg})`,
					border: `1.5px solid rgba(170,190,255,${0.28 * (1 - s.blue) + 0.1 * s.dark})`,
					boxShadow: `0 24px 60px rgba(0,0,0,${0.35 * (1 - s.blue * 0.5)})`,
					backdropFilter: 'blur(6px)',
				}}
			>
				{s.header > 0.02 && (
					<div style={{height: 52 * s.header, opacity: s.header, display: 'flex', alignItems: 'center', gap: 14, fontSize: 26, fontWeight: 600, color: C.mist, overflow: 'hidden'}}>
						<span style={{width: 12, height: 12, borderRadius: 12, background: C.teal}} />
						<span>Your AI agent</span>
						<span style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, opacity: docked, transform: `translateX(${(1 - docked) * 20}px)`, padding: '6px 16px 6px 8px', borderRadius: 30, background: 'rgba(47,91,255,0.22)', border: '1.5px solid rgba(123,151,255,0.5)', color: C.white}}>
							<Img src={staticFile('one-sentence/icon.png')} style={{width: 34, height: 34, borderRadius: 8}} />
							Slide Agent
							<span style={{color: C.teal, fontWeight: 700}}>✓</span>
						</span>
					</div>
				)}
				<div style={{fontSize: s.fs, lineHeight: `${s.lh}px`, fontWeight: 600, color: C.white, whiteSpace: 'pre', minHeight: s.lh * 2}}>
					<div>{lines[0]}{blink && !lines[1] ? <Caret h={s.lh} /> : null}</div>
					<div>
						{isFern ? <Highlighted line={lines[1]} on={kw} fs={s.fs} /> : lines[1]}
						{blink && lines[1] ? <Caret h={s.lh} /> : null}
					</div>
				</div>
				{f >= SHOTS.depth.from + 16 && (
					<div style={{height: 38 * note, opacity: note, overflow: 'hidden'}}>
						<Note style={{position: 'relative', marginTop: 8}}>{noteText}</Note>
					</div>
				)}
			</div>
			{/* Send button lives with the composer */}
			{s.header > 0.02 && (
				<div style={{position: 'absolute', right: 26, bottom: 24, width: 72, height: 72, borderRadius: 72, background: sent > 0 ? C.blue : 'rgba(255,255,255,0.14)', opacity: s.header, transform: `scale(${press})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.white, fontSize: 38, fontWeight: 700, boxShadow: sent > 0 ? `0 0 ${40 * (1 - sent) + 10}px rgba(47,91,255,0.7)` : 'none'}}>↑</div>
			)}
		</div>
	);
};

const Caret: React.FC<{h: number}> = ({h}) => <span style={{display: 'inline-block', width: 4, height: h * 0.72, marginLeft: 4, verticalAlign: 'middle', background: C.teal, borderRadius: 2}} />;

/** Navy band behind the docked request so slides never peek out above it. */
export const HeaderScrim: React.FC = () => {
	const f = useCurrentFrame();
	const a = tween(f, SHOTS.depth.from + 6, 16) * (1 - tween(f, SHOTS.deliver.from - 4, 16));
	if (a <= 0) return null;
	return <div style={{position: 'absolute', left: 0, top: 0, width: 1080, height: 300, opacity: a, background: 'linear-gradient(180deg, rgba(6,13,38,1) 0%, rgba(6,13,38,0.98) 52%, rgba(6,13,38,0) 100%)'}} />;
};
