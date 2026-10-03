import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {SW, Slide, type DeckSlide} from '../kit';
import {C, FONT, MONO, inOut, land, tween} from '../theme';
import {K, SHOTS, WORDS} from '../timeline';

// A condensed, faithful recreation of this session: the agent wrote the design
// language and intent, ran `slide-agent build` (5 slides) and `slide-agent finalize`
// (LibreOffice render, package validation, rebuild check) and exported the deck.
const at = (index: number) => {
	const w = WORDS.find((x) => x.line === 'workflow' && x.index === index);
	return w ? Math.round(w.start * 30) : 0;
};
const STEPS = [
	{t: 'Chose a design concept and palette', d: 'warm paper · forest green · Helvetica Neue', mono: false, word: 6},
	{t: 'Built 5 slides', d: 'slide-agent build  →  5 slides', mono: true, word: 10},
	{t: 'Checked layout, text fit and contrast', d: 'slide-agent finalize  →  ready', mono: true, word: 13},
	{t: 'Exported the PowerPoint file', d: 'Fern-launch-plan.pptx', mono: true, word: 17},
];

// Thumbnail strip geometry is shared with the Depth scene so the hand-over is seamless.
export const STRIP = {gap: 240, s: 0.0611, y: 1012};
export const FERN_SLIDES: DeckSlide[] = ['fern-1', 'fern-2', 'fern-3', 'fern-4', 'fern-5'];
export const stripX = (i: number) => 540 + (i - 2) * (SW + STRIP.gap) * STRIP.s;

export const Workflow: React.FC = () => {
	const f = useCurrentFrame() + SHOTS.workflow.from - 8;
	const open = land(f, SHOTS.workflow.from - 6, 30, 22, 150);
	const fadePanel = tween(f, SHOTS.depth.from, 14, inOut);
	return (
		<AbsoluteFill style={{fontFamily: FONT}}>
			<div style={{position: 'absolute', left: 40, top: 236, width: 1000, height: 890, borderRadius: 36, background: 'rgba(10,22,58,0.9)', border: `1.5px solid ${C.line}`, boxShadow: '0 40px 140px rgba(0,0,0,0.5)', opacity: Math.min(1, open * 1.3) * (1 - fadePanel), transform: `scale(${0.95 + 0.05 * open})`, transformOrigin: '540px 300px'}}>
				<div style={{position: 'absolute', left: 36, right: 36, top: 22, height: 40, display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, fontWeight: 600, color: C.mist}}>
					<span style={{width: 12, height: 12, borderRadius: 12, background: C.teal}} />
					Agent session
					<span style={{marginLeft: 'auto', fontSize: 26, color: C.mist, display: 'flex', alignItems: 'center', gap: 10}}>
						<span style={{width: 8, height: 8, borderRadius: 8, background: C.teal}} />
						Recreated from a real session · condensed
					</span>
				</div>
				<div style={{position: 'absolute', left: 36, right: 36, top: 66, height: 1.5, background: C.line}} />
				{/* agent is working */}
				<div style={{position: 'absolute', left: 56, top: 262, display: 'flex', gap: 12, opacity: tween(f, SHOTS.workflow.from + 10, 8) * (1 - tween(f, at(4) - 10, 6))}}>
					{[0, 1, 2].map((i) => (
						<span key={i} style={{width: 16, height: 16, borderRadius: 16, background: C.mist, opacity: 0.35 + 0.65 * Math.max(0, Math.sin((f - i * 4) / 4))}} />
					))}
				</div>
				{/* agent reply */}
				<div style={{position: 'absolute', left: 50, top: 252, width: 900, opacity: tween(f, at(4) - 6, 10)}}>
					<div style={{display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, fontWeight: 700, color: C.white}}>
						<Img src={staticFile('one-sentence/icon.png')} style={{width: 46, height: 46, borderRadius: 11}} />
						Using Slide Agent
					</div>
					<div style={{marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14}}>
						{STEPS.map((s, i) => {
							const t0 = at(s.word) - 10;
							const show = tween(f, t0, 10);
							const done = tween(f, t0 + 12, 6);
							if (f < t0) return null;
							return (
								<div key={i} style={{display: 'flex', gap: 20, alignItems: 'flex-start', opacity: show, transform: `translateY(${(1 - show) * 16}px)`}}>
									<div style={{width: 44, height: 44, marginTop: 2, borderRadius: 44, border: `3px solid ${done > 0.5 ? C.teal : 'rgba(185,199,242,0.4)'}`, borderTopColor: done > 0.5 ? C.teal : C.blueSoft, background: done > 0.5 ? 'rgba(20,184,166,0.2)' : 'transparent', transform: `rotate(${done > 0.5 ? 0 : (f - t0) * 30}deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.teal, fontSize: 26, fontWeight: 800}}>
										{done > 0.5 ? '✓' : ''}
									</div>
									<div>
										<div style={{fontSize: 34, fontWeight: 600, color: C.white, lineHeight: '44px'}}>{s.t}</div>
										<div style={{fontSize: 27, color: C.mist, fontFamily: s.mono ? MONO : FONT, marginTop: 2}}>{s.d}</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>
			{/* the deck builds into the reply while the steps tick: slots → real slides → checked */}
			{FERN_SLIDES.map((id, i) => {
				const w = SW * STRIP.s;
				const h = 1620 * STRIP.s;
				const cx = stripX(i);
				const slot = tween(f, SHOTS.workflow.from + 14 + i * 3, 10) * (1 - fadePanel);
				const built = land(f, at(10) - 8 + i * 5, 30, 18, 170);
				const checked = tween(f, at(13) + i * 3, 6);
				const lift = f >= K.deal - 2 ? Math.sin(Math.min(1, (f - K.deal + 2) / 12) * Math.PI) * 10 : 0;
				const handOff = f > SHOTS.depth.from + 1 ? 0 : 1;
				return (
					<React.Fragment key={id}>
						<div style={{position: 'absolute', left: cx - w / 2, top: STRIP.y - h / 2, width: w, height: h, borderRadius: 8, border: '3px dashed rgba(185,199,242,0.35)', opacity: slot * (1 - Math.min(1, built))}} />
						{f >= at(10) - 8 + i * 5 && (
							<div style={{position: 'absolute', left: cx - w / 2, top: STRIP.y - h / 2 + (1 - Math.min(1, built)) * 40 - lift, width: SW, height: 1620, transform: `scale(${STRIP.s})`, transformOrigin: '0 0', borderRadius: 60, overflow: 'hidden', boxShadow: '0 40px 120px rgba(0,0,0,0.6)', opacity: Math.min(1, built * 2) * handOff}}>
								<Slide id={id} />
							</div>
						)}
						{checked > 0 && handOff > 0 && (
							<div style={{position: 'absolute', left: cx + w / 2 - 22, top: STRIP.y - h / 2 - 14 - lift, width: 34, height: 34, borderRadius: 34, background: C.teal, color: C.night, fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${checked})`, opacity: 1 - fadePanel}}>✓</div>
						)}
					</React.Fragment>
				);
			})}
		</AbsoluteFill>
	);
};
