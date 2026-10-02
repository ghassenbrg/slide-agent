import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Chip, StageTitle} from '../components/ui';
import {contrast, DECK_PREVIEWS} from '../deck';
import {accentWord, C, clamp, display, ease, mono, shadow} from '../theme';

// 0:40.5–0:45.5 — the engine's own contact sheet. The finding and its
// wording are from the first draft's real build (data/verdict-before.json);
// the fix is the EditOp in launch/demo/film/edit-results.json.

const TILE_W = 320;
const TILE_H = 180;
const GAP = 20;
const ROW = [5, 4]; // nine slides: five over four
const TOP = 300;
const LEFT = (1920 - (ROW[0] * TILE_W + (ROW[0] - 1) * GAP)) / 2;
const SHEET_W = ROW[0] * TILE_W + (ROW[0] - 1) * GAP;

const tilePos = (i: number) => {
	const row = i < ROW[0] ? 0 : 1;
	const col = row ? i - ROW[0] : i;
	const offset = (SHEET_W - (ROW[row] * TILE_W + (ROW[row] - 1) * GAP)) / 2;
	return {x: LEFT + offset + col * (TILE_W + GAP), y: TOP + row * (TILE_H + GAP)};
};

const FLAGGED = '03-results';
const BEFORE_RATIO = '1.87';
const AFTER_RATIO = contrast('B45309', 'FFF4E2').toFixed(2);

const SCAN = [18, 54];
const FLAG = 40;
const ZOOM = [56, 72];
const FIX = 92;
const UNZOOM = [112, 126];

export const Check: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const scanX = interpolate(f, SCAN, [LEFT - 40, LEFT + SHEET_W + 40], {...clamp, easing: ease.inOut});
	const zoom = interpolate(f, ZOOM, [0, 1], {...clamp, easing: ease.inOut}) * (1 - interpolate(f, UNZOOM, [0, 1], {...clamp, easing: ease.inOut}));
	const fixed = f >= FIX;
	const fixT = interpolate(f, [FIX, FIX + 10], [0, 1], clamp);
	const verdict = interpolate(f, [UNZOOM[1] - 4, UNZOOM[1] + 10], [0, 1], {...clamp, easing: ease.out});
	const exit = interpolate(f, [140, 150], [0, 1], {...clamp, easing: ease.in});

	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			<StageTitle n="04" label="CHECK" at={0} top={70}>
				It looks at what it built. <span style={accentWord()}>Then fixes it.</span>
			</StageTitle>

			{DECK_PREVIEWS.map((name, i) => {
				const {x: gx, y: gy} = tilePos(i);
				const isFlag = name === FLAGGED;
				const t = interpolate(f, [i * 2, i * 2 + 12], [0, 1], {...clamp, easing: ease.out});
				const scanned = scanX > gx + TILE_W / 2;
				// The flagged tile flies to the centre and grows.
				const zw = 1040;
				const x = isFlag ? interpolate(zoom, [0, 1], [gx, 960 - zw / 2]) : gx;
				const y = isFlag ? interpolate(zoom, [0, 1], [gy, 268]) : gy;
				const w = isFlag ? interpolate(zoom, [0, 1], [TILE_W, zw]) : TILE_W;
				const src = isFlag ? (fixed ? 'results-after' : 'results-before') : name;
				const flagged = isFlag && f >= FLAG && !fixed;
				return (
					<div
						key={name}
						style={{
							position: 'absolute',
							left: x,
							top: y,
							width: w,
							height: (w * 9) / 16,
							borderRadius: 8,
							overflow: 'visible',
							opacity: t * (isFlag ? 1 : 1 - zoom * 0.85),
							translate: `0px ${(1 - t) * 30}px`,
							zIndex: isFlag ? 5 : 1,
						}}
					>
						<Img src={staticFile(`launch/deck/${src}.png`)} style={{width: '100%', height: '100%', borderRadius: 8, boxShadow: shadow.card, display: 'block'}} />
						{isFlag && fixed && fixT < 1 ? <Img src={staticFile('launch/deck/results-before.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 8, opacity: 1 - fixT}} /> : null}
						<div
							style={{
								position: 'absolute',
								inset: -4,
								borderRadius: 11,
								border: `3px solid ${flagged ? '#E8590C' : C.good}`,
								opacity: flagged ? 1 : scanned && !isFlag ? 0 : isFlag && fixed ? 1 - interpolate(f, [FIX + 30, FIX + 44], [0, 1], clamp) : 0,
							}}
						/>
						{scanned || (isFlag && f >= FLAG) ? (
							<div
								style={{
									position: 'absolute',
									right: -12,
									top: -12,
									width: 38,
									height: 38,
									borderRadius: 38,
									background: flagged ? '#E8590C' : C.good,
									color: '#fff',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									fontFamily: display,
									fontWeight: 800,
									fontSize: 22,
									boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
									scale: isFlag ? (zoom > 0 ? 1 - zoom : 1) : 1,
								}}
							>
								{flagged ? '!' : '✓'}
							</div>
						) : null}
					</div>
				);
			})}

			{/* scan line */}
			{f >= SCAN[0] && f <= SCAN[1] + 4 ? (
				<div style={{position: 'absolute', left: scanX, top: TOP - 30, width: 3, height: 2 * TILE_H + GAP + 60, background: C.blue, boxShadow: `0 0 24px 6px rgba(47,91,255,0.35)`, borderRadius: 3}} />
			) : null}

			{/* the finding, and the fix */}
			<div
				style={{
					position: 'absolute',
					left: 440,
					right: 440,
					top: 880,
					padding: '22px 30px',
					borderRadius: 18,
					background: C.card,
					boxShadow: shadow.lift,
					opacity: zoom,
					translate: `0px ${(1 - zoom) * 40}px`,
					zIndex: 10,
					display: 'flex',
					alignItems: 'center',
					gap: 26,
				}}
			>
				<div style={{width: 64, height: 64, borderRadius: 64, background: '#FFF4E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
					<svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={fixed ? '#B45309' : '#F5A524'} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
						<circle cx={8} cy={8} r={6} />
						<path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
						<path d="M7 6h1v4" />
						<path d="m16.71 13.88.7.71-2.82 2.82" />
					</svg>
				</div>
				<div style={{flex: 1}}>
					<div style={{fontFamily: mono, fontSize: 19, color: fixed ? C.good : '#D9480F'}}>
						{fixed ? 'icon set in a deeper amber · pass' : 'icon contrast · graphics need 3:1'}
					</div>
					<div style={{fontFamily: display, fontWeight: 600, fontSize: 32, letterSpacing: '-0.015em', color: C.ink, marginTop: 8}}>
						{fixed ? 'The cost icon now reads on its badge' : 'The cost icon is 1.87:1 against its badge'}
					</div>
				</div>
				<Chip tone={fixed ? 'good' : 'warn'} style={{fontSize: 26}}>
					{fixed ? AFTER_RATIO : BEFORE_RATIO} : 1
				</Chip>
			</div>

			{/* verdict */}
			<div style={{position: 'absolute', left: 0, right: 0, top: 860, display: 'flex', justifyContent: 'center', gap: 16, opacity: verdict, translate: `0px ${(1 - verdict) * 20}px`}}>
				<Chip tone="good" style={{fontSize: 24}}>ready ✓</Chip>
				<Chip style={{fontSize: 24}}>text fits</Chip>
				<Chip style={{fontSize: 24}}>contrast verified</Chip>
				<Chip style={{fontSize: 24}}>schema-valid PowerPoint</Chip>
				<Chip style={{fontSize: 24}}>rebuilt clean from intent</Chip>
			</div>

			<Audio name="Scan" from={SCAN[0]} src={staticFile('launch/audio/whoosh.wav')} volume={0.18} premountFor={fps} />
			<Audio name="Flag" from={FLAG} src={staticFile('launch/audio/flag.wav')} volume={0.45} premountFor={fps} />
			<Audio name="Zoom" from={ZOOM[0]} src={staticFile('launch/audio/whoosh.wav')} volume={0.2} premountFor={fps} />
			<Audio name="Recolour" from={FIX - 2} src={staticFile('launch/audio/pop.wav')} volume={0.35} premountFor={fps} />
			<Audio name="Fixed" from={FIX} src={staticFile('launch/audio/success.wav')} volume={0.4} premountFor={fps} />
		</AbsoluteFill>
	);
};
