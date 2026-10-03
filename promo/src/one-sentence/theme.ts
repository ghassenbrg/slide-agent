import {Easing, interpolate, spring} from 'remotion';

// Visual language from the product's own icon and website: navy stage, Slide Agent blue, teal.
export const C = {
	night: '#060D26',
	navy: '#0A1638',
	navy2: '#0F2459',
	panel: '#0C1A44',
	line: 'rgba(160,185,255,0.18)',
	blue: '#2F5BFF',
	blueSoft: '#7B97FF',
	teal: '#14B8A6',
	white: '#FFFFFF',
	ink: '#0B1430',
	mist: '#B9C7F2',
	dim: '#7F8DB8',
	lime: '#C9F26B',
	paper: '#F6F4EE',
};

export const FONT = '"Avenir Next", "Avenir", "Helvetica Neue", sans-serif';
export const MONO = '"SF Mono", Menlo, monospace';

export const W = 1080;
export const H = 1350;
export const FPS = 30;

// Motion voice: "professional trust" — decisive deceleration, no bounce except on landings.
export const out = Easing.bezier(0.16, 1, 0.3, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
export const ease = Easing.bezier(0.33, 0, 0.2, 1);

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** 0→1 over [start, start+dur] with an easing. */
export const tween = (f: number, start: number, dur: number, e = out) =>
	interpolate(f, [start, start + dur], [0, 1], {...clamp, easing: e});

/** 0→1 as an outgoing shot pushes back (smaller, darker) under the incoming one; cuts never dip through an empty frame. */
export const recede = (f: number, at: number, dur = 16) => tween(f, at, dur, inOut);

/** Spring landing (slight settle, used where an object lands). */
export const land = (f: number, start: number, fps = FPS, damping = 18, stiffness = 140) =>
	spring({frame: f - start, fps, config: {damping, stiffness, mass: 0.9}});

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic hash noise in [0,1). */
export const rand = (n: number) => {
	const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
};
