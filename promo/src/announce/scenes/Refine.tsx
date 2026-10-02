import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SlideView} from '../../launch/components/SlideView';
import {typed} from '../../launch/components/ui';
import {accentWord, C, clamp, display, ease, mono} from '../../launch/theme';
import {ANALYTICS_ASSETS, analyticsSlide} from '../data';
import {Card, CW, M, Title} from '../kit';

const ASK = 'Use blue as the accent colour.';
export const Refine: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const blue = interpolate(f, [64, 88], [0, 1], {...clamp, easing: ease.inOut});
	const ask = typed(ASK, f, 8, 90);
	return <AbsoluteFill style={{opacity: interpolate(f, [168, 180], [1, 0], clamp)}}>
		<Title size={76} top={136}>Ask for a change.<br /><span style={accentWord()}>Keep moving.</span></Title>
		<Card style={{left: M, top: 350, width: CW, height: 154, padding: '24px 30px', background: C.blue, color: '#fff'}}>
			<div style={{fontFamily: mono, fontSize: 21, letterSpacing: '0.08em', opacity: 0.85}}>YOUR NEXT MESSAGE</div>
			<div style={{fontFamily: display, fontSize: 43, fontWeight: 600, marginTop: 16}}>{ask}</div>
		</Card>
		<div style={{position: 'absolute', left: M, top: 552, display: 'flex', alignItems: 'center', gap: 16, opacity: interpolate(f, [32, 46], [0, 1], clamp)}}>
			<Img src={staticFile('icon.png')} style={{width: 48, height: 48}} />
			<div style={{fontFamily: display, fontSize: 32, fontWeight: 600, color: C.inkSoft}}>Update the design language. Rebuild the deck.</div>
		</div>
		<div style={{position: 'absolute', left: M, top: 654, width: CW, height: CW * 9 / 16, borderRadius: 14, overflow: 'hidden', boxShadow: '0 28px 60px -24px rgba(10,20,51,0.35)'}}>
			<SlideView slide={analyticsSlide('data-story')} width={CW} assetBase={ANALYTICS_ASSETS} />
			<div style={{position: 'absolute', inset: 0, opacity: blue}}><SlideView slide={analyticsSlide('data-story', true)} width={CW} assetBase={ANALYTICS_ASSETS} /></div>
		</div>
		<div style={{position: 'absolute', left: M, right: M, top: 1220, textAlign: 'center', fontFamily: display, fontSize: 32, fontWeight: 600, color: C.inkSoft, opacity: interpolate(f, [88, 102], [0, 1], clamp)}}>Design updated across the presentation.</div>
		<div style={{position: 'absolute', left: M, top: 1272, fontFamily: mono, fontSize: 20, color: C.dim}}>REAL ENGINE REVISION · ILLUSTRATIVE CONVERSATION</div>
		<Audio name="Ask" from={8} src={staticFile('launch/audio/typing-short.wav')} volume={0.25} premountFor={fps} />
		<Audio name="Revised" from={78} src={staticFile('launch/audio/pop.wav')} volume={0.29} premountFor={fps} />
	</AbsoluteFill>;
};
