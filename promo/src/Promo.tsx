import {Audio} from '@remotion/media';
import {linearTiming, TransitionSeries} from '@remotion/transitions';
import type React from 'react';
import {AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background} from './components/Background';
import {camera} from './components/camera-transition';
import {Hud} from './components/Hud';
import {Build} from './scenes/Build';
import {DirectsComputes} from './scenes/DirectsComputes';
import {Features} from './scenes/Features';
import {FitContrast} from './scenes/FitContrast';
import {Hook} from './scenes/Hook';
import {Logo} from './scenes/Logo';
import {Outro} from './scenes/Outro';
import {Showcase} from './scenes/Showcase';
import {ease} from './theme';

// 60 s at 30 fps, cut to a 120 BPM music bed: every scene length and
// transition is a multiple of one beat (15 frames). Transitions overlap
// adjacent scenes, so 1890 frames of scenes minus 7 × 15 = 1800 frames.
export const Promo: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();

	return (
		<AbsoluteFill>
			<Background />
			<TransitionSeries name="Scenes">
				<TransitionSeries.Sequence name="Hook" durationInFrames={165} premountFor={fps}>
					<Hook />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition presentation={camera('zoom')} timing={linearTiming({durationInFrames: 15, easing: ease.inOut})} />
				<TransitionSeries.Sequence name="Logo" durationInFrames={135} premountFor={fps}>
					<Logo />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition presentation={camera('pan-up')} timing={linearTiming({durationInFrames: 15, easing: ease.inOut})} />
				<TransitionSeries.Sequence name="Directs / computes" durationInFrames={255} premountFor={fps}>
					<DirectsComputes />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition presentation={camera('zoom')} timing={linearTiming({durationInFrames: 15, easing: ease.inOut})} />
				<TransitionSeries.Sequence name="Build" durationInFrames={375} premountFor={fps}>
					<Build />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition presentation={camera('pan-left')} timing={linearTiming({durationInFrames: 15, easing: ease.inOut})} />
				<TransitionSeries.Sequence name="Fit & contrast" durationInFrames={255} premountFor={fps}>
					<FitContrast />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition presentation={camera('zoom')} timing={linearTiming({durationInFrames: 15, easing: ease.inOut})} />
				<TransitionSeries.Sequence name="Showcase" durationInFrames={300} premountFor={fps}>
					<Showcase />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition presentation={camera('pan-up')} timing={linearTiming({durationInFrames: 15, easing: ease.inOut})} />
				<TransitionSeries.Sequence name="Features" durationInFrames={195} premountFor={fps}>
					<Features />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition presentation={camera('blur')} timing={linearTiming({durationInFrames: 15, easing: ease.inOut})} />
				<TransitionSeries.Sequence name="Outro" durationInFrames={225} premountFor={fps}>
					<Outro />
				</TransitionSeries.Sequence>
			</TransitionSeries>

			<Hud />

			{/* Fade in from and out to black. */}
			<AbsoluteFill
				style={{
					backgroundColor: 'black',
					pointerEvents: 'none',
					opacity: interpolate(frame, [0, 8, durationInFrames - 24, durationInFrames - 1], [1, 0, 0, 1], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					}),
				}}
			/>

			<Audio
				name="Music"
				src={staticFile('audio/music.wav')}
				volume={(f) => interpolate(f, [0, 10], [0, 0.6], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
				premountFor={fps}
			/>
			<Audio name="Whoosh: hook → logo" from={143} src={staticFile('audio/whoosh.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Whoosh: logo → directs" from={263} src={staticFile('audio/whoosh.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Whoosh: directs → build" from={503} src={staticFile('audio/whoosh.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Whoosh: build → fit" from={863} src={staticFile('audio/whoosh.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Whoosh: fit → showcase" from={1103} src={staticFile('audio/whoosh.wav')} volume={0.45} premountFor={fps} />
			<Audio name="Whoosh: showcase → features" from={1388} src={staticFile('audio/whoosh.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Whoosh: features → outro" from={1568} src={staticFile('audio/whoosh.wav')} volume={0.35} premountFor={fps} />
		</AbsoluteFill>
	);
};
