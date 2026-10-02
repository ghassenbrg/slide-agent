import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Easing, interpolate, interpolateColors, Interactive, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Kinetic} from '../components/Kinetic';
import {C, clamp, display, gradientText, mono} from '../theme';

// WCAG relative luminance and contrast, so the numbers on screen are real.
const luminance = (hex: string) => {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
	const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (l1 + 0.05) / (l2 + 0.05);
};

const SWATCH = '#7F9BFF';
const TEXT_BEFORE = '#FFFFFF';
const TEXT_AFTER = '#0A1A4A';
const RATIO_BEFORE = contrast(SWATCH, TEXT_BEFORE);
const RATIO_AFTER = contrast(SWATCH, TEXT_AFTER);

const Card: React.FC<{readonly delay: number; readonly title: string; readonly top: number; readonly height: number; readonly children: React.ReactNode}> = ({
	delay,
	title,
	top,
	height,
	children,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const s = spring({frame: frame - delay, fps, config: {damping: 16, stiffness: 120}});
	return (
		<div
			style={{
				position: 'absolute',
				left: 60,
				top,
				width: 960,
				height,
				borderRadius: 32,
				background: C.panel,
				border: `1.5px solid ${C.line}`,
				boxShadow: '0 40px 100px rgba(0,0,0,0.45)',
				translate: `0px ${(1 - s) * 500}px`,
				rotate: `${(1 - s) * 6}deg`,
				opacity: interpolate(frame - delay, [0, 6], [0, 1], clamp),
				overflow: 'hidden',
			}}
		>
			<div style={{position: 'absolute', left: 40, top: 32, fontFamily: mono, fontSize: 28, letterSpacing: 3, color: C.cyan}}>{title}</div>
			{children}
		</div>
	);
};

const Rung: React.FC<{readonly at: number; readonly label: string; readonly top: number}> = ({at, label, top}) => {
	const frame = useCurrentFrame();
	const on = interpolate(frame, [at, at + 6], [0, 1], clamp);
	return (
		<div style={{position: 'absolute', left: 640, top, display: 'flex', alignItems: 'center', gap: 18}}>
			<div
				style={{
					width: 30,
					height: 30,
					borderRadius: 15,
					border: `3px solid ${on > 0.5 ? C.cyan : 'rgba(140,155,208,0.4)'}`,
					backgroundColor: on > 0.5 ? C.cyan : 'transparent',
					boxShadow: on > 0.5 ? `0 0 18px ${C.cyan}` : 'none',
				}}
			/>
			<div style={{fontFamily: display, fontWeight: 700, fontSize: 40, color: on > 0.5 ? C.ink : 'rgba(140,155,208,0.55)'}}>{label}</div>
		</div>
	);
};

export const FitContrast: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const fit = interpolate(frame, [76, 104], [0, 1], {...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1)});
	const fixed = fit >= 1;
	const ratioAt = (f: number) =>
		interpolate(interpolate(f, [162, 186], [0, 1], {...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1)}), [0, 1], [RATIO_BEFORE, RATIO_AFTER]);
	const repair = interpolate(frame, [162, 186], [0, 1], {...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1)});
	const ratio = ratioAt(frame);
	// The verdict flips on the first frame the ratio clears WCAG AA (4.5:1).
	const passed = ratio >= 4.5;
	let passAt = 162;
	while (passAt < 186 && ratioAt(passAt) < 4.5) passAt++;
	const report = spring({frame: frame - 108, fps, config: {damping: 12, stiffness: 160}});
	const verdict = spring({frame: frame - passAt, fps, config: {damping: 10, stiffness: 180}});

	return (
		<AbsoluteFill>
			<Interactive.Div
				name="Camera"
				style={{
					position: 'absolute',
					inset: 0,
					scale: interpolate(frame, [0, 120, 255], [1.04, 1, 1.04], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
						output: 'perceptual-scale',
					}),
					translate: interpolate(frame, [0, 120, 255], ['0px 40px', '0px 0px', '0px -40px'], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
						easing: Easing.bezier(0.45, 0, 0.55, 1),
					}),
				}}
			>
				<Interactive.Div
					name="Label"
					style={{
						position: 'absolute',
						left: 90,
						top: 185,
						fontFamily: mono,
						fontSize: 32,
						letterSpacing: 4,
						color: C.cyan,
						opacity: interpolate(frame, [0, 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
					}}
				>
					NO SILENT TASTE
				</Interactive.Div>
				<div style={{position: 'absolute', left: 90, top: 238, width: 920}}>
					<Kinetic text="Every fix," delay={4} stagger={6} style={{fontFamily: display, fontWeight: 900, fontSize: 128, letterSpacing: -4, lineHeight: 1.02, color: C.ink}} />
					<Kinetic
						text="reported."
						delay={12}
						stagger={6}
						style={{fontFamily: display, fontWeight: 900, fontSize: 128, letterSpacing: -4, lineHeight: 1.02}}
						wordStyle={gradientText(C.cyan, C.blue)}
					/>
				</div>

				<Card delay={22} title="FIT LADDER" top={530} height={560}>
					{/* The text frame: overflows first, then the ladder fits it. */}
					<div
						style={{
							position: 'absolute',
							left: 40,
							top: 110,
							width: 560,
							height: 230,
							borderRadius: 10,
							border: `3px dashed ${fixed ? C.green : C.red}`,
							background: fixed ? 'rgba(59,227,139,0.06)' : 'rgba(255,84,112,0.07)',
						}}
					/>
					<div
						style={{
							position: 'absolute',
							left: 64,
							top: 128,
							width: interpolate(fit, [0, 1], [440, 512]),
							fontFamily: display,
							fontWeight: 800,
							fontSize: interpolate(fit, [0, 1], [56, 40]),
							lineHeight: 1.1,
							letterSpacing: -0.8,
							color: C.ink,
						}}
					>
						Northfield closes in Q3 and its volume moves to Southgate
					</div>
					<div
						style={{
							position: 'absolute',
							left: 40,
							top: 380,
							fontFamily: mono,
							fontSize: 26,
							color: fixed ? C.green : C.red,
							opacity: interpolate(frame, [40, 46], [0, 1], clamp),
						}}
					>
						{fixed ? '✓ fits · 3 lines' : '✕ overflow · +2 lines'}
					</div>
					<Rung at={56} label="measure" top={120} />
					<Rung at={66} label="reflow" top={180} />
					<Rung at={76} label="balance" top={240} />
					<Rung at={86} label="size down" top={300} />
					<div
						style={{
							position: 'absolute',
							left: 40,
							right: 40,
							bottom: 36,
							padding: '20px 26px',
							borderRadius: 18,
							backgroundColor: 'rgba(255,192,77,0.12)',
							border: `1.5px solid ${C.amber}55`,
							fontFamily: mono,
							fontSize: 27,
							color: C.amber,
							scale: String(report),
							transformOrigin: '0% 50%',
						}}
					>
						reported: title 56 → 40 pt · pin to refuse
					</div>
				</Card>

				<Card delay={128} title="CONTRAST" top={1130} height={520}>
					<div
						style={{
							position: 'absolute',
							left: 40,
							top: 100,
							width: 420,
							height: 370,
							borderRadius: 22,
							backgroundColor: SWATCH,
							padding: 34,
							display: 'flex',
							flexDirection: 'column',
							justifyContent: 'space-between',
						}}
					>
						<div style={{fontFamily: display, fontWeight: 900, fontSize: 130, lineHeight: 1, color: interpolateColors(repair, [0, 1], [TEXT_BEFORE, TEXT_AFTER])}}>Aa</div>
						<div style={{fontFamily: display, fontWeight: 700, fontSize: 40, lineHeight: 1.15, color: interpolateColors(repair, [0, 1], [TEXT_BEFORE, TEXT_AFTER])}}>
							Revenue up 12% this quarter
						</div>
					</div>
					<div style={{position: 'absolute', left: 500, top: 130, width: 420}}>
						<div style={{fontFamily: display, fontWeight: 900, fontSize: 128, letterSpacing: -4, lineHeight: 1, color: passed ? C.green : C.red}}>
							{ratio.toFixed(1)}
							<span style={{fontSize: 64, color: C.dim}}> : 1</span>
						</div>
						<div
							style={{
								marginTop: 30,
								display: 'inline-block',
								fontFamily: mono,
								fontWeight: 700,
								fontSize: 32,
								padding: '12px 22px',
								borderRadius: 12,
								color: C.bg,
								backgroundColor: passed ? C.green : C.red,
								scale: String(passed ? verdict : 1),
								opacity: interpolate(frame, [146, 152], [0, 1], clamp),
							}}
						>
							{passed ? '✓ AA PASS' : '✕ FAIL · 4.5 needed'}
						</div>
						<div style={{marginTop: 26, fontFamily: mono, fontSize: 25, lineHeight: 1.5, color: C.dim, opacity: interpolate(frame, [190, 198], [0, 1], clamp)}}>
							text → navy
							<br />
							repaired & reported
						</div>
					</div>
				</Card>

				<Interactive.Div
					name="Footer line"
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: 1700,
						textAlign: 'center',
						fontFamily: display,
						fontWeight: 600,
						fontSize: 46,
						color: C.dim,
						opacity: interpolate(frame, [204, 216], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
						translate: interpolate(frame, [204, 220], ['0px 30px', '0px 0px'], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
							easing: Easing.bezier(0.16, 1, 0.3, 1),
						}),
					}}
				>
					Your design. Never silently changed.
				</Interactive.Div>
			</Interactive.Div>

			<Audio name="Buzz: overflow" from={40} src={staticFile('audio/buzz.wav')} volume={0.3} premountFor={fps} />
			<Audio name="Tick: measure" from={56} src={staticFile('audio/tick.wav')} volume={0.6} premountFor={fps} />
			<Audio name="Tick: reflow" from={66} src={staticFile('audio/tick.wav')} volume={0.6} premountFor={fps} />
			<Audio name="Tick: balance" from={76} src={staticFile('audio/tick.wav')} volume={0.6} premountFor={fps} />
			<Audio name="Tick: size down" from={86} src={staticFile('audio/tick.wav')} volume={0.6} premountFor={fps} />
			<Audio name="Pop: report" from={108} src={staticFile('audio/pop.wav')} volume={0.35} premountFor={fps} />
			<Audio name="Whoosh: contrast card" from={124} src={staticFile('audio/whoosh-up.wav')} volume={0.3} premountFor={fps} />
			<Audio name="Buzz: contrast fail" from={146} src={staticFile('audio/buzz.wav')} volume={0.3} premountFor={fps} />
			<Audio name="Success: AA pass" from={174} src={staticFile('audio/success.wav')} volume={0.35} premountFor={fps} />
		</AbsoluteFill>
	);
};
