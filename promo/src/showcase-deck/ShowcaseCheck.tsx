import type React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {SlideView} from '../launch/components/SlideView';
import {GENRES, SHOWCASE_ASSETS, showcaseSlide} from '.';

// A fidelity check: each showcase slide drawn from scene.json (left) beside the
// LibreOffice render of the real .pptx (right).
export const ShowcaseCheck: React.FC = () => (
	<AbsoluteFill style={{background: '#ccc', flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 16}}>
		{GENRES.flatMap((g) => [
			<SlideView key={`${g.id}-v`} slide={showcaseSlide(g.id)} width={920} assetBase={SHOWCASE_ASSETS} />,
			<Img key={`${g.id}-r`} src={staticFile(g.render)} style={{width: 920, height: (920 * 9) / 16}} />,
		])}
	</AbsoluteFill>
);
