import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {Overline} from '../kit';
import {C, FONT, MONO, clamp, inOut, land, lerp, tween} from '../theme';
import {K, SHOTS, WORDS} from '../timeline';

// Verified in site/guide/install.md and docs/agents.md: one npx command installs the CLI,
// MCP server and skill for the agents it finds; VS Code installs via its Marketplace extension.
const CMD = ['npx --yes --package @slide-agent/core@latest', '    -- slide-agent install'];
// Listed on the website ("Works where you work"). Lit as the narration names them; the rest follow softly.
const AGENTS = ['Claude Code', 'Codex', 'Gemini', 'GitHub Copilot', 'VS Code', 'MCP apps'];

const spoken = (index: number) => {
	const w = WORDS.find((x) => x.line === 'install' && x.index === index);
	return w ? Math.round(w.start * 30) : 0;
};

export const Install: React.FC = () => {
	const f = useCurrentFrame() + SHOTS.install.from;
	const enter = land(f, SHOTS.install.from, 30, 22, 150);
	const exit = tween(f, SHOTS.workflow.from - 8, 18, inOut);
	const typed = interpolate(f, [SHOTS.install.from + 12, SHOTS.install.from + 40], [0, CMD.join('').length], clamp);
	const lightAt = [spoken(8), spoken(10), spoken(12), spoken(12) + 8, spoken(12) + 12, spoken(12) + 16];
	const dockT = interpolate(f, [K.dock - 4, K.dock + 12], [0, 1], {...clamp, easing: inOut});
	let count = 0;
	return (
		<AbsoluteFill style={{fontFamily: FONT, opacity: 1 - exit}}>
			<div style={{position: 'absolute', left: 60, top: 344, width: 960, borderRadius: 32, background: 'rgba(12,26,68,0.95)', border: `1.5px solid ${C.line}`, boxShadow: '0 40px 120px rgba(0,0,0,0.45)', padding: '40px 44px 44px', transform: `translateY(${(1 - enter) * 150 + exit * -30}px) scale(${0.96 + 0.04 * enter - exit * 0.04})`, opacity: Math.min(1, enter * 3)}}>
				<div style={{display: 'flex', alignItems: 'center', gap: 20}}>
					<div style={{width: 76, height: 76}}>
						<Img src={staticFile('one-sentence/icon.png')} style={{width: 76, height: 76, borderRadius: 18, opacity: dockT > 0 ? 0 : 1}} />
					</div>
					<div>
						<Overline>Install once</Overline>
						<div style={{fontSize: 42, fontWeight: 700, color: C.white, marginTop: 4}}>Add Slide Agent to your agent</div>
					</div>
				</div>
				<div style={{marginTop: 30, display: 'flex', alignItems: 'baseline', gap: 16}}>
					<div style={{fontSize: 32, fontWeight: 700, color: C.white}}>One command</div>
					<div style={{fontSize: 28, fontWeight: 600, color: C.mist}}>or the VS Code extension</div>
				</div>
				<div style={{marginTop: 14, borderRadius: 18, background: '#050B22', border: `1.5px solid ${C.line}`, padding: '16px 24px', fontFamily: MONO, fontSize: 25, lineHeight: '38px', color: '#C9D5FF'}}>
					{CMD.map((line, i) => {
						const shown = line.slice(0, Math.max(0, Math.round(typed) - count));
						count += line.length;
						return (
							<div key={i} style={{whiteSpace: 'pre'}}>
								<span style={{color: C.teal}}>{i === 0 ? '$ ' : '  '}</span>
								{shown}
							</div>
						);
					})}
				</div>
				<div style={{marginTop: 32, fontSize: 30, fontWeight: 600, color: C.mist}}>Works with</div>
				<div style={{marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14}}>
					{AGENTS.map((a, i) => {
						const on = tween(f, lightAt[i], 8) * (i < 3 ? 1 : 0.6);
						return (
							<div key={a} style={{height: 76, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 31, fontWeight: 600, color: on > 0.3 ? C.white : C.dim, background: `rgba(20,184,166,${0.2 * on})`, border: `1.5px solid ${on > 0.3 ? `rgba(20,184,166,${0.9 * on})` : C.line}`, transform: `scale(${1 + Math.sin(Math.min(1, on) * Math.PI) * 0.04})`}}>
								{a}
							</div>
						);
					})}
				</div>
			</div>
			{dockT > 0 && dockT < 1 && (
				<Img
					src={staticFile('one-sentence/icon.png')}
					style={{position: 'absolute', left: lerp(104, 744, dockT), top: lerp(384, 127, dockT) - Math.sin(dockT * Math.PI) * 60, width: lerp(76, 34, dockT), height: lerp(76, 34, dockT), borderRadius: 14, boxShadow: '0 10px 30px rgba(47,91,255,0.6)'}}
				/>
			)}
		</AbsoluteFill>
	);
};
