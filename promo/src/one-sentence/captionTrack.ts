import {FPS, SHOTS, WORDS} from './timeline';

// Written captions mapped onto spoken word indices (the URL is spoken differently).
export const CHUNKS: [string, number, number, string, boolean?][] = [
	['open', 0, 6, 'Ask your AI agent for a presentation,'],
	['open', 7, 12, 'and get a professionally designed deck.'],
	['open', 13, 16, 'This is Slide Agent.'],
	['install', 0, 6, 'Install it once in a supported agent,'],
	['install', 7, 12, 'like Claude Code, Codex, or Gemini.'],
	['workflow', 0, 3, 'Describe what you need.'],
	['workflow', 4, 7, 'Your agent designs it.'],
	['workflow', 8, 12, 'Slide Agent builds the deck,'],
	['workflow', 13, 18, 'checks the layout, and exports it.'],
	['depth', 0, 5, 'One design system, slide after slide:'],
	['depth', 6, 7, 'the timeline,'],
	['depth', 8, 9, 'the budget,'],
	['depth', 10, 12, 'and the risks.'],
	['range', 0, 4, 'Ask for an architecture review,'],
	['range', 5, 7, 'a strategy roadmap,'],
	['range', 8, 11, 'or a data story,'],
	['range', 12, 17, 'and the design changes with it.'],
	['deliver', 0, 6, 'The result is a real PowerPoint file,'],
	['deliver', 7, 12, 'with editable text and native charts.'],
	// close: the on-screen lockup, URL and invitation carry these words, so they are not burned in (false)
	['close', 0, 7, 'Create professional presentations directly through your AI agent.', false],
	['close', 8, 19, 'Explore examples and install it at slide-agent.ghassen.io', false],
];

const word = (line: string, i: number) => WORDS.find((w) => w.line === line && w.index === i)!;

/** Every caption with its display window in frames; `burn` = shown in the picture. */
export const CAPTIONS = CHUNKS.map(([line, a, b, text, burn], k) => {
	const start = word(line, a).start - 0.08;
	const next = CHUNKS[k + 1];
	const nextStart = next ? word(next[0], next[1]).start - 0.08 : Infinity;
	const sceneEnd = line === 'deliver' ? (SHOTS.close.from - 2) / FPS : Infinity; // never run into the lockup
	const end = Math.min(word(line, b).end + 0.4, nextStart, sceneEnd);
	return {text, from: Math.round(start * FPS), to: Math.round(end * FPS), burn: burn !== false};
});
