import type React from 'react';
import {AbsoluteFill} from 'remotion';
import {SlideView} from './components/SlideView';
import {deck} from './deck';

// A fidelity check: every slide drawn from scene.json, to compare against the
// engine's own previews in public/launch/deck.
export const DeckCheck: React.FC = () => (
	<AbsoluteFill style={{background: '#ddd', flexDirection: 'row', flexWrap: 'wrap', gap: 20, padding: 20}}>
		{deck.slides.map((s) => (
			<SlideView key={s.id} slide={s} width={920} />
		))}
	</AbsoluteFill>
);
