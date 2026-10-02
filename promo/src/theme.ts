import {loadFont as loadInterTight} from '@remotion/google-fonts/InterTight';
import {loadFont as loadJetBrainsMono} from '@remotion/google-fonts/JetBrainsMono';
import {Easing} from 'remotion';

export const display = loadInterTight('normal', {
	weights: ['500', '600', '700', '800', '900'],
	subsets: ['latin'],
}).fontFamily;

export const mono = loadJetBrainsMono('normal', {
	weights: ['400', '500', '700'],
	subsets: ['latin'],
}).fontFamily;

// Palette lifted from the Slide Agent icon: deep navy, electric blue, teal.
export const C = {
	bg: '#040A22',
	navy: '#0A1A4A',
	panel: 'rgba(14, 26, 70, 0.72)',
	panelSolid: '#0D1A45',
	line: 'rgba(140, 170, 255, 0.18)',
	blue: '#3D6BFF',
	blueDeep: '#2346D6',
	cyan: '#2EE6C9',
	ink: '#EEF2FF',
	dim: '#8C9BD0',
	red: '#FF5470',
	amber: '#FFC04D',
	green: '#3BE38B',
} as const;

export const gradientText = (from: string, to: string): React.CSSProperties => ({
	backgroundImage: `linear-gradient(100deg, ${from}, ${to})`,
	WebkitBackgroundClip: 'text',
	backgroundClip: 'text',
	color: 'transparent',
});

export const ease = {
	out: Easing.bezier(0.16, 1, 0.3, 1),
	inOut: Easing.bezier(0.65, 0, 0.35, 1),
	in: Easing.bezier(0.7, 0, 0.84, 0),
};

export const clamp = {
	extrapolateLeft: 'clamp',
	extrapolateRight: 'clamp',
} as const;

// One beat at 120 BPM and 30 fps.
export const BEAT = 15;
