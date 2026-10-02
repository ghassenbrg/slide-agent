import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {DECK_PREVIEWS} from '../deck';
import {accentWord, C, clamp, display, ease} from '../theme';

// 0:50.5–0:55 — range. Every tile is real Slide Agent output: the six
// showcase decks in examples/showcase, and the deck this film just built.

const show = (deckName: string) => [1, 2, 3].map((n) => `decks/${deckName}-${n}.jpg`);
const ROWS: string[][] = [
	[...show('board-decision'), ...show('travel')],
	[...show('scientific-explanation'), ...show('fashion-launch')],
	[...show('technical-architecture'), ...show('cultural-heritage')],
	DECK_PREVIEWS.map((n) => `launch/deck/${n}.png`),
];

const TW = 520;
const TH = 292;
const G = 26;

export const Range: React.FC = () => {
	const f = useCurrentFrame();
	const enter = interpolate(f, [0, 20], [0, 1], {...clamp, easing: ease.out});
	const head = interpolate(f, [12, 30], [0, 1], {...clamp, easing: ease.out});
	const sub = interpolate(f, [34, 50], [0, 1], {...clamp, easing: ease.out});
	const exit = interpolate(f, [124, 135], [0, 1], {...clamp, easing: ease.in});

	return (
		<AbsoluteFill style={{opacity: 1 - exit, overflow: 'hidden'}}>
			<AbsoluteFill style={{perspective: 1800}}>
				<div
					style={{
						position: 'absolute',
						left: -500,
						top: -120,
						width: 2920,
						transform: `rotateX(24deg) rotateZ(-8deg) scale(${interpolate(f, [0, 135], [1.06, 1])})`,
						transformOrigin: '50% 40%',
						opacity: enter,
					}}
				>
					{ROWS.map((row, r) => {
						const dir = r % 2 ? 1 : -1;
						const shift = dir * interpolate(f, [0, 135], [0, 420]) + (r % 2 ? -900 : 0);
						const tiles = [...row, ...row, ...row];
						return (
							<div key={r} style={{display: 'flex', gap: G, marginBottom: G, translate: `${shift}px 0px`}}>
								{tiles.map((src, i) => (
									<Img key={i} src={staticFile(src)} style={{width: TW, height: TH, objectFit: 'cover', borderRadius: 10, flexShrink: 0, boxShadow: '0 18px 40px -16px rgba(10,20,51,0.45)'}} />
								))}
							</div>
						);
					})}
				</div>
			</AbsoluteFill>

			<AbsoluteFill style={{background: 'radial-gradient(ellipse 62% 44% at 50% 52%, rgba(244,245,249,0.97) 35%, rgba(244,245,249,0.75) 62%, rgba(244,245,249,0) 100%)', opacity: head}} />
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
				<div style={{fontFamily: display, fontWeight: 700, fontSize: 100, letterSpacing: '-0.045em', lineHeight: 1.02, color: C.ink, opacity: head, translate: `0px ${(1 - head) * 24}px`}}>
					Every deck designed
					<br />
					for its subject.
				</div>
				<div style={{fontFamily: display, fontWeight: 600, fontSize: 72, letterSpacing: '-0.03em', color: C.inkSoft, marginTop: 22, opacity: sub, translate: `0px ${(1 - sub) * 16}px`}}>
					No templates. No house <span style={accentWord()}>style.</span>
				</div>
			</AbsoluteFill>
		</AbsoluteFill>
	);
};
