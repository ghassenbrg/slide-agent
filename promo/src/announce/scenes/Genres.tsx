import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SlideView} from '../../launch/components/SlideView';
import {typed} from '../../launch/components/ui';
import type {El, Slide} from '../../launch/deck';
import {accentWord, C, clamp, display, ease, mono} from '../../launch/theme';
import type {Genre} from '../../showcase-deck';
import {GENRES, SHOWCASE_ASSETS, showcaseSlide} from '../../showcase-deck';
import {Card, CW, Label, M, Title} from '../kit';

// 0:03–0:28 — one tool, every kind of deck. Five slides from the showcase deck
// (promo/showcase), each a different genre with its own design system: the
// prompt, the system it chose, and the slide assembling at the engine's
// computed frames.

export const BEAT = 150;
const GENRE_Y = 300;
const PROMPT_Y = 344;
const SYSTEM_Y = 442;
const DECK_Y = 612;
const DECK_H = (CW * 9) / 16;

// Reading order: top to bottom, then left to right; full-slide grounds first.
const schedule = (slide: Slide, from: number, span: number) => {
	const order = [...slide.elements]
		.filter((e) => !(e.frame.w > 12 && e.frame.h > 7))
		.sort((a, b) => Math.round(a.frame.y * 4) - Math.round(b.frame.y * 4) || a.frame.x - b.frame.x);
	const starts = new Map<string, number>();
	order.forEach((e, i) => starts.set(e.id, from + (i / Math.max(1, order.length - 1)) * span));
	return starts;
};

const GenreBeat: React.FC<{g: Genre; n: number}> = ({g, n}) => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const enter = interpolate(f, [0, 10], [0, 1], {...clamp, easing: ease.out});
	const exit = interpolate(f, [BEAT - 10, BEAT], [0, 1], {...clamp, easing: ease.in});
	const prompt = typed(g.prompt, f, 2, 150);
	const sys = interpolate(f, [12, 24], [0, 1], {...clamp, easing: ease.out});
	const slide = showcaseSlide(g.id);
	const starts = schedule(slide, 16, 28);
	const reveal = (el: El) => {
		const s = starts.get(el.id);
				if (s === undefined) return interpolate(f, [10, 20], [0, 1], clamp);
		return interpolate(f, [s, s + 12], [0, 1], clamp);
	};

	return (
		<AbsoluteFill style={{opacity: enter * (1 - exit), translate: `${(1 - enter) * 100 - exit * 100}px 0px`}}>
			<div style={{position: 'absolute', left: M, right: M, top: GENRE_Y, display: 'flex', alignItems: 'center', gap: 14}}>
				<Label>{`0${n}`}</Label>
				<div style={{fontFamily: display, fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em', color: C.ink}}>{g.genre}</div>
			</div>

			{/* the prompt */}
			<Card style={{left: M, top: PROMPT_Y, width: CW, height: 76, borderRadius: 38, display: 'flex', alignItems: 'center', padding: '0 28px', gap: 16}}>
				<Label>PROMPT</Label>
					<div style={{fontFamily: display, fontWeight: 500, fontSize: 32, letterSpacing: '-0.015em', color: C.ink, whiteSpace: 'nowrap'}}>
					{prompt}
					<span style={{display: 'inline-block', width: 3, height: 32, background: C.blue, verticalAlign: 'middle', marginLeft: 3, opacity: prompt.length < g.prompt.length ? 1 : 0}} />
				</div>
			</Card>

			{/* the design system it chose */}
			<Card style={{left: M, top: SYSTEM_Y, width: CW, height: 148, padding: '20px 28px', opacity: sys, translate: `0px ${(1 - sys) * 20}px`}}>
				<div style={{display: 'flex', alignItems: 'center', gap: 14}}>
					<Label>DESIGN SYSTEM</Label>
					<div style={{fontFamily: display, fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', color: C.ink}}>{g.system}</div>
				</div>
				<div style={{display: 'flex', alignItems: 'center', gap: 9, marginTop: 18}}>
					{g.palette.map((h, i) => {
						const t = interpolate(f, [16 + i * 2, 26 + i * 2], [0, 1], {...clamp, easing: ease.out});
						return <div key={h + i} style={{width: 38, height: 38, borderRadius: 38, background: h, border: `1px solid ${C.line}`, scale: interpolate(t, [0, 1], [0.3, 1]), opacity: t}} />;
					})}
					<div style={{marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 18, opacity: interpolate(f, [22, 32], [0, 1], clamp)}}>
						{g.fonts.map((ff) => (
							<span key={ff} style={{display: 'flex', alignItems: 'baseline', gap: 8}}>
								<span style={{fontFamily: ff, fontWeight: 600, fontSize: 38, color: C.ink, lineHeight: 1}}>Aa</span>
								<span style={{fontFamily: mono, fontSize: 16, color: C.dim}}>{ff}</span>
							</span>
						))}
					</div>
				</div>
			</Card>

			{/* the slide */}
			<div
				style={{
					position: 'absolute',
					left: M,
					top: DECK_Y,
					width: CW,
					height: DECK_H,
					borderRadius: 14,
					overflow: 'hidden',
					background: `#${slide.background.hex}`,
					boxShadow: '0 2px 6px rgba(10,20,51,0.1), 0 30px 70px -24px rgba(10,20,51,0.4)',
						opacity: interpolate(f, [8, 16], [0, 1], clamp),
				}}
			>
				<SlideView slide={slide} width={CW} reveal={reveal} assetBase={SHOWCASE_ASSETS} />
			</div>

			{/* what it shows */}
			<div style={{position: 'absolute', left: M, right: M, top: DECK_Y + DECK_H + 26, display: 'flex', justifyContent: 'center', gap: 12}}>
				{g.shows.map((s, i) => {
					const t = interpolate(f, [46 + i * 4, 58 + i * 4], [0, 1], {...clamp, easing: ease.out});
					return (
						<div key={s} style={{display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderRadius: 999, background: '#fff', border: `1.5px solid ${C.line}`, fontFamily: display, fontWeight: 600, fontSize: 27, color: C.ink, opacity: t, translate: `0px ${(1 - t) * 12}px`}}>
							<span style={{color: C.blue}}>✓</span>
							{s}
						</div>
					);
				})}
			</div>

			<Audio name="Typing" from={2} src={staticFile('launch/audio/typing-short.wav')} volume={0.26} premountFor={fps} />
			{[16, 28, 40, 52].map((t) => (
				<Audio key={t} name={`Land ${t}`} from={t} src={staticFile('launch/audio/land.wav')} volume={0.22} premountFor={fps} />
			))}
		</AbsoluteFill>
	);
};

export const Genres: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const total = GENRES.length * BEAT;
	return (
		<AbsoluteFill>
			<Title size={68} top={136} at={0} out={total - 12}>
				One tool. <span style={accentWord()}>Every kind of deck.</span>
			</Title>
			<div style={{position: 'absolute', right: M, top: 1272, fontFamily: mono, fontSize: 22, color: C.dim, opacity: interpolate(f, [0, 12, total - 12, total], [0, 1, 1, 0], clamp)}}>
				{Math.min(GENRES.length, Math.floor(f / BEAT) + 1)} / {GENRES.length}
			</div>
			<div style={{position: 'absolute', left: M, top: 1272, fontFamily: mono, fontSize: 20, color: C.dim}}>SHOWCASE · SAMPLE CONTENT</div>
			{GENRES.map((g, i) => (
				<Sequence key={g.id} name={g.genre} from={i * BEAT} durationInFrames={BEAT} premountFor={fps}>
					<GenreBeat g={g} n={i + 1} />
				</Sequence>
			))}
		</AbsoluteFill>
	);
};
