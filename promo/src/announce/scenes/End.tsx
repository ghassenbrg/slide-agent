import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {accentWord, C, clamp, display, ease, mono} from '../../launch/theme';
import {M} from '../kit';

// 0:53–1:00 — the end card: what it is, where to read about it, where the
// code lives. Held long enough to read the address.

export const REPO_URL = 'github.com/ghassenbrg/slide-agent';

export const End: React.FC = () => {
	const f = useCurrentFrame();
	const a = (d: number) => interpolate(f, [d, d + 16], [0, 1], {...clamp, easing: ease.out});

	return (
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: `0 ${M}px`}}>
			<Img src={staticFile('icon.png')} style={{width: 210, height: 210, opacity: a(0), scale: interpolate(a(0), [0, 1], [0.8, 1]), filter: 'drop-shadow(0 30px 50px rgba(20,40,120,0.3))'}} />
			<div style={{fontFamily: display, fontWeight: 800, fontSize: 132, letterSpacing: '-0.055em', lineHeight: 1, color: C.ink, marginTop: 26, opacity: a(6), translate: `0px ${(1 - a(6)) * 20}px`}}>Slide Agent</div>
			<div style={{fontFamily: display, fontWeight: 600, fontSize: 56, letterSpacing: '-0.03em', color: C.inkSoft, marginTop: 18, opacity: a(16), translate: `0px ${(1 - a(16)) * 16}px`}}>
				Describe it. <span style={accentWord()}>Get the deck.</span>
			</div>

			<div style={{marginTop: 70, padding: '22px 40px', borderRadius: 22, background: '#fff', boxShadow: '0 1px 2px rgba(10,20,51,0.06), 0 14px 36px -12px rgba(10,20,51,0.2)', opacity: a(30), translate: `0px ${(1 - a(30)) * 18}px`}}>
				<div style={{fontFamily: mono, fontSize: 25, letterSpacing: '0.1em', color: C.dim}}>GET STARTED · CODE & DOCS</div>
				<div style={{fontFamily: display, fontWeight: 800, fontSize: 45, letterSpacing: '-0.03em', color: C.blue, marginTop: 14}}>{REPO_URL}</div>
			</div>

			<div style={{fontFamily: display, fontSize: 32, color: C.inkSoft, marginTop: 34, opacity: a(42)}}>Install links and quickstart in the post.</div>
			<div style={{display: 'flex', gap: 12, marginTop: 30, opacity: a(52)}}>
				{['Open source · MIT', 'Native .pptx'].map((x) => (
					<span key={x} style={{padding: '8px 20px', borderRadius: 999, border: `1.5px solid ${C.line}`, background: '#fff', fontFamily: display, fontWeight: 600, fontSize: 26, color: C.ink}}>
						{x}
					</span>
				))}
			</div>
		</AbsoluteFill>
	);
};
