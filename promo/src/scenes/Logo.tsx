import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, Interactive, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Kinetic} from '../components/Kinetic';
import {Sparkle} from '../components/Sparkle';
import {C, clamp, display, gradientText, mono} from '../theme';

const Chip: React.FC<{readonly delay: number; readonly children: string}> = ({delay, children}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const s = spring({frame: frame - delay, fps, config: {damping: 12, stiffness: 170}});
	return (
		<div
			style={{
				fontFamily: mono,
				fontSize: 30,
				color: C.ink,
				padding: '14px 26px',
				borderRadius: 999,
				border: `1.5px solid ${C.line}`,
				background: 'rgba(61,107,255,0.14)',
				scale: String(s),
				opacity: interpolate(frame - delay, [0, 4], [0, 1], clamp),
			}}
		>
			{children}
		</div>
	);
};

export const Logo: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const icon = spring({frame: frame - 2, fps, config: {damping: 11, stiffness: 120}});

	return (
		<AbsoluteFill>
			<Interactive.Div
				name="Camera"
				style={{
					position: 'absolute',
					inset: 0,
					scale: interpolate(frame, [0, 135], [1, 1.07], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
						output: 'perceptual-scale',
					}),
					transformOrigin: '50% 45%',
				}}
			>
				{/* Shockwave ring on the drop. */}
				<div
					style={{
						position: 'absolute',
						left: 540 - 300,
						top: 690 - 300,
						width: 600,
						height: 600,
						borderRadius: '50%',
						border: `6px solid ${C.cyan}`,
						scale: String(interpolate(frame, [0, 28], [0.3, 2.6], {...clamp, easing: Easing.out(Easing.cubic)})),
						opacity: interpolate(frame, [0, 28], [0.9, 0], clamp),
					}}
				/>
				<div
					style={{
						position: 'absolute',
						left: 540 - 300,
						top: 690 - 300,
						width: 600,
						height: 600,
						borderRadius: '50%',
						border: `3px solid ${C.blue}`,
						scale: String(interpolate(frame, [6, 40], [0.3, 3.2], {...clamp, easing: Easing.out(Easing.cubic)})),
						opacity: interpolate(frame, [6, 40], [0.7, 0], clamp),
					}}
				/>
				<div
					style={{
						position: 'absolute',
						left: 540 - 380,
						top: 690 - 380,
						width: 760,
						height: 760,
						borderRadius: '50%',
						background: 'radial-gradient(circle, rgba(61,107,255,0.55), transparent 65%)',
						opacity: icon * (0.8 + 0.2 * Math.sin(frame / 8)),
					}}
				/>

				<Img
					name="Slide Agent icon"
					src={staticFile('icon.png')}
					style={{
						position: 'absolute',
						left: 540 - 220,
						top: 690 - 220,
						width: 440,
						height: 440,
						scale: String(icon),
						rotate: `${(1 - icon) * -18}deg`,
						filter: 'drop-shadow(0 40px 60px rgba(0,0,0,0.55))',
					}}
				/>
				<Sparkle x={830} y={420} size={90} delay={12} />
				<Sparkle x={905} y={545} size={46} delay={18} color={C.cyan} />
				<Sparkle x={215} y={880} size={56} delay={24} />
				<Sparkle x={300} y={470} size={30} delay={30} color="#9DB4FF" />

				<Interactive.Div name="Wordmark" style={{position: 'absolute', left: 0, right: 0, top: 990, display: 'flex', justifyContent: 'center'}}>
					<Kinetic
						text="Slide Agent"
						delay={16}
						stagger={6}
						style={{fontFamily: display, fontWeight: 900, fontSize: 156, letterSpacing: -5, color: C.ink, lineHeight: 1.05}}
					/>
				</Interactive.Div>

				<Interactive.Div name="Tagline" style={{position: 'absolute', left: 0, right: 0, top: 1210, display: 'flex', justifyContent: 'center'}}>
					<Kinetic
						text="Model-directed PowerPoint."
						delay={36}
						stagger={4}
						style={{fontFamily: display, fontWeight: 700, fontSize: 64, letterSpacing: -1}}
						wordStyle={gradientText(C.cyan, '#8FB0FF')}
					/>
				</Interactive.Div>

				<div
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: 1370,
						display: 'flex',
						justifyContent: 'center',
						gap: 18,
					}}
				>
					<Chip delay={60}>native .pptx</Chip>
					<Chip delay={66}>fully editable</Chip>
					<Chip delay={72}>open source</Chip>
				</div>
			</Interactive.Div>

			<Audio name="Sparkle" from={10} src={staticFile('audio/sparkle.wav')} volume={0.45} premountFor={fps} />
			<Audio name="Pop: chip 1" from={60} src={staticFile('audio/pop.wav')} volume={0.35} premountFor={fps} />
			<Audio name="Pop: chip 2" from={66} src={staticFile('audio/pop.wav')} volume={0.35} premountFor={fps} />
			<Audio name="Pop: chip 3" from={72} src={staticFile('audio/pop.wav')} volume={0.35} premountFor={fps} />
		</AbsoluteFill>
	);
};
