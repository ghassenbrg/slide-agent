import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, clamp, mono} from '../theme';

// Global frames where each chapter's transition is half done.
const CHAPTERS = [0, 157, 277, 517, 877, 1117, 1402, 1582];

// Persistent broadcast-style chrome: brand mark, chapter counter, progress.
export const Hud: React.FC = () => {
	const frame = useCurrentFrame();
	const {durationInFrames} = useVideoConfig();
	const chapter = CHAPTERS.filter((c) => frame >= c).length;
	const visible = interpolate(frame, [280, 300, 1560, 1580], [0, 1, 1, 0], clamp);

	return (
		<AbsoluteFill style={{opacity: visible, pointerEvents: 'none'}}>
			<div style={{position: 'absolute', left: 60, top: 60, display: 'flex', alignItems: 'center', gap: 14}}>
				<Img src={staticFile('icon.png')} style={{width: 46, height: 46, borderRadius: 10}} />
				<div style={{fontFamily: mono, fontSize: 22, fontWeight: 700, letterSpacing: 4, color: C.ink}}>SLIDE AGENT</div>
			</div>
			<div style={{position: 'absolute', right: 60, top: 70, fontFamily: mono, fontSize: 22, letterSpacing: 3, color: C.dim}}>
				<span style={{color: C.cyan}}>{String(chapter).padStart(2, '0')}</span> / {String(CHAPTERS.length).padStart(2, '0')}
			</div>
			<div style={{position: 'absolute', left: 60, right: 60, bottom: 54, height: 4, borderRadius: 2, backgroundColor: 'rgba(140,170,255,0.15)'}}>
				<div
					style={{
						width: `${(frame / (durationInFrames - 1)) * 100}%`,
						height: '100%',
						borderRadius: 2,
						background: `linear-gradient(90deg, ${C.blue}, ${C.cyan})`,
						boxShadow: `0 0 12px ${C.cyan}`,
					}}
				/>
			</div>
		</AbsoluteFill>
	);
};
