import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Easing, interpolate, Interactive, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Code} from '../components/Code';
import {Kinetic} from '../components/Kinetic';
import {Window} from '../components/Window';
import {C, clamp, display, gradientText, mono} from '../theme';

// Shortened from the intent example in the project README.
const INTENT = `{
  "id": "route",
  "message": "Waves fail at the pilot",
  "compose": { "grid": "12x6", "items": [
    { "at": "c1-9 r1", "role": "title",
      "text": "Every wave clears six gates" },
    { "at": "c1-12 r3-5", "row": {
      "connect": "chevron", "items": [
        { "use": "gate", "n": "01",
          "label": "Inventory" },
        { "use": "gate", "n": "04",
          "label": "Pilot", "tone": "accent" }
    ]}}
  ]}
}`;

const STEPS = [
	{at: 176, mark: '✓', label: 'measure ', detail: '14 runs from real fonts'},
	{at: 186, mark: '✓', label: 'fit     ', detail: '0 overflow · 1 reported'},
	{at: 196, mark: '✓', label: 'contrast', detail: 'AA verified · 7.2:1'},
	{at: 206, mark: '✓', label: 'validate', detail: 'ECMA-376 schemas'},
];

const Gate: React.FC<{
	readonly delay: number;
	readonly n: string;
	readonly label: string;
	readonly detail: string;
	readonly accent?: boolean;
	readonly grow?: number;
}> = ({delay, n, label, detail, accent = false, grow = 1}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const s = spring({frame: frame - delay, fps, config: {damping: 12, stiffness: 170}});
	return (
		<div
			style={{
				flex: grow,
				height: 196,
				borderRadius: 16,
				padding: '20px 18px',
				background: accent ? 'linear-gradient(160deg, #2E5BFF, #1D3BC4)' : '#FFFFFF',
				border: accent ? 'none' : '2px solid #D9DFF0',
				boxShadow: accent ? '0 16px 34px rgba(35,70,214,0.35)' : '0 6px 16px rgba(10,26,74,0.06)',
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'space-between',
				scale: String(s),
				translate: `0px ${(1 - s) * 40}px`,
				opacity: interpolate(frame - delay, [0, 4], [0, 1], clamp),
			}}
		>
			<div style={{fontFamily: mono, fontSize: 20, fontWeight: 700, color: accent ? '#8DF5E4' : C.blueDeep}}>{n}</div>
			<div>
				<div style={{fontFamily: display, fontSize: accent ? 34 : 28, fontWeight: 800, color: accent ? 'white' : '#0A1A4A', letterSpacing: -0.5}}>{label}</div>
				<div style={{fontFamily: display, fontSize: 17, fontWeight: 500, color: accent ? 'rgba(255,255,255,0.8)' : '#5A6690', marginTop: 4}}>{detail}</div>
			</div>
		</div>
	);
};

const Chevron: React.FC<{readonly delay: number}> = ({delay}) => {
	const frame = useCurrentFrame();
	return (
		<svg width="22" height="36" viewBox="0 0 22 36" style={{flexShrink: 0, opacity: interpolate(frame, [delay, delay + 6], [0, 1], clamp)}}>
			<path
				d="M4 4 L17 18 L4 32"
				fill="none"
				stroke="#2346D6"
				strokeWidth="4"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeDasharray="40"
				strokeDashoffset={interpolate(frame, [delay, delay + 8], [40, 0], clamp)}
			/>
		</svg>
	);
};

export const Build: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const terminal = spring({frame: frame - 138, fps, config: {damping: 16, stiffness: 120}});
	const pushBack = interpolate(frame, [236, 270], [0, 1], {...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1)});
	const slide = spring({frame: frame - 244, fps, config: {damping: 15, stiffness: 90}});
	const command = '$ slide-agent build --intent deck.intent.json';
	const commandChars = Math.floor(interpolate(frame, [148, 168], [0, command.length], clamp));
	const badge = spring({frame: frame - 318, fps, config: {damping: 12, stiffness: 150}});
	const cursorT = interpolate(frame, [306, 330], [0, 1], {...clamp, easing: Easing.bezier(0.45, 0, 0.2, 1)});
	const clickPulse = interpolate(frame, [331, 334, 340], [1, 0.8, 1], clamp);
	const selection = spring({frame: frame - 333, fps, config: {damping: 14, stiffness: 200}});

	return (
		<AbsoluteFill style={{perspective: 1800}}>
			<Interactive.Div
				name="Camera"
				style={{
					position: 'absolute',
					inset: 0,
					scale: interpolate(frame, [0, 140, 236, 300, 375], [1.06, 1, 1.02, 1, 1.05], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
						output: 'perceptual-scale',
					}),
					rotate: interpolate(frame, [0, 375], ['0.6deg', '-0.6deg'], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					}),
				}}
			>
				<div style={{position: 'absolute', left: 80, top: 150, width: 940}}>
					<Kinetic
						text="Intent in."
						delay={2}
						stagger={6}
						exitAt={234}
						style={{fontFamily: display, fontWeight: 900, fontSize: 124, letterSpacing: -4, lineHeight: 1.02, color: C.ink}}
					/>
				</div>
				<div style={{position: 'absolute', left: 80, top: 150, width: 940}}>
					<Kinetic
						text="PowerPoint out."
						delay={248}
						stagger={6}
						style={{fontFamily: display, fontWeight: 900, fontSize: 116, letterSpacing: -4, lineHeight: 1.02}}
						wordStyle={gradientText(C.cyan, C.blue)}
					/>
				</div>

				{/* The editor and terminal fall back into depth once the slide arrives. */}
				<div
					style={{
						position: 'absolute',
						inset: 0,
						transform: `translateY(${pushBack * -260}px) scale(${1 - pushBack * 0.35}) rotateX(${pushBack * 32}deg)`,
						transformOrigin: '50% 30%',
						opacity: 1 - pushBack * 0.8,
						filter: `blur(${pushBack * 5}px)`,
					}}
				>
					<Window
						title="deck.intent.json"
						style={{
							left: 60,
							top: 350,
							width: 960,
							translate: `0px ${interpolate(frame, [0, 18], [120, 0], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)})}px`,
							opacity: interpolate(frame, [0, 10], [0, 1], clamp),
						}}
					>
						<Code code={INTENT} chars={interpolate(frame, [8, 136], [0, INTENT.length], clamp)} caretOn={frame < 140 && Math.floor(frame / 8) % 2 === 0} />
					</Window>

					<Window
						title="zsh — slide-agent"
						accent={C.cyan}
						style={{
							left: 60,
							top: 1140,
							width: 960,
							translate: `0px ${(1 - terminal) * 900}px`,
						}}
						bodyStyle={{fontFamily: mono, fontSize: 27, lineHeight: 1.75, color: C.ink, minHeight: 380}}
					>
						<div>
							<span style={{color: C.cyan}}>{command.slice(0, 1)}</span>
							{command.slice(1, commandChars)}
							{frame < 172 ? <span style={{display: 'inline-block', width: 14, height: 30, backgroundColor: C.ink, verticalAlign: 'middle', opacity: Math.floor(frame / 6) % 2}} /> : null}
						</div>
						{STEPS.map((step) => {
							const s = spring({frame: frame - step.at, fps, config: {damping: 200}});
							return (
								<div key={step.label} style={{display: 'flex', gap: 22, opacity: s, translate: `${(1 - s) * -40}px 0px`, whiteSpace: 'pre'}}>
									<span style={{color: C.green}}>{step.mark}</span>
									<span style={{color: '#8FB0FF'}}>{step.label}</span>
									<span style={{color: C.dim}}>{step.detail}</span>
								</div>
							);
						})}
						<div
							style={{
								marginTop: 6,
								color: C.cyan,
								fontWeight: 700,
								opacity: interpolate(frame, [218, 224], [0, 1], clamp),
							}}
						>
							→ out/deck.pptx <span style={{color: C.bg, backgroundColor: C.cyan, padding: '2px 12px', borderRadius: 8, marginLeft: 12}}>ready</span>
						</div>
					</Window>
				</div>

				{/* The built slide flies forward out of the stack. */}
				<div
					style={{
						position: 'absolute',
						left: 60,
						top: 640,
						width: 960,
						height: 540,
						borderRadius: 22,
						overflow: 'hidden',
						background: '#F6F7FB',
						boxShadow: `0 60px 140px rgba(0,0,0,0.6), 0 0 120px rgba(61,107,255,${0.35 * slide})`,
						transform: `translateY(${(1 - slide) * 420}px) scale(${0.55 + slide * 0.45}) rotateX(${(1 - slide) * 55}deg)`,
						opacity: interpolate(frame, [244, 252], [0, 1], clamp),
					}}
				>
					<div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, background: `linear-gradient(${C.blue}, ${C.cyan})`}} />
					<div style={{position: 'absolute', left: 56, top: 48, fontFamily: mono, fontSize: 17, fontWeight: 700, letterSpacing: 3, color: C.blueDeep}}>
						ZERO-TRUST ROLLOUT / 04
					</div>
					<div
						style={{
							position: 'absolute',
							left: 56,
							top: 84,
							width: 760,
							fontFamily: display,
							fontSize: 48,
							fontWeight: 800,
							lineHeight: 1.08,
							letterSpacing: -1.2,
							color: '#0A1A4A',
							clipPath: `inset(0 ${100 - interpolate(frame, [262, 280], [0, 100], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)})}% 0 0)`,
						}}
					>
						Every wave clears the same six gates
					</div>
					<div style={{position: 'absolute', left: 56, right: 56, top: 258, display: 'flex', alignItems: 'center', gap: 12}}>
						<Gate delay={282} n="01" label="Inventory" detail="what talks to what" />
						<Chevron delay={290} />
						<Gate delay={288} n="02" label="Map" detail="owners & flows" />
						<Chevron delay={296} />
						<Gate delay={294} n="03" label="Harden" detail="policy per edge" />
						<Chevron delay={302} />
						<Gate delay={300} n="04" label="Pilot" detail="one business unit" accent grow={1.9} />
					</div>
					<div style={{position: 'absolute', left: 56, bottom: 30, fontFamily: mono, fontSize: 15, color: '#8A93B5'}}>Waves fail at the pilot</div>

					{/* Selection handles: the title is a real, editable placeholder. */}
					<div
						style={{
							position: 'absolute',
							left: 46,
							top: 76,
							width: 780,
							height: 124,
							border: `3px solid ${C.blue}`,
							borderRadius: 4,
							opacity: selection,
						}}
					>
						{[
							[-8, -8],
							[386, -8],
							[772, -8],
							[-8, 56],
							[772, 56],
							[-8, 112],
							[386, 112],
							[772, 112],
						].map(([x, y], i) => (
							<div key={i} style={{position: 'absolute', left: x, top: y, width: 14, height: 14, backgroundColor: 'white', border: `3px solid ${C.blue}`, borderRadius: 3}} />
						))}
					</div>
				</div>

				<div
					style={{
						position: 'absolute',
						left: 60 + 46,
						top: 640 - 58,
						fontFamily: mono,
						fontSize: 24,
						fontWeight: 700,
						color: 'white',
						backgroundColor: C.blue,
						padding: '8px 16px',
						borderRadius: 10,
						scale: String(selection),
						transformOrigin: '0% 100%',
					}}
				>
					Title placeholder · editable
				</div>

				{/* Cursor. */}
				<svg
					width="54"
					height="54"
					viewBox="0 0 24 24"
					style={{
						position: 'absolute',
						left: interpolate(cursorT, [0, 1], [920, 470]),
						top: interpolate(cursorT, [0, 1], [1750, 770]),
						scale: String(clickPulse),
						opacity: interpolate(frame, [304, 310, 360, 368], [0, 1, 1, 0], clamp),
						filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.5))',
					}}
				>
					<path d="M4 2 L4 19 L8.5 15 L11.5 22 L14.5 20.8 L11.6 14 L18 14 Z" fill="white" stroke="#0A1A4A" strokeWidth="1.4" strokeLinejoin="round" />
				</svg>

				{/* Output badge. */}
				<div
					style={{
						position: 'absolute',
						left: 60,
						top: 1260,
						width: 960,
						padding: '30px 34px',
						borderRadius: 28,
						background: C.panel,
						border: `1.5px solid ${C.line}`,
						display: 'flex',
						alignItems: 'center',
						gap: 28,
						scale: String(badge),
						opacity: interpolate(frame, [318, 322], [0, 1], clamp),
					}}
				>
					<div
						style={{
							width: 96,
							height: 116,
							borderRadius: 14,
							background: `linear-gradient(160deg, ${C.blue}, ${C.blueDeep})`,
							display: 'flex',
							alignItems: 'flex-end',
							justifyContent: 'center',
							paddingBottom: 14,
							fontFamily: mono,
							fontWeight: 700,
							fontSize: 22,
							color: 'white',
							flexShrink: 0,
							clipPath: 'polygon(0 0, 70% 0, 100% 22%, 100% 100%, 0 100%)',
						}}
					>
						.pptx
					</div>
					<div style={{flex: 1}}>
						<div style={{fontFamily: display, fontWeight: 800, fontSize: 50, color: C.ink, letterSpacing: -1}}>deck.pptx</div>
						<div style={{fontFamily: mono, fontSize: 25, color: C.dim, marginTop: 8, lineHeight: 1.5}}>
							theme colours · embedded fonts
							<br />
							native charts · real placeholders
						</div>
					</div>
				</div>
			</Interactive.Div>

			<Audio name="Typing: intent" from={8} durationInFrames={128} src={staticFile('audio/typing.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Whoosh: terminal" from={134} src={staticFile('audio/whoosh-up.wav')} volume={0.35} premountFor={fps} />
			<Audio name="Typing: command" from={148} durationInFrames={20} src={staticFile('audio/typing-short.wav')} volume={0.45} premountFor={fps} />
			<Audio name="Tick: measure" from={176} src={staticFile('audio/tick.wav')} volume={0.6} premountFor={fps} />
			<Audio name="Tick: fit" from={186} src={staticFile('audio/tick.wav')} volume={0.6} premountFor={fps} />
			<Audio name="Tick: contrast" from={196} src={staticFile('audio/tick.wav')} volume={0.6} premountFor={fps} />
			<Audio name="Tick: validate" from={206} src={staticFile('audio/tick.wav')} volume={0.6} premountFor={fps} />
			<Audio name="Pop: ready" from={218} src={staticFile('audio/pop.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Whoosh: slide flies in" from={238} src={staticFile('audio/whoosh.wav')} volume={0.45} premountFor={fps} />
			<Audio name="Pop: gate 01" from={282} src={staticFile('audio/pop.wav')} volume={0.3} premountFor={fps} />
			<Audio name="Pop: gate 02" from={288} src={staticFile('audio/pop.wav')} volume={0.3} premountFor={fps} />
			<Audio name="Pop: gate 03" from={294} src={staticFile('audio/pop.wav')} volume={0.3} premountFor={fps} />
			<Audio name="Pop: gate 04" from={300} src={staticFile('audio/pop.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Success: deck.pptx" from={318} src={staticFile('audio/success.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Click: select title" from={331} src={staticFile('audio/click.wav')} volume={0.55} premountFor={fps} />
		</AbsoluteFill>
	);
};
