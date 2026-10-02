import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SlideView} from '../../launch/components/SlideView';
import type {El} from '../../launch/deck';
import {SLIDE_W_IN} from '../../launch/deck';
import {accentWord, C, clamp, display, ease, mono} from '../../launch/theme';
import {SHOWCASE_ASSETS, showcaseSlide} from '../../showcase-deck';
import {Card, CW, Label, M, Title} from '../kit';

// 0:28–0:35 — the split that makes it work: the model designs, the engine
// computes. The showcase's data story on a grid, and what the engine verified
// for the showcase deck (finalized `ready`: rendered, schema-checked, rebuilt
// clean from its intent).

const SLIDE_Y = 330;
const SLIDE_H = (CW * 9) / 16;
const PPI = CW / SLIDE_W_IN;

const CHECKS = [
	['Text measured with the actual fonts', 'fits'],
	['Text contrast checked', 'pass'],
	['Chart data kept; diagrams stay shapes', 'native'],
	['Schema-checked, rebuilt from intent', 'ready'],
];

export const Engine: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const slide = showcaseSlide('data-story');
	const enter = interpolate(f, [0, 14], [0, 1], {...clamp, easing: ease.out});
	const grid = interpolate(f, [8, 22, 120, 150], [0, 1, 1, 0], clamp);
	const exit = interpolate(f, [198, 210], [0, 1], {...clamp, easing: ease.in});

	// The showcase's grid: 12 columns inside 0.5 in margins.
	const m = 0.5 * PPI;
	const g = (16 / 72) * PPI;
	const cw = (CW - 2 * m - 11 * g) / 12;

	const title = slide.elements.find((e) => e.id === 'data-story/text2')!;
	const chart = slide.elements.find((e) => e.id === 'data-story/chart11')!;
	const box = (e: El, at: number, label: string, below?: boolean) => {
		const t = interpolate(f, [at, at + 12], [0, 1], {...clamp, easing: ease.out}) * interpolate(f, [150, 162], [1, 0], clamp);
		return (
			<div style={{position: 'absolute', left: M + e.frame.x * PPI - 6, top: SLIDE_Y + e.frame.y * PPI - 6, width: e.frame.w * PPI + 12, height: e.frame.h * PPI + 12, opacity: t}}>
				<div style={{position: 'absolute', inset: 0, border: `2.5px solid ${C.blue}`, borderRadius: 4, clipPath: `inset(0 ${(1 - t) * 100}% 0 0)`}} />
				<div style={{position: 'absolute', left: 0, top: below ? SLIDE_H - e.frame.y * PPI + 12 : -48, padding: below ? '4px 12px' : '6px 14px', borderRadius: 9, background: C.blue, color: '#fff', fontFamily: mono, fontSize: below ? 20 : 21, whiteSpace: 'nowrap'}}>{label}</div>
			</div>
		);
	};

	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			<Title size={72} top={136}>
				The model designs. <span style={accentWord()}>The engine computes.</span>
			</Title>

			<div style={{position: 'absolute', left: M, top: SLIDE_Y, width: CW, height: SLIDE_H, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 6px rgba(10,20,51,0.1), 0 30px 70px -24px rgba(10,20,51,0.35)', opacity: enter, translate: `0px ${(1 - enter) * 30}px`}}>
				<SlideView slide={slide} width={CW} assetBase={SHOWCASE_ASSETS} reveal={(el) => (el.kind === 'chart' ? interpolate(f, [20, 70], [0, 1], clamp) : 1)} />
				<div style={{position: 'absolute', inset: 0, opacity: grid}}>
					{Array.from({length: 12}, (_, i) => (
						<div key={i} style={{position: 'absolute', left: m + i * (cw + g), top: 0, width: cw, height: SLIDE_H, background: 'rgba(47,91,255,0.07)', borderLeft: '1px solid rgba(47,91,255,0.25)', borderRight: '1px solid rgba(47,91,255,0.25)'}} />
					))}
				</div>
			</div>
			{box(title, 30, 'measured · fits')}
			{box(chart, 56, 'native chart · data embedded', true)}

			{/* what the engine verified */}
			<Card style={{left: M, top: SLIDE_Y + SLIDE_H + 40, width: CW, padding: '26px 32px'}}>
				<div style={{display: 'flex', alignItems: 'center'}}>
					<Label>VERIFIED · SHOWCASE DECK · 5 GENRES</Label>
					<div style={{marginLeft: 'auto', padding: '6px 16px', borderRadius: 999, background: '#E5F6EC', color: C.good, fontFamily: mono, fontSize: 21, fontWeight: 500, opacity: interpolate(f, [150, 162], [0, 1], clamp)}}>
						ready ✓
					</div>
				</div>
				{CHECKS.map(([text, tag], i) => {
					const t = interpolate(f, [70 + i * 18, 84 + i * 18], [0, 1], {...clamp, easing: ease.out});
					return (
						<div key={text} style={{display: 'flex', alignItems: 'center', gap: 16, marginTop: 20, opacity: 0.25 + 0.75 * t}}>
							<div style={{width: 34, height: 34, borderRadius: 34, background: t > 0.5 ? C.good : '#E3E7EF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: display, fontWeight: 800, fontSize: 20, scale: 0.8 + 0.2 * t}}>✓</div>
							<div style={{fontFamily: display, fontWeight: 600, fontSize: 30, letterSpacing: '-0.015em', color: C.ink}}>{text}</div>
							<div style={{marginLeft: 'auto', fontFamily: mono, fontSize: 20, color: C.dim}}>{tag}</div>
						</div>
					);
				})}
			</Card>

			{[70, 88, 106, 124].map((t) => (
				<Audio key={t} name={`Check ${t}`} from={t} src={staticFile('launch/audio/land.wav')} volume={0.35} premountFor={fps} />
			))}
			<Audio name="Ready" from={150} src={staticFile('launch/audio/success.wav')} volume={0.38} premountFor={fps} />
		</AbsoluteFill>
	);
};
