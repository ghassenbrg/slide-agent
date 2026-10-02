import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Charts, FRAG_H, FRAG_W, Layout, Outline, Polish, Research, Structure, Visuals, Write} from '../components/Fragments';
import {Caret, NightStage, Pointer} from '../components/ui';
import {accentWord, C, clamp, display, ease, mono} from '../theme';

// 0:00–0:15.5 — the hook and the problem, in the dark.
// An empty title placeholder; a week of work piles up around it; then all
// of it is pulled into one line.

const SLIDE_W = 1000;
const SLIDE_H = 562;

const CLICK = 40; // the pointer clicks the placeholder
const PULL = 150; // camera pulls back, work starts arriving
const HEADLINE = 372; // "Hours of it…"
const COLLAPSE = 408; // everything pulled into one line
const LINE = 440; // only the line is left; the score cuts to silence

// Centre (x, y) and tilt of each piece of work, in arrival order.
const PILE: {C: React.FC; x: number; y: number; r: number}[] = [
	{C: Research, x: 300, y: 215, r: -4},
	{C: Outline, x: 1625, y: 225, r: 3},
	{C: Structure, x: 245, y: 560, r: 2.5},
	{C: Write, x: 1680, y: 575, r: -3},
	{C: Layout, x: 960, y: 150, r: -2},
	{C: Visuals, x: 360, y: 880, r: 3},
	{C: Charts, x: 1560, y: 890, r: -2.5},
	{C: Polish, x: 960, y: 925, r: 2},
];
const ARRIVE = (k: number) => PULL + 18 + k * 26;

const clockText = (minutes: number) => {
	const day = ['MON', 'TUE', 'WED'][Math.min(2, Math.floor(minutes / 1440))];
	const m = Math.floor(minutes % 1440);
	const hh = String(Math.floor(m / 60)).padStart(2, '0');
	const mm = String(m % 60).padStart(2, '0');
	return `${day} ${hh}:${mm}`;
};

export const Blank: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();

	// Camera: a slow push in on the empty slide, then a pull back to make
	// room for the pile.
	const push = interpolate(f, [0, PULL], [0.96, 1.06], {...clamp, easing: ease.soft});
	const pull = interpolate(f, [PULL, PULL + 40], [0, 1], {...clamp, easing: ease.inOut});
	const slideScale = interpolate(pull, [0, 1], [push, 0.6]);

	// Collapse: everything goes to a single line through the centre.
	const col = interpolate(f, [COLLAPSE, LINE], [0, 1], {...clamp, easing: ease.in});
	const lineGlow = interpolate(f, [LINE - 6, LINE + 6], [0, 1], clamp);

	const enter = interpolate(f, [0, 24], [0, 1], {...clamp, easing: ease.out});
	const dim = interpolate(f, [HEADLINE - 10, HEADLINE + 10], [1, 0.28], clamp);

	// Pointer path: in from the lower right, click the title placeholder.
	const pIn = interpolate(f, [16, CLICK - 2], [0, 1], {...clamp, easing: ease.out});
	const pOut = interpolate(f, [CLICK + 20, CLICK + 44], [0, 1], {...clamp, easing: ease.in});
	const px = interpolate(pIn, [0, 1], [1500, 1010]) + pOut * 380;
	const py = interpolate(pIn, [0, 1], [900, 470]) + pOut * 300;
	const clicked = f >= CLICK;

	const minutes = interpolate(f, [PULL + 10, COLLAPSE], [9 * 60, 2 * 1440 + 23 * 60 + 47], {...clamp, easing: ease.in});

	return (
		<NightStage>
			{/* the pile */}
			{PILE.map(({C: Frag, x, y, r}, k) => {
				const a = ARRIVE(k);
				const t = interpolate(f, [a, a + 12], [0, 1], {...clamp, easing: ease.out});
				if (f < a) return null;
				const cx = interpolate(col, [0, 1], [x, 960]);
				const cy = interpolate(col, [0, 1], [y, 540]);
				return (
					<div
						key={k}
						style={{
							position: 'absolute',
							left: cx - FRAG_W / 2,
							top: cy - FRAG_H / 2,
							rotate: `${r * (1 - col) + (1 - t) * r * 2}deg`,
							scale: interpolate(t, [0, 1], [1.25, 1]) * (1 - col * 0.98),
							opacity: t * dim * (1 - col),
							filter: `blur(${(1 - t) * 8 + col * 6}px)`,
						}}
					>
						<Sequence from={a} layout="none" name={`Work ${k + 1}`}>
							<Frag />
						</Sequence>
					</div>
				);
			})}

			{/* the empty slide */}
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
				<div
					style={{
						width: SLIDE_W,
						height: SLIDE_H,
						scale: `${slideScale * (1 - col * 0.02)} ${slideScale * interpolate(col, [0, 1], [1, 0.004])}`,
						translate: `0px ${-pull * 20}px`,
						opacity: enter * (f < LINE ? 1 : 0) * interpolate(dim, [0.28, 1], [0.45, 1]),
						borderRadius: 8,
						background: 'rgba(255,255,255,0.035)',
						border: '1.5px solid rgba(200,210,255,0.22)',
						boxShadow: '0 0 120px rgba(47,91,255,0.12)',
						position: 'relative',
					}}
				>
					<div
						style={{
							position: 'absolute',
							left: 80,
							top: 150,
							width: 840,
							height: 160,
							border: '2px dashed rgba(200,210,255,0.3)',
							borderRadius: 6,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontFamily: display,
							fontWeight: 500,
							fontSize: 68,
							letterSpacing: '-0.02em',
							color: 'rgba(200,210,255,0.42)',
						}}
					>
						{clicked ? <Caret height={76} color={C.nightInk} from={CLICK} /> : 'Click to add title'}
					</div>
					<div
						style={{
							position: 'absolute',
							left: 80,
							top: 340,
							width: 840,
							height: 90,
							border: '2px dashed rgba(200,210,255,0.18)',
							borderRadius: 6,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontFamily: display,
							fontSize: 34,
							color: 'rgba(200,210,255,0.28)',
						}}
					>
						Click to add subtitle
					</div>
				</div>
			</AbsoluteFill>

			{/* the line everything became */}
			{f >= LINE - 6 ? (
				<div
					style={{
						position: 'absolute',
						left: 960 - 300,
						top: 539,
						width: 600,
						height: 2,
						background: '#fff',
						opacity: lineGlow,
						boxShadow: `0 0 ${18 + 10 * Math.sin(f / 4)}px rgba(120,150,255,0.9), 0 0 60px rgba(47,91,255,0.7)`,
					}}
				/>
			) : null}

			{f < CLICK + 50 ? <Pointer x={px} y={py} pressed={f >= CLICK && f < CLICK + 5} opacity={interpolate(f, [16, 24], [0, 1], clamp)} dark /> : null}

			{/* hook line */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: 878,
					textAlign: 'center',
					fontFamily: display,
					fontWeight: 600,
					fontSize: 80,
					letterSpacing: '-0.03em',
					color: C.nightInk,
					opacity: interpolate(f, [56, 74, PULL - 14, PULL], [0, 1, 1, 0], clamp),
					translate: `0px ${interpolate(f, [56, 80], [24, 0], {...clamp, easing: ease.out})}px`,
				}}
			>
				Every presentation starts <span style={accentWord('#8FA8FF')}>here.</span>
			</div>

			{/* the clock */}
			<div
				style={{
					position: 'absolute',
					right: 64,
					top: 52,
					fontFamily: mono,
					fontSize: 34,
					fontWeight: 500,
					letterSpacing: '0.04em',
					color: minutes > 1440 + 18 * 60 ? C.warn : C.nightInk,
					opacity: interpolate(f, [PULL + 4, PULL + 20], [0, 1], clamp) * (1 - col) * interpolate(f, [HEADLINE - 10, HEADLINE + 10], [1, 0.5], clamp),
					fontVariantNumeric: 'tabular-nums',
					background: 'rgba(5,9,24,0.6)',
					padding: '8px 14px',
					borderRadius: 8,
				}}
			>
				{clockText(minutes)}
			</div>

			{/* the cost of it */}
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'}}>
				<div
					style={{
						textAlign: 'center',
						fontFamily: display,
						fontWeight: 700,
						fontSize: 104,
						lineHeight: 1.04,
						letterSpacing: '-0.04em',
						color: '#fff',
						opacity: interpolate(f, [HEADLINE, HEADLINE + 12, COLLAPSE - 4, COLLAPSE + 6], [0, 1, 1, 0], clamp),
						scale: interpolate(f, [HEADLINE, HEADLINE + 30], [1.04, 1], {...clamp, easing: ease.out}),
						textShadow: '0 4px 40px rgba(0,0,0,0.8)',
					}}
				>
					Hours of it.
					<br />
					<span style={{color: C.nightDim, fontWeight: 600, fontSize: 72}}>
						Before anyone hears your <span style={accentWord('#8FA8FF')}>idea.</span>
					</span>
				</div>
			</AbsoluteFill>

			{/* sound */}
			<Audio name="Click placeholder" from={CLICK} src={staticFile('launch/audio/click.wav')} volume={0.5} premountFor={fps} />
			{PILE.map((_, k) => (
				<Audio key={k} name={`Thud ${k + 1}`} from={ARRIVE(k)} src={staticFile('launch/audio/thud.wav')} volume={0.32 + k * 0.03} premountFor={fps} />
			))}
			<Audio name="Collapse" from={COLLAPSE - 10} src={staticFile('launch/audio/suck.wav')} volume={0.55} premountFor={fps} />
			<Audio name="Keystroke" from={454} src={staticFile('launch/audio/click.wav')} volume={0.6} premountFor={fps} />
		</NightStage>
	);
};
