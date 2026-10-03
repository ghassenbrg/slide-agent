import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Cam, PX, SH, SW, SlideCard, camAt} from '../kit';
import {C, FONT, clamp, inOut, recede, tween} from '../theme';
import {K, SHOTS} from '../timeline';
import {FERN_SLIDES, STRIP} from './Workflow';

// One deck as a continuous strip; the camera travels it.
const GAP = STRIP.gap;
const X = (i: number) => i * (SW + GAP);
const cX = (i: number) => X(i) + SW / 2;
const FULL = 960 / SW;
const CLOSE = 0.62;

// Fern timeline slide (2): week columns, from the deck's own layout maths.
const wx = (w: number) => 2.55 + (w - 1) * (10.28 / 12);
const MARK_FROM = wx(1);
const MARK_TO = wx(11 + 3 / 7); // March 18
const markerAt = (f: number) => interpolate(f, [K.tlZoom + 6, K.tlZoom + 64], [MARK_FROM, MARK_TO], {...clamp, easing: inOut});

// Fern budget slide (3): measured bar rows in the LibreOffice render (inches).
const BARS = [2.624, 3.406, 4.193, 4.98, 5.766];

export const Depth: React.FC = () => {
	const f = useCurrentFrame() + SHOTS.depth.from;
	const mk = markerAt(f);
	const follow = Math.min(8.9, Math.max(4.4, mk));
	const cam = camAt(
		f,
		[
			[SHOTS.depth.from, cX(2), SH / 2, STRIP.s],
			[K.tl, cX(1), SH / 2, FULL],
			[K.tlZoom, cX(1), SH / 2, FULL],
			[K.tlZoom + 16, X(1) + 4.4 * PX, 3.95 * PX, CLOSE],
		],
		inOut,
	);
	let c = cam;
	if (f > K.tlZoom + 16 && f <= K.tlZoom + 68) c = {cx: X(1) + follow * PX, cy: 3.95 * PX, s: CLOSE};
	if (f > K.tlZoom + 68)
		c = camAt(
			f,
			[
				[K.tlZoom + 68, X(1) + 8.9 * PX, 3.95 * PX, CLOSE],
				[K.budget + 4, cX(2), SH / 2, FULL],
				[K.risks - 10, cX(2), SH / 2, FULL],
				[K.risks + 6, X(3) + 4.6 * PX, 4.3 * PX, CLOSE],
				[K.risks + 40, X(3) + 8.7 * PX, 4.3 * PX, CLOSE],
				[K.overview, cX(3), SH / 2, FULL],
			],
			inOut,
		);
	const sy = interpolate(f, [SHOTS.depth.from, K.tl], [STRIP.y, 680], {...clamp, easing: inOut});
	// hand-over to Range: the deck pushes back and the first range deck is dealt over it
	const back = recede(f, SHOTS.range.from - 6);
	return (
		<AbsoluteFill style={{opacity: 1 - tween(f, SHOTS.range.from + 6, 8)}}>
			<div style={{position: 'absolute', inset: 0, transform: `translateY(${-back * 70}px) scale(${1 - back * 0.14})`, transformOrigin: '540px 680px', filter: back > 0 ? `brightness(${1 - 0.55 * back})` : undefined}}>
				<Cam cx={c.cx} cy={c.cy} s={c.s} y={sy}>
					{FERN_SLIDES.map((id, i) => (
						<SlideCard key={id} id={id} style={{left: X(i), top: 0}} shadow={1.4}>
							{i === 1 && <TopCrop y={1.95} a={tween(f, K.tlZoom, 14) * (1 - tween(f, K.tlZoom + 68, 14))} />}
							{i === 1 && <TimelineMarker f={f} x={mk} />}
							{i === 2 && <BarReveal f={f} />}
							{i === 3 && <TopCrop y={2.12} a={tween(f, K.risks - 6, 12) * (1 - tween(f, K.risks + 42, 14))} />}
						</SlideCard>
					))}
				</Cam>
			</div>
		</AbsoluteFill>
	);
};

/** "Today" marker advancing through the real gantt; weeks ahead stay softened. */
const TimelineMarker: React.FC<{f: number; x: number}> = ({f, x}) => {
	const vis = tween(f, K.tlZoom + 2, 8) * (1 - tween(f, K.budget - 10, 10));
	if (vis <= 0) return null;
	const week = Math.min(12, Math.max(1, Math.floor((x - 2.55) / (10.28 / 12)) + 1));
	const reached = x >= MARK_TO - 0.02;
	const top = 2.15 * PX;
	const bottom = 5.75 * PX;
	return (
		<>
			<div style={{position: 'absolute', left: x * PX, top, width: 12.85 * PX - x * PX, height: bottom - top, background: 'rgba(246,244,238,0.72)', opacity: vis}} />
			<div style={{position: 'absolute', left: x * PX - 5, top: top - 10, width: 10, height: bottom - top + 20, borderRadius: 6, background: C.blue, opacity: vis, boxShadow: '0 0 30px rgba(47,91,255,0.6)'}} />
			<div style={{position: 'absolute', left: x * PX, top: 1.88 * PX, transform: `translateX(${-100 * Math.min(1, Math.max(0, (x - MARK_FROM) / (MARK_TO - MARK_FROM)))}%)`, opacity: vis, fontFamily: FONT, fontWeight: 700, fontSize: 44, lineHeight: '50px', color: C.white, background: reached ? C.ink : C.blue, borderRadius: 30, padding: '6px 26px', whiteSpace: 'nowrap'}}>
				{reached ? 'Launch · Mar 18' : `Week ${week}`}
			</div>
		</>
	);
};

/** Budget bars revealed in rank order (covers in the slide's paper colour). */
const BarReveal: React.FC<{f: number}> = ({f}) => (
	<>
		{BARS.map((y, i) => {
			const t = tween(f, K.budget + 8 + i * 5, 18, inOut);
			if (t >= 1) return null;
			const x0 = 1.69 * PX;
			const x1 = 8.25 * PX;
			return <div key={i} style={{position: 'absolute', left: x0 + (x1 - x0) * t, top: (y - 0.02) * PX, width: (x1 - x0) * (1 - t), height: 0.54 * PX, background: '#F6F4EE'}} />;
		})}
	</>
);

// The whole deck at once: the strip regroups into a two-row contact sheet.
export const GW = 330;
export const GRID = [
	[540 - 345, 560],
	[540, 560],
	[540 + 345, 560],
	[540 - 172, 772],
	[540 + 172, 772],
];

/** Close-up framing: the stage colour covers the headline band so close-ups never cut words. */
export const TopCrop: React.FC<{y: number; a: number}> = ({y, a}) =>
	a <= 0 ? null : <div style={{position: 'absolute', left: -4, top: -4, width: SW + 8, height: y * PX + 4, opacity: a, background: `linear-gradient(180deg, ${C.night} 0%, ${C.night} calc(100% - 70px), rgba(6,13,38,0) 100%)`}} />;
