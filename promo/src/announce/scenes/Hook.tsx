import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SlideView} from '../../launch/components/SlideView';
import {accentWord, C, clamp, display, ease} from '../../launch/theme';
import {SHOWCASE_ASSETS, showcaseSlide} from '../../showcase-deck';
import {M, Title} from '../kit';

// 0:00–0:03 — the promise and the proof, both on frame 0 (frame 0 is also
// the thumbnail). Three real slides from the showcase deck, three genres.

// A cascade: each deck's headline stays visible above the one in front of it.
const CARD_W = 760;
const FAN = [
	{slide: 'product-keynote', x: 470, y: 640, r: -4},
	{slide: 'architecture', x: 620, y: 830, r: 3},
	{slide: 'executive-dashboard', x: 520, y: 1020, r: -1.5},
];

export const Hook: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const exit = interpolate(f, [76, 90], [0, 1], {...clamp, easing: ease.in});

	return (
		<AbsoluteFill>
			<Title size={96} top={136} at={-20} out={78}>
				Describe a deck.
				<br />
				Get <span style={accentWord()}>real</span> PowerPoint.
			</Title>
			<div
				style={{
					position: 'absolute',
					left: M,
					right: M,
					top: 354,
					fontFamily: display,
					fontWeight: 500,
					fontSize: 36,
					lineHeight: 1.25,
					letterSpacing: '-0.015em',
					color: C.inkSoft,
					opacity: 1 - exit,
				}}
			>
				An open-source AI agent that designs native, editable decks.
			</div>

			{FAN.map(({slide, x, y, r}, i) => {
				// Already in place on frame 0; a slow drift keeps it alive, then the fan clears.
				const drift = Math.sin((f + i * 20) / 22) * 6;
				const out = interpolate(f, [70 + i * 3, 88 + i * 3], [0, 1], {...clamp, easing: ease.in});
				return (
					<div
						key={slide}
						style={{
							position: 'absolute',
							left: x - CARD_W / 2,
							top: y - (CARD_W * 9) / 32,
							rotate: `${r + interpolate(f, [0, 90], [0, r * 0.3])}deg`,
							translate: `${(i === 0 ? -1 : i === 1 ? 1 : 0) * out * 700}px ${drift + (i === 2 ? out * 600 : 0)}px`,
							scale: interpolate(f, [0, 90], [1, 1.03]),
							borderRadius: 14,
							overflow: 'hidden',
							boxShadow: '0 2px 6px rgba(10,20,51,0.1), 0 30px 70px -20px rgba(10,20,51,0.45)',
						}}
					>
						<SlideView slide={showcaseSlide(slide)} width={CARD_W} assetBase={SHOWCASE_ASSETS} />
					</div>
				);
			})}

			<Audio name="Out" from={72} src={staticFile('launch/audio/whoosh.wav')} volume={0.28} premountFor={fps} />
		</AbsoluteFill>
	);
};
