import type React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

type SparkleProps = {
	readonly x: number;
	readonly y: number;
	readonly size: number;
	readonly delay: number;
	readonly color?: string;
};

// Four-point star that springs in and then keeps twinkling.
export const Sparkle: React.FC<SparkleProps> = ({x, y, size, delay, color = 'white'}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const s = spring({frame: frame - delay, fps, config: {damping: 9, stiffness: 160}});
	const twinkle = 0.85 + 0.15 * Math.sin((frame - delay) / 5);

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 100 100"
			style={{
				position: 'absolute',
				left: x - size / 2,
				top: y - size / 2,
				scale: String(s * twinkle),
				rotate: `${interpolate(s, [0, 1], [-90, 0])}deg`,
				filter: `drop-shadow(0 0 ${size / 5}px ${color})`,
				overflow: 'visible',
			}}
		>
			<path d="M50 0 C54 34 66 46 100 50 C66 54 54 66 50 100 C46 66 34 54 0 50 C34 46 46 34 50 0 Z" fill={color} />
		</svg>
	);
};
