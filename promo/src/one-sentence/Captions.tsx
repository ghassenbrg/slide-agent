import React from 'react';
import {useCurrentFrame} from 'remotion';
import {CAPTIONS} from './captionTrack';
import {C, FONT, tween} from './theme';

export const Captions: React.FC = () => {
	const f = useCurrentFrame();
	const c = CAPTIONS.find((x) => x.burn && f >= x.from && f < x.to);
	if (!c) return null;
	const a = tween(f, c.from, 5) * (1 - tween(f, c.to - 4, 4));
	return (
		<div style={{position: 'absolute', left: 50, right: 50, top: 1150, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
			<div style={{fontFamily: FONT, fontWeight: 600, fontSize: 64, lineHeight: '74px', color: C.white, textAlign: 'center', textShadow: '0 2px 18px rgba(0,0,0,0.65)', opacity: a, transform: `translateY(${(1 - a) * 8}px)`, textWrap: 'balance'} as React.CSSProperties}>
				{c.text}
			</div>
		</div>
	);
};
