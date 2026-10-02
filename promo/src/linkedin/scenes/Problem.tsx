import {Audio} from '@remotion/media';
import type React from 'react';
import {interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Charts, FRAG_H, FRAG_W, Layout, Outline, Polish, Research, Structure, Visuals, Write} from '../../launch/components/Fragments';
import {Caret, NightStage} from '../../launch/components/ui';
import {C, clamp, display, ease, mono} from '../../launch/theme';
import {Headline} from '../kit';

// 0:03.5–0:09.5 — the problem, in the dark: an empty placeholder and the
// pile of work a deck normally takes. Then all of it collapses into a line.

const CX = 540;
const CY = 675; // the collapse lands on the frame's centre, where the next scene opens
const SLIDE_W = 600;
const SLIDE_H = 338;
const SCALE = 0.78;

const PILE: {C: React.FC; x: number; y: number; r: number}[] = [
	{C: Research, x: 230, y: 530, r: -4},
	{C: Outline, x: 850, y: 520, r: 3},
	{C: Structure, x: 190, y: 750, r: 2.5},
	{C: Write, x: 890, y: 760, r: -3},
	{C: Layout, x: 540, y: 470, r: -2},
	{C: Visuals, x: 240, y: 980, r: 3},
	{C: Charts, x: 840, y: 970, r: -2.5},
	{C: Polish, x: 540, y: 1030, r: 2},
];
const ARRIVE = (k: number) => 14 + k * 13;
const COLLAPSE = 146;
const LINE = 168;

const clock = (minutes: number) => {
	const day = ['MON', 'TUE', 'WED'][Math.min(2, Math.floor(minutes / 1440))];
	const m = Math.floor(minutes % 1440);
	return `${day} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export const Problem: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const enter = interpolate(f, [0, 12], [0, 1], {...clamp, easing: ease.out});
	const col = interpolate(f, [COLLAPSE, LINE], [0, 1], {...clamp, easing: ease.in});
	const minutes = interpolate(f, [8, COLLAPSE], [9 * 60, 2 * 1440 + 23 * 60 + 47], {...clamp, easing: ease.in});
	const words = interpolate(f, [30, 44], [0, 1], {...clamp, easing: ease.out});

	return (
		<NightStage>
			<div style={{opacity: 1 - col}}>
				<Headline dark size={80} top={110} at={0}>
					A good deck still takes <span style={{color: C.amber}}>hours.</span>
				</Headline>
				<div style={{position: 'absolute', left: 72, right: 72, top: 300, fontFamily: display, fontWeight: 500, fontSize: 36, color: C.nightDim, opacity: words, translate: `0px ${(1 - words) * 14}px`}}>
					Research. Outline. Layout. Fonts. Charts. Polish.
				</div>
			</div>

			{/* the empty slide */}
			<div
				style={{
					position: 'absolute',
					left: CX - SLIDE_W / 2,
					top: CY - SLIDE_H / 2 + 20,
					width: SLIDE_W,
					height: SLIDE_H,
					borderRadius: 8,
					background: 'rgba(255,255,255,0.04)',
					border: '1.5px solid rgba(200,210,255,0.22)',
					opacity: enter * (f < LINE ? 0.85 : 0),
					scale: `${1 - col * 0.02} ${interpolate(col, [0, 1], [1, 0.006])}`,
					translate: `0px ${-col * 20}px`,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<div style={{width: 500, height: 110, border: '2px dashed rgba(200,210,255,0.3)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: display, fontWeight: 500, fontSize: 40, color: 'rgba(200,210,255,0.4)'}}>
					{f < 10 ? 'Click to add title' : <Caret height={50} color={C.nightInk} from={10} />}
				</div>
			</div>

			{/* the pile */}
			{PILE.map(({C: Frag, x, y, r}, k) => {
				const a = ARRIVE(k);
				if (f < a) return null;
				const t = interpolate(f, [a, a + 10], [0, 1], {...clamp, easing: ease.out});
				const cx = interpolate(col, [0, 1], [x, CX]);
				const cy = interpolate(col, [0, 1], [y, CY]);
				return (
					<div
						key={k}
						style={{
							position: 'absolute',
							left: cx - FRAG_W / 2,
							top: cy - FRAG_H / 2,
							rotate: `${r * (1 - col) + (1 - t) * r * 2}deg`,
							scale: SCALE * interpolate(t, [0, 1], [1.25, 1]) * (1 - col * 0.98),
							opacity: t * (1 - col),
							filter: `blur(${(1 - t) * 8 + col * 6}px)`,
						}}
					>
						<Sequence from={a} layout="none" name={`Work ${k + 1}`}>
							<Frag />
						</Sequence>
					</div>
				);
			})}

			{/* the clock */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: 1170,
					textAlign: 'center',
					opacity: interpolate(f, [8, 20], [0, 1], clamp) * (1 - col),
				}}
			>
				<span style={{fontFamily: mono, fontSize: 44, fontWeight: 500, letterSpacing: '0.04em', color: minutes > 1440 + 18 * 60 ? C.warn : C.nightInk, background: 'rgba(5,9,24,0.7)', padding: '10px 22px', borderRadius: 12, fontVariantNumeric: 'tabular-nums'}}>
					{clock(minutes)}
				</span>
			</div>

			{/* the line everything became */}
			{f >= LINE - 6 ? (
				<div
					style={{
						position: 'absolute',
						left: CX - 300,
						top: CY - 1,
						width: 600,
						height: 2,
						background: '#fff',
						opacity: interpolate(f, [LINE - 6, LINE + 4], [0, 1], clamp),
						boxShadow: `0 0 ${18 + 10 * Math.sin(f / 4)}px rgba(120,150,255,0.9), 0 0 60px rgba(47,91,255,0.7)`,
					}}
				/>
			) : null}

			<Audio name="Click" from={10} src={staticFile('launch/audio/click.wav')} volume={0.5} premountFor={fps} />
			{PILE.map((_, k) => (
				<Audio key={k} name={`Thud ${k + 1}`} from={ARRIVE(k)} src={staticFile('launch/audio/thud.wav')} volume={0.32 + k * 0.03} premountFor={fps} />
			))}
			<Audio name="Collapse" from={COLLAPSE - 12} src={staticFile('launch/audio/suck.wav')} volume={0.55} premountFor={fps} />
			<Audio name="Keystroke" from={176} src={staticFile('launch/audio/click.wav')} volume={0.6} premountFor={fps} />
		</NightStage>
	);
};
