import React from 'react';
import {Composition, Still} from 'remotion';
import {Cover} from './Cover';
import {Film} from './Film';
import {FPS, H, W} from './theme';
import {TOTAL} from './timeline';

export const OneSentenceRoot: React.FC = () => (
	<>
		<Composition id="OneSentence" component={Film} durationInFrames={TOTAL} fps={FPS} width={W} height={H} defaultProps={{bgm: true}} />
		<Still id="OneSentenceCover" component={Cover} width={W} height={H} />
	</>
);
