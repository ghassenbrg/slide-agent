import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Easing, interpolate, Interactive, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Kinetic} from '../components/Kinetic';
import {C, clamp, display, gradientText, mono} from '../theme';

const Glyph: React.FC<{readonly kind: string}> = ({kind}) => {
	const box: React.CSSProperties = {width: 64, height: 64, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(61,107,255,0.18)', flexShrink: 0};
	if (kind === 'palette') {
		return (
			<div style={{...box, gap: 4}}>
				<div style={{width: 14, height: 30, borderRadius: 7, backgroundColor: C.cyan}} />
				<div style={{width: 14, height: 30, borderRadius: 7, backgroundColor: C.blue}} />
				<div style={{width: 14, height: 30, borderRadius: 7, backgroundColor: C.amber}} />
			</div>
		);
	}
	if (kind === 'type') {
		return <div style={{...box, fontFamily: display, fontWeight: 800, fontSize: 32, color: C.ink}}>Aa</div>;
	}
	if (kind === 'grid') {
		return (
			<div style={{...box, display: 'grid', gridTemplateColumns: '14px 14px', gap: 5, alignContent: 'center', justifyContent: 'center'}}>
				<div style={{width: 14, height: 14, borderRadius: 3, backgroundColor: C.cyan}} />
				<div style={{width: 14, height: 14, borderRadius: 3, backgroundColor: '#8FB0FF'}} />
				<div style={{width: 14, height: 14, borderRadius: 3, backgroundColor: '#8FB0FF'}} />
				<div style={{width: 14, height: 14, borderRadius: 3, backgroundColor: '#8FB0FF'}} />
			</div>
		);
	}
	if (kind === 'rhythm') {
		return (
			<div style={{...box, gap: 5, alignItems: 'flex-end', paddingBottom: 16}}>
				{[18, 30, 22, 34].map((h, i) => (
					<div key={i} style={{width: 7, height: h, borderRadius: 4, backgroundColor: i === 3 ? C.cyan : '#8FB0FF'}} />
				))}
			</div>
		);
	}
	if (kind === 'emphasis') {
		return (
			<div style={box}>
				<div style={{width: 30, height: 30, borderRadius: 15, backgroundColor: C.amber, boxShadow: `0 0 18px ${C.amber}`}} />
			</div>
		);
	}
	return (
		<div style={box}>
			<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="2.2" strokeLinecap="round">
				<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" />
			</svg>
		</div>
	);
};

const DesignChip: React.FC<{readonly delay: number; readonly kind: string; readonly label: string}> = ({delay, kind, label}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const s = spring({frame: frame - delay, fps, config: {damping: 12, stiffness: 160}});
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 22,
				padding: '22px 26px',
				borderRadius: 26,
				background: C.panel,
				border: `1.5px solid ${C.line}`,
				boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
				scale: String(s),
				rotate: `${(1 - s) * -8}deg`,
				opacity: interpolate(frame - delay, [0, 4], [0, 1], clamp),
			}}
		>
			<Glyph kind={kind} />
			<div style={{fontFamily: display, fontWeight: 700, fontSize: 44, color: C.ink, letterSpacing: -0.5}}>{label}</div>
		</div>
	);
};

const CheckRow: React.FC<{readonly delay: number; readonly label: string; readonly value: string}> = ({delay, label, value}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const enter = spring({frame: frame - delay, fps, config: {damping: 200}});
	const bar = interpolate(frame, [delay + 2, delay + 14], [0, 1], {...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1)});
	const check = spring({frame: frame - delay - 14, fps, config: {damping: 10, stiffness: 200}});
	return (
		<div
			style={{
				position: 'relative',
				display: 'flex',
				alignItems: 'center',
				gap: 26,
				padding: '28px 32px',
				borderRadius: 26,
				background: C.panel,
				border: `1.5px solid ${C.line}`,
				overflow: 'hidden',
				translate: `${(1 - enter) * -160}px 0px`,
				opacity: enter,
			}}
		>
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					bottom: 0,
					width: `${bar * 100}%`,
					background: 'linear-gradient(90deg, rgba(46,230,201,0.05), rgba(46,230,201,0.16))',
				}}
			/>
			<div
				style={{
					width: 58,
					height: 58,
					borderRadius: 29,
					backgroundColor: C.cyan,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					scale: String(check),
					boxShadow: `0 0 26px ${C.cyan}88`,
					flexShrink: 0,
				}}
			>
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.bg} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
					<path d="M5 12.5l4.5 4.5L19 7.5" />
				</svg>
			</div>
			<div style={{flex: 1, fontFamily: display, fontWeight: 700, fontSize: 46, color: C.ink, letterSpacing: -0.5}}>{label}</div>
			<div style={{fontFamily: mono, fontSize: 28, color: C.cyan, opacity: check}}>{value}</div>
		</div>
	);
};

export const DirectsComputes: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	return (
		<AbsoluteFill style={{overflow: 'hidden'}}>
			{/* A tall canvas the camera pans down: director on top, engine below. */}
			<Interactive.Div
				name="Camera"
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					width: 1080,
					height: 2700,
					translate: interpolate(frame, [104, 146], ['0px 0px', '0px -780px'], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
						easing: Easing.bezier(0.65, 0, 0.35, 1),
					}),
					scale: interpolate(frame, [0, 104, 125, 146, 255], [1.04, 1, 0.94, 1, 1.03], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
						output: 'perceptual-scale',
					}),
				}}
			>
				<Interactive.Div
					name="Director label"
					style={{
						position: 'absolute',
						left: 90,
						top: 250,
						fontFamily: mono,
						fontSize: 32,
						letterSpacing: 4,
						color: C.cyan,
						opacity: interpolate(frame, [2, 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
					}}
				>
					01 — THE MODEL DIRECTS
				</Interactive.Div>
				<div style={{position: 'absolute', left: 90, top: 310, width: 920}}>
					<Kinetic
						text="You decide"
						delay={6}
						stagger={5}
						style={{fontFamily: display, fontWeight: 900, fontSize: 132, letterSpacing: -4, lineHeight: 1.02, color: C.ink}}
					/>
					<Kinetic
						text="the design."
						delay={14}
						stagger={5}
						style={{fontFamily: display, fontWeight: 900, fontSize: 132, letterSpacing: -4, lineHeight: 1.02}}
						wordStyle={gradientText(C.cyan, C.blue)}
					/>
				</div>
				<div
					style={{
						position: 'absolute',
						left: 70,
						top: 660,
						width: 940,
						display: 'grid',
						gridTemplateColumns: '1fr 1fr',
						gap: 22,
					}}
				>
					<DesignChip delay={34} kind="concept" label="Concept" />
					<DesignChip delay={41} kind="palette" label="Palette" />
					<DesignChip delay={48} kind="type" label="Typefaces" />
					<DesignChip delay={55} kind="grid" label="Layout" />
					<DesignChip delay={62} kind="emphasis" label="Emphasis" />
					<DesignChip delay={69} kind="rhythm" label="Pacing" />
				</div>

				{/* Spine that draws as the camera travels between the halves. */}
				<div
					style={{
						position: 'absolute',
						left: 538,
						top: 1120,
						width: 4,
						height: 420,
						borderRadius: 2,
						background: `linear-gradient(${C.cyan}, ${C.blue})`,
						boxShadow: `0 0 24px ${C.cyan}`,
						scale: `1 ${interpolate(frame, [96, 140], [0, 1], {...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1)})}`,
						transformOrigin: '50% 0%',
					}}
				/>
				<div
					style={{
						position: 'absolute',
						left: 540 - 18,
						top: 1540 - 18,
						width: 36,
						height: 36,
						borderRadius: 18,
						backgroundColor: C.cyan,
						boxShadow: `0 0 40px ${C.cyan}`,
						scale: String(spring({frame: frame - 140, fps, config: {damping: 10}})),
					}}
				/>

				<Interactive.Div
					name="Engine label"
					style={{
						position: 'absolute',
						left: 90,
						top: 1640,
						fontFamily: mono,
						fontSize: 32,
						letterSpacing: 4,
						color: C.cyan,
						opacity: interpolate(frame, [134, 146], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
					}}
				>
					02 — THE ENGINE COMPUTES
				</Interactive.Div>
				<div style={{position: 'absolute', left: 90, top: 1700, width: 920}}>
					<Kinetic
						text="It solves"
						delay={138}
						stagger={5}
						style={{fontFamily: display, fontWeight: 900, fontSize: 132, letterSpacing: -4, lineHeight: 1.02, color: C.ink}}
					/>
					<Kinetic
						text="the rest."
						delay={146}
						stagger={5}
						style={{fontFamily: display, fontWeight: 900, fontSize: 132, letterSpacing: -4, lineHeight: 1.02}}
						wordStyle={gradientText(C.cyan, C.blue)}
					/>
				</div>
				<div style={{position: 'absolute', left: 70, top: 2030, width: 940, display: 'flex', flexDirection: 'column', gap: 20}}>
					<CheckRow delay={160} label="Geometry" value="12 × 6 grid" />
					<CheckRow delay={172} label="Text fitting" value="0 overflow" />
					<CheckRow delay={184} label="Contrast" value="AA · 7.2:1" />
					<CheckRow delay={196} label="Native OOXML" value="ECMA-376" />
				</div>
			</Interactive.Div>

			<Audio name="Pop: Concept" from={34} src={staticFile('audio/pop.wav')} volume={0.3} premountFor={fps} />
			<Audio name="Pop: Palette" from={41} src={staticFile('audio/pop.wav')} volume={0.3} premountFor={fps} />
			<Audio name="Pop: Typefaces" from={48} src={staticFile('audio/pop.wav')} volume={0.3} premountFor={fps} />
			<Audio name="Pop: Layout" from={55} src={staticFile('audio/pop.wav')} volume={0.3} premountFor={fps} />
			<Audio name="Pop: Emphasis" from={62} src={staticFile('audio/pop.wav')} volume={0.3} premountFor={fps} />
			<Audio name="Pop: Pacing" from={69} src={staticFile('audio/pop.wav')} volume={0.3} premountFor={fps} />
			<Audio name="Whoosh: camera pan" from={100} src={staticFile('audio/whoosh.wav')} volume={0.35} premountFor={fps} />
			<Audio name="Tick: Geometry" from={174} src={staticFile('audio/click.wav')} volume={0.45} premountFor={fps} />
			<Audio name="Tick: Text fitting" from={186} src={staticFile('audio/click.wav')} volume={0.45} premountFor={fps} />
			<Audio name="Tick: Contrast" from={198} src={staticFile('audio/click.wav')} volume={0.45} premountFor={fps} />
			<Audio name="Tick: OOXML" from={210} src={staticFile('audio/click.wav')} volume={0.45} premountFor={fps} />
		</AbsoluteFill>
	);
};
