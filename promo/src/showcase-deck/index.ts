// The showcase deck the films show: five slides from five different kinds of
// presentation, built as one Slide Agent deck and finalized `ready`
// (promo/showcase — showcase.py writes the intent, make_assets.py the two
// background images). scene.json is the engine's computed geometry.
//
// The per-slide descriptions follow the showcase's own notes (showcase.py and
// site/showcase.md); palettes are each slide's dominant colours in the scene.
import type {Slide} from '../launch/deck';
import scene from './scene.json';

export type Genre = {
	id: string;
	genre: string;
	prompt: string;
	system: string;
	detail: string;
	fonts: string[];
	palette: string[];
	shows: string[];
	render: string; // the LibreOffice render of the real .pptx, under public/
};

export const SHOWCASE_ASSETS = 'showcase-deck/assets';
export const showcaseSlides = (scene as unknown as {slides: Slide[]}).slides;

export const GENRES: Genre[] = [
	{
		id: 'executive-dashboard',
		genre: 'Executive dashboard',
		prompt: 'Q4 status. Clear, concise, decision-ready.',
		system: 'Steering-committee clarity',
		detail: 'White cards on cool grey, Avenir Next, status colour that carries meaning.',
		fonts: ['Avenir Next'],
		palette: ['#F3F5F9', '#FFFFFF', '#0F1B33', '#5B6478', '#2563EB', '#16A34A', '#DC2626'],
		shows: ['KPI cards', 'Progress rings', 'Milestones'],
		render: 'showcase-deck/slides/slide-1.png',
	},
	{
		id: 'architecture',
		genre: 'Technical architecture',
		prompt: 'Platform architecture. Dark and technical.',
		system: 'Night-mode architecture',
		detail: 'Deep navy under a soft glow, Helvetica Neue with Menlo tags, connectors coloured by domain.',
		fonts: ['Helvetica Neue', 'Menlo'],
		palette: ['#0A1022', '#152040', '#E8EDF7', '#97A3BF', '#38BDF8', '#A78BFA'],
		shows: ['System diagram', 'Routed connectors', 'Icons'],
		render: 'showcase-deck/slides/slide-2.png',
	},
	{
		id: 'data-story',
		genre: 'Data story',
		prompt: 'Six months of analytics. One clear story.',
		system: 'Editorial analytics',
		detail: 'Warm paper, Charter headlines, ink data and a single coral signal.',
		fonts: ['Charter', 'Helvetica Neue'],
		palette: ['#F6F3EC', '#ECE6DA', '#1B1B1F', '#66625B', '#C2410C', '#FF8A5B'],
		shows: ['Native chart', 'Retention curve', 'Funnel'],
		render: 'showcase-deck/slides/slide-3.png',
	},
	{
		id: 'product-keynote',
		genre: 'Product keynote',
		prompt: 'An AI workspace launch. Bold and minimal.',
		system: 'Launch keynote',
		detail: 'Oversized type, white light, and a device built entirely from editable shapes.',
		fonts: ['Helvetica Neue'],
		palette: ['#FFFFFF', '#F7F6FB', '#16161C', '#6E6C80', '#6D28D9', '#EFEAFE'],
		shows: ['Big type', 'Device mockup', 'Editable UI'],
		render: 'showcase-deck/slides/slide-4.png',
	},
	{
		id: 'transformation',
		genre: 'Transformation roadmap',
		prompt: 'An AI roadmap. Consulting style.',
		system: 'Consulting maturity model',
		detail: 'Futura and Gill Sans, chevrons from manual to AI-native, a three-year roadmap.',
		fonts: ['Futura', 'Gill Sans'],
		palette: ['#FFFFFF', '#F1F3F6', '#1F2933', '#5F6E84', '#0F7C86', '#1E3A8A', '#C98A0B'],
		shows: ['Chevrons', 'Maturity model', 'Gantt roadmap'],
		render: 'showcase-deck/slides/slide-5.png',
	},
];

export const showcaseSlide = (id: string): Slide => {
	const s = showcaseSlides.find((x) => x.id === id);
	if (!s) throw new Error(`no showcase slide ${id}`);
	return s;
};
