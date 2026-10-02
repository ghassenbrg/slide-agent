import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SlideView} from '../../launch/components/SlideView';
import {Caret, Pointer} from '../../launch/components/ui';
import type {ChartEl, Frame} from '../../launch/deck';
import {DECK_PREVIEWS, slideById, SLIDE_W_IN} from '../../launch/deck';
import {accentWord, C, clamp, display, ease, mono, shadow} from '../../launch/theme';
import {CONTENT_W, Headline, M, PICTURE_Y} from '../kit';

// 5 · Ship — the file, in a generic slide editor (not any vendor's UI): the
// headline is a live text box in its embedded face, and the chart is a native
// chart that opens onto the data it carries.

const WIN_H = 800;
const SLIDE_W = CONTENT_W - 48;
const SX = M + 24;
const SY = PICTURE_Y + 128 + 22;
const PPI = SLIDE_W / SLIDE_W_IN;
const CLICK_TEXT = 40;
const CLICK_BAR = 80;

const traffic = slideById('traffic');
const title = traffic.elements.find((e) => e.id === 'traffic/text3')!;
const chart = traffic.elements.find((e) => e.id === 'traffic/chart6') as ChartEl;
const at = (fr: Frame) => ({x: SX + fr.x * PPI, y: SY + fr.y * PPI, w: fr.w * PPI, h: fr.h * PPI});

const Handles: React.FC<{r: {x: number; y: number; w: number; h: number}}> = ({r}) => (
	<div style={{position: 'absolute', left: r.x - 5, top: r.y - 5, width: r.w + 10, height: r.h + 10, border: `2.5px solid ${C.blue}`, zIndex: 20}}>
		{[0, 0.5, 1].flatMap((cx) =>
			[0, 0.5, 1]
				.filter((cy) => !(cx === 0.5 && cy === 0.5))
				.map((cy) => <div key={`${cx}${cy}`} style={{position: 'absolute', left: `calc(${cx * 100}% - 8px)`, top: `calc(${cy * 100}% - 8px)`, width: 14, height: 14, borderRadius: 14, background: '#fff', border: `2.5px solid ${C.blue}`}} />),
		)}
	</div>
);

export const Deliver: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const drop = interpolate(f, [0, 12], [0, 1], {...clamp, easing: ease.out});
	const open = interpolate(f, [10, 26], [0, 1], {...clamp, easing: ease.inOut});
	const exit = interpolate(f, [125, 135], [0, 1], {...clamp, easing: ease.in});
	const tR = at(title.frame);
	const bR = at(chart.frame);
	const p1 = interpolate(f, [24, CLICK_TEXT - 2], [0, 1], {...clamp, easing: ease.out});
	const p2 = interpolate(f, [CLICK_TEXT + 16, CLICK_BAR - 2], [0, 1], {...clamp, easing: ease.inOut});
	const px = interpolate(p1, [0, 1], [1000, tR.x + tR.w * 0.6]) + p2 * (bR.x + bR.w * 0.5 - (tR.x + tR.w * 0.6));
	const py = interpolate(p1, [0, 1], [1300, tR.y + tR.h * 0.55]) + p2 * (bR.y + bR.h * 0.5 - (tR.y + tR.h * 0.55));
	const textSel = f >= CLICK_TEXT && f < CLICK_BAR;
	const barSel = f >= CLICK_BAR;
	const props = interpolate(f, [CLICK_BAR + 4, CLICK_BAR + 16], [0, 1], {...clamp, easing: ease.out});

	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			<Headline label="5 — SHIP">
				A real .pptx. <span style={accentWord()}>Every word and chart editable.</span>
			</Headline>

			{open < 1 ? (
				<div style={{position: 'absolute', left: 540 - 100, top: interpolate(drop, [0, 1], [-260, 760]), width: 200, height: 240, borderRadius: 20, background: C.card, boxShadow: shadow.lift, opacity: 1 - open, scale: 1 + open * 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 30}}>
					<div style={{width: 100, height: 100, borderRadius: 20, background: '#E8590C', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
						<svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
							<rect x={3} y={4} width={18} height={13} rx={1.5} />
							<path d="M8 21h8M12 17v4" />
						</svg>
					</div>
					<div style={{fontFamily: mono, fontSize: 26, fontWeight: 500, color: C.ink}}>deck.pptx</div>
				</div>
			) : null}

			<div style={{position: 'absolute', left: M, top: PICTURE_Y, width: CONTENT_W, height: WIN_H, borderRadius: 22, background: '#EEF0F5', boxShadow: shadow.lift, overflow: 'hidden', opacity: open, scale: interpolate(open, [0, 1], [0.6, 1])}}>
				<div style={{height: 60, display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px', background: '#fff', borderBottom: `1px solid ${C.line}`}}>
					{['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
						<div key={c} style={{width: 14, height: 14, borderRadius: 14, background: c}} />
					))}
					<div style={{marginLeft: 14, fontFamily: display, fontWeight: 600, fontSize: 24, color: C.ink}}>deck.pptx</div>
					<div style={{marginLeft: 'auto', fontFamily: mono, fontSize: 17, color: C.dim}}>fonts embedded</div>
				</div>
				<div style={{height: 68, display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px', background: '#fff', borderBottom: `1px solid ${C.line}`, fontFamily: display, fontSize: 21, color: C.ink}}>
					<div style={{padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.line}`, minWidth: 300, background: textSel || barSel ? C.blueSoft : '#fff'}}>
						{barSel ? 'Column chart' : textSel ? 'Plus Jakarta Sans ExtraBold' : 'Plus Jakarta Sans'}
					</div>
					<div style={{padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.line}`, width: 70, textAlign: 'center'}}>{barSel ? '—' : textSel ? '44' : '17'}</div>
					<div style={{display: 'flex', gap: 8, marginLeft: 'auto'}}>
						{['#0B1B33', '#4F46E5', '#0891B2', '#7C3AED', '#15803D'].map((c) => (
							<div key={c} style={{width: 28, height: 28, borderRadius: 6, background: c, outline: barSel && c === '#4F46E5' ? `3px solid ${C.blue}` : undefined, outlineOffset: 2}} />
						))}
					</div>
				</div>
				{/* thumbnails */}
				<div style={{position: 'absolute', left: 24, right: 24, bottom: 22, display: 'flex', gap: 8}}>
					{DECK_PREVIEWS.map((n) => (
						<Img key={n} src={staticFile(`launch/deck/${n}.png`)} style={{flex: 1, minWidth: 0, borderRadius: 4, outline: n === '04-traffic' ? `3px solid ${C.blue}` : `1px solid ${C.line}`}} />
					))}
				</div>
			</div>

			<div style={{position: 'absolute', left: SX, top: SY, opacity: interpolate(f, [18, 28], [0, 1], clamp), boxShadow: shadow.card}}>
				<SlideView slide={traffic} width={SLIDE_W} />
			</div>

			{textSel ? (
				<>
					<Handles r={tR} />
					<div style={{position: 'absolute', left: tR.x + tR.w * 0.98, top: tR.y + tR.h * 0.14, zIndex: 21}}>
						<Caret height={tR.h * 0.72} color="#0B1B33" from={CLICK_TEXT} />
					</div>
				</>
			) : null}
			{barSel ? <Handles r={bR} /> : null}

			<div style={{position: 'absolute', left: bR.x + bR.w * 0.08, top: bR.y + bR.h + 18, width: 420, borderRadius: 16, background: '#fff', boxShadow: shadow.lift, opacity: props, translate: `0px ${(1 - props) * 18}px`, zIndex: 25, overflow: 'hidden', fontFamily: mono, fontSize: 22}}>
				<div style={{padding: '10px 18px', background: '#F2F4FA', color: C.inkSoft, fontSize: 17, letterSpacing: '0.08em'}}>CHART DATA · EDITABLE</div>
				{chart.data.categories.map((c, i) => (
					<div key={c} style={{display: 'flex', padding: '8px 18px', borderTop: `1px solid ${C.line}`, fontVariantNumeric: 'tabular-nums'}}>
						<span style={{width: 90, color: C.dim}}>{c}</span>
						<span style={{color: C.ink}}>{chart.data.series[0].values[i]}k req/s</span>
					</div>
				))}
			</div>

			{f >= 22 && f < 125 ? <Pointer x={px} y={py} pressed={(f >= CLICK_TEXT && f < CLICK_TEXT + 4) || (f >= CLICK_BAR && f < CLICK_BAR + 4)} /> : null}

			<Audio name="File drop" from={8} src={staticFile('launch/audio/pop.wav')} volume={0.45} premountFor={fps} />
			<Audio name="Open" from={10} src={staticFile('launch/audio/whoosh.wav')} volume={0.2} premountFor={fps} />
			<Audio name="Click title" from={CLICK_TEXT} src={staticFile('launch/audio/click.wav')} volume={0.5} premountFor={fps} />
			<Audio name="Click chart" from={CLICK_BAR} src={staticFile('launch/audio/click.wav')} volume={0.5} premountFor={fps} />
		</AbsoluteFill>
	);
};
