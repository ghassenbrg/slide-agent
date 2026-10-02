import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Easing, interpolate, Interactive, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Kinetic} from '../components/Kinetic';
import {C, clamp, display, gradientText} from '../theme';

const TemplateSlide: React.FC<{
	readonly delay: number;
	readonly x: number;
	readonly y: number;
	readonly rotate: number;
}> = ({delay, x, y, rotate}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const s = spring({frame: frame - delay, fps, config: {damping: 13, stiffness: 150}});
	// A little "nope" shake when the buzzer goes.
	const shake = frame > 118 && frame < 132 ? Math.sin(frame * 2.4) * 10 * (1 - (frame - 118) / 14) : 0;

	return (
		<div
			style={{
				position: 'absolute',
				left: x - 290,
				top: y - 165,
				width: 580,
				height: 326,
				borderRadius: 14,
				backgroundColor: '#E8E6E1',
				boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
				padding: '44px 46px',
				scale: String(s),
				rotate: `${rotate * s}deg`,
				translate: `${shake}px ${(1 - s) * 200}px`,
				opacity: interpolate(frame - delay, [0, 5], [0, 1], clamp),
				filter: `grayscale(${interpolate(frame, [118, 130], [0, 1], clamp)})`,
			}}
		>
			<div style={{fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 34, color: '#8A8780', marginBottom: 30}}>
				Click to add title
			</div>
			{[0.86, 0.7, 0.78].map((w, i) => (
				<div key={i} style={{display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20}}>
					<div style={{width: 10, height: 10, borderRadius: 5, backgroundColor: '#A9A69F'}} />
					<div style={{height: 14, width: `${w * 100}%`, borderRadius: 7, backgroundColor: '#CFCCC5'}} />
				</div>
			))}
		</div>
	);
};

export const Hook: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	return (
		<AbsoluteFill>
			<Interactive.Div
				name="Camera"
				style={{
					position: 'absolute',
					inset: 0,
					scale: interpolate(frame, [0, 165], [1, 1.08], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
						output: 'perceptual-scale',
					}),
					rotate: interpolate(frame, [0, 165], ['-1deg', '1deg'], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					}),
					transformOrigin: '50% 40%',
				}}
			>
				<Interactive.Div
					name="Line pair: model"
					style={{
						position: 'absolute',
						left: 90,
						top: 300,
						opacity: interpolate(frame, [58, 72], [1, 0.32], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
						}),
						translate: interpolate(frame, [58, 76], ['0px 0px', '0px -60px'], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
							easing: Easing.bezier(0.16, 1, 0.3, 1),
						}),
					}}
				>
					<Kinetic
						text="Your model"
						delay={6}
						mode="slam"
						stagger={5}
						style={{fontFamily: display, fontWeight: 900, fontSize: 150, lineHeight: 1.02, color: C.ink, letterSpacing: -4}}
					/>
					<Kinetic
						text="has taste."
						delay={22}
						mode="slam"
						stagger={5}
						style={{fontFamily: display, fontWeight: 900, fontSize: 150, lineHeight: 1.02, letterSpacing: -4}}
						wordStyle={gradientText(C.cyan, C.blue)}
					/>
				</Interactive.Div>

				<Interactive.Div name="Line pair: slides" style={{position: 'absolute', left: 90, top: 640}}>
					<Kinetic
						text="Your slides"
						delay={64}
						mode="slam"
						stagger={5}
						style={{fontFamily: display, fontWeight: 900, fontSize: 150, lineHeight: 1.02, color: C.ink, letterSpacing: -4}}
					/>
					<Kinetic
						text="don't."
						delay={84}
						mode="slam"
						style={{fontFamily: display, fontWeight: 900, fontSize: 150, lineHeight: 1.02, color: C.red, letterSpacing: -4}}
					/>
				</Interactive.Div>

				<TemplateSlide delay={96} x={420} y={1330} rotate={-11} />
				<TemplateSlide delay={103} x={640} y={1450} rotate={5} />
				<TemplateSlide delay={110} x={500} y={1600} rotate={-3} />

				<Interactive.Div
					name="Same template caption"
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: 1800,
						textAlign: 'center',
						fontFamily: display,
						fontWeight: 600,
						fontSize: 46,
						color: C.dim,
						opacity: interpolate(frame, [120, 130], [0, 1], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
						}),
						translate: interpolate(frame, [120, 134], ['0px 30px', '0px 0px'], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
							easing: Easing.bezier(0.16, 1, 0.3, 1),
						}),
					}}
				>
					Same template. Every time.
				</Interactive.Div>
			</Interactive.Div>

			<Audio name="Slam: Your model" from={6} src={staticFile('audio/slam.wav')} volume={0.55} premountFor={fps} />
			<Audio name="Slam: has taste" from={22} src={staticFile('audio/slam.wav')} volume={0.55} premountFor={fps} />
			<Audio name="Slam: Your slides" from={64} src={staticFile('audio/slam.wav')} volume={0.55} premountFor={fps} />
			<Audio name="Slam: don't" from={84} src={staticFile('audio/slam.wav')} volume={0.7} premountFor={fps} />
			<Audio name="Pop: template 1" from={96} src={staticFile('audio/pop.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Pop: template 2" from={103} src={staticFile('audio/pop.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Pop: template 3" from={110} src={staticFile('audio/pop.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Buzz" from={118} src={staticFile('audio/buzz.wav')} volume={0.35} premountFor={fps} />
		</AbsoluteFill>
	);
};
