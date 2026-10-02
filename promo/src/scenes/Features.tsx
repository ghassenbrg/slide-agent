import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Easing, interpolate, Interactive, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Kinetic} from '../components/Kinetic';
import {C, clamp, display, gradientText, mono} from '../theme';

const Tile: React.FC<{readonly delay: number; readonly x: number; readonly y: number; readonly label: string; readonly children: React.ReactNode}> = ({
	delay,
	x,
	y,
	label,
	children,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const s = spring({frame: frame - delay, fps, config: {damping: 12, stiffness: 150}});
	return (
		<div
			style={{
				position: 'absolute',
				left: x,
				top: y,
				width: 450,
				height: 380,
				borderRadius: 32,
				padding: 34,
				background: C.panel,
				border: `1.5px solid ${C.line}`,
				boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'space-between',
				scale: String(s),
				rotate: `${(1 - s) * (x < 500 ? -10 : 10)}deg`,
				opacity: interpolate(frame - delay, [0, 4], [0, 1], clamp),
			}}
		>
			<div style={{height: 200, display: 'flex', alignItems: 'center'}}>{children}</div>
			<div style={{fontFamily: display, fontWeight: 700, fontSize: 38, lineHeight: 1.15, color: C.ink, letterSpacing: -0.5}}>{label}</div>
		</div>
	);
};

const Counter: React.FC<{readonly delay: number; readonly to: number}> = ({delay, to}) => {
	const frame = useCurrentFrame();
	const v = interpolate(frame, [delay, delay + 24], [0, to], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)});
	return (
		<div style={{fontFamily: display, fontWeight: 900, fontSize: 132, letterSpacing: -5, lineHeight: 1, ...gradientText(C.cyan, C.blue)}}>
			{Math.round(v).toLocaleString('en-US')}
		</div>
	);
};

const Bars: React.FC<{readonly delay: number}> = ({delay}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return (
		<div style={{display: 'flex', alignItems: 'flex-end', gap: 18, height: 170}}>
			{[0.45, 0.7, 0.55, 0.85, 1].map((h, i) => {
				const s = spring({frame: frame - delay - 4 - i * 3, fps, config: {damping: 14}});
				return <div key={i} style={{width: 52, height: 170 * h * s, borderRadius: 10, background: i === 4 ? C.cyan : `linear-gradient(${C.blue}, ${C.blueDeep})`}} />;
			})}
		</div>
	);
};

const Formats: React.FC<{readonly delay: number}> = ({delay}) => {
	const frame = useCurrentFrame();
	const shapes = [
		{w: 160, h: 90, label: '16:9'},
		{w: 104, h: 78, label: '4:3'},
		{w: 62, h: 110, label: '9:16'},
		{w: 76, h: 108, label: 'A4'},
	];
	return (
		<div style={{display: 'flex', alignItems: 'flex-end', gap: 18}}>
			{shapes.map((s, i) => {
				const on = interpolate(frame, [delay + 4 + i * 3, delay + 12 + i * 3], [0, 1], clamp);
				return (
					<div key={s.label} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, opacity: on, translate: `0px ${(1 - on) * 20}px`}}>
						<div style={{width: s.w * 0.62, height: s.h * 0.62, border: `4px solid ${i === 2 ? C.cyan : '#8FB0FF'}`, borderRadius: 8}} />
						<div style={{fontFamily: mono, fontSize: 20, color: C.dim}}>{s.label}</div>
					</div>
				);
			})}
		</div>
	);
};

export const Features: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	return (
		<AbsoluteFill>
			<Interactive.Div
				name="Camera"
				style={{
					position: 'absolute',
					inset: 0,
					scale: interpolate(frame, [0, 195], [1.08, 1], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
						output: 'perceptual-scale',
					}),
					rotate: interpolate(frame, [0, 195], ['-1.2deg', '0.4deg'], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					}),
				}}
			>
				<Interactive.Div
					name="Label"
					style={{
						position: 'absolute',
						left: 90,
						top: 160,
						fontFamily: mono,
						fontSize: 32,
						letterSpacing: 4,
						color: C.cyan,
						opacity: interpolate(frame, [0, 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
					}}
				>
					IN THE BOX
				</Interactive.Div>
				<div style={{position: 'absolute', left: 90, top: 215, width: 920}}>
					<Kinetic text="Built in." delay={2} mode="slam" stagger={6} style={{fontFamily: display, fontWeight: 900, fontSize: 132, letterSpacing: -4, lineHeight: 1.02, color: C.ink}} />
				</div>

				<Tile delay={15} x={65} y={430} label="icons as native shapes">
					<Counter delay={15} to={1848} />
				</Tile>
				<Tile delay={30} x={565} y={430} label="native charts, live data">
					<Bars delay={30} />
				</Tile>
				<Tile delay={45} x={65} y={840} label="recipes in 24 families">
					<Counter delay={45} to={38} />
				</Tile>
				<Tile delay={60} x={565} y={840} label="every slide format">
					<Formats delay={60} />
				</Tile>
				<Tile delay={75} x={65} y={1250} label="fonts measured & embedded">
					<div style={{fontFamily: display, fontWeight: 900, fontSize: 150, lineHeight: 1, color: C.ink, letterSpacing: -4}}>
						A<span style={{fontStyle: 'italic', fontWeight: 500, ...gradientText(C.cyan, C.blue)}}>a</span>
					</div>
				</Tile>
				<Tile delay={90} x={565} y={1250} label="quality gates, schema-valid">
					<div style={{fontFamily: display, fontWeight: 900, fontSize: 120, lineHeight: 1, letterSpacing: -4, ...gradientText(C.cyan, C.blue)}}>T0–T5</div>
				</Tile>
			</Interactive.Div>

			<Audio name="Slam: Built in" from={2} src={staticFile('audio/slam.wav')} volume={0.45} premountFor={fps} />
			<Audio name="Pop: icons" from={15} src={staticFile('audio/pop.wav')} volume={0.35} premountFor={fps} />
			<Audio name="Pop: charts" from={30} src={staticFile('audio/pop.wav')} volume={0.35} premountFor={fps} />
			<Audio name="Pop: recipes" from={45} src={staticFile('audio/pop.wav')} volume={0.35} premountFor={fps} />
			<Audio name="Pop: formats" from={60} src={staticFile('audio/pop.wav')} volume={0.35} premountFor={fps} />
			<Audio name="Pop: fonts" from={75} src={staticFile('audio/pop.wav')} volume={0.35} premountFor={fps} />
			<Audio name="Pop: quality" from={90} src={staticFile('audio/pop.wav')} volume={0.35} premountFor={fps} />
		</AbsoluteFill>
	);
};
