import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, interpolate, Sequence, Series, staticFile, useVideoConfig} from 'remotion';
import {PaperStage} from './components/ui';
import {Blank} from './scenes/Blank';
import {Build} from './scenes/Build';
import {Check} from './scenes/Check';
import {Close} from './scenes/Close';
import {Deliver} from './scenes/Deliver';
import {Describe} from './scenes/Describe';
import {Plan} from './scenes/Plan';
import {Range} from './scenes/Range';
import {Reveal} from './scenes/Reveal';
import {clamp} from './theme';

// Slide Agent — launch film. 60 s at 30 fps, cut to a 120 BPM score:
// every scene starts on a beat (15 frames). See launch/CREATIVE.md.
//
//   Blank     0    the empty placeholder, the week of work, the collapse
//   Reveal    465  lights on, the name
//   Describe  585  one sentence and your notes
//   Plan      735  a job for every slide, a look for this deck
//   Build     915  the engine places, measures, checks
//   Check     1215 it looks at what it built and fixes it
//   Deliver   1365 a real, editable PowerPoint
//   Range     1515 no house style
//   Close     1650 back to the placeholder
export const Launch: React.FC = () => {
	const {fps} = useVideoConfig();
	return (
		<AbsoluteFill style={{background: '#000'}}>
			<Sequence name="Paper stage" from={465} premountFor={fps}>
				<PaperStage />
			</Sequence>
			<Series>
				<Series.Sequence name="Blank" durationInFrames={465} premountFor={fps}>
					<Blank />
				</Series.Sequence>
				<Series.Sequence name="Reveal" durationInFrames={120} premountFor={fps}>
					<Reveal />
				</Series.Sequence>
				<Series.Sequence name="Describe" durationInFrames={150} premountFor={fps}>
					<Describe />
				</Series.Sequence>
				<Series.Sequence name="Plan" durationInFrames={180} premountFor={fps}>
					<Plan />
				</Series.Sequence>
				<Series.Sequence name="Build" durationInFrames={300} premountFor={fps}>
					<Build />
				</Series.Sequence>
				<Series.Sequence name="Check" durationInFrames={150} premountFor={fps}>
					<Check />
				</Series.Sequence>
				<Series.Sequence name="Deliver" durationInFrames={150} premountFor={fps}>
					<Deliver />
				</Series.Sequence>
				<Series.Sequence name="Range" durationInFrames={135} premountFor={fps}>
					<Range />
				</Series.Sequence>
				<Series.Sequence name="Close" durationInFrames={150} premountFor={fps}>
					<Close />
				</Series.Sequence>
			</Series>
			<Audio
				name="Score"
				src={staticFile('launch/audio/score.wav')}
				volume={(f) => interpolate(f, [0, 6], [0, 0.75], clamp)}
				premountFor={fps}
			/>
		</AbsoluteFill>
	);
};
