import type React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {clamp} from '../theme';

type Mode = 'mask' | 'slam' | 'pop';

type KineticProps = {
	readonly text: string;
	readonly delay?: number;
	// Frames between words.
	readonly stagger?: number;
	readonly mode?: Mode;
	readonly style?: React.CSSProperties;
	// Style applied to each word, e.g. a gradient fill.
	readonly wordStyle?: React.CSSProperties;
	// Frame (local) at which the words leave again; omit to stay.
	readonly exitAt?: number;
};

// Kinetic typography: each word springs into place on its own beat.
export const Kinetic: React.FC<KineticProps> = ({
	text,
	delay = 0,
	stagger = 4,
	mode = 'mask',
	style,
	wordStyle,
	exitAt,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const words = text.split(' ');

	return (
		<div style={{display: 'flex', flexWrap: 'wrap', columnGap: '0.24em', ...style}}>
			{words.map((word, i) => {
				const start = delay + i * stagger;
				const s = spring({
					frame: frame - start,
					fps,
					config: mode === 'slam' ? {damping: 14, stiffness: 180, mass: 0.7} : {damping: 18, stiffness: 140},
				});
				const out =
					exitAt === undefined
						? 0
						: interpolate(frame, [exitAt + i * 2, exitAt + i * 2 + 10], [0, 1], clamp);

				if (mode === 'mask') {
					return (
						<span
							key={i}
							style={{display: 'inline-block', overflow: 'hidden', paddingBottom: '0.08em', marginBottom: '-0.08em'}}
						>
							<span
								style={{
									display: 'inline-block',
									translate: `0 ${(1 - s) * 110 - out * 110}%`,
									rotate: `${(1 - s) * 6}deg`,
									...wordStyle,
								}}
							>
								{word}
							</span>
						</span>
					);
				}

				const scale = mode === 'slam' ? interpolate(s, [0, 1], [2.6, 1]) : interpolate(s, [0, 1], [0.3, 1]);
				return (
					<span
						key={i}
						style={{
							display: 'inline-block',
							scale: String(scale * (1 - out * 0.3)),
							opacity: interpolate(frame - start, [0, 4], [0, 1], clamp) * (1 - out),
							filter: `blur(${Math.max(0, (1 - s) * 18) + out * 12}px)`,
							...wordStyle,
						}}
					>
						{word}
					</span>
				);
			})}
		</div>
	);
};
