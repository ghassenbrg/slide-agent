import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import type React from 'react';
import {AbsoluteFill, interpolate} from 'remotion';

type Kind = 'zoom' | 'pan-up' | 'pan-left' | 'blur';
type Props = {kind: Kind};

// Scene transitions that read as camera moves over the shared background:
// scenes are transparent, so the outgoing one flies past while the incoming
// one settles in, both with motion blur.
const CameraPresentation: React.FC<TransitionPresentationComponentProps<Props>> = ({
	children,
	presentationDirection,
	presentationProgress: p,
	passedProps: {kind},
}) => {
	const entering = presentationDirection === 'entering';
	const opacity = entering ? interpolate(p, [0.25, 0.85], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : interpolate(p, [0.1, 0.65], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const blur = entering ? (1 - p) * 22 : p * 22;

	let style: React.CSSProperties;
	if (kind === 'zoom') {
		style = {scale: String(entering ? interpolate(p, [0, 1], [0.55, 1]) : interpolate(p, [0, 1], [1, 2.2]))};
	} else if (kind === 'pan-up') {
		style = {translate: `0px ${entering ? (1 - p) * 900 : -p * 900}px`};
	} else if (kind === 'pan-left') {
		style = {translate: `${entering ? (1 - p) * 800 : -p * 800}px 0px`, rotate: `${entering ? (1 - p) * 4 : -p * 4}deg`};
	} else {
		style = {scale: String(entering ? interpolate(p, [0, 1], [1.1, 1]) : interpolate(p, [0, 1], [1, 0.92]))};
	}

	return <AbsoluteFill style={{...style, opacity, filter: `blur(${blur}px)`}}>{children}</AbsoluteFill>;
};

export const camera = (kind: Kind): TransitionPresentation<Props> => ({
	component: CameraPresentation,
	props: {kind},
});
