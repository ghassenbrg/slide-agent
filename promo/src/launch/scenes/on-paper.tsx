import type React from 'react';
import {AbsoluteFill} from 'remotion';
import {PaperStage} from '../components/ui';
import {Build} from './Build';
import {Check} from './Check';
import {Close} from './Close';
import {Deliver} from './Deliver';
import {Describe} from './Describe';
import {Plan} from './Plan';
import {Range} from './Range';
import {Reveal} from './Reveal';

// In the film the paper stage sits under every light scene; these wrappers
// give each scene the same stage when it is previewed on its own.
const onPaper = (Scene: React.FC): React.FC => {
	const Wrapped: React.FC = () => (
		<AbsoluteFill>
			<PaperStage />
			<Scene />
		</AbsoluteFill>
	);
	return Wrapped;
};

export const LReveal = onPaper(Reveal);
export const LDescribe = onPaper(Describe);
export const LPlan = onPaper(Plan);
export const LBuild = onPaper(Build);
export const LCheck = onPaper(Check);
export const LDeliver = onPaper(Deliver);
export const LRange = onPaper(Range);
export const LClose = onPaper(Close);
