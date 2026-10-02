import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SlideView} from '../../launch/components/SlideView';
import {C, clamp, display, ease, mono} from '../../launch/theme';
import {ANALYTICS_ASSETS, analyticsSlide} from '../data';
import {Card, CW, M} from '../kit';

export const Introduce: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const exit = interpolate(f, [108, 120], [0, 1], {...clamp, easing: ease.in});
	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			<div style={{position: 'absolute', left: M, top: 165, fontFamily: display, fontSize: 54, fontWeight: 600, color: C.inkSoft}}>Introducing</div>
			<div style={{position: 'absolute', left: M, right: M, top: 228, fontFamily: display, fontSize: 136, fontWeight: 800, letterSpacing: '-0.055em', lineHeight: 1, color: C.blue}}>Slide Agent.</div>
			<div style={{position: 'absolute', left: M, right: M, top: 394, fontFamily: display, fontSize: 41, fontWeight: 500, lineHeight: 1.25, color: C.inkSoft}}>An open-source presentation tool<br />for your AI assistant.</div>
			<Card style={{left: M, top: 540, width: CW, height: 142, padding: '24px 30px', border: `1.5px solid ${C.line}`}}>
				<div style={{fontFamily: mono, fontSize: 21, letterSpacing: '0.1em', color: C.blue}}>YOUR BRIEF</div>
				<div style={{fontFamily: display, fontSize: 36, fontWeight: 600, color: C.ink, marginTop: 12}}>Turn these metrics into a presentation.</div>
			</Card>
			<div style={{position: 'absolute', left: M, right: M, top: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: display, fontSize: 30, fontWeight: 600, color: C.inkSoft}}>
				<span style={{color: C.blue}}>↓</span> Editable PowerPoint
			</div>
			<div style={{position: 'absolute', left: M, top: 762, borderRadius: 14, overflow: 'hidden', boxShadow: '0 28px 60px -24px rgba(10,20,51,0.35)', translate: `0px ${-interpolate(f, [0, 120], [0, 9], clamp)}px`}}>
				<SlideView slide={analyticsSlide('data-story')} width={CW} assetBase={ANALYTICS_ASSETS} />
			</div>
			<Audio name="Into workflow" from={110} src={staticFile('launch/audio/whoosh.wav')} volume={0.23} premountFor={fps} />
		</AbsoluteFill>
	);
};
