import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {AudioBed} from './Audio';
import {Captions} from './Captions';
import {Stage} from './kit';
import {RequestBar} from './Request';
import {Opening} from './scenes/Opening';
import {Install} from './scenes/Install';
import {Workflow} from './scenes/Workflow';
import {Depth} from './scenes/Depth';
import {Range} from './scenes/Range';
import {Deliver} from './scenes/Deliver';
import {CLOSE_LEAD, Close} from './scenes/Close';
import {SHOTS} from './timeline';
import {HeaderScrim} from './Request';

// Scenes overlap their neighbours by a few frames so carried elements hand over in motion.
const OVER = 24;

export const Film: React.FC<{bgm?: boolean}> = ({bgm = true}) => (
	<AbsoluteFill style={{background: '#060D26'}}>
		<Stage />
		<Sequence name="1 Opening" durationInFrames={SHOTS.opening.duration + OVER}>
			<Opening />
		</Sequence>
		<Sequence name="2 Install" from={SHOTS.install.from} durationInFrames={SHOTS.install.duration + OVER} layout="none">
			<AbsoluteFill><Install /></AbsoluteFill>
		</Sequence>
		<Sequence name="3 Workflow" from={SHOTS.workflow.from - 8} durationInFrames={SHOTS.workflow.duration + 8 + OVER}>
			<Workflow />
		</Sequence>
		<Sequence name="4 Depth" from={SHOTS.depth.from} durationInFrames={SHOTS.depth.duration + OVER}>
			<Depth />
		</Sequence>
		<Sequence name="5 Range" from={SHOTS.range.from} durationInFrames={SHOTS.range.duration + OVER}>
			<Range />
		</Sequence>
		<Sequence name="6 Deliver" from={SHOTS.deliver.from} durationInFrames={SHOTS.deliver.duration + OVER}>
			<Deliver />
		</Sequence>
		<Sequence name="7 Close" from={SHOTS.close.from - CLOSE_LEAD} durationInFrames={SHOTS.close.duration + CLOSE_LEAD}>
			<Close />
		</Sequence>
		<HeaderScrim />
		<RequestBar />
		<Captions />
		<AudioBed bgm={bgm} />
	</AbsoluteFill>
);
