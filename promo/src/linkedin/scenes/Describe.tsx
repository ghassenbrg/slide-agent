import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Caret, typed} from '../../launch/components/ui';
import {BRIEF} from '../../launch/scenes/Describe';
import {accentWord, C, clamp, display, ease, mono, shadow} from '../../launch/theme';
import {CONTENT_W, Headline, M, PICTURE_Y} from '../kit';

// 1 · Describe — the actual brief and source files in launch/demo.

const TYPE_FROM = 12;
const CPS = 64;
const SEND = 118;

const File: React.FC<{name: string; peek?: string; at: number}> = ({name, peek, at}) => {
	const f = useCurrentFrame();
	const t = interpolate(f, [at, at + 14], [0, 1], {...clamp, easing: ease.out});
	const data = name.endsWith('.csv');
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderRadius: 14, background: '#F2F4FA', border: `1px solid ${C.line}`, opacity: t, translate: `${(1 - t) * -140}px 0px`}}>
			<div style={{width: 36, height: 44, borderRadius: 6, background: data ? '#D8F3EC' : '#E4E9FF', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 5, fontFamily: mono, fontSize: 11, fontWeight: 700, color: data ? '#0E7468' : C.blue}}>
				{data ? 'CSV' : 'MD'}
			</div>
			<div>
				<div style={{fontFamily: mono, fontSize: 24, fontWeight: 500, color: C.ink}}>{name}</div>
				{peek ? <div style={{fontFamily: mono, fontSize: 16, color: C.dim, marginTop: 2}}>{peek}</div> : null}
			</div>
		</div>
	);
};

export const Describe: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const win = interpolate(f, [0, 14], [0, 1], {...clamp, easing: ease.out});
	const sent = interpolate(f, [SEND, SEND + 14], [0, 1], {...clamp, easing: ease.inOut});
	const reply = interpolate(f, [SEND + 14, SEND + 24], [0, 1], clamp);
	const exit = interpolate(f, [140, 150], [0, 1], {...clamp, easing: ease.in});
	const text = f < SEND ? typed(BRIEF, f, TYPE_FROM, CPS) : '';

	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			<Headline label="1 — DESCRIBE">
				Say what you need. <span style={accentWord()}>Attach your notes.</span>
			</Headline>

			<div style={{position: 'absolute', left: M, top: PICTURE_Y, width: CONTENT_W, height: 780, borderRadius: 26, background: C.card, boxShadow: shadow.card, overflow: 'hidden', opacity: win, translate: `0px ${(1 - win) * 50}px`}}>
				<div style={{height: 76, display: 'flex', alignItems: 'center', gap: 10, padding: '0 28px', borderBottom: `1px solid ${C.line}`}}>
					{['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
						<div key={c} style={{width: 15, height: 15, borderRadius: 15, background: c}} />
					))}
					<div style={{marginLeft: 16, fontFamily: display, fontWeight: 600, fontSize: 26, color: C.ink}}>Your AI assistant</div>
					<div style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontFamily: mono, fontSize: 19, color: C.inkSoft}}>
						<Img src={staticFile('icon.png')} style={{width: 32, height: 32}} />
						slide-agent
					</div>
				</div>

				{/* a fresh chat */}
				<div style={{position: 'absolute', left: 0, right: 0, top: 150, textAlign: 'center', opacity: interpolate(f, [6, 18], [0, 1], clamp) * (1 - sent)}}>
					<div style={{fontFamily: display, fontWeight: 700, fontSize: 58, letterSpacing: '-0.035em', color: C.ink}}>What are you presenting?</div>
				</div>

				{/* after sending */}
				<div style={{position: 'absolute', left: 30, right: 30, top: 110, opacity: sent}}>
					<div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end', translate: `0px ${(1 - sent) * 220}px`}}>
						<div style={{padding: '22px 26px', borderRadius: 22, background: C.blue, color: '#fff', fontFamily: display, fontSize: 30, lineHeight: 1.34, fontWeight: 500}}>{BRIEF}</div>
					</div>
					<div style={{display: 'flex', alignItems: 'center', gap: 16, marginTop: 30, opacity: reply}}>
						<Img src={staticFile('icon.png')} style={{width: 52, height: 52}} />
						<div style={{fontFamily: mono, fontSize: 24, color: C.inkSoft}}>
							Planning 9 slides{'.'.repeat(1 + (Math.floor(f / 6) % 3))}
						</div>
					</div>
				</div>

				{/* composer */}
				<div
					style={{
						position: 'absolute',
						left: 26,
						right: 26,
						bottom: 26,
						height: 540,
						borderRadius: 20,
						border: `1.5px solid ${f < SEND ? 'rgba(47,91,255,0.45)' : C.line}`,
						boxShadow: f < SEND ? '0 0 0 6px rgba(47,91,255,0.08)' : undefined,
						padding: '26px 28px',
						opacity: 1 - sent,
					}}
				>
					<div style={{fontFamily: display, fontWeight: 500, fontSize: 38, lineHeight: 1.32, letterSpacing: '-0.015em', color: C.ink}}>
						{text}
						<Caret height={44} color={C.blue} solid={text.length < BRIEF.length} style={{marginLeft: 4}} />
					</div>
					<div style={{position: 'absolute', left: 28, bottom: 24, display: 'flex', flexDirection: 'column', gap: 12}}>
						<File name="platform-notes.md" peek="AI platform — Q4 2026 engineering review" at={86} />
						<File name="metrics.csv" peek="quarter, requests_per_sec, p95_latency …" at={96} />
					</div>
					<div style={{position: 'absolute', right: 24, bottom: 24, width: 72, height: 72, borderRadius: 72, background: f >= 108 ? C.blue : '#C9D2EE', scale: f >= SEND - 2 && f < SEND + 4 ? 0.88 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
						<svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
							<path d="M12 19V5M5 12l7-7 7 7" />
						</svg>
					</div>
				</div>
			</div>

			<Audio name="Typing" from={TYPE_FROM} src={staticFile('launch/audio/typing.wav')} volume={0.32} premountFor={fps} />
			<Audio name="Attach notes" from={86} src={staticFile('launch/audio/pop.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Attach art" from={96} src={staticFile('launch/audio/pop.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Send" from={SEND} src={staticFile('launch/audio/click.wav')} volume={0.55} premountFor={fps} />
		</AbsoluteFill>
	);
};
