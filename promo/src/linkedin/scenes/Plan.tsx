import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {typed} from '../../launch/components/ui';
import {deck} from '../../launch/deck';
import {accentWord, C, clamp, deckFonts, display, ease, mono, shadow} from '../../launch/theme';
import {CONTENT_W, Headline, M, PICTURE_Y} from '../kit';

// 2 · Plan & design — the slide-by-slide storyline (each card is the slide's
// real `message`), then the deck's real concept, palette and typeface, which
// then wash over the storyline.

const CONCEPT =
	'A modern engineering review: crisp white cards on a cool canvas, deep navy headlines with one word in electric indigo, numbers set in mono like live metrics, and every idea anchored by a round tinted icon badge.';
const PALETTE = ['#F5F7FB', '#0B1B33', '#55627A', '#4F46E5', '#0891B2', '#7C3AED', '#15803D', '#B45309'];
const JAKARTA = deckFonts['Plus Jakarta Sans'];
const ACCENT = '#4F46E5';
const NAVY = '#0B1B33';

const GAP = 16;
const CARD_W = (CONTENT_W - 2 * GAP) / 3;
const CARD_H = 150;
const DESIGN = 56;
const APPLY = 112;

export const Plan: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const panel = interpolate(f, [DESIGN, DESIGN + 16], [0, 1], {...clamp, easing: ease.out});
	const exit = interpolate(f, [155, 165], [0, 1], {...clamp, easing: ease.in});
	const panelTop = PICTURE_Y + 3 * CARD_H + 2 * GAP + 40;

	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			<Headline label="2 — PLAN & DESIGN">
				A storyline and a look, made <span style={accentWord()}>for this deck.</span>
			</Headline>

			{/* the storyline */}
			{deck.slides.map((s, i) => {
				const t = interpolate(f, [4 + i * 3, 18 + i * 3], [0, 1], {...clamp, easing: ease.out});
				const ap = interpolate(f, [APPLY + i * 2, APPLY + 8 + i * 2], [0, 1], clamp);
				const styled = ap > 0.5;
				return (
					<div
						key={s.id}
						style={{
							position: 'absolute',
							left: M + (i % 3) * (CARD_W + GAP),
							top: PICTURE_Y + Math.floor(i / 3) * (CARD_H + GAP),
							width: CARD_W,
							height: CARD_H,
							borderRadius: 16,
							background: styled && i === 0 ? ACCENT : C.card,
							border: styled && i !== 0 ? '1.5px solid #E2E8EE' : '1.5px solid transparent',
							boxShadow: shadow.card,
							padding: '16px 18px',
							display: 'flex',
							gap: 14,
							opacity: t,
							translate: `0px ${(1 - t) * 80}px`,
							rotate: `${(1 - t) * (i % 2 ? 3 : -3)}deg`,
							scale: ap > 0 && ap < 1 ? 1 + 0.04 * Math.sin(ap * Math.PI) : 1,
						}}
					>
						<div
							style={{
								flexShrink: 0,
								width: 40,
								height: 40,
								borderRadius: 40,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								fontFamily: styled ? JAKARTA : mono,
								fontSize: 17,
								fontWeight: 700,
								background: styled ? (i === 0 ? '#fff' : ACCENT) : '#ECEFF6',
								color: styled ? (i === 0 ? ACCENT : '#fff') : C.blue,
							}}
						>
							{String(i + 1).padStart(2, '0')}
						</div>
						<div style={{fontFamily: styled ? JAKARTA : display, fontWeight: styled ? 700 : 600, fontSize: 19, lineHeight: 1.22, letterSpacing: '-0.01em', color: styled ? (i === 0 ? '#fff' : NAVY) : C.ink}}>{s.message}</div>
					</div>
				);
			})}

			{/* the design language */}
			<div style={{position: 'absolute', left: M, width: CONTENT_W, top: panelTop, opacity: panel, translate: `0px ${(1 - panel) * 24}px`}}>
				<div style={{fontFamily: JAKARTA, fontWeight: 600, fontSize: 29, lineHeight: 1.3, color: NAVY, minHeight: 114}}>
					“{typed(CONCEPT, f, DESIGN + 6, 130)}
					{f > DESIGN + 6 + (CONCEPT.length / 130) * 30 ? '”' : ''}
				</div>
				<div style={{display: 'flex', alignItems: 'center', gap: 14, marginTop: 18}}>
					{PALETTE.map((h, i) => {
						const t = interpolate(f, [DESIGN + 10 + i * 3, DESIGN + 22 + i * 3], [0, 1], {...clamp, easing: ease.out});
						return <div key={h} style={{width: 58, height: 58, borderRadius: 58, background: h, border: `1px solid ${C.line}`, opacity: t, scale: interpolate(t, [0, 1], [0.4, 1])}} />;
					})}
					<div style={{marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 10, opacity: interpolate(f, [DESIGN + 36, DESIGN + 48], [0, 1], clamp)}}>
						<span style={{fontFamily: JAKARTA, fontWeight: 800, fontSize: 60, color: NAVY, lineHeight: 1}}>Aa</span>
						<span style={{fontFamily: mono, fontSize: 18, color: C.inkSoft}}>Plus Jakarta Sans · JetBrains Mono</span>
					</div>
				</div>
			</div>

			<Audio name="Deal" from={4} src={staticFile('launch/audio/whoosh.wav')} volume={0.18} premountFor={fps} />
			<Audio name="Design" from={DESIGN} src={staticFile('launch/audio/whoosh.wav')} volume={0.18} premountFor={fps} />
			<Audio name="Apply" from={APPLY} src={staticFile('launch/audio/sparkle.wav')} volume={0.35} premountFor={fps} />
		</AbsoluteFill>
	);
};
