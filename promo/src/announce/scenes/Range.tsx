import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {accentWord, C, clamp, display, ease, mono} from '../../launch/theme';
import {CW, M, Title} from '../kit';

const EXAMPLES = [
	{slug: 'executive', label: 'Executive reviews'},
	{slug: 'architecture', label: 'Architecture'},
	{slug: 'analytics', label: 'Analytics'},
	{slug: 'nova', label: 'Product launches'},
	{slug: 'transformation', label: 'Roadmaps'},
];
const WIDTH = (CW - 32) / 2;
export const Range: React.FC = () => {
	const f = useCurrentFrame();
	return <AbsoluteFill style={{opacity: interpolate(f, [138, 150], [1, 0], clamp)}}>
		<Title size={76} top={136}>One tool.<br /><span style={accentWord()}>For the work you present.</span></Title>
		{EXAMPLES.map((g, i) => {
			const at = 6 + i * 5;
			const enter = interpolate(f, [at, at + 16], [0, 1], {...clamp, easing: ease.out});
			return <div key={g.slug} style={{position: 'absolute', left: i === 4 ? (1080 - WIDTH) / 2 : M + (i % 2) * (WIDTH + 32), top: 348 + Math.floor(i / 2) * 296, width: WIDTH, opacity: enter, translate: `0px ${(1 - enter) * 26}px`}}>
				<Img src={staticFile(`announce/range/${g.slug}.png`)} style={{width: WIDTH, height: WIDTH * 9 / 16, borderRadius: 10, boxShadow: '0 15px 32px -12px rgba(10,20,51,0.28)'}} />
				<div style={{fontFamily: display, fontSize: 29, fontWeight: 600, color: C.inkSoft, textAlign: 'center', marginTop: 13}}>{g.label}</div>
			</div>;
		})}
		<div style={{position: 'absolute', left: M, right: M, top: 1272, fontFamily: mono, fontSize: 20, color: C.dim}}>REAL SHOWCASE PRESENTATIONS · SAMPLE DATA</div>
	</AbsoluteFill>;
};
