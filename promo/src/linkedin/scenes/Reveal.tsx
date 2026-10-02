import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {accentWord, C, clamp, display, ease} from '../../launch/theme';
import {M} from '../kit';

// 0:09.5–0:13.5 — the line opens onto the light, and the product is introduced.

export const Reveal: React.FC = () => {
	const f = useCurrentFrame();
	const open = interpolate(f, [0, 16], [0, 1], {...clamp, easing: ease.inOut});
	const holeW = interpolate(open, [0, 0.4, 1], [600, 1000, 1700]);
	const holeH = interpolate(open, [0, 1], [2, 1800]);
	const pre = interpolate(f, [6, 22], [0, 1], {...clamp, easing: ease.out});
	const icon = interpolate(f, [12, 30], [0, 1], {...clamp, easing: ease.out});
	const word = interpolate(f, [18, 38], [0, 1], {...clamp, easing: ease.out});
	const tag = interpolate(f, [40, 58], [0, 1], {...clamp, easing: ease.out});
	const exit = interpolate(f, [106, 120], [0, 1], {...clamp, easing: ease.in});

	return (
		<AbsoluteFill>
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', translate: `0px ${-exit * 100}px`, opacity: 1 - exit}}>
				<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: `0 ${M}px`}}>
					<div style={{fontFamily: display, fontWeight: 600, fontSize: 52, letterSpacing: '-0.03em', color: C.inkSoft, opacity: pre, translate: `0px ${(1 - pre) * 16}px`}}>
						Introducing
					</div>
					<Img
						src={staticFile('icon.png')}
						style={{width: 230, height: 230, marginTop: 28, opacity: icon, scale: interpolate(icon, [0, 1], [0.7, 1]), filter: 'drop-shadow(0 30px 50px rgba(20,40,120,0.35))'}}
					/>
					<div
						style={{
							fontFamily: display,
							fontWeight: 800,
							fontSize: 140,
							letterSpacing: '-0.055em',
							lineHeight: 1,
							color: C.ink,
							marginTop: 22,
							opacity: word,
							clipPath: `inset(-20% ${(1 - word) * 100}% -20% 0)`,
						}}
					>
						Slide Agent
					</div>
					<div style={{fontFamily: display, fontWeight: 500, fontSize: 44, lineHeight: 1.22, letterSpacing: '-0.02em', color: C.inkSoft, marginTop: 30, maxWidth: 900, opacity: tag, translate: `0px ${(1 - tag) * 18}px`}}>
						An open-source AI agent that turns one sentence into a real, editable <span style={accentWord()}>PowerPoint.</span>
					</div>
				</div>
			</AbsoluteFill>

			{/* the dark, with a widening hole cut in it */}
			{open < 1 ? (
				<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}}>
					<div
						style={{
							width: holeW,
							height: holeH,
							borderRadius: interpolate(open, [0, 0.3], [1, 36], clamp),
							boxShadow: `0 0 50px 6px rgba(120,150,255,${0.85 * (1 - open)}), 0 0 0 4000px ${C.night}`,
						}}
					/>
				</AbsoluteFill>
			) : null}
		</AbsoluteFill>
	);
};
