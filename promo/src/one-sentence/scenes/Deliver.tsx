import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Overline, SH, SW, Slide, type Rect, inch} from '../kit';
import {C, FONT, inOut, land, lerp, recede, tween} from '../theme';
import {K, SHOTS} from '../timeline';
import {FERN_SLIDES} from './Workflow';
import {GRID, GW} from './Depth';

// Beats inside the shot (frames after K.deliver). Callouts lead their spoken words by ~0.4 s.
export const DL = {deal: 0, fold: 12, folds: [0, 5, 8, 10, 12], seal: 38, open: 44, text: 66, chart: 86, sheet: 94};

// Verified in the package: title placeholder + text runs, chart1.xml with an embedded
// workbook, embedded fonts, theme colours (see one-sentence/evidence/pptx-check.txt).
const VIEW = {x: 60, y: 420, w: 960};
const S = VIEW.w / SW;
const scr = (r: Rect) => ({x: VIEW.x + r.x * S, y: VIEW.y + r.y * S, w: r.w * S, h: r.h * S});
const DOC = {x: 540, y: 640, w: 300, h: 380};


const Selection: React.FC<{r: Rect; at: number; f: number; label: string; above?: boolean}> = ({r, at, f, label, above = true}) => {
	const t = land(f, at, 30, 18, 170);
	if (f < at) return null;
	const b = scr(r);
	const hs = 16;
	const handles = [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]];
	return (
		<div style={{position: 'absolute', left: b.x - 8, top: b.y - 8, width: b.w + 16, height: b.h + 16, opacity: Math.min(1, t * 1.5)}}>
			<div style={{position: 'absolute', inset: 0, border: `3px solid ${C.blue}`, boxShadow: `0 0 0 1px rgba(255,255,255,0.6), 0 0 40px rgba(47,91,255,0.35)`, transform: `scale(${lerp(1.06, 1, Math.min(1, t))})`}} />
			{handles.map(([hx, hy], i) => (
				<div key={i} style={{position: 'absolute', left: `calc(${hx * 100}% - ${hs / 2}px)`, top: `calc(${hy * 100}% - ${hs / 2}px)`, width: hs, height: hs, background: C.white, border: `3px solid ${C.blue}`, borderRadius: 3}} />
			))}
			<div style={{position: 'absolute', left: -2, [above ? 'bottom' : 'top']: 'calc(100% + 14px)', fontFamily: FONT, fontWeight: 700, fontSize: 34, color: C.white, background: C.blue, borderRadius: 14, padding: '6px 18px', whiteSpace: 'nowrap', transform: `translateY(${(1 - Math.min(1, t)) * 12}px)`}}>
				{label}
			</div>
		</div>
	);
};

export const Deliver: React.FC = () => {
	const f = useCurrentFrame() + SHOTS.deliver.from;
	const s0 = K.deliver;
	const doc = land(f, s0 + DL.fold - 2, 30, 18, 150);
	const lock = land(f, s0 + DL.seal, 30, 12, 220);
	const open = tween(f, s0 + DL.open, 12, inOut);
	// hand-over to Close: the open file shrinks back into the deck wall that rises behind the lockup
	const back = recede(f, SHOTS.close.from - 14, 22);
	const docOp = Math.min(1, doc * 1.5) * (1 - tween(f, s0 + DL.open + 6, 5));
	return (
		<AbsoluteFill style={{fontFamily: FONT, opacity: 1 - tween(f, SHOTS.close.from + 2, 8), transform: `scale(${1 - back * 0.42}) translateY(${back * 40}px)`, transformOrigin: '540px 640px', filter: back > 0 ? `brightness(${1 - 0.5 * back})` : undefined}}>
			{/* the file */}
			<div style={{position: 'absolute', left: DOC.x - DOC.w / 2, top: DOC.y - DOC.h / 2, width: DOC.w, height: DOC.h, opacity: docOp, transform: `scale(${lerp(0.7, 1, Math.min(1, doc)) * (1 + Math.sin(Math.min(1, lock) * Math.PI) * 0.05) * lerp(1, 2.4, open)})`}}>
				<div style={{position: 'absolute', inset: 0, background: C.white, borderRadius: 26, clipPath: 'polygon(0 0, 74% 0, 100% 20%, 100% 100%, 0 100%)', boxShadow: '0 40px 100px rgba(0,0,0,0.5)'}} />
				<div style={{position: 'absolute', right: 0, top: 0, width: '26%', height: '20%', background: '#D9E2FF', borderBottomLeftRadius: 20}} />
				<div style={{position: 'absolute', left: 34, top: 150, padding: '8px 22px', borderRadius: 12, background: C.blue, color: C.white, fontWeight: 800, fontSize: 46, letterSpacing: '0.04em'}}>PPTX</div>
				<div style={{position: 'absolute', left: 34, right: 34, top: 240, height: 14, borderRadius: 7, background: '#E3E8F6'}} />
				<div style={{position: 'absolute', left: 34, width: 160, top: 272, height: 14, borderRadius: 7, background: '#E3E8F6'}} />
			</div>
			<div style={{position: 'absolute', left: 0, width: 1080, top: DOC.y + DOC.h / 2 + 34, textAlign: 'center', opacity: docOp}}>
				<div style={{fontSize: 44, fontWeight: 700, color: C.white}}>Fern-launch-plan.pptx</div>
				<div style={{fontSize: 30, fontWeight: 600, color: C.mist, marginTop: 8}}>5 slides · native PowerPoint</div>
			</div>
			{/* the five Fern slides are dealt out over the receding data deck, then fold into the file one by one */}
			{FERN_SLIDES.map((id, i) => {
				const dealt = land(f, s0 + DL.deal + i * 2, 30, 20, 170);
				const start = s0 + DL.fold + DL.folds[i];
				const t = tween(f, start, 14, inOut);
				if (f < s0 + DL.deal + i * 2 || t >= 1) return null;
				const x0 = GRID[i][0];
				const y0 = GRID[i][1] - 40 + (1 - Math.min(1, dealt)) * 320;
				const sc = lerp(GW / SW, 0.03, t);
				return (
					<div key={id} style={{position: 'absolute', left: lerp(x0, DOC.x, t) - (SW * sc) / 2, top: lerp(y0, DOC.y - 40, t) - (SH * sc) / 2 - Math.sin(t * Math.PI) * 50, width: SW, height: SH, transform: `scale(${sc}) rotate(${(t + (1 - Math.min(1, dealt)) * 1.5) * (i - 2) * 4}deg)`, transformOrigin: '0 0', borderRadius: 80, overflow: 'hidden', opacity: Math.min(Math.min(1, dealt * 3), 1 - tween(f, start + 11, 3)), boxShadow: '0 40px 120px rgba(0,0,0,0.6)'}}>
						<Slide id={id} />
					</div>
				);
			})}
			{/* it opens as a real slide; callouts mark native, editable objects */}
			<div style={{position: 'absolute', left: VIEW.x + (SW * S) / 2 - (SW * S * lerp(0.3, 1, open)) / 2, top: VIEW.y + (SH * S) / 2 - (SH * S * lerp(0.3, 1, open)) / 2, width: SW, height: SH, transform: `scale(${S * lerp(0.3, 1, open)})`, transformOrigin: '0 0', opacity: Math.min(1, open * 1.6), borderRadius: 70, overflow: 'hidden', boxShadow: '0 60px 160px rgba(0,0,0,0.55)'}}>
				<Slide id="fern-3" />
			</div>
			<Overline style={{position: 'absolute', left: VIEW.x, top: VIEW.y - 64, opacity: open}}>Native PowerPoint file</Overline>
			<Selection f={f} at={s0 + DL.text} r={inch(0.45, 0.82, 12.4, 0.7)} label="Editable text" />
			<Selection f={f} at={s0 + DL.chart} r={inch(0.4, 2.2, 7.75, 4.3)} label="Native chart · data included" above={false} />
			<DataSheet f={f} at={s0 + DL.sheet} />
		</AbsoluteFill>
	);
};

// The chart's embedded workbook (ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx), as built from the intent.
const ROWS: [string, number][] = [['Paid social', 160], ['Creators', 95], ['PR & events', 70], ['App store ads', 55], ['Contingency', 40]];
const DataSheet: React.FC<{f: number; at: number}> = ({f, at}) => {
	const t = land(f, at, 30, 18, 170);
	if (f < at) return null;
	const cell: React.CSSProperties = {height: 44, display: 'flex', alignItems: 'center', padding: '0 14px', borderRight: '1.5px solid #DDE3EE', borderBottom: '1.5px solid #DDE3EE'};
	return (
		<div style={{position: 'absolute', left: 590, top: 584, width: 440, borderRadius: 16, overflow: 'hidden', background: C.white, boxShadow: '0 30px 80px rgba(0,0,0,0.5)', fontFamily: FONT, fontSize: 26, color: C.ink, opacity: Math.min(1, t * 1.6), transform: `translateY(${(1 - Math.min(1, t)) * 30}px) scale(${lerp(0.92, 1, Math.min(1, t))})`, transformOrigin: '0 100%'}}>
			<div style={{background: C.blue, color: C.white, fontWeight: 700, fontSize: 26, padding: '10px 16px'}}>Chart data · embedded</div>
			<div style={{display: 'grid', gridTemplateColumns: '1fr 200px', background: '#F4F6FB', fontWeight: 700, color: '#5B6478'}}>
				<div style={cell}>Channel</div>
				<div style={{...cell, justifyContent: 'flex-end'}}>Budget ($K)</div>
			</div>
			{ROWS.map(([k, v], i) => (
				<div key={k} style={{display: 'grid', gridTemplateColumns: '1fr 200px', opacity: tween(f, at + 4 + i * 3, 6)}}>
					<div style={cell}>{k}</div>
					<div style={{...cell, justifyContent: 'flex-end', fontWeight: 700}}>{v}</div>
				</div>
			))}
		</div>
	);
};
