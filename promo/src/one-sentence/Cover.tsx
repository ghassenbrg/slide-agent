import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {Stage} from './kit';
import {RequestBar} from './Request';
import {Opening} from './scenes/Opening';

// Cover: the opening's finished state — the request, the real result, the name.
export const Cover: React.FC = () => (
	<AbsoluteFill>
		<Stage />
		<Sequence from={-182}>
			<Opening />
			<RequestBar />
		</Sequence>
	</AbsoluteFill>
);
