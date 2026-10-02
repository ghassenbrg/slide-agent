import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Chip} from '../../launch/components/ui';
import {contrast, DECK_PREVIEWS} from '../../launch/deck';
import {accentWord, C, clamp, display, ease, mono, shadow} from '../../launch/theme';
import {CONTENT_W, Headline, M, PICTURE_Y} from '../kit';

// 4 · Check — the engine's own previews. The finding is the first draft's real
// verdict (data/verdict-before.json); the fix is launch/demo/film/edit-results.json.

const GAP = 16;
const TILE_W = (CONTENT_W - 2 * GAP) / 3;
const TILE_H = (TILE_W * 9) / 16;
const FLAGGED = '03-results';
const BEFORE_RATIO = '1.87';
const AFTER_RATIO = contrast('B45309', 'FFF4E2').toFixed(2);

const SCAN = [14, 46];
const FLAG = 34;
const ZOOM = [48, 62];
const FIX = 80;
const UNZOOM = [100, 112];

export const Check: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const scanY = interpolate(f, SCAN, [PICTURE_Y - 30, PICTURE_Y + 3 * TILE_H + 2 * GAP + 30], {...clamp, easing: ease.inOut});
	const zoom = interpolate(f, ZOOM, [0, 1], {...clamp, easing: ease.inOut}) * (1 - interpolate(f, UNZOOM, [0, 1], {...clamp, easing: ease.inOut}));
	const fixed = f >= FIX;
	const fixT = interpolate(f, [FIX, FIX + 10], [0, 1], clamp);
	const verdict = interpolate(f, [UNZOOM[1] - 2, UNZOOM[1] + 10], [0, 1], {...clamp, easing: ease.out});
	const exit = interpolate(f, [126, 135], [0, 1], {...clamp, easing: ease.in});

	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			<Headline label="4 — CHECK">
				It checks its own work. <span style={accentWord()}>Then fixes it.</span>
			</Headline>

			{DECK_PREVIEWS.map((name, i) => {
				const gx = M + (i % 3) * (TILE_W + GAP);
				const gy = PICTURE_Y + Math.floor(i / 3) * (TILE_H + GAP);
				const isFlag = name === FLAGGED;
				const t = interpolate(f, [i * 1.5, i * 1.5 + 10], [0, 1], {...clamp, easing: ease.out});
				const scanned = scanY > gy + TILE_H / 2;
				const x = isFlag ? interpolate(zoom, [0, 1], [gx, M]) : gx;
				const y = isFlag ? interpolate(zoom, [0, 1], [gy, PICTURE_Y]) : gy;
				const w = isFlag ? interpolate(zoom, [0, 1], [TILE_W, CONTENT_W]) : TILE_W;
				const src = isFlag ? (fixed ? 'results-after' : 'results-before') : name;
				const flagged = isFlag && f >= FLAG && !fixed;
				return (
					<div key={name} style={{position: 'absolute', left: x, top: y, width: w, height: (w * 9) / 16, opacity: t * (isFlag ? 1 : 1 - zoom * 0.9), zIndex: isFlag ? 5 : 1}}>
						<Img src={staticFile(`launch/deck/${src}.png`)} style={{width: '100%', height: '100%', borderRadius: 8, boxShadow: shadow.card, display: 'block'}} />
						{isFlag && fixed && fixT < 1 ? <Img src={staticFile('launch/deck/results-before.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 8, opacity: 1 - fixT}} /> : null}
						<div style={{position: 'absolute', inset: -4, borderRadius: 11, border: `4px solid ${flagged ? '#E8590C' : C.good}`, opacity: flagged ? 1 : isFlag && fixed ? 1 - interpolate(f, [FIX + 26, FIX + 40], [0, 1], clamp) : 0}} />
						{scanned || (isFlag && f >= FLAG) ? (
							<div style={{position: 'absolute', right: -12, top: -12, width: 40, height: 40, borderRadius: 40, background: flagged ? '#E8590C' : C.good, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: display, fontWeight: 800, fontSize: 24, boxShadow: '0 4px 10px rgba(0,0,0,0.2)', scale: isFlag ? 1 - zoom : 1}}>
								{flagged ? '!' : '✓'}
							</div>
						) : null}
					</div>
				);
			})}

			{f >= SCAN[0] && f <= SCAN[1] + 4 ? (
				<div style={{position: 'absolute', left: M - 24, top: scanY, width: CONTENT_W + 48, height: 3, background: C.blue, boxShadow: '0 0 24px 6px rgba(47,91,255,0.35)', borderRadius: 3}} />
			) : null}

			{/* the finding, and the fix */}
			<div
				style={{
					position: 'absolute',
					left: M,
					width: CONTENT_W,
					top: PICTURE_Y + (CONTENT_W * 9) / 16 + 30,
					padding: '24px 28px',
					borderRadius: 20,
					background: C.card,
					boxShadow: shadow.lift,
					opacity: zoom,
					translate: `0px ${(1 - zoom) * 40}px`,
					zIndex: 10,
					display: 'flex',
					alignItems: 'center',
					gap: 22,
				}}
			>
				<div style={{width: 72, height: 72, borderRadius: 72, background: '#FFF4E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
					{/* Lucide "coins", the icon the engine flagged */}
					<svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={fixed ? '#B45309' : '#F5A524'} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
						<circle cx={8} cy={8} r={6} />
						<path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
						<path d="M7 6h1v4" />
						<path d="m16.71 13.88.7.71-2.82 2.82" />
					</svg>
				</div>
				<div style={{flex: 1}}>
					<div style={{fontFamily: mono, fontSize: 21, color: fixed ? C.good : '#D9480F'}}>{fixed ? 'fixed · deeper amber' : 'icon contrast · needs 3:1'}</div>
					<div style={{fontFamily: display, fontWeight: 600, fontSize: 32, lineHeight: 1.2, letterSpacing: '-0.015em', color: C.ink, marginTop: 6}}>
						{fixed ? 'The cost icon now reads on its badge' : 'Cost icon too faint on its badge'}
					</div>
				</div>
				<Chip tone={fixed ? 'good' : 'warn'} style={{fontSize: 28}}>
					{fixed ? AFTER_RATIO : BEFORE_RATIO} : 1
				</Chip>
			</div>

			{/* verdict */}
			<div style={{position: 'absolute', left: M, width: CONTENT_W, top: PICTURE_Y + 3 * TILE_H + 2 * GAP + 44, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14, opacity: verdict, translate: `0px ${(1 - verdict) * 20}px`}}>
				<Chip tone="good" style={{fontSize: 26}}>ready ✓</Chip>
				<Chip style={{fontSize: 26}}>text fits</Chip>
				<Chip style={{fontSize: 26}}>contrast verified</Chip>
				<Chip style={{fontSize: 26}}>schema-valid PowerPoint</Chip>
				<Chip style={{fontSize: 26}}>rebuilt clean from intent</Chip>
			</div>

			<Audio name="Scan" from={SCAN[0]} src={staticFile('launch/audio/whoosh.wav')} volume={0.18} premountFor={fps} />
			<Audio name="Flag" from={FLAG} src={staticFile('launch/audio/flag.wav')} volume={0.45} premountFor={fps} />
			<Audio name="Zoom" from={ZOOM[0]} src={staticFile('launch/audio/whoosh.wav')} volume={0.2} premountFor={fps} />
			<Audio name="Recolour" from={FIX - 2} src={staticFile('launch/audio/pop.wav')} volume={0.35} premountFor={fps} />
			<Audio name="Fixed" from={FIX} src={staticFile('launch/audio/success.wav')} volume={0.4} premountFor={fps} />
		</AbsoluteFill>
	);
};
