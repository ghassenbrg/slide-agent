import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SlideView} from '../components/SlideView';
import {Caret, Pointer, StageTitle} from '../components/ui';
import type {Frame, ShapeEl} from '../deck';
import {DECK_PREVIEWS, slideById, SLIDE_W_IN} from '../deck';
import {accentWord, C, clamp, display, ease, mono, shadow} from '../theme';

// 0:45.5–0:50.5 — the file. A generic slide editor (not any vendor's UI):
// the headline is a live text box in its embedded face, and a roadmap bar is
// a native shape with its theme fill and size.

const WIN = {x: 160, y: 262, w: 1600, h: 790};
const RAIL = 236;
const SLIDE_W = 1120;
const SX = WIN.x + RAIL + (WIN.w - RAIL - SLIDE_W) / 2;
const SY = WIN.y + 112 + 26;
const PPI = SLIDE_W / SLIDE_W_IN;

const CLICK_TEXT = 46;
const CLICK_BAR = 92;

const roadmap = slideById('roadmap');
const title = roadmap.elements.find((e) => e.id === 'roadmap/text3')!;
const bar = roadmap.elements.find((e) => e.id === 'roadmap/shape25') as ShapeEl;
const barFill = `#${bar.style.fill?.hex ?? '8B5CF6'}`;

const at = (fr: Frame) => ({x: SX + fr.x * PPI, y: SY + fr.y * PPI, w: fr.w * PPI, h: fr.h * PPI});

const Handles: React.FC<{r: {x: number; y: number; w: number; h: number}; o: number}> = ({r, o}) => (
	<div style={{position: 'absolute', left: r.x - 4, top: r.y - 4, width: r.w + 8, height: r.h + 8, border: `2px solid ${C.blue}`, opacity: o, zIndex: 20}}>
		{[0, 0.5, 1].flatMap((cx) =>
			[0, 0.5, 1]
				.filter((cy) => !(cx === 0.5 && cy === 0.5))
				.map((cy) => (
					<div key={`${cx}${cy}`} style={{position: 'absolute', left: `calc(${cx * 100}% - 7px)`, top: `calc(${cy * 100}% - 7px)`, width: 12, height: 12, borderRadius: 12, background: '#fff', border: `2px solid ${C.blue}`}} />
				)),
		)}
	</div>
);

export const Deliver: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();

	const drop = interpolate(f, [0, 14], [0, 1], {...clamp, easing: ease.out});
	const open = interpolate(f, [12, 30], [0, 1], {...clamp, easing: ease.inOut});
	const exit = interpolate(f, [140, 150], [0, 1], {...clamp, easing: ease.in});

	const tR = at(title.frame);
	const cR = at(bar.frame);

	// Pointer: to the headline, click; to a roadmap bar, click.
	const p1 = interpolate(f, [30, CLICK_TEXT - 2], [0, 1], {...clamp, easing: ease.out});
	const p2 = interpolate(f, [CLICK_TEXT + 22, CLICK_BAR - 2], [0, 1], {...clamp, easing: ease.inOut});
	const px = interpolate(p1, [0, 1], [1700, tR.x + tR.w * 0.62]) + p2 * (cR.x + cR.w * 0.55 - (tR.x + tR.w * 0.62));
	const py = interpolate(p1, [0, 1], [1040, tR.y + tR.h * 0.55]) + p2 * (cR.y + cR.h * 0.5 - (tR.y + tR.h * 0.55));

	const textSel = f >= CLICK_TEXT && f < CLICK_BAR;
	const barSel = f >= CLICK_BAR;
	const sheet = interpolate(f, [CLICK_BAR + 4, CLICK_BAR + 18], [0, 1], {...clamp, easing: ease.out});
	const font = barSel ? 'Rounded rectangle' : textSel ? 'Plus Jakarta Sans ExtraBold' : 'Plus Jakarta Sans Medium';
	const size = barSel ? '—' : textSel ? '46' : '17';

	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			<StageTitle n="05" label="DELIVER" at={0} top={70}>
				Real PowerPoint. <span style={accentWord()}>Every word, shape and chart editable.</span>
			</StageTitle>

			{/* the file arriving */}
			{open < 1 ? (
				<div
					style={{
						position: 'absolute',
						left: 960 - 90,
						top: interpolate(drop, [0, 1], [-260, 520]),
						width: 180,
						height: 220,
						borderRadius: 18,
						background: C.card,
						boxShadow: shadow.lift,
						opacity: 1 - open,
						scale: 1 + open * 2,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 14,
						zIndex: 30,
					}}
				>
					<div style={{width: 92, height: 92, borderRadius: 18, background: '#E8590C', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
						<svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
							<rect x={3} y={4} width={18} height={13} rx={1.5} />
							<path d="M8 21h8M12 17v4" />
						</svg>
					</div>
					<div style={{fontFamily: mono, fontSize: 24, fontWeight: 500, color: C.ink}}>deck.pptx</div>
				</div>
			) : null}

			{/* the editor */}
			<div
				style={{
					position: 'absolute',
					left: WIN.x,
					top: WIN.y,
					width: WIN.w,
					height: WIN.h,
					borderRadius: 18,
					background: '#EEF0F5',
					boxShadow: shadow.lift,
					overflow: 'hidden',
					opacity: open,
					scale: interpolate(open, [0, 1], [0.6, 1]),
				}}
			>
				<div style={{height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px', background: '#fff', borderBottom: `1px solid ${C.line}`}}>
					{['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
						<div key={c} style={{width: 13, height: 13, borderRadius: 13, background: c}} />
					))}
					<div style={{marginLeft: 16, fontFamily: display, fontWeight: 600, fontSize: 21, color: C.ink}}>deck.pptx</div>
				</div>
				<div style={{height: 60, display: 'flex', alignItems: 'center', gap: 14, padding: '0 22px', background: '#fff', borderBottom: `1px solid ${C.line}`, fontFamily: display, fontSize: 19, color: C.inkSoft}}>
					<div style={{padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.line}`, minWidth: 220, background: textSel || barSel ? C.blueSoft : '#fff', color: C.ink}}>{font}</div>
					<div style={{padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.line}`, width: 70, textAlign: 'center', color: C.ink}}>{size}</div>
					{['B', 'I', 'U'].map((x) => (
						<div key={x} style={{width: 36, textAlign: 'center', fontWeight: x === 'B' ? 800 : 500, fontStyle: x === 'I' ? 'italic' : undefined, textDecoration: x === 'U' ? 'underline' : undefined}}>
							{x}
						</div>
					))}
					<div style={{width: 1, height: 28, background: C.line}} />
					<div style={{display: 'flex', gap: 8}}>
						{['#0B1B33', '#4F46E5', '#0891B2', '#7C3AED', '#15803D', '#B45309'].map((c) => (
							<div key={c} style={{width: 24, height: 24, borderRadius: 5, background: c, border: `1px solid ${C.line}`}} />
						))}
					</div>
					<div style={{marginLeft: 'auto', fontFamily: mono, fontSize: 16, color: C.dim}}>fonts embedded · theme colours</div>
				</div>
				{/* thumbnails */}
				<div style={{position: 'absolute', left: 0, top: 112, width: RAIL, bottom: 0, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12, background: '#E6E9F0'}}>
					{DECK_PREVIEWS.slice(3, 9).map((n, i) => (
						<div key={n} style={{display: 'flex', gap: 8, alignItems: 'flex-start'}}>
							<div style={{fontFamily: mono, fontSize: 13, color: C.dim, width: 14}}>{i + 4}</div>
							<Img src={staticFile(`launch/deck/${n}.png`)} style={{width: 170, borderRadius: 4, outline: n === '08-roadmap' ? `3px solid ${C.blue}` : `1px solid ${C.line}`}} />
						</div>
					))}
				</div>
			</div>

			{/* the slide itself, drawn from scene.json */}
			<div style={{position: 'absolute', left: SX, top: SY, opacity: interpolate(f, [22, 32], [0, 1], clamp), boxShadow: shadow.card}}>
				<SlideView slide={roadmap} width={SLIDE_W} />
			</div>

			{textSel ? (
				<>
					<Handles r={tR} o={1} />
					<div style={{position: 'absolute', left: tR.x + tR.w * 0.98, top: tR.y + tR.h * 0.14, zIndex: 21}}>
						<Caret height={tR.h * 0.7} color="#0F2A44" from={CLICK_TEXT} />
					</div>
				</>
			) : null}
			{barSel ? <Handles r={cR} o={1} /> : null}

			{/* the shape's own properties */}
			<div
				style={{
					position: 'absolute',
					left: cR.x - 40,
					top: cR.y + cR.h + 26,
					width: 460,
					borderRadius: 14,
					background: '#fff',
					boxShadow: shadow.lift,
					opacity: sheet,
					translate: `0px ${(1 - sheet) * 20}px`,
					zIndex: 25,
					overflow: 'hidden',
					fontFamily: mono,
					fontSize: 19,
				}}
			>
				<div style={{padding: '10px 16px', background: '#F2F4FA', color: C.inkSoft, fontSize: 16, letterSpacing: '0.08em'}}>SHAPE · EDITABLE</div>
				<div style={{display: 'grid', gridTemplateColumns: '0.8fr 2fr'}}>
					<Row cells={['type', 'Rounded rectangle']} />
					<Row
						cells={[
							'fill',
							<span key="fill" style={{display: 'inline-flex', alignItems: 'center', gap: 10}}>
								<span style={{width: 20, height: 20, borderRadius: 5, background: barFill, display: 'inline-block'}} />
								purple · theme colour
							</span>,
						]}
					/>
					<Row cells={['size', `${bar.frame.w.toFixed(2)} × ${bar.frame.h.toFixed(2)} in`]} />
					<Row cells={['lane', 'Web Application']} />
				</div>
			</div>

			{f >= 28 && f < 140 ? <Pointer x={px} y={py} pressed={(f >= CLICK_TEXT && f < CLICK_TEXT + 4) || (f >= CLICK_BAR && f < CLICK_BAR + 4)} /> : null}

			<Audio name="File drop" from={10} src={staticFile('launch/audio/pop.wav')} volume={0.45} premountFor={fps} />
			<Audio name="Open" from={12} src={staticFile('launch/audio/whoosh.wav')} volume={0.2} premountFor={fps} />
			<Audio name="Click title" from={CLICK_TEXT} src={staticFile('launch/audio/click.wav')} volume={0.5} premountFor={fps} />
			<Audio name="Click bar" from={CLICK_BAR} src={staticFile('launch/audio/click.wav')} volume={0.5} premountFor={fps} />
			<Audio name="Properties" from={CLICK_BAR + 4} src={staticFile('launch/audio/pop.wav')} volume={0.3} premountFor={fps} />
		</AbsoluteFill>
	);
};

const Row: React.FC<{cells: React.ReactNode[]}> = ({cells}) => (
	<>
		{cells.map((c, i) => (
			<div key={i} style={{padding: '6px 14px', color: i ? C.ink : C.inkSoft, borderBottom: `1px solid ${C.line}`, fontVariantNumeric: 'tabular-nums'}}>
				{c}
			</div>
		))}
	</>
);
