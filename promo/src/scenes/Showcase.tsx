import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, Interactive, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Kinetic} from '../components/Kinetic';
import {C, clamp, display, gradientText, mono} from '../theme';

// Real previews from examples/showcase: six decks, six design languages.
const DECKS = ['board-decision', 'fashion-launch', 'scientific-explanation', 'cultural-heritage', 'technical-architecture', 'travel'];
const NAMES = ['Board paper', 'Fashion launch', 'Science lecture', 'Heritage essay', 'Architecture review', 'Travel guide'];

const COLUMNS = [
	{x: -260, speed: 2.4, offset: 0, slides: [1, 2, 3]},
	{x: 400, speed: -2.0, offset: 2, slides: [2, 3, 1]},
	{x: 1060, speed: 2.8, offset: 4, slides: [3, 1, 2]},
];
const CARD_W = 620;
const CARD_H = 349;
const GAP = 36;

const Column: React.FC<{readonly index: number}> = ({index}) => {
	const frame = useCurrentFrame();
	const col = COLUMNS[index];
	const items = new Array(12).fill(true).map((_, i) => {
		const deck = DECKS[(i + col.offset) % DECKS.length];
		const n = col.slides[Math.floor(i / DECKS.length) % col.slides.length];
		return `decks/${deck}-${n}.jpg`;
	});
	const loop = (CARD_H + GAP) * items.length;
	const y = ((((frame * col.speed) % loop) + loop) % loop) - loop;

	return (
		<div style={{position: 'absolute', left: col.x, top: -400, width: CARD_W, translate: `0px ${y}px`}}>
			{items.concat(items).map((src, i) => (
				<Img
					key={i}
					src={staticFile(src)}
					style={{
						display: 'block',
						width: CARD_W,
						height: CARD_H,
						objectFit: 'cover',
						borderRadius: 18,
						marginBottom: GAP,
						boxShadow: '0 30px 70px rgba(0,0,0,0.55)',
						outline: '1px solid rgba(255,255,255,0.08)',
					}}
				/>
			))}
		</div>
	);
};

export const Showcase: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const zoom = interpolate(frame, [0, 70], [1.9, 1.15], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)});

	return (
		<AbsoluteFill style={{overflow: 'hidden'}}>
			{/* The wall, tilted in 3D, with the camera pulling back to reveal it. */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					width: 1080,
					height: 1920,
					transform: `perspective(2200px) scale(${zoom}) rotateX(${interpolate(frame, [0, 300], [28, 20])}deg) rotateZ(${interpolate(frame, [0, 300], [-16, -9])}deg)`,
					transformOrigin: '50% 55%',
				}}
			>
				<Column index={0} />
				<Column index={1} />
				<Column index={2} />
			</div>

			{/* Scrim so the type reads over any deck. */}
			<AbsoluteFill
				style={{
					background: 'linear-gradient(180deg, rgba(4,10,34,0.96) 0%, rgba(4,10,34,0.85) 26%, rgba(4,10,34,0.0) 46%, rgba(4,10,34,0) 78%, rgba(4,10,34,0.9) 100%)',
				}}
			/>

			<div style={{position: 'absolute', left: 90, top: 150, width: 920}}>
				<Kinetic text="Six decks." delay={6} mode="slam" stagger={5} exitAt={146} style={{fontFamily: display, fontWeight: 900, fontSize: 124, letterSpacing: -4, lineHeight: 1.02, color: C.ink}} />
				<Kinetic
					text="No house style."
					delay={20}
					mode="slam"
					stagger={5}
					exitAt={150}
					style={{fontFamily: display, fontWeight: 900, fontSize: 124, letterSpacing: -4, lineHeight: 1.02}}
					wordStyle={gradientText(C.cyan, C.blue)}
				/>
			</div>
			<div style={{position: 'absolute', left: 90, top: 150, width: 920}}>
				<Kinetic text="Your model" delay={162} mode="slam" stagger={5} style={{fontFamily: display, fontWeight: 900, fontSize: 124, letterSpacing: -4, lineHeight: 1.02, color: C.ink}} />
				<Kinetic
					text="sets the look."
					delay={176}
					mode="slam"
					stagger={5}
					style={{fontFamily: display, fontWeight: 900, fontSize: 124, letterSpacing: -4, lineHeight: 1.02}}
					wordStyle={gradientText(C.cyan, C.blue)}
				/>
			</div>

			{/* Marquee of the deck names along the bottom. */}
			<Interactive.Div
				name="Deck names marquee"
				style={{
					position: 'absolute',
					left: 0,
					top: 1730,
					display: 'flex',
					gap: 22,
					whiteSpace: 'nowrap',
					opacity: interpolate(frame, [30, 44], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
					translate: interpolate(frame, [0, 300], ['0px 0px', '-1300px 0px'], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					}),
				}}
			>
				{NAMES.concat(NAMES).map((name, i) => (
					<div
						key={i}
						style={{
							fontFamily: mono,
							fontSize: 32,
							color: C.ink,
							padding: '16px 28px',
							borderRadius: 999,
							border: `1.5px solid ${C.line}`,
							background: 'rgba(14,26,70,0.8)',
						}}
					>
						{name}
					</div>
				))}
			</Interactive.Div>

			<Audio name="Slam: Six decks" from={6} src={staticFile('audio/slam.wav')} volume={0.5} premountFor={fps} />
			<Audio name="Slam: No house style" from={20} src={staticFile('audio/slam.wav')} volume={0.5} premountFor={fps} />
			<Audio name="Whoosh: line swap" from={146} src={staticFile('audio/whoosh.wav')} volume={0.3} premountFor={fps} />
			<Audio name="Slam: Your model" from={162} src={staticFile('audio/slam.wav')} volume={0.5} premountFor={fps} />
			<Audio name="Slam: sets the look" from={176} src={staticFile('audio/slam.wav')} volume={0.5} premountFor={fps} />
		</AbsoluteFill>
	);
};
