import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {accentWord, C, clamp, display, ease, mono} from '../../launch/theme';
import {narrative, palette} from '../data';
import {Card, CW, M, Title} from '../kit';

export const Story: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const design = interpolate(f, [78, 96], [0, 1], {...clamp, easing: ease.out});
	return <AbsoluteFill style={{opacity: interpolate(f, [198, 210], [1, 0], clamp)}}>
		<Title size={70} top={136}>A story with purpose.<br /><span style={accentWord()}>A design for your audience.</span></Title>
		<div style={{position: 'absolute', left: M, top: 322, fontFamily: mono, fontSize: 21, color: C.blue, letterSpacing: '0.1em'}}>YOUR ASSISTANT · STORY + DESIGN</div>
		{narrative.map((s, i) => {
			const t = interpolate(f, [8 + i * 8, 24 + i * 8], [0, 1], {...clamp, easing: ease.out});
			return <Card key={s.id} style={{left: M, top: 368 + i * 88, width: CW, height: 76, display: 'flex', alignItems: 'center', gap: 20, padding: '0 24px', opacity: t, translate: `${(1 - t) * 40}px 0px`}}>
				<div style={{fontFamily: mono, fontSize: 24, color: C.blue}}>{`0${i + 1}`}</div>
				<div style={{width: 146, fontFamily: display, fontSize: 30, fontWeight: 700, color: C.ink}}>{s.label}</div>
				<div style={{height: 28, width: 1, background: C.line}} />
				<div style={{fontFamily: display, fontSize: 31, fontWeight: 500, color: C.inkSoft}}>{s.message}</div>
			</Card>;
		})}
		<Card style={{left: M, top: 856, width: CW, height: 338, padding: '26px 30px', background: palette.s3paper, opacity: design, translate: `0px ${(1 - design) * 20}px`}}>
			<div style={{fontFamily: mono, fontSize: 21, color: palette.s3coral, letterSpacing: '0.1em'}}>DESIGN LANGUAGE · EDITORIAL ANALYTICS</div>
			<div style={{fontFamily: 'Charter', fontSize: 49, fontWeight: 700, color: palette.s3ink, marginTop: 16}}>Warm paper. Clear evidence.</div>
			<div style={{fontFamily: display, fontSize: 29, color: palette.s3stone, marginTop: 12}}>Quiet typography. One signal colour.</div>
			<div style={{display: 'flex', alignItems: 'center', gap: 14, marginTop: 26}}>
				{[palette.s3paper, palette.s3ink, palette.s3stone, palette.s3coral, palette.s3coralLight].map((color) => <div key={color} style={{width: 54, height: 54, borderRadius: 54, background: color, border: `1px solid ${C.line}`}} />)}
				<div style={{marginLeft: 'auto', fontFamily: 'Charter', fontSize: 43, color: palette.s3ink}}>Aa <span style={{fontFamily: display, fontSize: 25}}>Charter</span></div>
			</div>
		</Card>
		<div style={{position: 'absolute', left: M, right: M, top: 1240, fontFamily: display, fontSize: 32, fontWeight: 600, textAlign: 'center', color: C.inkSoft}}>A clear narrative, before the slides are built.</div>
		{[8, 24, 40, 56, 78].map((at) => <Audio key={at} name={`Story step ${at}`} from={at} src={staticFile('launch/audio/land.wav')} volume={0.24} premountFor={fps} />)}
	</AbsoluteFill>;
};
