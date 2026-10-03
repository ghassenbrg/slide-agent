import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import geometry from './geometry.json';
import {C, FONT, H, W, clamp} from './theme';

// Real Slide Agent output: LibreOffice renders of the native .pptx, rasterised at 216 dpi.
export const SW = 2881;
export const SH = 1620;
export const PX = SW / 13.3333; // slide pixels per inch

export type DeckSlide = 'fern-1' | 'fern-2' | 'fern-3' | 'fern-4' | 'fern-5' | 'architecture-1' | 'transformation-1' | 'analytics-1' | 'analytics-2';
export const slideSrc = (id: DeckSlide) => staticFile(`one-sentence/slides/${id}.png`);

type G = Record<string, {elements: {id: string; kind: string; text: string; frame: {x: number; y: number; w: number; h: number}}[]}>;
const GEO = geometry as G;

/** Frame of a real element (by id suffix or text prefix), in slide pixels. */
export const el = (slide: DeckSlide, key: string) => {
	const e = GEO[slide].elements.find((x) => x.id.endsWith('/' + key) || x.text.startsWith(key));
	if (!e) throw new Error(`element ${key} not in ${slide}`);
	return {x: e.frame.x * PX, y: e.frame.y * PX, w: e.frame.w * PX, h: e.frame.h * PX};
};
/** A rectangle given in slide inches, as slide pixels. */
export const inch = (x: number, y: number, w: number, h: number) => ({x: x * PX, y: y * PX, w: w * PX, h: h * PX});
export type Rect = {x: number; y: number; w: number; h: number};
export const pad = (r: Rect, p: number) => ({x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p});
export const center = (r: Rect) => ({x: r.x + r.w / 2, y: r.y + r.h / 2});

/** Navy stage with a slow, deterministic light drift. */
export const Stage: React.FC<{glow?: number}> = ({glow = 1}) => {
	const f = useCurrentFrame();
	const gx = 50 + Math.sin(f / 140) * 12;
	const gy = 34 + Math.cos(f / 170) * 8;
	return (
		<AbsoluteFill style={{background: C.night}}>
			<AbsoluteFill style={{background: `radial-gradient(ellipse 85% 60% at ${gx}% ${gy}%, ${C.navy2} 0%, ${C.navy} 45%, ${C.night} 100%)`, opacity: glow}} />
			<AbsoluteFill style={{background: `radial-gradient(ellipse 50% 30% at ${100 - gx}% 92%, rgba(20,184,166,0.10), transparent 70%)`}} />
		</AbsoluteFill>
	);
};

/** The full slide image, optionally clipped to a rectangle (slide px) with rounded corners. */
export const Slide: React.FC<{id: DeckSlide; clip?: Rect; radius?: number; style?: React.CSSProperties}> = ({id, clip, radius = 0, style}) => {
	const cp = clip ? `inset(${clip.y}px ${SW - clip.x - clip.w}px ${SH - clip.y - clip.h}px ${clip.x}px round ${radius}px)` : undefined;
	return <Img src={slideSrc(id)} style={{position: 'absolute', left: 0, top: 0, width: SW, height: SH, clipPath: cp, ...style}} />;
};

/** A slide as a physical card: rounded, shadowed, at native slide-pixel size (scale it from outside). */
export const SlideCard: React.FC<{id: DeckSlide; children?: React.ReactNode; shadow?: number; style?: React.CSSProperties}> = ({id, children, shadow = 1, style}) => (
	<div style={{position: 'absolute', width: SW, height: SH, borderRadius: 26, overflow: 'hidden', boxShadow: `0 ${60 * shadow}px ${140 * shadow}px rgba(0,0,0,${0.5 * shadow}), 0 0 0 2px rgba(255,255,255,0.06)`, ...style}}>
		<Slide id={id} />
		{children}
	</div>
);

/**
 * Camera over a content plane. Point (cx, cy) of the content (in content px) is placed at
 * screen (x, y) and the content is scaled by s.
 */
export const Cam: React.FC<{cx: number; cy: number; s: number; x?: number; y?: number; children: React.ReactNode}> = ({cx, cy, s, x = W / 2, y = H / 2, children}) => (
	<div style={{position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${x - cx * s}px, ${y - cy * s}px) scale(${s})`}}>{children}</div>
);

/** Interpolate a camera through keyframes [frame, cx, cy, s] with per-segment easing. */
export const camAt = (f: number, keys: [number, number, number, number][], e: (t: number) => number) => {
	if (f <= keys[0][0]) return {cx: keys[0][1], cy: keys[0][2], s: keys[0][3]};
	for (let i = 0; i < keys.length - 1; i++) {
		const [f0, x0, y0, s0] = keys[i];
		const [f1, x1, y1, s1] = keys[i + 1];
		if (f <= f1) {
			const t = e(interpolate(f, [f0, f1], [0, 1], clamp));
			// scale in log space so pushes feel even
			const s = Math.exp(Math.log(s0) + (Math.log(s1) - Math.log(s0)) * t);
			return {cx: x0 + (x1 - x0) * t, cy: y0 + (y1 - y0) * t, s};
		}
	}
	const k = keys[keys.length - 1];
	return {cx: k[1], cy: k[2], s: k[3]};
};

/** Small uppercase overline used for on-screen messages. */
export const Overline: React.FC<{children: React.ReactNode; color?: string; style?: React.CSSProperties}> = ({children, color = C.teal, style}) => (
	<div style={{fontFamily: FONT, fontWeight: 700, fontSize: 26, letterSpacing: '0.16em', textTransform: 'uppercase', color, ...style}}>{children}</div>
);

/** Honest production note (compression, example requests). */
export const Note: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => (
	<div style={{position: 'absolute', fontFamily: FONT, fontWeight: 600, fontSize: 28, color: C.mist, letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 10, ...style}}>
		<span style={{width: 8, height: 8, borderRadius: 8, background: C.teal}} />
		{children}
	</div>
);
