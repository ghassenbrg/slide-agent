import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, interpolate, Series, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {PaperStage} from '../launch/components/ui';
import {clamp} from '../launch/theme';
import {Lockup} from './kit';
import {BEAT, Genres} from './scenes/Genres';
import {Editable} from './scenes/Editable';
import {End} from './scenes/End';
import {Engine} from './scenes/Engine';
import {Hook} from './scenes/Hook';
import {Install} from './scenes/Install';

// Slide Agent — LinkedIn announcement. 1080×1350 (4:5), 60 s at 30 fps,
// written to be understood with the sound off. See linkedin/CONCEPT.md.
//
//   Hook      0     the promise and three real slides, on frame 0
//   Genres    90    one tool, every kind of deck: five showcase slides
//   Engine    840   the model designs, the engine computes
//   Editable  1050   native .pptx, every element editable
//   Install   1230  VS Code, one command, then just ask
//   End       1590  name, tagline, docs address, repository

const END = 1590;

const Chrome: React.FC = () => {
	const f = useCurrentFrame();
	return <Lockup opacity={interpolate(f, [END - 12, END], [1, 0], clamp)} />;
};

export const Announce: React.FC = () => {
	const {fps} = useVideoConfig();
	return (
		<AbsoluteFill>
			<PaperStage />
			<Series>
				<Series.Sequence name="Hook" durationInFrames={90} premountFor={fps}>
					<Hook />
				</Series.Sequence>
				<Series.Sequence name="Genres" durationInFrames={5 * BEAT} premountFor={fps}>
					<Genres />
				</Series.Sequence>
				<Series.Sequence name="Engine" durationInFrames={210} premountFor={fps}>
					<Engine />
				</Series.Sequence>
				<Series.Sequence name="Editable" durationInFrames={180} premountFor={fps}>
					<Editable />
				</Series.Sequence>
				<Series.Sequence name="Install" durationInFrames={360} premountFor={fps}>
					<Install />
				</Series.Sequence>
				<Series.Sequence name="End" durationInFrames={210} premountFor={fps}>
					<End />
				</Series.Sequence>
			</Series>
			<Chrome />
			<Audio name="Score" src={staticFile('announce/audio/score.wav')} volume={0.75} premountFor={fps} />
		</AbsoluteFill>
	);
};
