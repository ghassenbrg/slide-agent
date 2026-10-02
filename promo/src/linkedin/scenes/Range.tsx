import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {DECK_PREVIEWS} from '../../launch/deck';
import {accentWord, C, clamp, display, ease} from '../../launch/theme';
import {Headline, M} from '../kit';

// No house style — every tile is real Slide Agent output: the six showcase
// decks in examples/showcase and the sample deck.

const show = (name: string) => [1, 2, 3].map((n) => `decks/${name}-${n}.jpg`);
const ROWS: string[][] = [
	DECK_PREVIEWS.slice(0, 5).map((n) => `launch/deck/${n}.png`),
	[...show('board-decision'), ...show('travel')],
	[...show('scientific-explanation'), ...show('fashion-launch')],
	DECK_PREVIEWS.slice(4).map((n) => `launch/deck/${n}.png`),
	[...show('technical-architecture'), ...show('cultural-heritage')],
];

export const Range: React.FC = () => {
	const f = useCurrentFrame();
	const enter = interpolate(f, [0, 16], [0, 1], {...clamp, easing: ease.out});
	const sub = interpolate(f, [24, 38], [0, 1], {...clamp, easing: ease.out});
	const exit = interpolate(f, [95, 105], [0, 1], {...clamp, easing: ease.in});

	return (
		<AbsoluteFill style={{opacity: 1 - exit, overflow: 'hidden'}}>
			<AbsoluteFill style={{perspective: 1600}}>
				<div style={{position: 'absolute', left: -700, top: 430, width: 2600, transform: 'rotateX(22deg) rotateZ(-9deg)', transformOrigin: '50% 30%', opacity: enter}}>
					{ROWS.map((row, r) => {
						const dir = r % 2 ? 1 : -1;
						const shift = dir * interpolate(f, [0, 105], [0, 320]) + (r % 2 ? -600 : 0);
						return (
							<div key={r} style={{display: 'flex', gap: 22, marginBottom: 22, translate: `${shift}px 0px`}}>
								{[...row, ...row, ...row].map((src, i) => (
									<Img key={i} src={staticFile(src)} style={{width: 400, height: 225, objectFit: 'cover', borderRadius: 10, flexShrink: 0, boxShadow: '0 18px 40px -16px rgba(10,20,51,0.45)'}} />
								))}
							</div>
						);
					})}
				</div>
			</AbsoluteFill>
			<AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(244,245,249,1) 0%, rgba(244,245,249,0.96) 30%, rgba(244,245,249,0) 48%, rgba(244,245,249,0) 85%, rgba(244,245,249,0.9) 100%)'}} />
			<Headline size={88} top={120}>
				Every deck gets <span style={accentWord()}>its own design.</span>
			</Headline>
			<div style={{position: 'absolute', left: M, right: M, top: 360, fontFamily: display, fontWeight: 600, fontSize: 44, letterSpacing: '-0.025em', color: C.inkSoft, opacity: sub, translate: `0px ${(1 - sub) * 14}px`}}>
				No templates. No house style.
			</div>
		</AbsoluteFill>
	);
};
