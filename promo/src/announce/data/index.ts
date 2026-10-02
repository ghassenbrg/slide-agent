import type {Slide} from '../../launch/deck';
import scene from './analytics.json';
import revised from './analytics-blue.json';
import intent from './analytics-intent.json';

export const ANALYTICS_ASSETS = 'showcase-deck/assets';
export const analyticsSlides = (scene as unknown as {slides: Slide[]}).slides;
export const revisedSlides = (revised as unknown as {slides: Slide[]}).slides;
export const analyticsSlide = (id: string, blue = false): Slide => {
	const slide = (blue ? revisedSlides : analyticsSlides).find((s) => s.id === id);
	if (!slide) throw new Error(`Missing analytics slide: ${id}`);
	return slide;
};
export const narrative = [
	{id: 'data-story', label: 'Overview', message: 'Growth, retention and activation'},
	{id: 'growth', label: 'Growth', message: 'Monthly users grew 88%'},
	{id: 'retention', label: 'Retention', message: '62% remain at month six'},
	{id: 'funnel', label: 'Activation', message: '11K sign-ups never activate'},
	{id: 'experiment', label: 'Action', message: 'Test an 80% activation scenario'},
];
export const palette = intent.design.language.color.palette;
export const ANALYTICS_BRIEF = 'Create a product analytics presentation from these metrics. Focus on growth, retention and activation. Use a clear editorial style.';
