// The demo deck the film builds is a real Slide Agent deck: launch/demo/intent.json,
// built by `slide-agent build`, finalized `ready`. scene.json is the engine's
// own output — every frame below is a position the engine computed.
import scene from './data/scene.json';

type Hex = {hex: string; token?: string};

export type Frame = {x: number; y: number; w: number; h: number};

export type TextEl = {
	kind: 'text';
	id: string;
	role: string;
	frame: Frame;
	z: number;
	paragraphs: {runs: {text: string; bold?: boolean; italic?: boolean}[]}[];
	style: {
		family?: string;
		font?: string;
		weight?: number;
		size: number;
		bold?: boolean;
		italic?: boolean;
		color: Hex;
		align: 'left' | 'center' | 'right';
		valign: 'top' | 'middle' | 'bottom';
		leading: number;
		tracking?: number;
		case?: 'upper' | 'lower';
		inset: [number, number, number, number];
	};
	fit?: {status: string; steps: string[]; lines?: number};
};

export type ShapeEl = {
	kind: 'shape';
	id: string;
	role: string;
	frame: Frame;
	z: number;
	decorative?: boolean;
	style: {
		preset: string;
		fill?: Hex;
		stroke?: Hex;
		strokeWidth?: number;
		radius?: number;
		opacity?: number;
		gradient?: {from: Hex; to: Hex; angle: number; toAlpha?: number};
		shadow?: 'none' | 'soft' | 'hard';
		path?: string;
	};
	rotate?: number;
};

export type IconEl = {
	kind: 'icon';
	id: string;
	frame: Frame;
	z: number;
	name: string;
	paths: {d: string; fill: boolean}[];
	color: Hex;
	strokeWidth: number;
};

export type ChartEl = {
	kind: 'chart';
	id: string;
	frame: Frame;
	z: number;
	chart: 'line' | 'column' | 'bar' | 'pie' | 'doughnut' | 'area';
	data: {categories: string[]; series: {name: string; values: number[]}[]};
	colors: Hex[];
	highlight?: number[];
	style: {font: string; size: number; text: Hex; muted: Hex; rule: Hex; legend: string; labels?: string; highlight?: Hex};
};

export type ConnectorEl = {
	kind: 'connector';
	id: string;
	frame: Frame;
	z: number;
	points: {x: number; y: number}[];
	style: {stroke: Hex; strokeWidth: number; arrowEnd?: boolean};
};

export type TableEl = {
	kind: 'table';
	id: string;
	frame: Frame;
	z: number;
	columns: string[];
	rows: string[][];
	columnWidths: number[];
	rowHeights: number[];
	highlight?: {row: number};
	style: {
		font: string;
		size: number;
		text: Hex;
		headerText: Hex;
		headerFill: Hex;
		rule: Hex;
		highlightFill: Hex;
		align: ('left' | 'right' | 'center')[];
	};
};

export type ImageEl = {
	kind: 'image';
	id: string;
	frame: Frame;
	z: number;
	asset: string;
	crop?: {left: number; right: number; top: number; bottom: number};
	alt?: string;
};

export type El = TextEl | ShapeEl | IconEl | ChartEl | ConnectorEl | TableEl | ImageEl;

export type Slide = {
	id: string;
	index: number;
	message: string;
	background: Hex;
	elements: El[];
};

export const deck = scene as unknown as {size: {width: number; height: number}; slides: Slide[]};

export const SLIDE_W_IN = deck.size.width;
export const SLIDE_H_IN = deck.size.height;

export const slideById = (id: string): Slide => {
	const s = deck.slides.find((x) => x.id === id);
	if (!s) throw new Error(`no slide ${id}`);
	return s;
};

export const hex = (c: Hex | undefined, fallback = '#000') => (c ? `#${c.hex}` : fallback);

export const textOf = (el: TextEl) => el.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n');

// WCAG relative-luminance contrast ratio, used for the build scene's checks.
const lum = (h: string) => {
	const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
	return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
export const contrast = (a: string, b: string) => {
	const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
	return (x + 0.05) / (y + 0.05);
};

export const DECK_PREVIEWS = [
	'01-cover',
	'02-agenda',
	'03-results',
	'04-traffic',
	'05-architecture',
	'06-reliability',
	'07-capabilities',
	'08-roadmap',
	'09-asks',
] as const;
