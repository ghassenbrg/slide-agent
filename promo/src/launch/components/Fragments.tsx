import type React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {C, clamp, display, mono} from '../theme';

// Eight small pictures of the work a deck normally takes. Each is a dark
// glass card with a label and a little loop of motion — the busywork.

const W = 380;
const H = 236;

const Card: React.FC<{label: string; children: React.ReactNode}> = ({label, children}) => (
	<div
		style={{
			width: W,
			height: H,
			borderRadius: 14,
			background: 'linear-gradient(180deg, rgba(24,34,72,0.96), rgba(13,20,46,0.96))',
			border: `1px solid ${C.nightLine}`,
			boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7)',
			overflow: 'hidden',
			position: 'relative',
		}}
	>
		<div style={{height: 40, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: `1px solid ${C.nightLine}`}}>
			{[0, 1, 2].map((i) => (
				<div key={i} style={{width: 9, height: 9, borderRadius: 9, background: 'rgba(255,255,255,0.14)'}} />
			))}
			<div style={{marginLeft: 'auto', fontFamily: mono, fontSize: 17, fontWeight: 500, letterSpacing: '0.18em', color: C.amber}}>{label}</div>
		</div>
		<div style={{position: 'absolute', left: 0, top: 40, width: W, height: H - 40}}>{children}</div>
	</div>
);

const Line: React.FC<{w: number; y: number; x?: number; o?: number; color?: string}> = ({w, y, x = 20, o = 0.18, color}) => (
	<div style={{position: 'absolute', left: x, top: y, width: w, height: 9, borderRadius: 5, background: color ?? `rgba(200,210,255,${o})`}} />
);

export const Research: React.FC = () => {
	const f = useCurrentFrame();
	const tabs = 9 + Math.floor(f / 12);
	return (
		<Card label="RESEARCH">
			<div style={{display: 'flex', gap: 3, padding: '8px 12px'}}>
				{Array.from({length: Math.min(tabs, 16)}, (_, i) => (
					<div key={i} style={{flex: 1, height: 18, borderRadius: 4, background: i === (Math.min(tabs, 16) - 1) ? 'rgba(120,150,255,0.5)' : 'rgba(200,210,255,0.12)'}} />
				))}
			</div>
			<div style={{position: 'absolute', left: 20, top: 40, width: 340, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.07)', fontFamily: mono, fontSize: 15, color: C.nightDim, display: 'flex', alignItems: 'center', padding: '0 12px'}}>
				support resolution benchmarks 2025…
			</div>
			<Line w={300} y={96} />
			<Line w={250} y={116} />
			<Line w={320} y={136} />
			<Line w={180} y={156} />
		</Card>
	);
};

export const Outline: React.FC = () => {
	const f = useCurrentFrame();
	const strike = interpolate(f, [10, 30], [0, 1], clamp);
	return (
		<Card label="OUTLINE">
			<div style={{position: 'absolute', left: 20, top: 14, fontFamily: mono, fontSize: 15, color: C.nightDim}}>outline_v7_FINAL(2).docx</div>
			{[0, 1, 2, 3, 4].map((i) => (
				<div key={i}>
					<div style={{position: 'absolute', left: 22, top: 52 + i * 26, width: 7, height: 7, borderRadius: 7, background: 'rgba(200,210,255,0.35)'}} />
					<Line x={40} w={[260, 200, 290, 170, 230][i]} y={51 + i * 26} />
					{i === 1 || i === 3 ? <div style={{position: 'absolute', left: 36, top: 55 + i * 26, width: [260, 200, 290, 170, 230][i] * strike + 8, height: 2.5, background: C.warn}} /> : null}
				</div>
			))}
		</Card>
	);
};

export const Structure: React.FC = () => {
	const f = useCurrentFrame();
	const slots = [
		[24, 16],
		[136, 16],
		[248, 16],
		[80, 104],
		[192, 104],
	];
	const order = [0, 1, 2, 3, 4];
	const swaps = Math.floor(f / 20);
	for (let s = 0; s < swaps; s++) {
		const a = s % 5;
		const b = (s * 3 + 1) % 5;
		[order[a], order[b]] = [order[b], order[a]];
	}
	const t = interpolate(f % 20, [0, 8], [0, 1], clamp);
	return (
		<Card label="STRUCTURE">
			{order.map((slot, note) => {
				const [x, y] = slots[slot];
				return (
					<div
						key={note}
						style={{
							position: 'absolute',
							left: x,
							top: y,
							width: 100,
							height: 74,
							borderRadius: 6,
							background: ['#E8C95A', '#E3A86B', '#9FC7E8', '#C9B2E8', '#A8D8A8'][note],
							opacity: 0.82,
							rotate: `${(note % 2 ? 1 : -1) * 3}deg`,
							scale: 0.96 + 0.04 * t,
							padding: 10,
						}}
					>
						<div style={{height: 6, width: 70, borderRadius: 3, background: 'rgba(0,0,0,0.22)'}} />
						<div style={{height: 6, width: 50, borderRadius: 3, background: 'rgba(0,0,0,0.16)', marginTop: 8}} />
					</div>
				);
			})}
		</Card>
	);
};

export const Write: React.FC = () => {
	const f = useCurrentFrame();
	const extra = Math.min(5, Math.floor(f / 8));
	return (
		<Card label="WRITE">
			<div style={{position: 'absolute', left: 22, top: 18, width: 250, height: 128, border: '2px dashed rgba(200,210,255,0.4)', borderRadius: 4}} />
			{Array.from({length: 5 + extra}, (_, i) => (
				<Line key={i} x={34} w={[220, 200, 226, 180, 210, 220, 160, 200, 214, 190][i]} y={30 + i * 21} color={i >= 5 ? 'rgba(255,107,90,0.55)' : undefined} />
			))}
			<div
				style={{
					position: 'absolute',
					right: 18,
					top: 20,
					fontFamily: mono,
					fontSize: 14,
					color: C.warn,
					border: `1.5px solid ${C.warn}`,
					borderRadius: 6,
					padding: '4px 8px',
					opacity: extra > 0 ? 1 : 0,
				}}
			>
				overflow
			</div>
		</Card>
	);
};

export const Layout: React.FC = () => {
	const f = useCurrentFrame();
	const nudge = Math.sin(f / 3) * 6;
	return (
		<Card label="LAYOUT">
			<div style={{position: 'absolute', left: 30, top: 22, width: 140, height: 70, borderRadius: 6, background: 'rgba(200,210,255,0.16)'}} />
			<div style={{position: 'absolute', left: 196 + nudge, top: 28, width: 150, height: 70, borderRadius: 6, background: 'rgba(120,150,255,0.35)', outline: '2px solid rgba(140,170,255,0.9)'}} />
			<div style={{position: 'absolute', left: 30, top: 116, width: 316, height: 52, borderRadius: 6, background: 'rgba(200,210,255,0.12)'}} />
			<div style={{position: 'absolute', left: 196 + nudge, top: 0, width: 1.5, height: 196, background: '#FF4FD8', opacity: Math.abs(nudge) < 2 ? 1 : 0.25}} />
			<div style={{position: 'absolute', left: 0, top: 28, width: W, height: 1.5, background: '#FF4FD8', opacity: 0.35}} />
			<div style={{position: 'absolute', left: 230 + nudge, top: 104, fontFamily: mono, fontSize: 13, color: '#FF8AE6'}}>x {(1.37 + nudge / 100).toFixed(2)} in</div>
		</Card>
	);
};

export const Visuals: React.FC = () => {
	const f = useCurrentFrame();
	return (
		<Card label="VISUALS">
			{Array.from({length: 6}, (_, i) => {
				const sh = interpolate((f + i * 7) % 30, [0, 30], [-1, 2]);
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: 20 + (i % 3) * 116,
							top: 16 + Math.floor(i / 3) * 88,
							width: 104,
							height: 76,
							borderRadius: 6,
							background: `linear-gradient(100deg, rgba(200,210,255,0.08) ${sh * 100 - 30}%, rgba(200,210,255,0.22) ${sh * 100}%, rgba(200,210,255,0.08) ${sh * 100 + 30}%)`,
						}}
					/>
				);
			})}
		</Card>
	);
};

export const Charts: React.FC = () => {
	const f = useCurrentFrame();
	const bars = [60, 95, 40, 120, 80];
	return (
		<Card label="CHARTS">
			<div style={{position: 'absolute', left: 26, top: 18, width: 220, height: 160, background: '#fff', borderRadius: 3, filter: 'blur(0.6px)'}}>
				{bars.map((h, i) => (
					<div
						key={i}
						style={{
							position: 'absolute',
							bottom: 12,
							left: 14 + i * 40,
							width: 26,
							height: h,
							background: ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5'][i],
							boxShadow: '4px -4px 0 rgba(0,0,0,0.18)',
						}}
					/>
				))}
			</div>
			<div style={{position: 'absolute', left: 230, top: 120, fontFamily: display, fontSize: 15, color: '#111', background: '#F5F5F5', padding: '6px 10px', borderRadius: 4, boxShadow: '0 4px 10px rgba(0,0,0,0.4)', opacity: f > 12 ? 1 : 0}}>
				Paste as picture
			</div>
		</Card>
	);
};

export const Polish: React.FC = () => {
	const f = useCurrentFrame();
	const fonts = ['Georgia, serif', 'Arial, sans-serif', '"Courier New", monospace'];
	const blues = ['#2F5BFF', '#3260F7', '#2B55F0', '#3A64FF'];
	return (
		<Card label="POLISH">
			<div style={{position: 'absolute', left: 24, top: 18, display: 'flex', gap: 18}}>
				{fonts.map((ff, i) => (
					<div key={ff} style={{fontFamily: ff, fontSize: 56, color: i === Math.floor(f / 10) % 3 ? '#fff' : 'rgba(220,225,255,0.45)'}}>
						Aa
					</div>
				))}
			</div>
			<div style={{position: 'absolute', left: 24, top: 108, display: 'flex', gap: 10}}>
				{blues.map((b) => (
					<div key={b} style={{width: 72, height: 44, borderRadius: 6, background: b}} />
				))}
			</div>
			<div style={{position: 'absolute', left: 24, top: 162, fontFamily: mono, fontSize: 13, color: C.nightDim}}>{blues[Math.floor(f / 8) % 4]} — or was it the other one?</div>
		</Card>
	);
};

export const FRAG_W = W;
export const FRAG_H = H;
