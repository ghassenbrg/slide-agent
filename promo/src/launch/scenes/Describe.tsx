import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Caret, typed} from '../components/ui';
import {C, clamp, display, ease, mono, shadow} from '../theme';

// 0:19.5–0:24.5 — one sentence, and your notes. This is the actual brief
// and the actual source files in launch/demo.

export const BRIEF =
	'A 9-slide engineering review of our AI platform: results, architecture, roadmap and what we need. Use the notes and the metrics. Modern and technical.';

const TYPE_FROM = 10;
const CPS = 62;
const SEND = 118;

const FileChip: React.FC<{name: string; peek: string; at: number; small?: boolean}> = ({name, peek, at, small}) => {
	const f = useCurrentFrame();
	const t = interpolate(f, [at, at + 16], [0, 1], {...clamp, easing: ease.out});
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 14,
				padding: small ? '8px 14px' : '12px 18px',
				borderRadius: 12,
				background: '#F2F4FA',
				border: `1px solid ${C.line}`,
				opacity: t,
				translate: `${(1 - t) * -160}px 0px`,
				rotate: `${(1 - t) * -6}deg`,
			}}
		>
			<div style={{width: small ? 26 : 34, height: small ? 32 : 42, borderRadius: 5, background: name.endsWith('.csv') ? '#D8F3EC' : '#E4E9FF', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 4, fontFamily: mono, fontSize: small ? 8 : 10, fontWeight: 700, color: name.endsWith('.csv') ? '#0E7468' : C.blue}}>
				{name.endsWith('.csv') ? 'CSV' : 'MD'}
			</div>
			<div>
				<div style={{fontFamily: mono, fontSize: small ? 18 : 22, fontWeight: 500, color: C.ink}}>{name}</div>
				{small ? null : <div style={{fontFamily: mono, fontSize: 15, color: C.dim, marginTop: 2}}>{peek}</div>}
			</div>
		</div>
	);
};

export const Describe: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const win = interpolate(f, [0, 16], [0, 1], {...clamp, easing: ease.out});
	const sent = interpolate(f, [SEND, SEND + 14], [0, 1], {...clamp, easing: ease.inOut});
	const text = f < SEND ? typed(BRIEF, f, TYPE_FROM, CPS) : '';
	const reply = interpolate(f, [SEND + 14, SEND + 24], [0, 1], clamp);
	const exit = interpolate(f, [138, 150], [0, 1], {...clamp, easing: ease.in});

	return (
		<AbsoluteFill style={{opacity: 1 - exit, translate: `0px ${-exit * 60}px`}}>
			<div
				style={{
					position: 'absolute',
					left: 240,
					top: 120,
					width: 1440,
					height: 820,
					borderRadius: 24,
					background: C.card,
					boxShadow: shadow.card,
					opacity: win,
					translate: `0px ${(1 - win) * 60}px`,
					overflow: 'hidden',
				}}
			>
				{/* header */}
				<div style={{height: 72, display: 'flex', alignItems: 'center', gap: 10, padding: '0 28px', borderBottom: `1px solid ${C.line}`}}>
					{['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
						<div key={c} style={{width: 14, height: 14, borderRadius: 14, background: c}} />
					))}
					<div style={{marginLeft: 18, fontFamily: display, fontWeight: 600, fontSize: 24, color: C.ink}}>Your AI assistant</div>
					<div style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontFamily: mono, fontSize: 18, color: C.inkSoft}}>
						<Img src={staticFile('icon.png')} style={{width: 30, height: 30}} />
						slide-agent · ready
					</div>
				</div>

				{/* a fresh chat */}
				<div
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: 150,
						textAlign: 'center',
						opacity: interpolate(f, [6, 20], [0, 1], clamp) * (1 - sent),
					}}
				>
					<div style={{fontFamily: display, fontWeight: 700, fontSize: 64, letterSpacing: '-0.035em', color: C.ink}}>What are you presenting?</div>
					<div style={{fontFamily: display, fontWeight: 500, fontSize: 30, color: C.dim, marginTop: 14}}>Describe the deck. Attach anything it should use.</div>
				</div>

				{/* conversation */}
				<div style={{position: 'absolute', left: 40, right: 40, top: 110, opacity: sent}}>
					<div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end', translate: `0px ${(1 - sent) * 260}px`}}>
						<div style={{maxWidth: 1000, padding: '22px 28px', borderRadius: 20, background: C.blue, color: '#fff', fontFamily: display, fontSize: 30, lineHeight: 1.35, fontWeight: 500}}>{BRIEF}</div>
						<div style={{display: 'flex', gap: 12, marginTop: 12}}>
							<FileChip name="platform-notes.md" peek="" at={-100} small />
							<FileChip name="metrics.csv" peek="" at={-100} small />
						</div>
					</div>
					<div style={{display: 'flex', alignItems: 'center', gap: 16, marginTop: 34, opacity: reply}}>
						<Img src={staticFile('icon.png')} style={{width: 48, height: 48}} />
						<div style={{fontFamily: mono, fontSize: 24, color: C.inkSoft}}>
							Reading platform-notes.md and metrics.csv · planning 9 slides
							{'.'.repeat(1 + (Math.floor(f / 6) % 3))}
						</div>
					</div>
				</div>

				{/* composer */}
				<div
					style={{
						position: 'absolute',
						left: 32,
						right: 32,
						bottom: 32,
						height: 300,
						borderRadius: 18,
						border: `1.5px solid ${f < SEND ? 'rgba(47,91,255,0.45)' : C.line}`,
						boxShadow: f < SEND ? '0 0 0 6px rgba(47,91,255,0.08)' : undefined,
						padding: '26px 30px',
					}}
				>
					<div style={{fontFamily: display, fontWeight: 500, fontSize: 40, lineHeight: 1.32, letterSpacing: '-0.015em', color: C.ink, width: 1180}}>
						{f >= SEND ? <span style={{color: C.dim}}>Ask for a change…</span> : text}
						{f < SEND ? <Caret height={44} color={C.blue} solid={text.length < BRIEF.length} style={{marginLeft: 4}} /> : null}
					</div>
					{f < SEND ? (
						<div style={{position: 'absolute', left: 30, bottom: 22, display: 'flex', gap: 14}}>
							<FileChip name="platform-notes.md" peek="AI platform — Q4 2026 engineering review" at={84} />
							<FileChip name="metrics.csv" peek="quarter, requests_per_sec, p95_latency …" at={94} />
						</div>
					) : null}
					<div
						style={{
							position: 'absolute',
							right: 24,
							bottom: 24,
							width: 64,
							height: 64,
							borderRadius: 64,
							background: f >= 108 ? C.blue : '#C9D2EE',
							scale: f >= SEND - 2 && f < SEND + 4 ? 0.88 : 1,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						<svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
							<path d="M12 19V5M5 12l7-7 7 7" />
						</svg>
					</div>
				</div>
			</div>

			<Audio name="Typing" from={TYPE_FROM} src={staticFile('launch/audio/typing.wav')} volume={0.32} premountFor={fps} />
			<Audio name="Attach notes" from={84} src={staticFile('launch/audio/pop.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Attach survey" from={94} src={staticFile('launch/audio/pop.wav')} volume={0.4} premountFor={fps} />
			<Audio name="Send" from={SEND} src={staticFile('launch/audio/click.wav')} volume={0.55} premountFor={fps} />
			<Audio name="Send whoosh" from={SEND} src={staticFile('launch/audio/whoosh.wav')} volume={0.22} premountFor={fps} />
		</AbsoluteFill>
	);
};
