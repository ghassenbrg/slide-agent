import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {StageTitle, typed} from '../components/ui';
import {deck} from '../deck';
import {accentWord, C, clamp, deckFonts, display, ease, mono, shadow} from '../theme';

// 0:24.5–0:30.5 — the storyline (a job for every slide: each card is the
// slide's real `message`), then the design language this deck got — the
// real concept, palette and typeface from launch/demo/intent.json.

const CONCEPT =
	'A modern engineering review: crisp white cards on a cool canvas, deep navy headlines with one word in electric indigo, numbers set in mono like live metrics, and every idea anchored by a round tinted icon badge.';
const PALETTE: [string, string][] = [
	['canvas', '#F5F7FB'],
	['navy', '#0B1B33'],
	['slate', '#55627A'],
	['indigo', '#4F46E5'],
	['cyan', '#0891B2'],
	['violet', '#7C3AED'],
	['green', '#15803D'],
	['amber', '#B45309'],
];
const JAKARTA = deckFonts['Plus Jakarta Sans'];
const TEAL = '#4F46E5';
const NAVY = '#0B1B33';

const DESIGN = 90; // the plan gives way to the design
const APPLY = 138; // the design washes over the storyline

const N = deck.slides.length;
const GAP = 14;
const CARD_W = (1680 - (N - 1) * GAP) / N;
const CARD_H = 330;

export const Plan: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const toDesign = interpolate(f, [DESIGN, DESIGN + 22], [0, 1], {...clamp, easing: ease.inOut});
	const panel = interpolate(f, [DESIGN + 10, DESIGN + 28], [0, 1], {...clamp, easing: ease.out});
	const exit = interpolate(f, [168, 180], [0, 1], {...clamp, easing: ease.in});

	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			<StageTitle n="01" label="PLAN" at={2} out={DESIGN - 8}>
				Every slide gets a <span style={accentWord()}>job.</span>
			</StageTitle>
			<StageTitle n="02" label="DESIGN" at={DESIGN + 4}>
				A look made for this deck. <span style={accentWord()}>Not a template.</span>
			</StageTitle>

			{/* the design language */}
			<div style={{position: 'absolute', left: 120, top: 330, width: 780, opacity: panel, translate: `0px ${(1 - panel) * 30}px`}}>
				<div style={{fontFamily: mono, fontSize: 20, letterSpacing: '0.14em', color: C.dim}}>CONCEPT</div>
				<div style={{fontFamily: JAKARTA, fontWeight: 600, fontSize: 36, lineHeight: 1.26, letterSpacing: '-0.01em', color: NAVY, marginTop: 14, minHeight: 220}}>
					“{typed(CONCEPT, f, DESIGN + 14, 120)}
					{f > DESIGN + 14 + (CONCEPT.length / 120) * 30 ? '”' : ''}
				</div>
			</div>
			<div style={{position: 'absolute', left: 980, top: 330, width: 820, opacity: panel, translate: `0px ${(1 - panel) * 30}px`}}>
				<div style={{fontFamily: mono, fontSize: 20, letterSpacing: '0.14em', color: C.dim}}>PALETTE</div>
				<div style={{display: 'flex', gap: 14, marginTop: 18}}>
					{PALETTE.map(([name, h], i) => {
						const t = interpolate(f, [DESIGN + 16 + i * 3, DESIGN + 30 + i * 3], [0, 1], {...clamp, easing: ease.out});
						return (
							<div key={name} style={{textAlign: 'center', opacity: t, scale: interpolate(t, [0, 1], [0.5, 1])}}>
								<div style={{width: 76, height: 76, borderRadius: 76, background: h, border: `1px solid ${C.line}`}} />
								<div style={{fontFamily: mono, fontSize: 15, color: C.inkSoft, marginTop: 8}}>{name}</div>
							</div>
						);
					})}
				</div>
				<div style={{fontFamily: mono, fontSize: 20, letterSpacing: '0.14em', color: C.dim, marginTop: 34}}>TYPE</div>
				<div style={{display: 'flex', gap: 56, marginTop: 10, alignItems: 'baseline'}}>
					{(
						[
							['Plus Jakarta Sans · 800', 800],
							['JetBrains Mono · 500', 500],
						] as const
					).map(([name, w], i) => {
						const t = interpolate(f, [DESIGN + 30 + i * 5, DESIGN + 44 + i * 5], [0, 1], {...clamp, easing: ease.out});
						return (
							<div key={name} style={{opacity: t, translate: `0px ${(1 - t) * 14}px`}}>
								<div style={{fontFamily: name.startsWith('JetBrains') ? mono : JAKARTA, fontWeight: w, fontSize: 64, color: NAVY, lineHeight: 1}}>Aa</div>
								<div style={{fontFamily: mono, fontSize: 16, color: C.inkSoft, marginTop: 8}}>{name}</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* the storyline */}
			<div
				style={{
					position: 'absolute',
					left: 120,
					top: interpolate(toDesign, [0, 1], [390, 752]),
					width: N * CARD_W + (N - 1) * GAP,
					height: CARD_H,
					scale: interpolate(toDesign, [0, 1], [1, 0.78]),
					transformOrigin: 'top left',
				}}
			>
				{deck.slides.map((s, i) => {
					const t = interpolate(f, [8 + i * 4, 24 + i * 4], [0, 1], {...clamp, easing: ease.out});
					const ap = interpolate(f, [APPLY + i * 2.5, APPLY + 10 + i * 2.5], [0, 1], clamp);
					const styled = ap > 0.5;
					return (
						<div
							key={s.id}
							style={{
								position: 'absolute',
								left: i * (CARD_W + GAP),
								top: 0,
								width: CARD_W,
								height: CARD_H,
								borderRadius: 16,
								background: styled && i === 0 ? TEAL : C.card,
								border: styled && i !== 0 ? '1.5px solid #E2E8EE' : '1.5px solid transparent',
								boxShadow: shadow.card,
								padding: 18,
								opacity: t,
								translate: `0px ${(1 - t) * 120}px`,
								rotate: `${(1 - t) * (i % 2 ? 4 : -4)}deg`,
								scale: ap > 0 && ap < 1 ? 1 + 0.04 * Math.sin(ap * Math.PI) : 1,
							}}
						>
							<div
								style={{
									fontFamily: styled ? JAKARTA : mono,
									fontSize: 17,
									fontWeight: 700,
									width: 38,
									height: 38,
									borderRadius: 38,
									display: 'flex',
									alignItems: 'center',
									justifyContent: styled ? 'center' : 'flex-start',
									background: styled ? (i === 0 ? '#FFFFFF' : TEAL) : 'transparent',
									color: styled ? (i === 0 ? TEAL : '#FFFFFF') : C.blue,
								}}
							>
								{String(i + 1).padStart(2, '0')}
							</div>
							<div
								style={{
									fontFamily: styled ? JAKARTA : display,
									fontWeight: styled ? 700 : 600,
									fontSize: 22,
									lineHeight: 1.22,
									letterSpacing: '-0.01em',
									color: styled ? (i === 0 ? '#FFFFFF' : NAVY) : C.ink,
									marginTop: 12,
								}}
							>
								{s.message}
							</div>
						</div>
					);
				})}
			</div>

			<Audio name="Deal" from={8} src={staticFile('launch/audio/whoosh.wav')} volume={0.18} premountFor={fps} />
			<Audio name="Design in" from={DESIGN} src={staticFile('launch/audio/whoosh.wav')} volume={0.2} premountFor={fps} />
			<Audio name="Apply" from={APPLY} src={staticFile('launch/audio/sparkle.wav')} volume={0.35} premountFor={fps} />
		</AbsoluteFill>
	);
};
