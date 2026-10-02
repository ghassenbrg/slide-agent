import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SlideView} from '../../launch/components/SlideView';
import {Caret, Pointer} from '../../launch/components/ui';
import type {ChartEl, Frame} from '../../launch/deck';
import {SLIDE_W_IN} from '../../launch/deck';
import {accentWord, C, clamp, display, ease, mono} from '../../launch/theme';
import {ANALYTICS_ASSETS, analyticsSlide, narrative} from '../data';
import {CW, M, Title} from '../kit';

// 0:27–0:33 — it is real PowerPoint. A generic slide editor (not any vendor's
// UI): the headline is a live text box in its own typeface, and the chart is a
// native chart that opens onto the data it carries.

const WIN_Y = 340;
const WIN_H = 840;
const SLIDE_W = CW - 48;
const SX = M + 24;
const SY = WIN_Y + 128 + 26;
const PPI = SLIDE_W / SLIDE_W_IN;
const CLICK_TEXT = 36;
const CLICK_CHART = 76;

const slide = analyticsSlide('data-story');
const title = slide.elements.find((e) => e.id === 'data-story/text2')!;
const chart = slide.elements.find((e) => e.id === 'data-story/chart11') as ChartEl;
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

export const Editable: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const open = interpolate(f, [0, 16], [0, 1], {...clamp, easing: ease.out});
	const exit = interpolate(f, [168, 180], [0, 1], {...clamp, easing: ease.in});
	const tR = at(title.frame);
	const cR = at(chart.frame);
	const p1 = interpolate(f, [16, CLICK_TEXT - 2], [0, 1], {...clamp, easing: ease.out});
	const p2 = interpolate(f, [CLICK_TEXT + 14, CLICK_CHART - 2], [0, 1], {...clamp, easing: ease.inOut});
	const px = interpolate(p1, [0, 1], [1000, tR.x + tR.w * 0.55]) + p2 * (cR.x + cR.w * 0.62 - (tR.x + tR.w * 0.55));
	const py = interpolate(p1, [0, 1], [1300, tR.y + tR.h * 0.55]) + p2 * (cR.y + cR.h * 0.45 - (tR.y + tR.h * 0.55));
	const textSel = f >= CLICK_TEXT && f < CLICK_CHART;
	const chartSel = f >= CLICK_CHART;
	const data = interpolate(f, [CLICK_CHART + 4, CLICK_CHART + 16], [0, 1], {...clamp, easing: ease.out});

	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			<Title size={72} top={136}>
				Real PowerPoint. <span style={accentWord()}>Text and charts you can edit.</span>
			</Title>

			<div style={{position: 'absolute', left: M, top: WIN_Y, width: CW, height: WIN_H, borderRadius: 22, background: '#EEF0F5', boxShadow: '0 2px 6px rgba(10,20,51,0.1), 0 30px 70px -24px rgba(10,20,51,0.35)', overflow: 'hidden', opacity: open, scale: interpolate(open, [0, 1], [0.94, 1])}}>
				<div style={{height: 60, display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px', background: '#fff', borderBottom: `1px solid ${C.line}`}}>
					{['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
						<div key={c} style={{width: 14, height: 14, borderRadius: 14, background: c}} />
					))}
					<div style={{marginLeft: 14, fontFamily: display, fontWeight: 600, fontSize: 24, color: C.ink}}>analytics.pptx</div>
				</div>
				<div style={{height: 68, display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px', background: '#fff', borderBottom: `1px solid ${C.line}`, fontFamily: display, fontSize: 21, color: C.ink}}>
					<div style={{padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.line}`, minWidth: 280, background: textSel || chartSel ? C.blueSoft : '#fff'}}>{chartSel ? 'Column chart' : textSel ? 'Charter' : 'Helvetica Neue'}</div>
					<div style={{padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.line}`, width: 70, textAlign: 'center'}}>{chartSel ? '—' : textSel ? '32' : '13'}</div>
					<div style={{display: 'flex', gap: 8, marginLeft: 'auto'}}>
						{['#1B1B1F', '#66625B', '#C2410C', '#FF8A5B', '#ECE6DA'].map((c) => (
							<div key={c} style={{width: 28, height: 28, borderRadius: 6, background: c}} />
						))}
					</div>
				</div>
				<div style={{position: 'absolute', left: 24, right: 24, bottom: 22, display: 'flex', gap: 8}}>
					{narrative.map((g, i) => (
						<Img key={g.id} src={staticFile(`announce/analytics/0${i + 1}.png`)} style={{flex: 1, minWidth: 0, borderRadius: 4, outline: g.id === 'data-story' ? `3px solid ${C.blue}` : `1px solid ${C.line}`}} />
					))}
				</div>
			</div>

			<div style={{position: 'absolute', left: SX, top: SY, opacity: interpolate(f, [10, 20], [0, 1], clamp), boxShadow: '0 1px 3px rgba(10,20,51,0.12)'}}>
				<SlideView slide={slide} width={SLIDE_W} assetBase={ANALYTICS_ASSETS} />
			</div>

			{textSel ? (
				<>
					<Handles r={tR} />
					<div style={{position: 'absolute', left: tR.x + tR.w * 0.99, top: tR.y + tR.h * 0.12, zIndex: 21}}>
						<Caret height={tR.h * 0.76} color="#1B1B1F" from={CLICK_TEXT} />
					</div>
				</>
			) : null}
			{chartSel ? <Handles r={cR} /> : null}

			<div style={{position: 'absolute', left: M + 118, top: SY + (SLIDE_W * 9) / 16 + 18, width: 700, borderRadius: 16, background: '#fff', boxShadow: '0 2px 6px rgba(10,20,51,0.1), 0 24px 60px -16px rgba(10,20,51,0.4)', opacity: data, translate: `0px ${(1 - data) * 16}px`, zIndex: 25, overflow: 'hidden', fontFamily: mono, fontSize: 32}}>
				<div style={{padding: '12px 18px', background: '#F2F4FA', color: C.inkSoft, fontSize: 25, letterSpacing: '0.04em'}}>CHART DATA · EDITABLE</div>
				<div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)'}}>
					{chart.data.categories.slice(-4).map((c, i) => {
						const v = chart.data.series[0].values[chart.data.categories.length - 4 + i];
						const unit = (chart.data as {unit?: string}).unit ?? '';
						return (
							<div key={c} style={{padding: '10px 14px', borderTop: `1px solid ${C.line}`, borderRight: i < 3 ? `1px solid ${C.line}` : undefined}}>
								<div style={{color: C.dim, fontSize: 25}}>{c}</div>
								<div style={{color: C.ink, marginTop: 4}}>
									{v}
									{unit}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<div style={{position: 'absolute', left: M, right: M, top: 1230, textAlign: 'center', fontFamily: display, fontSize: 30, fontWeight: 600, color: C.inkSoft}}>Text stays text. Charts keep their data.</div>
			<div style={{position: 'absolute', left: M + CW - 248, top: WIN_Y + 24, fontFamily: mono, fontSize: 16, color: C.dim}}>ILLUSTRATIVE EDITOR</div>
			{f >= 14 && f < 110 ? <Pointer x={px} y={py} pressed={(f >= CLICK_TEXT && f < CLICK_TEXT + 4) || (f >= CLICK_CHART && f < CLICK_CHART + 4)} /> : null}

			<Audio name="Open" from={0} src={staticFile('launch/audio/whoosh.wav')} volume={0.2} premountFor={fps} />
			<Audio name="Click title" from={CLICK_TEXT} src={staticFile('launch/audio/click.wav')} volume={0.5} premountFor={fps} />
			<Audio name="Click chart" from={CLICK_CHART} src={staticFile('launch/audio/click.wav')} volume={0.5} premountFor={fps} />
			<Audio name="Data" from={CLICK_CHART + 4} src={staticFile('launch/audio/pop.wav')} volume={0.3} premountFor={fps} />
		</AbsoluteFill>
	);
};
