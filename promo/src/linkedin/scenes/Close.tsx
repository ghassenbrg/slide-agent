import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Caret, Pointer, typed} from '../../launch/components/ui';
import {accentWord, C, clamp, display, ease, mono, shadow} from '../../launch/theme';
import {CONTENT_W, M} from '../kit';

// The bookend: the empty placeholder from the opening, now in the light, and
// this time the title writes itself. Then where to get it.

const CLICK = 12;
const TITLE_AT = 18;
const SUB_AT = 42;
const TITLE = 'Slide Agent';
const SUB = 'Describe it. Get the deck.';
const CARD_H = (CONTENT_W * 9) / 16;

export const Close: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const card = interpolate(f, [0, 12], [0, 1], {...clamp, easing: ease.out});
	const title = typed(TITLE, f, TITLE_AT, 26);
	const sub = typed(SUB, f, SUB_AT, 42);
	const titleDone = title.length === TITLE.length;
	const subDone = sub.length === SUB.length;
	const icon = interpolate(f, [TITLE_AT + 12, TITLE_AT + 24], [0, 1], {...clamp, easing: ease.out});
	const foot = (d: number) => interpolate(f, [72 + d, 86 + d], [0, 1], {...clamp, easing: ease.out});
	const pIn = interpolate(f, [0, CLICK - 1], [0, 1], {...clamp, easing: ease.out});
	const pOut = interpolate(f, [CLICK + 8, CLICK + 24], [0, 1], {...clamp, easing: ease.in});

	return (
		<AbsoluteFill>
			<div style={{position: 'absolute', left: M, top: 92, fontFamily: mono, fontSize: 26, fontWeight: 500, letterSpacing: '0.16em', color: C.blue, opacity: card}}>OPEN SOURCE · MIT</div>

			<div style={{position: 'absolute', left: M, top: 150, width: CONTENT_W, height: CARD_H, borderRadius: 16, background: C.card, boxShadow: shadow.lift, opacity: card, scale: interpolate(card, [0, 1], [0.94, 1])}}>
				<div style={{position: 'absolute', left: 50, right: 50, top: 120, height: 160, border: `2px dashed rgba(10,20,51,${titleDone ? 0 : 0.18})`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24}}>
					{f < CLICK ? (
						<span style={{fontFamily: display, fontWeight: 500, fontSize: 64, letterSpacing: '-0.02em', color: 'rgba(10,20,51,0.3)'}}>Click to add title</span>
					) : (
						<>
							<Img src={staticFile('icon.png')} style={{width: 120 * icon, height: 120, opacity: icon, objectFit: 'contain'}} />
							<span style={{fontFamily: display, fontWeight: 800, fontSize: 112, letterSpacing: '-0.055em', color: C.ink, lineHeight: 1}}>
								{title}
								{titleDone ? null : <Caret height={100} color={C.blue} solid />}
							</span>
						</>
					)}
				</div>
				<div style={{position: 'absolute', left: 50, right: 50, top: 310, height: 100, border: `2px dashed rgba(10,20,51,${subDone ? 0 : 0.12})`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: display, fontWeight: 500, fontSize: 52, letterSpacing: '-0.025em', color: C.inkSoft}}>
					{f < SUB_AT ? (
						<span style={{fontSize: 36, color: 'rgba(10,20,51,0.25)'}}>Click to add subtitle</span>
					) : subDone ? (
						<span>
							Describe it. <span style={{...accentWord(), fontSize: 60}}>Get the deck.</span>
						</span>
					) : (
						<span>
							{sub}
							<Caret height={54} color={C.blue} solid />
						</span>
					)}
				</div>
			</div>

			{/* where to get it */}
			<div style={{position: 'absolute', left: M, width: CONTENT_W, top: 150 + CARD_H + 56, textAlign: 'center'}}>
				<div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, opacity: foot(0), translate: `0px ${(1 - foot(0)) * 16}px`}}>
					{['Claude Code', 'Codex', 'GitHub Copilot', 'Gemini', 'VS Code', 'any MCP app'].map((x) => (
						<span key={x} style={{padding: '8px 20px', borderRadius: 999, background: '#fff', border: `1px solid ${C.line}`, fontFamily: display, fontWeight: 600, fontSize: 30, color: C.ink}}>
							{x}
						</span>
					))}
				</div>
				<div style={{fontFamily: display, fontWeight: 800, fontSize: 52, letterSpacing: '-0.03em', color: C.ink, marginTop: 52, opacity: foot(10), translate: `0px ${(1 - foot(10)) * 16}px`}}>
					github.com/ghassenbrg/slide-agent
				</div>
				<div style={{fontFamily: mono, fontSize: 26, color: C.dim, marginTop: 14, opacity: foot(16)}}>npm @slide-agent/core · VS Code Marketplace</div>
				<div style={{fontFamily: display, fontWeight: 600, fontSize: 44, letterSpacing: '-0.025em', color: C.inkSoft, marginTop: 60, opacity: foot(30), translate: `0px ${(1 - foot(30)) * 16}px`}}>
					Start with <span style={accentWord()}>one sentence.</span>
				</div>
			</div>

			{f < CLICK + 26 ? <Pointer x={interpolate(pIn, [0, 1], [1000, 760]) + pOut * 260} y={interpolate(pIn, [0, 1], [900, 360]) + pOut * 300} pressed={f >= CLICK && f < CLICK + 4} opacity={card} /> : null}

			<Audio name="Click" from={CLICK} src={staticFile('launch/audio/click.wav')} volume={0.55} premountFor={fps} />
			<Audio name="Type title" from={TITLE_AT} src={staticFile('launch/audio/typing-short.wav')} volume={0.32} premountFor={fps} />
			<Audio name="Title done" from={TITLE_AT + 12} src={staticFile('launch/audio/sparkle.wav')} volume={0.32} premountFor={fps} />
			<Audio name="Type subtitle" from={SUB_AT} src={staticFile('launch/audio/typing-short.wav')} volume={0.28} premountFor={fps} />
			<Audio name="Done" from={SUB_AT + 22} src={staticFile('launch/audio/success.wav')} volume={0.38} premountFor={fps} />
		</AbsoluteFill>
	);
};
