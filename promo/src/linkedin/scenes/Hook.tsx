import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {PaperStage} from '../../launch/components/ui';
import {DECK_PREVIEWS} from '../../launch/deck';
import {accentWord, C, clamp, display, ease, mono, shadow} from '../../launch/theme';
import {CONTENT_W, Headline, M} from '../kit';

// 0:00–0:03.5 — the payoff first. Frame 0 is already the whole message (it is
// also what LinkedIn shows before anyone presses play): what it is, the
// prompt, and the nine real slides it made.

const TILE_W = (CONTENT_W - 2 * 18) / 3;
const TILE_H = (TILE_W * 9) / 16;

export const Hook: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	// The prompt is there from frame 0 (the thumbnail); it gets a nudge once playback starts.
	const nudge = interpolate(f, [20, 30, 44], [0, 1, 0], {...clamp, easing: ease.inOut});
	const exit = interpolate(f, [92, 105], [0, 1], {...clamp, easing: ease.in});

	return (
		<AbsoluteFill style={{opacity: 1 - exit, scale: 1 + exit * 0.04}}>
			<PaperStage />
			<div style={{position: 'absolute', left: M, top: 64, fontFamily: mono, fontSize: 24, fontWeight: 500, letterSpacing: '0.16em', color: C.blue}}>NEW · OPEN SOURCE</div>
			<Headline size={84} top={112} at={-30}>
				An AI agent that designs <span style={accentWord()}>real</span> PowerPoint decks.
			</Headline>

			{/* the nine slides it made */}
			<div style={{position: 'absolute', left: M, top: 600, width: CONTENT_W, display: 'flex', flexWrap: 'wrap', gap: 18}}>
				{DECK_PREVIEWS.map((n, i) => {
					// Already there on frame 0; each one lifts in turn so the grid feels alive.
					const lift = interpolate(f, [i * 5, i * 5 + 10, i * 5 + 24], [0, 1, 0], {...clamp, easing: ease.inOut});
					return (
						<Img
							key={n}
							src={staticFile(`launch/deck/${n}.png`)}
							style={{
								width: TILE_W,
								height: TILE_H,
								borderRadius: 8,
								boxShadow: shadow.card,
								translate: `0px ${-lift * 10}px`,
								scale: 1 + lift * 0.03,
								outline: lift > 0.2 ? `3px solid ${C.blue}` : '3px solid transparent',
							}}
						/>
					);
				})}
			</div>

			{/* what it took */}
			<div
				style={{
					position: 'absolute',
					left: M,
					right: M,
					top: 360,
					scale: 1 + nudge * 0.03,
				}}
			>
				<div style={{padding: '20px 26px', borderRadius: 20, background: C.card, boxShadow: shadow.card, fontFamily: display, fontWeight: 500, fontSize: 34, color: C.ink, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 16}}>
					<span style={{fontFamily: mono, fontSize: 22, color: C.blue, letterSpacing: '0.1em'}}>PROMPT</span>
					“A 9-slide engineering review of our AI platform…”
				</div>
				<div style={{display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, fontFamily: mono, fontSize: 24, color: C.inkSoft}}>
					<svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
						<path d="M12 5v14M5 12l7 7 7-7" />
					</svg>
					9 designed slides · a native, editable .pptx
				</div>
			</div>

			<Audio name="Prompt" from={20} src={staticFile('launch/audio/pop.wav')} volume={0.35} premountFor={fps} />
			<Audio name="To dark" from={92} src={staticFile('launch/audio/whoosh.wav')} volume={0.3} premountFor={fps} />
		</AbsoluteFill>
	);
};
