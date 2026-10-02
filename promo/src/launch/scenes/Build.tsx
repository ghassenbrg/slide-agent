import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SlideView} from '../components/SlideView';
import {StageTitle} from '../components/ui';
import type {El, Frame, Slide} from '../deck';
import {contrast, slideById, SLIDE_W_IN} from '../deck';
import {accentWord, C, clamp, ease, mono, shadow} from '../theme';

// 0:30.5–0:40.5 — the engine builds three slides of the real deck. Every
// element lands at the frame the engine computed (scene.json), in reading
// order, and every line in the log is something the engine actually computed
// or reported for this deck (out/run.json and the verdict).

const CANVAS_X = 110;
const CANVAS_Y = 300;
const CANVAS_W = 1140;
const PPI = CANVAS_W / SLIDE_W_IN;

type Beat = {
	slide: string;
	from: number;
	to: number;
	measure: {id: string; at: number; label: string; below?: boolean};
	log: {at: number; text: string; tone?: 'good' | 'note'}[];
};

const titleContrast = contrast('0B1B33', 'F5F7FB').toFixed(1);

const BEATS: Beat[] = [
	{
		slide: 'cover',
		from: 0,
		to: 100,
		measure: {id: 'cover/text3', at: 30, label: 'Plus Jakarta Sans 800 · 56 pt · 2 lines · fits', below: true},
		log: [
			{at: 6, text: 'grid 12×8 · margin 44 · gutter 16'},
			{at: 32, text: 'title measured from the font file · fits'},
			{at: 50, text: 'native chart · data embedded'},
			{at: 66, text: `contrast  navy on canvas ${titleContrast}:1`},
		],
	},
	{
		slide: 'reliability',
		from: 100,
		to: 200,
		measure: {id: 'reliability/text14', at: 22, label: 'h3 21.5 → 17 pt to fit its region'},
		log: [
			{at: 20, text: 'type step  4 quarter labels 21.5 → 17 pt', tone: 'note'},
			{at: 40, text: 'timeline · 4 milestones · 16 items'},
			{at: 62, text: 'icons drawn as native shapes'},
		],
	},
	{
		slide: 'roadmap',
		from: 200,
		to: 300,
		measure: {id: 'roadmap/shape25', at: 66, label: 'native shape · editable'},
		log: [
			{at: 14, text: '6 lanes × 3 quarters · 13×7 grid'},
			{at: 44, text: 'bars placed on quarter columns'},
			{at: 70, text: 'icon contrast ≥ 3:1 · pass'},
		],
	},
];

// Reading order: top to bottom, then left to right. Full-slide washes come
// first; everything else is staggered across the beat.
const schedule = (slide: Slide): Map<string, number> => {
	const order = [...slide.elements]
		.filter((e) => !(e.frame.w > 12 && e.frame.h > 7))
		.sort((a, b) => Math.round(a.frame.y * 4) - Math.round(b.frame.y * 4) || a.frame.x - b.frame.x);
	const starts = new Map<string, number>();
	order.forEach((e, i) => starts.set(e.id, 10 + (i / Math.max(1, order.length - 1)) * 54));
	return starts;
};

const isBar = (el: El) => el.kind === 'shape' && el.frame.w > el.frame.h * 4 && el.frame.h < 0.6;

const Measure: React.FC<{frame: Frame; label: string; p: number; out: number; below?: boolean}> = ({frame, label, p, out, below}) => {
	const x = CANVAS_X + frame.x * PPI;
	const y = CANVAS_Y + frame.y * PPI;
	const w = frame.w * PPI;
	const h = frame.h * PPI;
	const e = ease.out(p);
	return (
		<div style={{position: 'absolute', left: x - 8, top: y - 8, width: w + 16, height: h + 16, opacity: e * (1 - out)}}>
			<div style={{position: 'absolute', inset: 0, border: `2px solid ${C.blue}`, borderRadius: 4, clipPath: `inset(0 ${(1 - e) * 100}% 0 0)`}} />
			{[
				[0, 0],
				[1, 0],
				[0, 1],
				[1, 1],
			].map(([cx, cy]) => (
				<div key={`${cx}${cy}`} style={{position: 'absolute', left: cx ? undefined : -5, right: cx ? -5 : undefined, top: cy ? undefined : -5, bottom: cy ? -5 : undefined, width: 10, height: 10, background: '#fff', border: `2px solid ${C.blue}`}} />
			))}
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: below ? h + 28 : -46,
					padding: '6px 12px',
					borderRadius: 8,
					background: C.blue,
					color: '#fff',
					fontFamily: mono,
					fontSize: 19,
					fontWeight: 500,
					whiteSpace: 'nowrap',
					translate: `0px ${(1 - e) * 8}px`,
				}}
			>
				{label}
			</div>
		</div>
	);
};

const GridOverlay: React.FC<{o: number}> = ({o}) => {
	// The deck's own grid: 12 × 8 inside 44 pt margins with 16 pt gutters.
	const m = (44 / 72) * PPI;
	const g = (16 / 72) * PPI;
	const W = CANVAS_W;
	const H = (7.5 / 13.333333) * W;
	const cw = (W - 2 * m - 11 * g) / 12;
	const rh = (H - 2 * m - 7 * g) / 8;
	return (
		<div style={{position: 'absolute', left: CANVAS_X, top: CANVAS_Y, width: W, height: H, opacity: o, pointerEvents: 'none'}}>
			{Array.from({length: 12}, (_, i) => (
				<div key={`c${i}`} style={{position: 'absolute', left: m + i * (cw + g), top: 0, width: cw, height: H, background: 'rgba(47,91,255,0.06)', borderLeft: '1px solid rgba(47,91,255,0.2)', borderRight: '1px solid rgba(47,91,255,0.2)'}} />
			))}
			{Array.from({length: 8}, (_, i) => (
				<div key={`r${i}`} style={{position: 'absolute', left: 0, top: m + i * (rh + g), width: W, height: rh, borderTop: '1px solid rgba(47,91,255,0.16)', borderBottom: '1px solid rgba(47,91,255,0.16)'}} />
			))}
		</div>
	);
};

export const Build: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const H = (7.5 / 13.333333) * CANVAS_W;
	const canvasIn = interpolate(f, [0, 14], [0, 1], {...clamp, easing: ease.out});
	const exit = interpolate(f, [288, 300], [0, 1], {...clamp, easing: ease.in});

	const logLines = BEATS.flatMap((b) => [
		{at: b.from + 2, text: `${String(slideById(b.slide).index + 1).padStart(2, '0')} · ${b.slide}`, head: true, tone: undefined as undefined | 'good' | 'note'},
		...b.log.map((l) => ({at: b.from + l.at, text: l.text, head: false, tone: l.tone})),
	]);

	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			<StageTitle n="03" label="BUILD" at={0} top={70}>
				Grid, type, contrast, icons. <span style={accentWord()}>Computed, not guessed.</span>
			</StageTitle>

			{/* the canvas */}
			<div
				style={{
					position: 'absolute',
					left: CANVAS_X,
					top: CANVAS_Y,
					width: CANVAS_W,
					height: H,
					borderRadius: 10,
					background: '#F5F7F9',
					boxShadow: shadow.lift,
					opacity: canvasIn,
					translate: `0px ${(1 - canvasIn) * 40}px`,
					overflow: 'hidden',
				}}
			>
				{BEATS.map((b) => {
					if (f < b.from - 2 || f > b.to + 6) return null;
					const local = f - b.from;
					const slide = slideById(b.slide);
					const starts = schedule(slide);
					const enter = interpolate(local, [0, 10], [0, 1], {...clamp, easing: ease.out});
					const leave = b.to === 300 ? 0 : interpolate(local, [b.to - b.from - 8, b.to - b.from + 4], [0, 1], {...clamp, easing: ease.in});
					const reveal = (el: El) => {
						const s = starts.get(el.id);
						if (s === undefined) return interpolate(local, [2, 14], [0, 1], clamp);
						return interpolate(local, [s, s + (isBar(el) ? 22 : 14)], [0, 1], clamp);
					};
					return (
						<div key={b.slide} style={{position: 'absolute', inset: 0, opacity: enter * (1 - leave), translate: `${(1 - enter) * 60 - leave * 60}px 0px`}}>
							<SlideView slide={slide} width={CANVAS_W} reveal={reveal} />
						</div>
					);
				})}
			</div>

			{BEATS.map((b) => {
				const local = f - b.from;
				return <GridOverlay key={b.slide} o={interpolate(local, [0, 8, 50, 70], [0, 1, 1, 0], clamp) * (f < b.to ? 1 : 0)} />;
			})}

			{BEATS.map((b) => {
				const el = slideById(b.slide).elements.find((e) => e.id === b.measure.id);
				if (!el) throw new Error(`no element ${b.measure.id}`);
				const local = f - b.from;
				return <Measure key={b.slide} frame={el.frame} label={b.measure.label} below={b.measure.below} p={interpolate(local, [b.measure.at, b.measure.at + 12], [0, 1], clamp)} out={interpolate(local, [b.to - b.from - 22, b.to - b.from - 10], [0, 1], clamp)} />;
			})}

			{/* the engine's log */}
			<div
				style={{
					position: 'absolute',
					left: 1290,
					top: CANVAS_Y,
					width: 520,
					height: H,
					borderRadius: 16,
					background: '#0B1230',
					boxShadow: shadow.lift,
					padding: '22px 26px',
					opacity: canvasIn,
					translate: `0px ${(1 - canvasIn) * 40}px`,
					overflow: 'hidden',
				}}
			>
				<div style={{display: 'flex', alignItems: 'center', gap: 12, fontFamily: mono, fontSize: 19, color: '#8C9BD0', paddingBottom: 14, borderBottom: '1px solid rgba(140,170,255,0.18)'}}>
					<Img src={staticFile('icon.png')} style={{width: 28, height: 28}} />
					slide-agent build
				</div>
				<div style={{marginTop: 12}}>
					{logLines.map((l, i) => {
						const t = interpolate(f, [l.at, l.at + 8], [0, 1], {...clamp, easing: ease.out});
						if (t <= 0) return null;
						return (
							<div
								key={i}
								style={{
									display: 'flex',
									gap: 12,
									fontFamily: mono,
									fontSize: l.head ? 17 : 19,
									lineHeight: 1.3,
									marginTop: l.head ? (i === 0 ? 4 : 18) : 9,
									color: l.head ? '#5E6C9E' : l.tone === 'note' ? C.amber : '#E3E8FA',
									letterSpacing: l.head ? '0.12em' : 0,
									textTransform: l.head ? 'uppercase' : undefined,
									opacity: t,
									translate: `${(1 - t) * 16}px 0px`,
								}}
							>
								{l.head ? null : <span style={{color: l.tone === 'note' ? C.amber : '#3BE38B'}}>{l.tone === 'note' ? '↻' : '✓'}</span>}
								<span>{l.text}</span>
							</div>
						);
					})}
				</div>
			</div>

			{BEATS.flatMap((b) => [10, 24, 38, 52, 64].map((s) => <Audio key={`${b.slide}-${s}`} name={`Land ${b.slide} ${s}`} from={b.from + s} src={staticFile('launch/audio/land.wav')} volume={0.26} premountFor={fps} />))}
			<Audio name="To reliability" from={96} src={staticFile('launch/audio/whoosh.wav')} volume={0.2} premountFor={fps} />
			<Audio name="To roadmap" from={196} src={staticFile('launch/audio/whoosh.wav')} volume={0.2} premountFor={fps} />
		</AbsoluteFill>
	);
};
