import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SlideView} from '../../launch/components/SlideView';
import type {El} from '../../launch/deck';
import {accentWord, C, clamp, display, ease, mono} from '../../launch/theme';
import {ANALYTICS_ASSETS, analyticsSlide, narrative} from '../data';
import {Card, CW, M, Title} from '../kit';

// Real computed geometry from the existing analytics presentation. The assembly
// is an explanatory animation, not a recording of generation speed.
const BUILD_BEATS = [
	{id: 'data-story', from: 0, to: 118, note: 'Compose the message and visual hierarchy'},
	{id: 'growth', from: 118, to: 200, note: 'Build native charts with their data'},
	{id: 'experiment', from: 200, to: 270, note: 'Turn the evidence into a decision'},
];
const SLIDE_Y = 394;
const SLIDE_H = CW * 9 / 16;

export const Compose: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const beat = BUILD_BEATS.find((b) => f >= b.from && f < b.to) ?? BUILD_BEATS[0];
	const local = f - beat.from;
	const slide = analyticsSlide(beat.id);
	const elements = [...slide.elements].sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x);
	const reveal = (el: El) => {
		if (el.frame.w > 12 && el.frame.h > 7) return 1;
		const i = elements.findIndex((e) => e.id === el.id);
		const at = 8 + i / Math.max(1, elements.length - 1) * 32;
		return interpolate(local, [at, at + 14], [0, 1], clamp);
	};
	const grid = interpolate(local, [0, 10, 44, 60], [0, 0.3, 0.3, 0], clamp);
	return <AbsoluteFill style={{opacity: interpolate(f, [258, 270], [1, 0], clamp)}}>
		<Title size={72} top={136}>Slide Agent builds<br /><span style={accentWord()}>what your assistant designs.</span></Title>
		<div style={{position: 'absolute', left: M, top: 322, fontFamily: mono, fontSize: 22, letterSpacing: '0.06em', color: C.blue}}>LAYOUT → TEXT FIT → CHECKS → .PPTX</div>
		<div style={{position: 'absolute', left: M, top: SLIDE_Y, width: CW, height: SLIDE_H, borderRadius: 14, overflow: 'hidden', boxShadow: '0 26px 60px -24px rgba(10,20,51,0.35)', opacity: interpolate(local, [0, 10], [0, 1], clamp), translate: `0px ${(1 - interpolate(local, [0, 14], [0, 1], {...clamp, easing: ease.out})) * 18}px`}}>
			<SlideView slide={slide} width={CW} assetBase={ANALYTICS_ASSETS} reveal={reveal} />
			<svg width={CW} height={SLIDE_H} style={{position: 'absolute', inset: 0, opacity: grid}}>{Array.from({length: 13}, (_, i) => <line key={i} x1={i * CW / 12} x2={i * CW / 12} y1={0} y2={SLIDE_H} stroke={C.blue} strokeWidth={1.5} />)}</svg>
		</div>
		<div style={{position: 'absolute', left: M, right: M, top: 950, fontFamily: display, fontSize: 33, fontWeight: 600, color: C.inkSoft}}>{beat.note}</div>
		<Card style={{left: M, top: 1012, width: CW, height: 90, display: 'flex', alignItems: 'center', gap: 22, padding: '0 26px'}}>
			<span style={{fontFamily: display, fontSize: 34, color: C.good}}>✓</span>
			<div style={{fontFamily: display, fontSize: 30, fontWeight: 600, color: C.ink}}>Text fit and contrast checked.</div>
			<div style={{marginLeft: 'auto', fontFamily: mono, fontSize: 22, color: C.blue}}>native .pptx</div>
		</Card>
		<div style={{position: 'absolute', left: M, right: M, top: 1142, display: 'flex', gap: 12}}>{narrative.map((s, i) => <Img key={s.id} src={staticFile(`announce/analytics/0${i + 1}.png`)} style={{width: (CW - 48) / 5, height: ((CW - 48) / 5) * 9 / 16, objectFit: 'contain', borderRadius: 6, outline: s.id === beat.id ? `3px solid ${C.blue}` : `1px solid ${C.line}`}} />)}</div>
		<div style={{position: 'absolute', left: M, top: 1272, fontFamily: mono, fontSize: 20, color: C.dim}}>ILLUSTRATIVE WORKFLOW · REAL 5-SLIDE OUTPUT</div>
		{[8, 24, 40, 118, 142, 166, 200, 224].map((at) => <Audio key={at} name={`Build ${at}`} from={at} src={staticFile('launch/audio/land.wav')} volume={0.22} premountFor={fps} />)}
	</AbsoluteFill>;
};
