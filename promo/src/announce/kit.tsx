import type React from 'react';
import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {C, clamp, display, ease, mono} from '../launch/theme';

// The announcement film is 4:5 portrait (1080×1350). One layout everywhere:
//
//   y   40  brand lockup (left) · OPEN SOURCE (right) — on every frame
//   y  140  headline
//   y  300+ the picture
//   y 1290  bottom safe edge
export const W = 1080;
export const H = 1350;
export const M = 72;
export const CW = W - 2 * M;

// The product is named from frame 0 — no logo intro to wait through.
export const Lockup: React.FC<{opacity?: number}> = ({opacity = 1}) => (
	<div style={{position: 'absolute', left: M, right: M, top: 40, height: 64, display: 'flex', alignItems: 'center', opacity}}>
		<Img src={staticFile('icon.png')} style={{width: 56, height: 56}} />
		<div style={{marginLeft: 16, fontFamily: display, fontWeight: 800, fontSize: 36, letterSpacing: '-0.035em', color: C.ink}}>Slide Agent</div>
		<div style={{marginLeft: 'auto', padding: '8px 16px', borderRadius: 999, border: `1.5px solid ${C.line}`, background: '#fff', fontFamily: mono, fontSize: 20, fontWeight: 500, letterSpacing: '0.12em', color: C.inkSoft}}>
			OPEN SOURCE
		</div>
	</div>
);

export const Title: React.FC<{children: React.ReactNode; at?: number; size?: number; top?: number; out?: number}> = ({children, at = 0, size = 72, top = 140, out}) => {
	const f = useCurrentFrame();
	const t = interpolate(f, [at, at + 16], [0, 1], {...clamp, easing: ease.out});
	const o = out === undefined ? 1 : interpolate(f, [out, out + 10], [1, 0], clamp);
	return (
		<div
			style={{
				position: 'absolute',
				left: M,
				right: M,
				top,
				fontFamily: display,
				fontWeight: 700,
				fontSize: size,
				lineHeight: 1.04,
				letterSpacing: '-0.04em',
				color: C.ink,
				opacity: t * o,
				translate: `0px ${(1 - t) * 22}px`,
			}}
		>
			{children}
		</div>
	);
};

export const Card: React.FC<{style?: React.CSSProperties; children: React.ReactNode}> = ({style, children}) => (
	<div
		style={{
			position: 'absolute',
			borderRadius: 24,
			background: '#fff',
			boxShadow: '0 1px 2px rgba(10,20,51,0.06), 0 14px 36px -12px rgba(10,20,51,0.2)',
			...style,
		}}
	>
		{children}
	</div>
);

export const Label: React.FC<{children: React.ReactNode; color?: string}> = ({children, color = C.blue}) => (
	<div style={{fontFamily: mono, fontSize: 20, fontWeight: 500, letterSpacing: '0.14em', color}}>{children}</div>
);
