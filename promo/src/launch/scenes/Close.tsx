import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Caret, Pointer, typed} from '../components/ui';
import {accentWord, C, clamp, display, ease, mono, shadow} from '../theme';

// 0:55–1:00 — the bookend. The same empty placeholder the film opened on,
// now in the light; this time the title writes itself.

const CLICK = 12;
const TITLE_AT = 18;
const SUB_AT = 46;
const TITLE = 'Slide Agent';
const SUB = 'Describe it. Get the deck.';

const CARD_W = 1120;
const CARD_H = 630;

export const Close: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const card = interpolate(f, [0, 12], [0, 1], {...clamp, easing: ease.out});
	const title = typed(TITLE, f, TITLE_AT, 24);
	const sub = typed(SUB, f, SUB_AT, 40);
	const titleDone = title.length === TITLE.length;
	const subDone = sub.length === SUB.length;
	const icon = interpolate(f, [TITLE_AT + 14, TITLE_AT + 26], [0, 1], {...clamp, easing: ease.out});
	const foot = interpolate(f, [86, 102], [0, 1], {...clamp, easing: ease.out});
	const settle = interpolate(f, [80, 100], [0, 1], {...clamp, easing: ease.inOut});

	const pIn = interpolate(f, [0, CLICK - 1], [0, 1], {...clamp, easing: ease.out});
	const pOut = interpolate(f, [CLICK + 8, CLICK + 24], [0, 1], {...clamp, easing: ease.in});

	return (
		<AbsoluteFill>
			<div
				style={{
					position: 'absolute',
					left: (1920 - CARD_W) / 2,
					top: interpolate(settle, [0, 1], [180, 110]),
					width: CARD_W,
					height: CARD_H,
					borderRadius: 14,
					background: C.card,
					boxShadow: shadow.lift,
					opacity: card,
					scale: interpolate(card, [0, 1], [0.94, 1]),
				}}
			>
				<div
					style={{
						position: 'absolute',
						left: 90,
						top: 170,
						width: CARD_W - 180,
						height: 180,
						border: `2px dashed rgba(10,20,51,${titleDone ? 0 : 0.18})`,
						borderRadius: 8,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 34,
					}}
				>
					{f < CLICK ? (
						<span style={{fontFamily: display, fontWeight: 500, fontSize: 72, letterSpacing: '-0.02em', color: 'rgba(10,20,51,0.3)'}}>Click to add title</span>
					) : (
						<>
							<Img src={staticFile('icon.png')} style={{width: 150 * icon, height: 150, opacity: icon, objectFit: 'contain'}} />
							<span style={{fontFamily: display, fontWeight: 800, fontSize: 138, letterSpacing: '-0.05em', color: C.ink, lineHeight: 1}}>
								{title}
								{titleDone ? null : <Caret height={120} color={C.blue} solid />}
							</span>
						</>
					)}
				</div>
				<div
					style={{
						position: 'absolute',
						left: 90,
						top: 380,
						width: CARD_W - 180,
						height: 110,
						border: `2px dashed rgba(10,20,51,${subDone ? 0 : 0.12})`,
						borderRadius: 8,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontFamily: display,
						fontWeight: 500,
						fontSize: 58,
						letterSpacing: '-0.025em',
						color: C.inkSoft,
					}}
				>
					{f < SUB_AT ? (
						<span style={{fontSize: 38, color: 'rgba(10,20,51,0.25)'}}>Click to add subtitle</span>
					) : subDone ? (
						<span>
							Describe it. <span style={{...accentWord(), fontSize: 66}}>Get the deck.</span>
						</span>
					) : (
						<span>
							{sub}
							<Caret height={60} color={C.blue} solid />
						</span>
					)}
				</div>
			</div>

			<div style={{position: 'absolute', left: 0, right: 0, top: 790, textAlign: 'center', opacity: foot, translate: `0px ${(1 - foot) * 20}px`}}>
				<div style={{display: 'flex', justifyContent: 'center', gap: 14, fontFamily: display, fontWeight: 500, fontSize: 27, color: C.inkSoft}}>
					<span style={{color: C.dim}}>Works with</span>
					{['VS Code', 'Claude Code', 'Codex', 'GitHub Copilot', 'Gemini', 'any MCP app'].map((x) => (
						<span key={x} style={{padding: '4px 16px', borderRadius: 999, background: '#fff', border: `1px solid ${C.line}`, color: C.ink}}>
							{x}
						</span>
					))}
				</div>
				<div style={{fontFamily: display, fontWeight: 700, fontSize: 50, letterSpacing: '-0.02em', color: C.ink, marginTop: 34}}>github.com/ghassenbrg/slide-agent</div>
				<div style={{fontFamily: mono, fontSize: 22, color: C.dim, marginTop: 12}}>open source · MIT · real, editable .pptx</div>
			</div>

			{f < CLICK + 26 ? <Pointer x={interpolate(pIn, [0, 1], [1500, 1180]) + pOut * 300} y={interpolate(pIn, [0, 1], [900, 380]) + pOut * 260} pressed={f >= CLICK && f < CLICK + 4} opacity={card} /> : null}

			<Audio name="Click" from={CLICK} src={staticFile('launch/audio/click.wav')} volume={0.55} premountFor={fps} />
			<Audio name="Type title" from={TITLE_AT} src={staticFile('launch/audio/typing-short.wav')} volume={0.32} premountFor={fps} />
			<Audio name="Title done" from={TITLE_AT + 14} src={staticFile('launch/audio/sparkle.wav')} volume={0.32} premountFor={fps} />
			<Audio name="Type subtitle" from={SUB_AT} src={staticFile('launch/audio/typing-short.wav')} volume={0.28} premountFor={fps} />
			<Audio name="Done" from={SUB_AT + 22} src={staticFile('launch/audio/success.wav')} volume={0.38} premountFor={fps} />
		</AbsoluteFill>
	);
};
