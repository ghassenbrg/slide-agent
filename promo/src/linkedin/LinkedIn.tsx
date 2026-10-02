import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, interpolate, Sequence, Series, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {PaperStage} from '../launch/components/ui';
import {clamp} from '../launch/theme';
import {StepBar} from './kit';
import {Build} from './scenes/Build';
import {Check} from './scenes/Check';
import {Close} from './scenes/Close';
import {Deliver} from './scenes/Deliver';
import {Describe} from './scenes/Describe';
import {Hook} from './scenes/Hook';
import {Plan} from './scenes/Plan';
import {Problem} from './scenes/Problem';
import {Range} from './scenes/Range';
import {Reveal} from './scenes/Reveal';

// Slide Agent — the LinkedIn cut. 1080×1350 (4:5), 50 s at 30 fps, built to
// be understood with the sound off. Scenes start on beats of the 120 BPM score.
//
//   Hook      0     the payoff first: "I built…" and the nine slides
//   Problem   105   a good deck still takes hours
//   Reveal    285   "So I built Slide Agent"
//   Describe  405   1 · one sentence and your notes
//   Plan      555   2 · a storyline and a look for this deck
//   Build     720   3 · computed, not guessed
//   Check     945   4 · it checks its own work
//   Deliver   1080  5 · a real, editable .pptx
//   Range     1215  no house style
//   Close     1320  open source, where to get it

const STEPS: [number, number][] = [
	[405, 555],
	[555, 720],
	[720, 945],
	[945, 1080],
	[1080, 1215],
];

const Progress: React.FC = () => {
	const f = useCurrentFrame();
	const i = STEPS.findIndex(([a, b]) => f >= a && f < b);
	if (i < 0) return null;
	const [a, b] = STEPS[i];
	const fade = interpolate(f, [405, 415, 1205, 1215], [0, 1, 1, 0], clamp);
	return (
		<AbsoluteFill style={{opacity: fade}}>
			<StepBar step={i + 1} progress={interpolate(f, [a, b], [0, 1], clamp)} />
		</AbsoluteFill>
	);
};

export const LinkedIn: React.FC = () => {
	const {fps} = useVideoConfig();
	return (
		<AbsoluteFill style={{background: '#000'}}>
			<Sequence name="Paper stage" from={285} premountFor={fps}>
				<PaperStage />
			</Sequence>
			<Series>
				<Series.Sequence name="Hook" durationInFrames={105} premountFor={fps}>
					<Hook />
				</Series.Sequence>
				<Series.Sequence name="Problem" durationInFrames={180} premountFor={fps}>
					<Problem />
				</Series.Sequence>
				<Series.Sequence name="Reveal" durationInFrames={120} premountFor={fps}>
					<Reveal />
				</Series.Sequence>
				<Series.Sequence name="Describe" durationInFrames={150} premountFor={fps}>
					<Describe />
				</Series.Sequence>
				<Series.Sequence name="Plan" durationInFrames={165} premountFor={fps}>
					<Plan />
				</Series.Sequence>
				<Series.Sequence name="Build" durationInFrames={225} premountFor={fps}>
					<Build />
				</Series.Sequence>
				<Series.Sequence name="Check" durationInFrames={135} premountFor={fps}>
					<Check />
				</Series.Sequence>
				<Series.Sequence name="Deliver" durationInFrames={135} premountFor={fps}>
					<Deliver />
				</Series.Sequence>
				<Series.Sequence name="Range" durationInFrames={105} premountFor={fps}>
					<Range />
				</Series.Sequence>
				<Series.Sequence name="Close" durationInFrames={180} premountFor={fps}>
					<Close />
				</Series.Sequence>
			</Series>
			<Progress />
			<Audio name="Score" src={staticFile('linkedin/audio/score.wav')} volume={0.75} premountFor={fps} />
		</AbsoluteFill>
	);
};
