import type React from 'react';
import {Img, interpolate, staticFile} from 'remotion';
import type {ChartEl, ConnectorEl, El, IconEl, ImageEl, ShapeEl, Slide, TableEl, TextEl} from '../deck';
import {hex, SLIDE_H_IN, SLIDE_W_IN} from '../deck';
import {clamp, deckFonts, ease} from '../theme';

// Draws one slide of the demo deck from the engine's scene.json, at any pixel
// width. `reveal(el, i)` returns 0..1 per element so a scene can stage the
// build; omitted, everything is shown.

type Props = {
	slide: Slide;
	width: number;
	reveal?: (el: El, i: number) => number;
	override?: (el: El) => El;
	// Folder under public/ that holds the deck's images, by file name.
	assetBase?: string;
	style?: React.CSSProperties;
	children?: React.ReactNode;
};

// "Plus Jakarta Sans Medium" → the Plus Jakarta Sans family; the weight is set separately.
const face = (family: string) => {
	const known = Object.keys(deckFonts).find((name) => family === name || family.startsWith(`${name} `));
	return known ? deckFonts[known] : family;
};

export const SlideView: React.FC<Props> = ({slide, width, reveal, override, style, children, assetBase = 'launch/deck/assets'}) => {
	const ppi = width / SLIDE_W_IN; // pixels per inch
	const height = SLIDE_H_IN * ppi;
	const els = [...slide.elements].sort((a, b) => a.z - b.z);
	return (
		<div
			style={{
				position: 'relative',
				width,
				height,
				background: hex(slide.background),
				overflow: 'hidden',
				...style,
			}}
		>
			{els.map((raw, i) => {
				const el = override ? override(raw) : raw;
				const p = reveal ? reveal(el, i) : 1;
				if (p <= 0) return null;
				return <Element key={el.id} el={el} ppi={ppi} p={Math.min(1, p)} assetBase={assetBase} />;
			})}
			{children}
		</div>
	);
};

const box = (el: El, ppi: number): React.CSSProperties => ({
	rotate: (el as {rotate?: number}).rotate ? `${(el as {rotate?: number}).rotate}deg` : undefined,
	position: 'absolute',
	left: el.frame.x * ppi,
	top: el.frame.y * ppi,
	width: el.frame.w * ppi,
	height: el.frame.h * ppi,
});

const Element: React.FC<{el: El; ppi: number; p: number; assetBase: string}> = ({el, ppi, p, assetBase}) => {
	switch (el.kind) {
		case 'text':
			return <Text el={el} ppi={ppi} p={p} />;
		case 'shape':
			return <Shape el={el} ppi={ppi} p={p} />;
		case 'icon':
			return <Icon el={el} ppi={ppi} p={p} />;
		case 'chart':
			return <Chart el={el} ppi={ppi} p={p} />;
		case 'connector':
			return <Connector el={el} ppi={ppi} p={p} />;
		case 'table':
			return <Table el={el} ppi={ppi} p={p} />;
		case 'image':
			return <Image el={el} ppi={ppi} p={p} assetBase={assetBase} />;
		default:
			return null;
	}
};

const pt = (size: number, ppi: number) => (size / 72) * ppi;

export const Text: React.FC<{el: TextEl; ppi: number; p: number}> = ({el, ppi, p}) => {
	const s = el.style;
	const size = pt(s.size, ppi);
	const [top, right, bottom, left] = s.inset.map((v) => v * ppi);
	const e = ease.out(p);
	return (
		<div
			style={{
				...box(el, ppi),
				display: 'flex',
				flexDirection: 'column',
				// Diagram labels: the engine sizes the node for its own line breaks; centring
				// keeps the label in the node when the browser breaks it differently.
				justifyContent: s.valign === 'middle' || /-node-.*-label$/.test(el.id) ? 'center' : s.valign === 'bottom' ? 'flex-end' : 'flex-start',
				padding: `${top}px ${right}px ${bottom}px ${left}px`,
				opacity: e,
				translate: `0px ${(1 - e) * size * 0.35}px`,
			}}
		>
			{el.paragraphs.map((para, k) => (
				<div
					key={k}
					style={{
						fontFamily: face(s.family ?? s.font ?? 'Inter'),
						fontWeight: s.bold ? 700 : (s.weight ?? 400),
						fontStyle: s.italic ? 'italic' : 'normal',
						fontSize: size,
						lineHeight: s.leading,
						color: hex(s.color),
						textAlign: s.align,
						letterSpacing: s.tracking ? `${s.tracking}em` : undefined,
						textTransform: s.case === 'upper' ? 'uppercase' : s.case === 'lower' ? 'lowercase' : undefined,
						whiteSpace: el.fit?.lines === 1 ? 'pre' : 'pre-wrap',
						fontVariantNumeric: 'lining-nums',
					}}
				>
					{para.runs.map((r, j) => (
						<span key={j} style={{fontWeight: r.bold ? 700 : undefined, fontStyle: r.italic ? 'italic' : undefined}}>
							{r.text}
						</span>
					))}
				</div>
			))}
		</div>
	);
};

// The engine's preset geometry (src/v2/render/svg.ts), in a w × h box.
const presetPath = (preset: string, w: number, h: number): string | null => {
	switch (preset) {
		case 'diamond':
			return `M${w / 2},0 L${w},${h / 2} L${w / 2},${h} L0,${h / 2} Z`;
		case 'chevron': {
			const n = Math.min(w, h) * 0.5;
			return `M0,0 L${w - n},0 L${w},${h / 2} L${w - n},${h} L0,${h} L${n},${h / 2} Z`;
		}
		case 'homePlate': {
			const t = Math.min(w, h) * 0.5;
			return `M0,0 L${w - t},0 L${w},${h / 2} L${w - t},${h} L0,${h} Z`;
		}
		case 'triangle':
			return `M${w / 2},0 L${w},${h} L0,${h} Z`;
		case 'rtTriangle':
			return `M0,0 L${w},${h} L0,${h} Z`;
		case 'hexagon': {
			const i = w * 0.25;
			return `M${i},0 L${w - i},0 L${w},${h / 2} L${w - i},${h} L${i},${h} L0,${h / 2} Z`;
		}
		case 'rightArrow':
			return `M0,${h * 0.25} L${w * 0.6},${h * 0.25} L${w * 0.6},0 L${w},${h / 2} L${w * 0.6},${h} L${w * 0.6},${h * 0.75} L0,${h * 0.75} Z`;
		default:
			return null;
	}
};

const Shape: React.FC<{el: ShapeEl; ppi: number; p: number}> = ({el, ppi, p}) => {
	const s = el.style;
	const e = ease.out(p);
	const W = el.frame.w * ppi;
	const Hh = el.frame.h * ppi;
	const preset = s.path ? null : presetPath(s.preset, W, Hh);
	if (s.path || preset) {
		// Custom paths are drawn in a unit box; strokes keep their point width.
		const paint = s.fill ? hex(s.fill) : 'none';
		return (
			<svg style={{...box(el, ppi), overflow: 'visible', opacity: (s.opacity ?? 1) * Math.min(1, e * 1.4), rotate: el.rotate ? `${el.rotate}deg` : undefined}} width={W} height={Hh} viewBox={s.path ? '0 0 1 1' : `0 0 ${W} ${Hh}`} preserveAspectRatio="none">
				<path
					d={s.path ?? preset!}
					fill={paint}
					stroke={s.stroke ? hex(s.stroke) : undefined}
					strokeWidth={s.stroke ? pt(s.strokeWidth ?? 1, ppi) : undefined}
					vectorEffect="non-scaling-stroke"
					strokeLinecap="round"
					pathLength={s.path ? 1 : undefined}
					strokeDasharray={s.path && s.stroke ? 1 : undefined}
					strokeDashoffset={s.path && s.stroke ? 1 - e : undefined}
				/>
			</svg>
		);
	}
	if (s.gradient) {
		// Drawn exactly as the engine's preview draws it: an objectBoundingBox
		// linear gradient from an opaque colour into a translucent one.
		const g = s.gradient;
		const r = (g.angle * Math.PI) / 180;
		const id = `grad-${el.id.replace(/[^a-z0-9]/gi, '-')}`;
		return (
			<svg style={{...box(el, ppi), opacity: e}} preserveAspectRatio="none" viewBox="0 0 1 1">
				<defs>
					<linearGradient id={id} x1={0.5 - Math.cos(r) / 2} y1={0.5 - Math.sin(r) / 2} x2={0.5 + Math.cos(r) / 2} y2={0.5 + Math.sin(r) / 2}>
						<stop offset="0" stopColor={hex(g.from)} />
						<stop offset="1" stopColor={hex(g.to)} stopOpacity={g.toAlpha ?? 1} />
					</linearGradient>
				</defs>
				<rect x={0} y={0} width={1} height={1} fill={`url(#${id})`} />
			</svg>
		);
	}
	const radius = s.preset === 'roundRect' ? ((s.radius ?? 6) / 72) * ppi * 1.2 : s.preset === 'ellipse' ? '50%' : 0;
	return (
		<div
			style={{
				...box(el, ppi),
				background: s.fill ? hex(s.fill) : 'transparent',
				border: s.stroke ? `${pt(s.strokeWidth ?? 1, ppi)}px solid ${hex(s.stroke)}` : undefined,
				boxShadow: s.shadow === 'soft' ? '0 1px 2px rgba(10,20,51,0.06), 0 10px 24px -10px rgba(10,20,51,0.2)' : undefined,
				borderRadius: radius,
				opacity: (s.opacity ?? 1) * Math.min(1, e * 1.4),
				// Long thin shapes (bars) grow left to right; everything else wipes up.
				// Fully revealed, nothing is clipped, so soft shadows show.
				clipPath:
					e >= 0.999
						? undefined
						: el.frame.w > el.frame.h * 4
						? `inset(0 ${(1 - e) * 100}% 0 0 round ${typeof radius === 'number' ? radius : 0}px)`
						: `inset(0 0 ${(1 - e) * 100}% 0 round ${typeof radius === 'number' ? radius : 0}px)`,
			}}
		/>
	);
};

// The engine's crop fractions mapped onto the frame, exactly as written to the PPTX.
const Image: React.FC<{el: ImageEl; ppi: number; p: number; assetBase: string}> = ({el, ppi, p, assetBase}) => {
	const c = el.crop ?? {left: 0, right: 0, top: 0, bottom: 0};
	const w = (el.frame.w * ppi) / (1 - c.left - c.right);
	const h = (el.frame.h * ppi) / (1 - c.top - c.bottom);
	const e = ease.out(p);
	const name = el.asset.split('/').pop();
	return (
		<div style={{...box(el, ppi), overflow: 'hidden', opacity: e, scale: interpolate(e, [0, 1], [1.04, 1])}}>
			<Img src={staticFile(`${assetBase}/${name}`)} style={{position: 'absolute', left: -c.left * w, top: -c.top * h, width: w, height: h, maxWidth: 'none'}} />
		</div>
	);
};

const Icon: React.FC<{el: IconEl; ppi: number; p: number}> = ({el, ppi, p}) => {
	const e = ease.out(p);
	return (
		<svg
			viewBox="0 0 24 24"
			style={{...box(el, ppi), overflow: 'visible', scale: interpolate(e, [0, 1], [0.4, 1]), opacity: e}}
			fill="none"
			stroke={hex(el.color)}
			strokeWidth={el.strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{el.paths.map((path, i) => (
				<path key={i} d={path.d} fill={path.fill ? hex(el.color) : 'none'} />
			))}
		</svg>
	);
};

// The engine's own axis rule (src/v2/charts/preview.ts): about five ticks.
const niceStep = (range: number, ticks = 5) => {
	if (range <= 0) return 1;
	const rough = range / ticks;
	const magnitude = 10 ** Math.floor(Math.log10(rough));
	const residual = rough / magnitude;
	return (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1) * magnitude;
};
const niceMax = (v: number) => {
	const step = niceStep(v);
	return {max: Math.ceil(v / step) * step, step};
};

// `name/55`: 55% of the way to white, as the engine tints unhighlighted bars.
const tint = (h: string, pct: number) => {
	const c = [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16));
	return `rgb(${c.map((v) => Math.round(v + (255 - v) * (pct / 100))).join(',')})`;
};

// Pie and doughnut, as the engine draws them: one series, highlighted slices
// in the highlight colour and the rest in tints of the first data colour.
const Ring: React.FC<{el: ChartEl; ppi: number; p: number}> = ({el, ppi, p}) => {
	const W = el.frame.w * ppi;
	const H = el.frame.h * ppi;
	const values = (el.data.series[0]?.values ?? []).map((v) => Math.max(0, v));
	const total = values.reduce((sum, v) => sum + v, 0) || 1;
	const r = (Math.min(W, H) / 2) * 0.9;
	const inner = el.chart === 'doughnut' ? r * 0.62 : 0;
	const cx = W / 2;
	const cy = H / 2;
	const sweepAll = ease.inOut(p) * Math.PI * 2;
	const hl = el.highlight ?? [];
	let start = -Math.PI / 2;
	const pt2 = (rad: number, a: number) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
	return (
		<svg style={{...box(el, ppi), overflow: 'visible'}} width={W} height={H}>
			{values.map((v, i) => {
				const full = (v / total) * Math.PI * 2;
				const from = start;
				start += full;
				const visible = Math.max(0, Math.min(full, sweepAll - (from + Math.PI / 2)));
				if (visible <= 0.0001) return null;
				const to = from + visible;
				const large = visible > Math.PI ? 1 : 0;
				const color = hl.length ? (hl.includes(i) ? hex(el.style.highlight ?? el.colors[0]) : tint(hex(el.colors[0]), 40 + (i % 3) * 15)) : hex(el.colors[i % el.colors.length]);
				const d = inner
					? `M${pt2(r, from)} A${r},${r} 0 ${large} 1 ${pt2(r, to)} L${pt2(inner, to)} A${inner},${inner} 0 ${large} 0 ${pt2(inner, from)} Z`
					: `M${cx},${cy} L${pt2(r, from)} A${r},${r} 0 ${large} 1 ${pt2(r, to)} Z`;
				return <path key={i} d={d} fill={color} stroke="#FFFFFF" strokeWidth={1} />;
			})}
		</svg>
	);
};

const Chart: React.FC<{el: ChartEl; ppi: number; p: number}> = ({el, ppi, p}) => {
	if (el.chart === 'pie' || el.chart === 'doughnut') return <Ring el={el} ppi={ppi} p={p} />;
	const W = el.frame.w * ppi;
	const H = el.frame.h * ppi;
	const fs = pt(el.style.size, ppi);
	const font = face(el.style.font);
	const all = el.data.series.flatMap((s) => s.values);
	const {max, step} = niceMax(Math.max(...all));
	const showLegend = el.style.legend !== 'none' && el.data.series.length > 1;
	const legendH = showLegend ? fs * 2.2 : fs * 1.4;
	const axisW = fs * 2.4;
	const bottomH = fs * 2;
	const px0 = axisW;
	const px1 = W - fs * 0.5;
	const py0 = legendH;
	const py1 = H - bottomH;
	const yOf = (v: number) => py1 - (v / max) * (py1 - py0);
	const axisP = interpolate(p, [0, 0.35], [0, 1], clamp);
	const dataP = interpolate(p, [0.25, 1], [0, 1], clamp);
	const n = el.data.categories.length;
	const ticks = Array.from({length: max / step + 1}, (_, i) => i * step);
	const muted = hex(el.style.muted);
	const rule = hex(el.style.rule);
	return (
		<div style={{...box(el, ppi)}}>
			<svg width={W} height={H} style={{overflow: 'visible', fontFamily: font}}>
				{/* legend */}
				<g opacity={showLegend ? axisP : 0}>
					{el.data.series.map((s, i) => {
						const x = px0 + i * fs * 9;
						return (
							<g key={s.name}>
								<rect x={x} y={fs * 0.3} width={fs * 0.7} height={fs * 0.7} fill={hex(el.colors[i])} />
								<text x={x + fs * 1.05} y={fs * 0.95} fontSize={fs * 0.85} fill={muted}>
									{s.name}
								</text>
							</g>
						);
					})}
				</g>
				{/* gridlines + y labels */}
				{ticks.map((t) => (
					<g key={t} opacity={axisP}>
						<line x1={px0} x2={px0 + (px1 - px0) * axisP} y1={yOf(t)} y2={yOf(t)} stroke={rule} strokeWidth={t === 0 ? 1.4 : 0.8} />
						<text x={px0 - fs * 0.5} y={yOf(t) + fs * 0.3} fontSize={fs * 0.8} fill={muted} textAnchor="end">
							{t}
						</text>
					</g>
				))}
				{el.chart === 'line' ? (
					<>
						{el.data.categories.map((c, i) => (
							<text key={c} x={px0 + ((i + 0.5) / n) * (px1 - px0)} y={py1 + fs * 1.3} fontSize={fs * 0.8} fill={muted} textAnchor="middle" opacity={axisP}>
								{c}
							</text>
						))}
						{el.data.series.map((s, si) => {
							const pts = s.values.map((v, i) => [px0 + ((i + 0.5) / n) * (px1 - px0), yOf(v)] as const);
							const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
							let len = 0;
							for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
							const local = interpolate(dataP, [si * 0.15, 0.85 + si * 0.15], [0, 1], {...clamp, easing: ease.inOut});
							return (
								<path
									key={s.name}
									d={d}
									fill="none"
									stroke={hex(el.colors[si])}
									strokeWidth={si === 0 ? fs * 0.22 : fs * 0.14}
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeDasharray={len}
									strokeDashoffset={len * (1 - local)}
								/>
							);
						})}
					</>
				) : (
					<>
						{el.data.categories.map((c, ci) => {
							const groupW = (px1 - px0) / n;
							const barW = (groupW * 0.62) / el.data.series.length;
							const gx = px0 + ci * groupW + groupW * 0.19;
							return (
								<g key={c}>
									{el.data.series.map((s, si) => {
										// Staggered across however many categories there are, always finishing by p = 1.
										const at = (ci / Math.max(1, n)) * 0.4 + si * 0.05;
										const local = interpolate(dataP, [at, at + 0.55], [0, 1], {...clamp, easing: ease.out});
										const v = s.values[ci] * local;
										const hl = el.highlight ?? [];
										const fill = hl.length && el.data.series.length === 1 ? (hl.includes(ci) ? hex(el.style.highlight ?? el.colors[0]) : tint(hex(el.colors[0]), 55)) : hex(el.colors[si]);
										return (
											<g key={s.name}>
												<rect x={gx + si * barW} y={yOf(v)} width={barW} height={py1 - yOf(v)} fill={fill} />
												{el.style.labels && el.style.labels !== 'none' ? (
													<text x={gx + si * barW + barW / 2} y={yOf(v) - fs * 0.35} fontSize={fs * 0.85} fill={hex(el.style.text)} textAnchor="middle" opacity={interpolate(local, [0.7, 1], [0, 1], clamp)}>
														{s.values[ci]}
													</text>
												) : null}
											</g>
										);
									})}
									<text x={gx + (barW * el.data.series.length) / 2} y={py1 + fs * 1.3} fontSize={fs * 0.8} fill={muted} textAnchor="middle" opacity={axisP}>
										{c}
									</text>
								</g>
							);
						})}
					</>
				)}
			</svg>
		</div>
	);
};

const Connector: React.FC<{el: ConnectorEl; ppi: number; p: number}> = ({el, ppi, p}) => {
	const pts = el.points.map((q) => [q.x * ppi, q.y * ppi] as const);
	const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
	let len = 0;
	for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
	const e = ease.inOut(p);
	const sw = pt(el.style.strokeWidth, ppi) * 1.4;
	const [ex, ey] = pts[pts.length - 1];
	const [fx, fy] = pts[pts.length - 2];
	const ang = Math.atan2(ey - fy, ex - fx);
	const ah = sw * 4.5;
	const col = hex(el.style.stroke);
	return (
		<svg style={{position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible'}}>
			<path d={d} fill="none" stroke={col} strokeWidth={sw} strokeDasharray={len} strokeDashoffset={len * (1 - e)} />
			{el.style.arrowEnd ? (
				<path
					d={`M${ex},${ey} L${ex - ah * Math.cos(ang - 0.45)},${ey - ah * Math.sin(ang - 0.45)} L${ex - ah * Math.cos(ang + 0.45)},${ey - ah * Math.sin(ang + 0.45)} Z`}
					fill={col}
					opacity={interpolate(p, [0.85, 1], [0, 1], clamp)}
				/>
			) : null}
		</svg>
	);
};

const Table: React.FC<{el: TableEl; ppi: number; p: number}> = ({el, ppi, p}) => {
	const s = el.style;
	const fs = pt(s.size, ppi);
	const rows = [el.columns, ...el.rows];
	let y = 0;
	return (
		<div style={{...box(el, ppi)}}>
			{rows.map((row, ri) => {
				const h = el.rowHeights[ri] * ppi;
				const top = y;
				y += h;
				const local = ease.out(interpolate(p, [ri * 0.12, ri * 0.12 + 0.4], [0, 1], clamp));
				const isHeader = ri === 0;
				// As the engine counts it: data rows from zero, the header excluded.
				const isHi = !isHeader && el.highlight?.row === ri - 1;
				let x = 0;
				return (
					<div
						key={ri}
						style={{
							position: 'absolute',
							left: 0,
							top,
							width: '100%',
							height: h,
							background: isHeader ? hex(s.headerFill) : isHi ? hex(s.highlightFill) : 'transparent',
							borderBottom: `1px solid ${hex(s.rule)}`,
							opacity: local,
							translate: `0px ${(1 - local) * 8}px`,
						}}
					>
						{row.map((cell, ci) => {
							const w = el.columnWidths[ci] * ppi;
							const left = x;
							x += w;
							return (
								<div
									key={ci}
									style={{
										position: 'absolute',
										left,
										width: w,
										top: 0,
										height: h,
										display: 'flex',
										alignItems: 'center',
										justifyContent: s.align[ci] === 'right' ? 'flex-end' : s.align[ci] === 'center' ? 'center' : 'flex-start',
										padding: `0 ${0.08 * ppi}px`,
										fontFamily: face(s.font),
										fontSize: fs,
										fontWeight: isHeader || isHi ? 600 : 400,
										color: hex(isHeader ? s.headerText : s.text),
										fontVariantNumeric: 'tabular-nums',
									}}
								>
									{cell}
								</div>
							);
						})}
					</div>
				);
			})}
		</div>
	);
};
