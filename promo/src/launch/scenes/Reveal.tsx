import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {accentWord, C, clamp, display, ease} from '../theme';

// 0:15.5–0:19.5 — the line opens onto the light, and the product is named.

export const Reveal: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();

	// The single line from the dark scene opens, like an eye, onto paper.
	const open = interpolate(f, [0, 16], [0, 1], {...clamp, easing: ease.inOut});
	const holeW = interpolate(open, [0, 0.4, 1], [600, 1400, 2400]);
	const holeH = interpolate(open, [0, 1], [2, 1400]);

	const icon = interpolate(f, [8, 30], [0, 1], {...clamp, easing: ease.out});
	const word = interpolate(f, [16, 36], [0, 1], {...clamp, easing: ease.out});
	const tag = interpolate(f, [38, 56], [0, 1], {...clamp, easing: ease.out});
	const exit = interpolate(f, [102, 120], [0, 1], {...clamp, easing: ease.in});

	return (
		<AbsoluteFill>
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', translate: `0px ${-exit * 120}px`, opacity: 1 - exit}}>
				<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
					<Img
						src={staticFile('icon.png')}
						style={{
							width: 210,
							height: 210,
							opacity: icon,
							scale: interpolate(icon, [0, 1], [0.7, 1]),
							translate: `0px ${(1 - icon) * 30}px`,
							filter: 'drop-shadow(0 30px 50px rgba(20,40,120,0.35))',
						}}
					/>
					<div
						style={{
							fontFamily: display,
							fontWeight: 800,
							fontSize: 156,
							letterSpacing: '-0.05em',
							color: C.ink,
							marginTop: 18,
							opacity: word,
							translate: `0px ${(1 - word) * 30}px`,
							clipPath: `inset(-20% ${(1 - word) * 100}% -20% 0)`,
						}}
					>
						Slide Agent
					</div>
					<div
						style={{
							fontFamily: display,
							fontWeight: 500,
							fontSize: 52,
							letterSpacing: '-0.02em',
							color: C.inkSoft,
							marginTop: 8,
							opacity: tag,
							translate: `0px ${(1 - tag) * 18}px`,
						}}
					>
						Describe a presentation. Get a real <span style={accentWord()}>PowerPoint.</span>
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

			<Audio name="Exit whoosh" from={100} src={staticFile('launch/audio/whoosh.wav')} volume={0.25} premountFor={fps} />
		</AbsoluteFill>
	);
};
