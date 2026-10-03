import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {SH, SW, Slide, type DeckSlide} from '../kit';
import {C, FONT, clamp, inOut, land, tween} from '../theme';
import {K, SHOTS, WORDS} from '../timeline';

// Every deck the film showed returns as a quiet wall behind the lockup.
const ROWS: DeckSlide[][] = [
	['fern-1', 'architecture-1', 'fern-2', 'analytics-1', 'fern-4'],
	['transformation-1', 'fern-3', 'architecture-1', 'fern-5', 'analytics-1'],
	['fern-2', 'transformation-1', 'fern-1', 'fern-4', 'architecture-1'],
];
const TW = 420;
/** The Close sequence starts this many frames early so the wall rises while the file shrinks into it. */
export const CLOSE_LEAD = 14;
// The invitation follows the narration: each part lands as it is spoken.
const said = (i: number) => Math.round(WORDS.find((w) => w.line === 'close' && w.index === i)!.start * 30);
export const CLOSE_CUES = {explore: said(8) - 4, install: said(11) - 4, url: said(14), urlEnd: said(19) + 8};
const TS = TW / SW;

export const Close: React.FC = () => {
	const f = useCurrentFrame() + SHOTS.close.from - CLOSE_LEAD;
	const t = f - K.close + CLOSE_LEAD;
	const icon = land(f, K.close, 30, 13, 150);
	const name = land(f, K.close + 6, 30, 18, 150);
	const tag = tween(f, K.close + 14, 18);
	const url = land(f, K.close + 36, 30, 16, 160);
	const ex = land(f, CLOSE_CUES.explore, 30, 18, 170);
	const ins = land(f, CLOSE_CUES.install, 30, 18, 170);
	const wall = tween(f, K.close - CLOSE_LEAD, 26);
	// slow push on the held lockup; a light sweep crosses the URL while it is read out
	const push = interpolate(f, [K.close + 20, SHOTS.close.from + SHOTS.close.duration], [0, 1], {...clamp, easing: inOut});
	const sweep = interpolate(f, [CLOSE_CUES.url, CLOSE_CUES.urlEnd], [-0.35, 1.35], clamp);
	const urlPulse = Math.sin(Math.min(1, Math.max(0, (f - CLOSE_CUES.url) / 14)) * Math.PI) * 0.035;
	const under = (at: number) => tween(f, at + 4, 14);
	return (
		<AbsoluteFill style={{fontFamily: FONT}}>
			<AbsoluteFill style={{opacity: 0.24 * wall}}>
				{ROWS.map((row, r) => (
					<div key={r} style={{position: 'absolute', left: (r % 2 ? -660 : -60) + (r % 2 ? 1 : -1) * t * 1.4, top: 80 + r * 430, display: 'flex', gap: 30}}>
						{row.concat(row).map((id, i) => (
							<div key={i} style={{position: 'relative', width: TW, height: SH * TS, borderRadius: 14, overflow: 'hidden', flex: 'none'}}>
								<div style={{position: 'absolute', transform: `scale(${TS})`, transformOrigin: '0 0', width: SW, height: SH}}>
									<Slide id={id} />
								</div>
							</div>
						))}
					</div>
				))}
			</AbsoluteFill>
			<AbsoluteFill style={{opacity: wall, background: `radial-gradient(ellipse 70% 52% at 50% 46%, ${C.navy} 30%, rgba(10,22,56,0.7) 62%, rgba(6,13,38,0.2) 100%)`}} />
			<div style={{position: 'absolute', left: 0, width: 1080, top: 250, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${1 + 0.035 * push})`, transformOrigin: '540px 400px'}}>
				<Img src={staticFile('one-sentence/icon.png')} style={{width: 176, height: 176, borderRadius: 40, transform: `scale(${0.5 + 0.5 * icon}) translateY(${(1 - icon) * 40}px)`, opacity: Math.min(1, icon * 2), boxShadow: '0 20px 80px rgba(47,91,255,0.55)'}} />
				<div style={{marginTop: 34, fontSize: 104, fontWeight: 700, color: C.white, letterSpacing: '-0.015em', opacity: Math.min(1, name * 1.5), transform: `translateY(${(1 - name) * 30}px)`}}>Slide Agent</div>
				<div style={{marginTop: 18, fontSize: 44, lineHeight: '56px', fontWeight: 600, color: C.mist, textAlign: 'center', opacity: tag, transform: `translateY(${(1 - tag) * 16}px)`}}>
					Create professional presentations
					<br />
					directly through your AI agent.
				</div>
				<div style={{position: 'relative', overflow: 'hidden', marginTop: 56, padding: '22px 46px', borderRadius: 60, background: C.blue, color: C.white, fontSize: 62, fontWeight: 700, letterSpacing: '-0.005em', boxShadow: '0 20px 60px rgba(47,91,255,0.45)', opacity: Math.min(1, url * 1.5), transform: `scale(${0.85 + 0.15 * url + urlPulse})`}}>
					<span style={{position: 'relative'}}>slide-agent.ghassen.io</span>
					{sweep > -0.35 && sweep < 1.35 && <div style={{position: 'absolute', top: 0, bottom: 0, left: `${sweep * 100}%`, width: '30%', transform: 'translateX(-50%) skewX(-18deg)', background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.32), rgba(255,255,255,0))'}} />}
				</div>
				<div style={{marginTop: 30, fontSize: 36, fontWeight: 600, color: C.white, display: 'flex', gap: 22, alignItems: 'center'}}>
					<Invite a={ex} line={under(CLOSE_CUES.explore)}>Explore the examples</Invite>
					<span style={{width: 8, height: 8, borderRadius: 8, background: C.teal, opacity: Math.min(1, ins * 1.5)}} />
					<Invite a={ins} line={under(CLOSE_CUES.install)}>Install guide</Invite>
				</div>
			</div>
		</AbsoluteFill>
	);
};

/** One part of the invitation: rises in when spoken, then a teal rule draws under it. */
const Invite: React.FC<{a: number; line: number; children: React.ReactNode}> = ({a, line, children}) => (
	<span style={{position: 'relative', paddingBottom: 8, opacity: Math.min(1, a * 1.5), transform: `translateY(${(1 - Math.min(1, a)) * 18}px)`, display: 'inline-block'}}>
		{children}
		<span style={{position: 'absolute', left: 0, bottom: 0, height: 4, borderRadius: 4, width: `${line * 100}%`, background: C.teal}} />
	</span>
);
