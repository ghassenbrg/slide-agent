import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Cam, PX, SH, SW, SlideCard, camAt, type DeckSlide} from '../kit';
import {C, FONT, clamp, inOut, land, lerp, recede, tween} from '../theme';
import {K, SHOTS} from '../timeline';
import {TopCrop} from './Depth';

const FULL = 960 / SW;
const SY = 680;
const LEN = 118; // frames per deck (4 beats × 2 bars)

/**
 * Deck card dealt on top of the previous one when its request is typed. The outgoing deck
 * never dissolves: it recedes (smaller, darker) and is covered at full opacity by the next.
 */
const DeckShot: React.FC<{f: number; start: number; id: DeckSlide; keys: [number, number, number, number][]; children?: React.ReactNode}> = ({f, start, id, keys, children}) => {
	const enter = land(f, start + 1, 30, 20, 140);
	const back = recede(f, start + LEN - 6);
	if (f < start || f >= start + LEN + 16) return null;
	const c = camAt(f, keys.map(([t, x, y, s]) => [start + t, x, y, s]), inOut);
	return (
		<AbsoluteFill style={{opacity: Math.min(1, enter * 8) * (1 - tween(f, start + LEN + 6, 8)), transform: `translateY(${(1 - enter) * 300 - back * 70}px) scale(${lerp(0.92, 1, enter) - back * 0.14})`, transformOrigin: `540px ${SY}px`, filter: back > 0 ? `brightness(${1 - 0.55 * back})` : undefined}}>
			<Cam cx={c.cx} cy={c.cy} s={c.s} y={SY}>
				<SlideCard id={id} style={{left: 0, top: 0}} shadow={1.4}>
					{children}
				</SlideCard>
			</Cam>
		</AbsoluteFill>
	);
};

// ── Architecture: a signal follows the real routed connectors, node by node ──
const PATH: [number, number][] = [
	[0.92, 3.85], [1.48, 3.85], [1.48, 3.3], [1.72, 3.3], [3.27, 3.3], [3.45, 3.3], [3.45, 3.85], [3.6, 3.85], [5.0, 3.85],
	[5.45, 3.85], [6.95, 3.85], [7.13, 3.85], [7.13, 2.61], [7.3, 2.61], [9.46, 2.61], [9.68, 2.61], [9.68, 2.15], [10.0, 2.15], [11.2, 2.15],
];
const NODES = [
	{r: [0.5, 3.35, 0.85, 1.0], at: 0},
	{r: [1.72, 3.0, 1.55, 0.6], at: 0.12},
	{r: [3.6, 3.3, 1.4, 1.1], at: 0.3},
	{r: [5.45, 3.17, 1.5, 1.36], at: 0.47},
	{r: [7.3, 2.33, 2.16, 0.56], at: 0.68},
	{r: [10.0, 1.9, 2.68, 0.5], at: 0.92},
];
const SEG = PATH.slice(1).map((p, i) => Math.hypot(p[0] - PATH[i][0], p[1] - PATH[i][1]));
const TOTAL_LEN = SEG.reduce((a, b) => a + b, 0);
const pointAt = (t: number) => {
	let d = t * TOTAL_LEN;
	for (let i = 0; i < SEG.length; i++) {
		if (d <= SEG[i]) {
			const u = d / SEG[i];
			return [lerp(PATH[i][0], PATH[i + 1][0], u), lerp(PATH[i][1], PATH[i + 1][1], u)];
		}
		d -= SEG[i];
	}
	return PATH[PATH.length - 1];
};
const A_RUN = [44, 92];

const Signal: React.FC<{f: number}> = ({f}) => {
	const t = interpolate(f - K.arch, A_RUN, [0, 1], {...clamp, easing: inOut});
	const vis = tween(f - K.arch, A_RUN[0] - 4, 6) * (1 - tween(f - K.arch, A_RUN[1] + 14, 10));
	if (vis <= 0) return null;
	// trail: sample behind the head
	const trail = Array.from({length: 18}, (_, i) => pointAt(Math.max(0, t - i * 0.012)));
	return (
		<>
			{NODES.map((n, i) => {
				const on = t >= n.at ? tween(f - K.arch, A_RUN[0] + n.at * (A_RUN[1] - A_RUN[0]), 8) : 0;
				const [x, y, w, h] = n.r;
				return (
					<div key={i} style={{position: 'absolute', left: (x - 0.05) * PX, top: (y - 0.05) * PX, width: (w + 0.1) * PX, height: (h + 0.1) * PX, borderRadius: 26, border: `8px solid rgba(94,234,212,${0.9 * on * vis})`, boxShadow: `0 0 ${60 * on}px rgba(94,234,212,${0.55 * on * vis})`}} />
				);
			})}
			{trail.map(([x, y], i) => (
				<div key={i} style={{position: 'absolute', left: x * PX - 18, top: y * PX - 18, width: 36, height: 36, borderRadius: 36, background: i === 0 ? '#FFFFFF' : '#5EEAD4', opacity: vis * (i === 0 ? 1 : 0.6 * (1 - i / 18)), transform: `scale(${i === 0 ? 1.3 : 1 - i / 22})`, boxShadow: i === 0 ? '0 0 50px 16px rgba(94,234,212,0.8)' : 'none'}} />
			))}
		</>
	);
};

// ── Roadmap: a "today" marker progresses 2026 → 2028; milestones pop as reached ──
const R_RUN = [40, 92];
const YEARS = [
	{x0: 2.5, label: '2026 · Foundation'},
	{x0: 5.94, label: '2027 · Scale'},
	{x0: 9.39, label: '2028 · Autonomy'},
];
const MILES = [4.22, 7.67, 10.25];
const roadX = (f: number) => interpolate(f - K.road, R_RUN, [2.5, 12.8], {...clamp, easing: inOut});

const Today: React.FC<{f: number}> = ({f}) => {
	const x = roadX(f);
	const vis = tween(f - K.road, R_RUN[0] - 6, 8) * (1 - tween(f - K.road, R_RUN[1] + 10, 10));
	if (vis <= 0) return null;
	const year = YEARS.filter((y) => x >= y.x0).pop()!;
	const top = 4.3 * PX;
	const bottom = 6.98 * PX;
	return (
		<>
			<div style={{position: 'absolute', left: x * PX, top, width: Math.max(0, 12.9 * PX - x * PX), height: bottom - top, background: 'rgba(255,255,255,0.72)', opacity: vis}} />
			{MILES.map((m, i) => {
				const p = x >= m ? land(f, K.road + R_RUN[0] + ((m - 2.5) / 10.3) * (R_RUN[1] - R_RUN[0]), 30, 12, 200) : 0;
				return <div key={i} style={{position: 'absolute', left: m * PX - 60, top: 6.78 * PX - 60, width: 120, height: 120, borderRadius: 120, border: `8px solid rgba(217,119,6,${(1 - Math.min(1, p)) * vis})`, transform: `scale(${0.4 + p * 1.2})`}} />;
			})}
			<div style={{position: 'absolute', left: x * PX - 5, top: top - 8, width: 10, height: bottom - top + 16, borderRadius: 6, background: C.blue, opacity: vis, boxShadow: '0 0 30px rgba(47,91,255,0.6)'}} />
			<div style={{position: 'absolute', left: x * PX, top: top - 74, transform: `translateX(${-100 * Math.min(1, Math.max(0, (x - 2.5) / 10.3))}%)`, opacity: vis, fontFamily: FONT, fontWeight: 700, fontSize: 44, lineHeight: '50px', color: C.white, background: C.blue, borderRadius: 30, padding: '6px 26px', whiteSpace: 'nowrap'}}>{year.label}</div>
		</>
	);
};

// ── Data story: three panels answer their questions in reading order, then the takeaway ──
const PAPER = '#F6F3EC';
const Cover: React.FC<{f: number; at: number; dur: number; r: [number, number, number, number]; dir?: 'x' | 'down'}> = ({f, at, dur, r, dir = 'x'}) => {
	const t = tween(f, at, dur, inOut);
	if (t >= 1) return null;
	const [x, y, w, h] = r;
	const st: React.CSSProperties = dir === 'x' ? {left: (x + w * t) * PX, top: y * PX, width: w * (1 - t) * PX, height: h * PX} : {left: x * PX, top: (y + h * t) * PX, width: w * PX, height: h * (1 - t) * PX};
	return <div style={{position: 'absolute', background: PAPER, ...st}} />;
};
const D = {p1: 30, p2: 48, p3: 68, band: 94};
const PanelReveal: React.FC<{f: number}> = ({f}) => {
	const r = f - K.data;
	return (
		<>
			<Cover f={r} at={D.p1} dur={22} r={[0.42, 3.5, 4.95, 2.45]} />
			<Cover f={r} at={D.p2} dur={20} r={[5.55, 3.6, 3.5, 2.15]} />
			{[3.6, 4.15, 4.7, 5.25].map((y, i) => (
				<Cover key={i} f={r} at={D.p3 + i * 5} dur={10} r={[10.38, y, 2.55, i === 2 ? 0.58 : 0.5]} />
			))}
			<Cover f={r} at={D.band} dur={12} r={[0, 6.1, 13.4, 1.45]} dir="down" />
		</>
	);
};

export const Range: React.FC = () => {
	const f = useCurrentFrame() + SHOTS.range.from;
	const cy = SH / 2;
	return (
		<AbsoluteFill>
			<DeckShot f={f} start={K.arch} id="architecture-1" keys={[[0, SW / 2, cy, FULL], [30, SW / 2, cy, FULL], [44, 5.0 * PX, 3.75 * PX, 0.56], [92, 8.1 * PX, 3.2 * PX, 0.56], [108, SW / 2, cy, FULL]]}>
				<TopCrop y={1.45} a={tween(f - K.arch, 34, 10) * (1 - tween(f - K.arch, 96, 12))} />
				<Signal f={f} />
			</DeckShot>
			<DeckShot f={f} start={K.road} id="transformation-1" keys={[[0, SW / 2, cy, FULL], [26, SW / 2, cy, FULL], [40, 6.3 * PX, 5.45 * PX, 0.6], [92, 8.9 * PX, 5.45 * PX, 0.6], [108, SW / 2, cy, FULL]]}>
				<TopCrop y={1.8} a={tween(f - K.road, 30, 10) * (1 - tween(f - K.road, 96, 12))} />
				<Today f={f} />
			</DeckShot>
			<DeckShot f={f} start={K.data} id="analytics-1" keys={[[0, SW / 2, cy, FULL], [18, SW / 2, cy, FULL], [32, 5.2 * PX, 4.25 * PX, 0.5], [56, 5.4 * PX, 4.25 * PX, 0.5], [70, 8.1 * PX, 4.25 * PX, 0.5], [88, 8.1 * PX, 4.25 * PX, 0.5], [102, SW / 2, cy, FULL]]}>
				<PanelReveal f={f} />
				<TopCrop y={1.95} a={tween(f - K.data, 26, 10) * (1 - tween(f - K.data, 90, 12))} />
			</DeckShot>
		</AbsoluteFill>
	);
};
