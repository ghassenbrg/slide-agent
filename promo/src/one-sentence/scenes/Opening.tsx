import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {Cam, Rect, SH, SW, Slide, inch} from '../kit';
import {FERN, KEYWORDS, keywordBox} from '../Request';
import {C, FONT, clamp, inOut, land, lerp, recede, tween} from '../theme';
import {K, SHOTS} from '../timeline';

// Where the slide sits on screen in the opening.
export const OPEN = {x: 60, y: 334, w: 960};
const S = OPEN.w / SW;
const toScreen = (r: Rect) => ({x: OPEN.x + r.x * S, y: OPEN.y + r.y * S, w: r.w * S, h: r.h * S});

// Real components of the Fern dashboard (slide inches, from the engine's scene.json).
const PIECES = {
	header: inch(0.4, 0.33, 12.6, 1.86),
	target: inch(0.42, 2.22, 3.16, 2.25),
	timeline: inch(3.62, 2.22, 9.29, 2.25),
	budget: inch(0.42, 4.47, 6.16, 2.19),
	risks: inch(6.62, 4.47, 6.29, 2.19),
	footer: inch(0.4, 6.7, 12.6, 0.4),
};
const LANDS = [K.firstLand, K.firstLand + 8, K.firstLand + 16]; // timeline, budget, risks
const TARGET = [PIECES.timeline, PIECES.budget, PIECES.risks];

/** A real piece of the slide, revealed from an origin point (slide px) with a spring. */
const Piece: React.FC<{r: Rect; at: number; from?: {x: number; y: number}; children?: React.ReactNode}> = ({r, at, from, children}) => {
	const f = useCurrentFrame();
	const p = land(f, at, 30, 20, 150);
	if (f < at) return null;
	const ox = from ? from.x : r.x + r.w / 2;
	const oy = from ? from.y : r.y + r.h / 2;
	const sc = lerp(0.18, 1, p);
	return (
		<div style={{position: 'absolute', left: 0, top: 0, width: SW, height: SH, transformOrigin: `${ox}px ${oy}px`, transform: `scale(${sc})`, opacity: Math.min(1, p * 2.2)}}>
			<Slide id="fern-1" clip={r} radius={30} />
			{children}
		</div>
	);
};

/** A paper-coloured cover that wipes away to reveal the component's internal order. */
const Wipe: React.FC<{r: Rect; at: number; dur: number; color: string; dir?: 'x' | 'y'}> = ({r, at, dur, color, dir = 'x'}) => {
	const f = useCurrentFrame();
	const t = tween(f, at, dur, inOut);
	if (t >= 1) return null;
	const style: React.CSSProperties =
		dir === 'x'
			? {left: r.x + r.w * t, top: r.y, width: r.w * (1 - t), height: r.h}
			: {left: r.x, top: r.y + r.h * t, width: r.w, height: r.h * (1 - t)};
	return <div style={{position: 'absolute', background: color, ...style}} />;
};

// The canvas listens: as the request names a part, that part's slot draws itself in the canvas.
const TYPED = FERN.join('\n');
const typedAt = (n: number) => interpolate(n, [0, TYPED.length], [K.typeStart, K.typeEnd]);
const SLOTS: {r: Rect; label?: string; drawn: number; gone: number}[] = [
	{r: PIECES.header, drawn: typedAt(TYPED.indexOf('launch plan') + 11), gone: K.send + 8},
	...KEYWORDS.map((k, i) => ({r: TARGET[i], label: k, drawn: typedAt(FERN[0].length + 1 + FERN[1].indexOf(k) + k.length), gone: LANDS[i] + 2})),
];
const Slots: React.FC<{paper: number}> = ({paper}) => {
	const f = useCurrentFrame();
	return (
		<>
			{SLOTS.map(({r, label, drawn, gone}, i) => {
				const a = tween(f, drawn, 9) * (1 - tween(f, gone, 4));
				if (a <= 0) return null;
				const ink = (d: number, p: number) => Math.round(lerp(d, p, paper));
				const col = `rgba(${ink(185, 11)},${ink(199, 20)},${ink(242, 48)},${lerp(0.75, 0.32, paper)})`;
				// the label fades as its keyword flies in, so the word lands on its own slot
				const labelA = 1 - tween(f, LANDS[Math.max(0, i - 1)] - 10, 8);
				return (
					<div key={i} style={{position: 'absolute', left: r.x + 14, top: r.y + 14, width: r.w - 28, height: r.h - 28, borderRadius: 30, border: `6px dashed ${col}`, background: `rgba(47,91,255,${0.1 * (1 - paper)})`, opacity: a, transform: `scale(${lerp(0.94, 1, a)})`}}>
						{label && (
							<div style={{position: 'absolute', left: 0, right: 0, top: r.h * 0.32 - 14 - 70, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 132, lineHeight: '140px', color: col, opacity: Math.min(1, labelA * 1.25)}}>{label}</div>
						)}
					</div>
				);
			})}
		</>
	);
};

export const Opening: React.FC = () => {
	const f = useCurrentFrame();
	const frameIn = land(f, K.send - 4, 30, 22, 160);
	const hit = f >= K.firstLand ? Math.sin(Math.min(1, (f - K.firstLand) / 10) * Math.PI) * 0.012 : 0;
	// hand-over to Install: the result pushes back under the composer while the install card is dealt over it
	const back = recede(f, SHOTS.install.from - 2, 18);
	const exit = tween(f, SHOTS.install.from - 8, 10, inOut); // lockup clears first
	const gone = tween(f, SHOTS.install.from + 10, 10);
	const brand = land(f, K.brand - 6, 30, 16, 130);
	const tag = tween(f, K.brand + 6, 18);
	return (
		<AbsoluteFill>
			{/* the slide */}
			<div style={{position: 'absolute', left: 0, top: 0, width: 1080, height: 1350, opacity: 1 - gone, transform: `translateY(${-back * 50}px) scale(${1 - back * 0.14})`, transformOrigin: '540px 520px', filter: back > 0 ? `brightness(${1 - 0.55 * back})` : undefined}}>
				<Cam cx={SW / 2} cy={SH / 2} s={S * (0.96 + 0.04 * frameIn + hit)} x={OPEN.x + OPEN.w / 2} y={OPEN.y + (SH * S) / 2}>
					<div style={{position: 'absolute', width: SW, height: SH, borderRadius: 30, background: C.paper, opacity: frameIn, boxShadow: '0 60px 160px rgba(0,0,0,0.55)'}} />
					{/* empty-frame hint lines before the pieces arrive */}
					<div style={{position: 'absolute', width: SW, height: SH, borderRadius: 30, border: `6px dashed rgba(11,20,48,${0.14 * (1 - tween(f, K.firstLand + 20, 20))})`, opacity: frameIn}} />
					{/* frame 0: the empty canvas the request will fill */}
					<div style={{position: 'absolute', width: SW, height: SH, borderRadius: 30, border: '7px dashed rgba(185,199,242,0.45)', background: 'rgba(255,255,255,0.03)', opacity: 1 - frameIn}} />
					<Slots paper={frameIn} />
					<Piece r={PIECES.header} at={K.send + 6} from={{x: 0, y: 0}}>
						<Wipe r={inch(0.4, 0.8, 12.6, 1.35)} at={K.send + 8} dur={22} color={C.paper} />
					</Piece>
					{TARGET.map((r, i) => {
						const kb = keywordBox(KEYWORDS[i]);
						// origin: where the flying keyword lands, in slide px
						const o = {x: (kb.x + kb.w / 2 - OPEN.x) / S, y: (kb.y - OPEN.y) / S};
						return (
							<Piece key={i} r={r} at={LANDS[i]} from={{x: lerp(o.x, r.x + r.w / 2, 0.85), y: r.y + r.h * 0.3}}>
								{i === 0 && <Wipe r={inch(4.05, 2.95, 8.75, 1.32)} at={LANDS[0] + 6} dur={30} color="#FFFFFF" />}
								{i === 1 && <Wipe r={inch(2.38, 5.12, 3.1, 1.42)} at={LANDS[1] + 6} dur={22} color="#FFFFFF" />}
								{i === 2 && <Wipe r={inch(6.95, 5.12, 5.62, 1.38)} at={LANDS[2] + 6} dur={20} color="#FFFFFF" dir="y" />}
							</Piece>
						);
					})}
					<Piece r={PIECES.target} at={LANDS[2] + 8} />
					<Piece r={PIECES.footer} at={LANDS[2] + 14} />
				</Cam>
			</div>

			{/* the keywords fly from the request into the slide */}
			{KEYWORDS.map((k, i) => {
				const kb = keywordBox(k);
				const start = K.send + 4 + i * 8;
				const t = interpolate(f, [start, LANDS[i]], [0, 1], {...clamp, easing: inOut});
				if (f < start || f > LANDS[i] + 2) return null;
				const r = toScreen(TARGET[i]);
				const tx = r.x + r.w * 0.5;
				const ty = r.y + r.h * 0.32;
				const x = lerp(kb.x + kb.w / 2, tx, t);
				const y = lerp(kb.y + kb.h / 2, ty, t) - Math.sin(t * Math.PI) * 120;
				return (
					<div key={k} style={{position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) scale(${1 + Math.sin(t * Math.PI) * 0.25})`, fontFamily: FONT, fontWeight: 700, fontSize: 44, color: C.white, padding: '4px 16px', borderRadius: 12, background: C.teal, boxShadow: '0 16px 40px rgba(20,184,166,0.45)', opacity: 1 - tween(f, LANDS[i] - 2, 4)}}>
						{k}
					</div>
				);
			})}

			{/* Slide Agent lockup */}
			<div style={{position: 'absolute', left: 0, width: 1080, top: 912, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: Math.min(1, brand * 1.5) * (1 - exit), transform: `translateY(${exit * 60}px)`, fontFamily: FONT}}>
				<div style={{display: 'flex', alignItems: 'center', gap: 22, transform: `translateY(${(1 - brand) * 40}px) scale(${0.9 + 0.1 * brand})`}}>
					<Img src={staticFile('one-sentence/icon.png')} style={{width: 92, height: 92, borderRadius: 22, boxShadow: '0 10px 40px rgba(47,91,255,0.5)'}} />
					<div style={{fontSize: 78, fontWeight: 700, color: C.white, letterSpacing: '-0.01em'}}>Slide Agent</div>
				</div>
				<div style={{marginTop: 16, fontSize: 36, fontWeight: 600, color: C.mist, textAlign: 'center', lineHeight: '46px', opacity: tag, transform: `translateY(${(1 - tag) * 14}px)`}}>
					Create professional presentations
					<br />
					directly through your AI agent.
				</div>
			</div>
		</AbsoluteFill>
	);
};
