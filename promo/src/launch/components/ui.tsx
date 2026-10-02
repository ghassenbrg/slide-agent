import type React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, clamp, display, ease, mono} from '../theme';

// The dark room the problem lives in.
export const NightStage: React.FC<{children?: React.ReactNode}> = ({children}) => (
	<AbsoluteFill style={{background: C.night}}>
		<AbsoluteFill
			style={{
				background: 'radial-gradient(ellipse 60% 55% at 50% 45%, rgba(47,91,255,0.16), rgba(5,9,24,0) 70%)',
			}}
		/>
		{children}
		<AbsoluteFill style={{background: 'radial-gradient(ellipse 85% 80% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.65) 100%)', pointerEvents: 'none'}} />
	</AbsoluteFill>
);

// The bright studio the product lives in: paper, a faint 12×6 grid, soft light.
export const PaperStage: React.FC<{gridOpacity?: number}> = ({gridOpacity = 1}) => {
	const cols = Array.from({length: 13}, (_, i) => i);
	const rows = Array.from({length: 7}, (_, i) => i);
	return (
		<AbsoluteFill style={{background: C.paper}}>
			<svg width={1920} height={1080} style={{position: 'absolute', opacity: 0.5 * gridOpacity}}>
				{cols.map((i) => (
					<line key={`c${i}`} x1={60 + i * 150} x2={60 + i * 150} y1={0} y2={1080} stroke={C.line} strokeWidth={1} />
				))}
				{rows.map((i) => (
					<line key={`r${i}`} x1={0} x2={1920} y1={i * 180} y2={i * 180} stroke={C.line} strokeWidth={1} />
				))}
			</svg>
			<AbsoluteFill style={{background: 'radial-gradient(ellipse 70% 60% at 50% 35%, rgba(255,255,255,0.9), rgba(244,245,249,0) 70%)'}} />
		</AbsoluteFill>
	);
};

// A mouse pointer.
export const Pointer: React.FC<{x: number; y: number; pressed?: boolean; opacity?: number; dark?: boolean}> = ({x, y, pressed, opacity = 1, dark}) => (
	<svg
		width={44}
		height={44}
		viewBox="0 0 24 24"
		style={{position: 'absolute', left: x - 6, top: y - 3, opacity, scale: pressed ? 0.88 : 1, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.35))', zIndex: 50}}
	>
		<path d="M5 2.5 L5 19.5 L9.4 15.4 L12.3 21.8 L15.2 20.5 L12.3 14.2 L18.4 14.2 Z" fill={dark ? '#fff' : '#111'} stroke={dark ? '#111' : '#fff'} strokeWidth={1.4} strokeLinejoin="round" />
	</svg>
);

// A blinking text caret: on for 15 frames, off for 15.
export const Caret: React.FC<{height: number; color: string; from?: number; solid?: boolean; style?: React.CSSProperties}> = ({height, color, from = 0, solid, style}) => {
	const f = useCurrentFrame();
	const on = solid || Math.floor((f - from) / 15) % 2 === 0;
	return <span style={{display: 'inline-block', width: Math.max(3, height * 0.06), height, background: color, opacity: on ? 1 : 0, verticalAlign: 'middle', ...style}} />;
};

// "01 — PLAN" and its line: the stage marker used by every pipeline scene.
export const StageTitle: React.FC<{
	n: string;
	label: string;
	children: React.ReactNode;
	at?: number;
	out?: number;
	top?: number;
	align?: 'left' | 'center';
}> = ({n, label, children, at = 0, out, top = 92, align = 'left'}) => {
	const f = useCurrentFrame();
	const a = interpolate(f, [at, at + 18], [0, 1], {...clamp, easing: ease.out});
	const b = interpolate(f, [at + 6, at + 26], [0, 1], {...clamp, easing: ease.out});
	const o = out === undefined ? 1 : interpolate(f, [out, out + 10], [1, 0], clamp);
	return (
		<div style={{position: 'absolute', left: align === 'left' ? 120 : 0, right: align === 'left' ? undefined : 0, top, opacity: o, textAlign: align}}>
			<div style={{fontFamily: mono, fontSize: 24, fontWeight: 500, letterSpacing: '0.16em', color: C.blue, opacity: a, translate: `0px ${(1 - a) * 12}px`}}>
				{n} — {label}
			</div>
			<div
				style={{
					fontFamily: display,
					fontWeight: 700,
					fontSize: 76,
					letterSpacing: '-0.035em',
					lineHeight: 1.04,
					color: C.ink,
					marginTop: 14,
					opacity: b,
					translate: `0px ${(1 - b) * 22}px`,
				}}
			>
				{children}
			</div>
		</div>
	);
};

// A small mono status chip, e.g. "contrast 12.9:1 ✓".
export const Chip: React.FC<{children: React.ReactNode; tone?: 'good' | 'warn' | 'plain' | 'blue'; style?: React.CSSProperties}> = ({children, tone = 'plain', style}) => {
	const col = tone === 'good' ? C.good : tone === 'warn' ? '#D9480F' : tone === 'blue' ? C.blue : C.inkSoft;
	const bg = tone === 'good' ? '#E5F6EC' : tone === 'warn' ? '#FFEDE3' : tone === 'blue' ? C.blueSoft : '#ECEEF4';
	return (
		<div
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 10,
				padding: '9px 16px',
				borderRadius: 999,
				background: bg,
				color: col,
				fontFamily: mono,
				fontSize: 21,
				fontWeight: 500,
				whiteSpace: 'nowrap',
				...style,
			}}
		>
			{children}
		</div>
	);
};

// Characters of `text` revealed by frame, for typing effects.
export const typed = (text: string, frame: number, start: number, cps: number, fps = 30) => {
	const n = Math.max(0, Math.floor(((frame - start) / fps) * cps));
	return text.slice(0, n);
};
