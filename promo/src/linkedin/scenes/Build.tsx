import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SlideView} from '../../launch/components/SlideView';
import type {El, Frame, Slide} from '../../launch/deck';
import {contrast, slideById, SLIDE_W_IN} from '../../launch/deck';
import {accentWord, C, clamp, ease, mono, shadow} from '../../launch/theme';
import {CONTENT_W, Headline, M, PICTURE_Y} from '../kit';

// 3 · Build — two slides of the sample deck land at the frames the engine
// computed (scene.json), in reading order. The log lines are what the engine
// computed or reported for this deck (out/run.json).

const CANVAS_W = CONTENT_W;
const CANVAS_H = (7.5 / 13.333333) * CANVAS_W;
const PPI = CANVAS_W / SLIDE_W_IN;
const LOG_Y = PICTURE_Y + CANVAS_H + 28;

type Beat = {slide: string; from: number; to: number; measure: {id: string; at: number; label: string; below?: boolean}; log: {at: number; text: string; note?: boolean}[]};

const titleContrast = contrast('0B1B33', 'F5F7FB').toFixed(1);
const routerContrast = contrast('FFFFFF', '4F46E5').toFixed(1);

const BEATS: Beat[] = [
	{
		slide: 'cover',
		from: 0,
		to: 110,
		measure: {id: 'cover/text3', at: 30, label: '56 pt · 2 lines · fits', below: true},
		log: [
			{at: 6, text: 'grid 12×8 · margin 44 · gutter 16'},
			{at: 30, text: 'title measured from the font file · fits'},
			{at: 52, text: 'native chart · data embedded'},
			{at: 70, text: `contrast  navy on canvas ${titleContrast}:1`},
		],
	},
	{
		slide: 'architecture',
		from: 110,
		to: 225,
		measure: {id: 'architecture/diagram6-node-router', at: 60, label: `white on indigo ${routerContrast}:1 · pass`},
		log: [
			{at: 10, text: 'flow diagram · 5 nodes · 4 edges'},
			{at: 36, text: 'connectors routed between nodes'},
			{at: 60, text: 'type step  2 notes 17 → 15 pt to fit'},
		],
	},
];

const schedule = (slide: Slide): Map<string, number> => {
	const order = [...slide.elements]
		.filter((e) => !(e.frame.w > 12 && e.frame.h > 7))
		.sort((a, b) => Math.round(a.frame.y * 4) - Math.round(b.frame.y * 4) || a.frame.x - b.frame.x);
	const starts = new Map<string, number>();
	order.forEach((e, i) => starts.set(e.id, 10 + (i / Math.max(1, order.length - 1)) * 56));
	return starts;
};
const isBar = (el: El) => el.kind === 'shape' && el.frame.w > el.frame.h * 4 && el.frame.h < 0.6;

const Measure: React.FC<{frame: Frame; label: string; p: number; out: number; below?: boolean}> = ({frame, label, p, out, below}) => {
	const e = ease.out(p);
	const x = M + frame.x * PPI;
	const y = PICTURE_Y + frame.y * PPI;
	const w = frame.w * PPI;
	const h = frame.h * PPI;
	return (
		<div style={{position: 'absolute', left: x - 6, top: y - 6, width: w + 12, height: h + 12, opacity: e * (1 - out)}}>
			<div style={{position: 'absolute', inset: 0, border: `2.5px solid ${C.blue}`, borderRadius: 4, clipPath: `inset(0 ${(1 - e) * 100}% 0 0)`}} />
			<div style={{position: 'absolute', left: 0, top: below ? h + 22 : -50, padding: '7px 14px', borderRadius: 9, background: C.blue, color: '#fff', fontFamily: mono, fontSize: 22, fontWeight: 500, whiteSpace: 'nowrap'}}>{label}</div>
		</div>
	);
};

const GridOverlay: React.FC<{o: number}> = ({o}) => {
	const m = (44 / 72) * PPI;
	const g = (16 / 72) * PPI;
	const cw = (CANVAS_W - 2 * m - 11 * g) / 12;
	return (
		<div style={{position: 'absolute', left: M, top: PICTURE_Y, width: CANVAS_W, height: CANVAS_H, opacity: o, pointerEvents: 'none'}}>
			{Array.from({length: 12}, (_, i) => (
				<div key={i} style={{position: 'absolute', left: m + i * (cw + g), top: 0, width: cw, height: CANVAS_H, background: 'rgba(47,91,255,0.06)', borderLeft: '1px solid rgba(47,91,255,0.2)', borderRight: '1px solid rgba(47,91,255,0.2)'}} />
			))}
		</div>
	);
};

export const Build: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const canvasIn = interpolate(f, [0, 12], [0, 1], {...clamp, easing: ease.out});
	const exit = interpolate(f, [214, 225], [0, 1], {...clamp, easing: ease.in});
	const lines = BEATS.flatMap((b) => [
		{at: b.from + 2, text: `${String(slideById(b.slide).index + 1).padStart(2, '0')} · ${b.slide}`, head: true, note: false},
		...b.log.map((l) => ({at: b.from + l.at, text: l.text, head: false, note: Boolean(l.note)})),
	]);
	// Only the current slide's lines are shown, so the log never overflows.
	const current = BEATS.find((b) => f >= b.from && f < b.to) ?? BEATS[BEATS.length - 1];

	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			<Headline label="3 — BUILD">
				Grid, type, contrast. <span style={accentWord()}>Computed, not guessed.</span>
			</Headline>

			<div style={{position: 'absolute', left: M, top: PICTURE_Y, width: CANVAS_W, height: CANVAS_H, borderRadius: 12, background: '#F5F7F9', boxShadow: shadow.lift, overflow: 'hidden', opacity: canvasIn, translate: `0px ${(1 - canvasIn) * 40}px`}}>
				{BEATS.map((b) => {
					if (f < b.from - 2 || f > b.to + 6) return null;
					const local = f - b.from;
					const slide = slideById(b.slide);
					const starts = schedule(slide);
					const enter = interpolate(local, [0, 10], [0, 1], {...clamp, easing: ease.out});
					const leave = b.to === 225 ? 0 : interpolate(local, [b.to - b.from - 8, b.to - b.from + 4], [0, 1], {...clamp, easing: ease.in});
					const reveal = (el: El) => {
						const s = starts.get(el.id);
						if (s === undefined) return interpolate(local, [2, 14], [0, 1], clamp);
						return interpolate(local, [s, s + (isBar(el) ? 22 : 14)], [0, 1], clamp);
					};
					return (
						<div key={b.slide} style={{position: 'absolute', inset: 0, opacity: enter * (1 - leave), translate: `${(1 - enter) * 50 - leave * 50}px 0px`}}>
							<SlideView slide={slide} width={CANVAS_W} reveal={reveal} />
						</div>
					);
				})}
			</div>
			{BEATS.map((b) => (
				<GridOverlay key={b.slide} o={interpolate(f - b.from, [0, 8, 50, 70], [0, 1, 1, 0], clamp) * (f < b.to ? 1 : 0)} />
			))}
			{BEATS.map((b) => {
				const el = slideById(b.slide).elements.find((e) => e.id === b.measure.id);
				if (!el) throw new Error(`no element ${b.measure.id}`);
				const local = f - b.from;
				return <Measure key={b.slide} frame={el.frame} label={b.measure.label} below={b.measure.below} p={interpolate(local, [b.measure.at, b.measure.at + 12], [0, 1], clamp)} out={interpolate(local, [b.to - b.from - 22, b.to - b.from - 10], [0, 1], clamp)} />;
			})}

			{/* the engine's log */}
			<div style={{position: 'absolute', left: M, top: LOG_Y, width: CANVAS_W, height: 1290 - LOG_Y, borderRadius: 18, background: '#0B1230', boxShadow: shadow.lift, padding: '22px 28px', opacity: canvasIn, overflow: 'hidden'}}>
				<div style={{display: 'flex', alignItems: 'center', gap: 12, fontFamily: mono, fontSize: 21, color: '#8C9BD0', paddingBottom: 12, borderBottom: '1px solid rgba(140,170,255,0.18)'}}>
					<Img src={staticFile('icon.png')} style={{width: 30, height: 30}} />
					slide-agent build
				</div>
				{lines
					.filter((l) => l.at >= current.from && l.at < current.to)
					.map((l, i) => {
						const t = interpolate(f, [l.at, l.at + 8], [0, 1], {...clamp, easing: ease.out});
						if (t <= 0) return null;
						return (
							<div key={`${current.slide}-${i}`} style={{display: 'flex', gap: 14, fontFamily: mono, fontSize: l.head ? 19 : 24, lineHeight: 1.3, marginTop: l.head ? 14 : 10, color: l.head ? '#5E6C9E' : '#E3E8FA', letterSpacing: l.head ? '0.12em' : 0, textTransform: l.head ? 'uppercase' : undefined, opacity: t, translate: `${(1 - t) * 16}px 0px`}}>
								{l.head ? null : <span style={{color: '#3BE38B'}}>✓</span>}
								<span>{l.text}</span>
							</div>
						);
					})}
			</div>

			{BEATS.flatMap((b) => [12, 26, 40, 54, 66].map((s) => <Audio key={`${b.slide}-${s}`} name={`Land ${b.slide} ${s}`} from={b.from + s} src={staticFile('launch/audio/land.wav')} volume={0.26} premountFor={fps} />))}
			<Audio name="To architecture" from={106} src={staticFile('launch/audio/whoosh.wav')} volume={0.2} premountFor={fps} />
		</AbsoluteFill>
	);
};
