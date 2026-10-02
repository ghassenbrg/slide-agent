import type React from 'react';
import {AbsoluteFill, random, useCurrentFrame} from 'remotion';
import {C} from '../theme';

const PARTICLES = new Array(46).fill(true).map((_, i) => ({
	x: random(`px-${i}`) * 1080,
	y: random(`py-${i}`) * 1920,
	size: 2 + random(`ps-${i}`) * 4,
	speed: 0.3 + random(`pv-${i}`) * 1.1,
	phase: random(`pp-${i}`) * Math.PI * 2,
	cyan: random(`pc-${i}`) > 0.7,
}));

// The shared stage every scene plays on. It is driven by the global frame, so
// it keeps drifting through cuts and gives the whole promo one continuous
// camera.
export const Background: React.FC = () => {
	const frame = useCurrentFrame();
	const t = frame / 30;

	return (
		<AbsoluteFill style={{backgroundColor: C.bg, overflow: 'hidden'}}>
			<AbsoluteFill
				style={{
					background: `radial-gradient(60% 40% at ${50 + Math.sin(t * 0.35) * 18}% ${28 + Math.cos(t * 0.27) * 8}%, rgba(61,107,255,0.42), transparent 70%)`,
				}}
			/>
			<AbsoluteFill
				style={{
					background: `radial-gradient(55% 35% at ${55 + Math.cos(t * 0.31) * 22}% ${78 + Math.sin(t * 0.22) * 8}%, rgba(46,230,201,0.20), transparent 70%)`,
				}}
			/>
			<AbsoluteFill
				style={{
					background: `radial-gradient(45% 30% at ${20 + Math.sin(t * 0.18) * 10}% ${55 + Math.cos(t * 0.4) * 10}%, rgba(120,70,255,0.18), transparent 70%)`,
				}}
			/>

			{/* Perspective grid floor that scrolls toward the viewer. */}
			<div
				style={{
					position: 'absolute',
					left: -1200,
					right: -1200,
					top: 1000,
					height: 1800,
					backgroundImage: `linear-gradient(rgba(110,150,255,0.22) 2px, transparent 2px), linear-gradient(90deg, rgba(110,150,255,0.22) 2px, transparent 2px)`,
					backgroundSize: '120px 120px',
					backgroundPosition: `0px ${frame * 2.2}px`,
					transform: 'perspective(700px) rotateX(68deg)',
					transformOrigin: '50% 0%',
					maskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 55%, transparent 100%)',
					WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 55%, transparent 100%)',
					opacity: 0.55,
				}}
			/>

			{PARTICLES.map((p, i) => {
				const y = (((p.y - frame * p.speed * 2) % 1920) + 1920) % 1920;
				const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + p.phase));
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: p.x + Math.sin(t * 0.5 + p.phase) * 20,
							top: y,
							width: p.size,
							height: p.size,
							borderRadius: '50%',
							backgroundColor: p.cyan ? C.cyan : '#9DB4FF',
							boxShadow: `0 0 ${p.size * 4}px ${p.cyan ? C.cyan : C.blue}`,
							opacity: twinkle * 0.7,
						}}
					/>
				);
			})}

			<AbsoluteFill
				style={{
					background: 'radial-gradient(120% 80% at 50% 50%, transparent 55%, rgba(0,0,0,0.65) 100%)',
				}}
			/>
		</AbsoluteFill>
	);
};
