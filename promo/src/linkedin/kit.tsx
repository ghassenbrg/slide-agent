import type React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {C, clamp, display, ease, mono} from '../launch/theme';

// The LinkedIn cut is 4:5 portrait: the tallest frame the feed shows on a
// phone. Every scene shares one layout so the eye never has to hunt:
//
//   y   48  step bar (pipeline scenes)
//   y  110  headline — the one thing to read
//   y  470  the picture
//   y 1290  bottom safe edge
export const W = 1080;
export const H = 1350;
export const M = 72; // side margin
export const CONTENT_W = W - 2 * M;
export const PICTURE_Y = 470;

// "2 — PLAN" and a big headline, set for a phone screen.
export const Headline: React.FC<{
	label?: string;
	children: React.ReactNode;
	at?: number;
	out?: number;
	size?: number;
	dark?: boolean;
	top?: number;
}> = ({label, children, at = 0, out, size = 76, dark, top = 104}) => {
	const f = useCurrentFrame();
	const a = interpolate(f, [at, at + 14], [0, 1], {...clamp, easing: ease.out});
	const b = interpolate(f, [at + 4, at + 22], [0, 1], {...clamp, easing: ease.out});
	const o = out === undefined ? 1 : interpolate(f, [out, out + 10], [1, 0], clamp);
	return (
		<div style={{position: 'absolute', left: M, right: M, top, opacity: o}}>
			{label ? (
				<div style={{fontFamily: mono, fontSize: 26, fontWeight: 500, letterSpacing: '0.16em', color: dark ? '#8FA8FF' : C.blue, opacity: a, translate: `0px ${(1 - a) * 12}px`}}>
					{label}
				</div>
			) : null}
			<div
				style={{
					fontFamily: display,
					fontWeight: 700,
					fontSize: size,
					letterSpacing: '-0.04em',
					lineHeight: 1.04,
					color: dark ? '#fff' : C.ink,
					marginTop: label ? 16 : 0,
					opacity: b,
					translate: `0px ${(1 - b) * 24}px`,
				}}
			>
				{children}
			</div>
		</div>
	);
};

// Five steps, the current one filled: a progress bar people can read at a glance.
export const StepBar: React.FC<{step: number; progress: number}> = ({step, progress}) => (
	<div style={{position: 'absolute', left: M, right: M, top: 52, display: 'flex', gap: 10}}>
		{[1, 2, 3, 4, 5].map((n) => (
			<div key={n} style={{flex: 1, height: 8, borderRadius: 8, background: 'rgba(10,20,51,0.1)', overflow: 'hidden'}}>
				<div style={{width: `${n < step ? 100 : n === step ? progress * 100 : 0}%`, height: '100%', background: C.blue, borderRadius: 8}} />
			</div>
		))}
	</div>
);
