import {loadFont as loadInstrumentSerif} from '@remotion/google-fonts/InstrumentSerif';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadInterTight} from '@remotion/google-fonts/InterTight';
import {loadFont as loadJetBrainsMono} from '@remotion/google-fonts/JetBrainsMono';
import {loadFont as loadDMSans} from '@remotion/google-fonts/DMSans';
import {loadFont as loadFraunces} from '@remotion/google-fonts/Fraunces';
import {loadFont as loadPlusJakartaSans} from '@remotion/google-fonts/PlusJakartaSans';
import {loadFont as loadSpaceGrotesk} from '@remotion/google-fonts/SpaceGrotesk';
import type React from 'react';
import {Easing} from 'remotion';

// The film's own voice.
export const display = loadInterTight('normal', {weights: ['500', '600', '700', '800'], subsets: ['latin']}).fontFamily;
export const serif = loadInstrumentSerif('italic', {weights: ['400'], subsets: ['latin']}).fontFamily;
export const mono = loadJetBrainsMono('normal', {weights: ['400', '500', '700'], subsets: ['latin']}).fontFamily;

// The demo deck's faces — the ones its design language chose, so the
// slides drawn from scene.json set in the same type the engine measured.
export const deckFonts: Record<string, string> = {
	'Plus Jakarta Sans': loadPlusJakartaSans('normal', {weights: ['400', '500', '600', '700', '800'], subsets: ['latin', 'latin-ext']}).fontFamily,
	'Inter Tight': display,
	Inter: loadInter('normal', {weights: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext']}).fontFamily,
	'Space Grotesk': loadSpaceGrotesk('normal', {weights: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext']}).fontFamily,
	'JetBrains Mono': mono,
	Fraunces: loadFraunces('normal', {weights: ['400', '600'], subsets: ['latin', 'latin-ext']}).fontFamily,
	'DM Sans': loadDMSans('normal', {weights: ['400', '500', '700'], subsets: ['latin', 'latin-ext']}).fontFamily,
};

// Palette lifted from the Slide Agent icon. Dark for the problem, paper for
// the product.
export const C = {
	night: '#050918',
	nightPanel: 'rgba(20, 30, 64, 0.72)',
	nightLine: 'rgba(150, 170, 230, 0.16)',
	nightInk: '#E9EDFA',
	nightDim: '#7D88AE',
	warn: '#FF6B5A',
	amber: '#FFB547',

	paper: '#F4F5F9',
	card: '#FFFFFF',
	ink: '#0A1433',
	inkSoft: '#3A4566',
	dim: '#8590AE',
	line: 'rgba(10, 20, 51, 0.09)',
	blue: '#2F5BFF',
	blueSoft: '#E6ECFF',
	teal: '#14B8A6',
	good: '#12A150',
} as const;

export const ease = {
	out: Easing.bezier(0.16, 1, 0.3, 1),
	inOut: Easing.bezier(0.65, 0, 0.35, 1),
	in: Easing.bezier(0.7, 0, 0.84, 0),
	soft: Easing.bezier(0.33, 1, 0.68, 1),
};

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const shadow = {
	card: '0 1px 2px rgba(10,20,51,0.06), 0 12px 32px -8px rgba(10,20,51,0.18), 0 40px 80px -24px rgba(10,20,51,0.18)',
	lift: '0 2px 4px rgba(10,20,51,0.08), 0 24px 60px -12px rgba(10,20,51,0.28)',
};

export const accentWord = (color: string = C.blue): React.CSSProperties => ({
	fontFamily: serif,
	fontStyle: 'italic',
	fontWeight: 400,
	color,
	letterSpacing: '-0.01em',
});

// 120 BPM at 30 fps.
export const BEAT = 15;
