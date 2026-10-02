import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, interpolate, Series, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {PaperStage} from '../launch/components/ui';
import {clamp} from '../launch/theme';
import {Lockup} from './kit';
import {Brief} from './scenes/Brief';
import {Compose} from './scenes/Compose';
import {Editable} from './scenes/Editable';
import {End} from './scenes/End';
import {Install} from './scenes/Install';
import {Introduce} from './scenes/Introduce';
import {Range} from './scenes/Range';
import {Refine} from './scenes/Refine';
import {Story} from './scenes/Story';

// Product announcement: 60 s, 4:5. One journey, with range as supporting proof.
// 0–4 introduction; 4–11 brief; 11–18 story/design; 18–27 build;
// 27–33 editable output; 33–39 revision; 39–44 range; 44–54 setup; 54–60 CTA.
const Chrome: React.FC = () => {
	const f = useCurrentFrame();
	return <Lockup opacity={interpolate(f, [1608, 1620], [1, 0], clamp)} />;
};

export const Announce: React.FC = () => {
	const {fps} = useVideoConfig();
	return <AbsoluteFill>
		<PaperStage />
		<Series>
			<Series.Sequence name="Introducing Slide Agent" durationInFrames={120} premountFor={fps}><Introduce /></Series.Sequence>
			<Series.Sequence name="Your brief and context" durationInFrames={210} premountFor={fps}><Brief /></Series.Sequence>
			<Series.Sequence name="Story and design language" durationInFrames={210} premountFor={fps}><Story /></Series.Sequence>
			<Series.Sequence name="Slide Agent builds" durationInFrames={270} premountFor={fps}><Compose /></Series.Sequence>
			<Series.Sequence name="Editable PowerPoint" durationInFrames={180} premountFor={fps}><Editable /></Series.Sequence>
			<Series.Sequence name="Ask for a revision" durationInFrames={180} premountFor={fps}><Refine /></Series.Sequence>
			<Series.Sequence name="Range of work" durationInFrames={150} premountFor={fps}><Range /></Series.Sequence>
			<Series.Sequence name="Install and start" durationInFrames={300} premountFor={fps}><Install /></Series.Sequence>
			<Series.Sequence name="Try Slide Agent" durationInFrames={180} premountFor={fps}><End /></Series.Sequence>
		</Series>
		<Chrome />
		<Audio name="Original score" src={staticFile('announce/audio/score.wav')} volume={0.75} premountFor={fps} />
	</AbsoluteFill>;
};
