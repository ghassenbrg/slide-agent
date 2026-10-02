import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, Interactive, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Kinetic} from '../components/Kinetic';
import {Sparkle} from '../components/Sparkle';
import {C, clamp, display, gradientText, mono} from '../theme';

const HOSTS = ['Claude Code', 'Codex', 'Copilot', 'Gemini', 'Cursor', 'any MCP client'];

export const Outro: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const icon = spring({frame: frame - 4, fps, config: {damping: 12, stiffness: 120}});
	const pill = spring({frame: frame - 44, fps, config: {damping: 14, stiffness: 150}});
	const command = 'npm i @slide-agent/core';
	const typed = Math.floor(interpolate(frame, [54, 78], [0, command.length], clamp));

	return (
		<AbsoluteFill>
			<Interactive.Div
				name="Camera"
				style={{
					position: 'absolute',
					inset: 0,
					scale: interpolate(frame, [0, 225], [1.1, 1], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
						output: 'perceptual-scale',
						easing: Easing.bezier(0.16, 1, 0.3, 1),
					}),
				}}
			>
				<div
					style={{
						position: 'absolute',
						left: 540 - 260,
						top: 390 - 260,
						width: 520,
						height: 520,
						borderRadius: '50%',
						background: 'radial-gradient(circle, rgba(61,107,255,0.5), transparent 65%)',
						opacity: icon,
					}}
				/>
				<Img
					name="Icon"
					src={staticFile('icon.png')}
					style={{
						position: 'absolute',
						left: 540 - 150,
						top: 390 - 150,
						width: 300,
						height: 300,
						scale: String(icon),
						rotate: `${(1 - icon) * 20}deg`,
						filter: 'drop-shadow(0 30px 50px rgba(0,0,0,0.5))',
					}}
				/>
				<Sparkle x={735} y={230} size={64} delay={14} />
				<Sparkle x={330} y={520} size={36} delay={20} color={C.cyan} />

				<div style={{position: 'absolute', left: 0, right: 0, top: 610, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
					<Kinetic text="Your model directs." delay={14} stagger={5} style={{fontFamily: display, fontWeight: 900, fontSize: 96, letterSpacing: -3, lineHeight: 1.08, color: C.ink, justifyContent: 'center'}} />
					<Kinetic
						text="The engine computes."
						delay={26}
						stagger={5}
						style={{fontFamily: display, fontWeight: 900, fontSize: 96, letterSpacing: -3, lineHeight: 1.08, justifyContent: 'center'}}
						wordStyle={gradientText(C.cyan, C.blue)}
					/>
				</div>

				<div
					style={{
						position: 'absolute',
						left: 100,
						right: 100,
						top: 900,
						padding: '34px 40px',
						borderRadius: 26,
						background: 'linear-gradient(180deg, rgba(20,34,88,0.95), rgba(9,18,52,0.95))',
						border: `2px solid ${C.cyan}66`,
						boxShadow: `0 0 60px ${C.cyan}33, 0 30px 80px rgba(0,0,0,0.5)`,
						fontFamily: mono,
						fontSize: 44,
						color: C.ink,
						scale: String(pill),
						opacity: interpolate(frame, [44, 50], [0, 1], clamp),
					}}
				>
					<span style={{color: C.cyan}}>$ </span>
					{command.slice(0, typed)}
					<span style={{display: 'inline-block', width: 22, height: 46, marginLeft: 4, backgroundColor: C.cyan, verticalAlign: 'middle', opacity: Math.floor(frame / 8) % 2}} />
				</div>

				<Interactive.Div
					name="Works with label"
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: 1130,
						textAlign: 'center',
						fontFamily: mono,
						fontSize: 30,
						letterSpacing: 4,
						color: C.dim,
						opacity: interpolate(frame, [84, 94], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
					}}
				>
					WORKS WITH
				</Interactive.Div>
				<div style={{position: 'absolute', left: 80, right: 80, top: 1195, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18}}>
					{HOSTS.map((host, i) => {
						const s = spring({frame: frame - 90 - i * 4, fps, config: {damping: 12, stiffness: 170}});
						return (
							<div
								key={host}
								style={{
									fontFamily: display,
									fontWeight: 700,
									fontSize: 40,
									color: C.ink,
									padding: '16px 30px',
									borderRadius: 999,
									background: 'rgba(61,107,255,0.16)',
									border: `1.5px solid ${C.line}`,
									scale: String(s),
									opacity: interpolate(frame - 90 - i * 4, [0, 4], [0, 1], clamp),
								}}
							>
								{host}
							</div>
						);
					})}
				</div>

				<Interactive.Div
					name="Repository"
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: 1560,
						textAlign: 'center',
						opacity: interpolate(frame, [126, 140], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
						translate: interpolate(frame, [126, 144], ['0px 40px', '0px 0px'], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
							easing: Easing.bezier(0.16, 1, 0.3, 1),
						}),
					}}
				>
					<div style={{fontFamily: display, fontWeight: 800, fontSize: 50, color: C.ink, letterSpacing: -0.5}}>github.com/ghassenbrg/slide-agent</div>
					<div style={{fontFamily: mono, fontSize: 30, color: C.dim, marginTop: 18, letterSpacing: 2}}>MIT · open source · Node 22+</div>
				</Interactive.Div>
			</Interactive.Div>

			<Audio name="Sparkle" from={12} src={staticFile('audio/sparkle.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Pop: install pill" from={44} src={staticFile('audio/pop.wav')} volume={0.35} premountFor={fps} />
			<Audio name="Typing: install" from={54} durationInFrames={24} src={staticFile('audio/typing-short.wav')} volume={0.45} premountFor={fps} />
			<Audio name="Tick: Claude Code" from={90} src={staticFile('audio/tick.wav')} volume={0.5} premountFor={fps} />
			<Audio name="Tick: Codex" from={94} src={staticFile('audio/tick.wav')} volume={0.5} premountFor={fps} />
			<Audio name="Tick: Copilot" from={98} src={staticFile('audio/tick.wav')} volume={0.5} premountFor={fps} />
			<Audio name="Tick: Gemini" from={102} src={staticFile('audio/tick.wav')} volume={0.5} premountFor={fps} />
			<Audio name="Tick: Cursor" from={106} src={staticFile('audio/tick.wav')} volume={0.5} premountFor={fps} />
			<Audio name="Tick: MCP" from={110} src={staticFile('audio/tick.wav')} volume={0.5} premountFor={fps} />
			<Audio name="Success: repo" from={128} src={staticFile('audio/success.wav')} volume={0.3} premountFor={fps} />
		</AbsoluteFill>
	);
};
