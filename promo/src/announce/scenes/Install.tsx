import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {typed} from '../../launch/components/ui';
import {accentWord, C, clamp, display, ease, mono} from '../../launch/theme';
import {Card, CW, M, Title} from '../kit';

// Two alternative installation paths, followed by the shared workflow.
// Exact command and VS Code actions come from docs/quickstart.md.
export const INSTALL_CMD = 'npx --yes --package @slide-agent/core@latest -- slide-agent install';
const ASK = 'Make a deck on our Q3 results.';

const Step: React.FC<{badge: string; label: string; at: number; top: number; height: number; children: React.ReactNode}> = ({badge, label, at, top, height, children}) => {
	const f = useCurrentFrame();
	const t = interpolate(f, [at, at + 16], [0, 1], {...clamp, easing: ease.out});
	return (
		<Card style={{left: M, top, width: CW, height, padding: '22px 28px', opacity: t, translate: `0px ${(1 - t) * 24}px`}}>
			<div style={{display: 'flex', alignItems: 'center', gap: 14}}>
				<div style={{width: 36, height: 36, borderRadius: 36, background: C.blue, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: display, fontWeight: 800, fontSize: 22}}>{badge}</div>
				<div style={{fontFamily: display, fontWeight: 700, fontSize: 34, letterSpacing: '-0.02em', color: C.ink}}>{label}</div>
			</div>
			{children}
		</Card>
	);
};

export const Install: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const ask = typed(ASK, f, 204, 60);
	const exit = interpolate(f, [348, 360], [0, 1], {...clamp, easing: ease.in});
	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			<Title size={72} top={136}>
				Choose your setup.<br /><span style={accentWord()}>Then create.</span>
			</Title>

			<Step badge="A" label="VS Code extension" at={4} top={324} height={250}>
				<div style={{display: 'flex', alignItems: 'center', gap: 18, marginTop: 14, padding: '12px 18px', borderRadius: 16, background: '#F4F6FB'}}>
					<Img src={staticFile('icon.png')} style={{width: 54, height: 54}} />
					<div style={{fontFamily: display, fontWeight: 700, fontSize: 30, color: C.ink}}>Slide Agent</div>
					<div style={{marginLeft: 'auto', padding: '10px 20px', borderRadius: 10, background: C.blue, color: '#fff', fontFamily: display, fontWeight: 700, fontSize: 26}}>Marketplace</div>
				</div>
				<div style={{fontFamily: display, fontSize: 28, fontWeight: 600, lineHeight: 1.35, marginTop: 10, color: C.inkSoft}}>
					Install → Set up Slide Agent<br />
					Create a presentation → choose a model
				</div>
			</Step>

			<Step badge="B" label="Or use your AI assistant" at={54} top={598} height={324}>
				<div style={{marginTop: 16, borderRadius: 16, background: '#0B1230', padding: '12px 24px', fontFamily: mono, fontSize: 32, lineHeight: 1.5, color: '#E3E8FA'}}>
					<div style={{minHeight: 144, display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', columnGap: 19.2, opacity: interpolate(f, [72, 88], [0, 1], clamp)}}><span style={{color: '#3BE38B'}}>$</span>{INSTALL_CMD.split(' ').map((word, i) => <span key={i} style={{whiteSpace: 'nowrap'}}>{word}</span>)}</div>
				</div>
				<div style={{fontFamily: display, fontSize: 26, color: C.inkSoft, marginTop: 14}}>Claude Code · Codex · Copilot · Gemini</div>
			</Step>

			<Step badge="→" label="After setup, start a new chat" at={174} top={946} height={244}>
				<div style={{marginTop: 20, padding: '16px 22px', borderRadius: 16, background: C.blue, color: '#fff', fontFamily: display, fontWeight: 500, fontSize: 34, minHeight: 75}}>
					{ask}{ask.length < ASK.length ? <span style={{display: 'inline-block', width: 3, height: 34, background: '#fff', verticalAlign: 'middle', marginLeft: 3}} /> : null}
				</div>
				<div style={{fontFamily: display, fontSize: 30, fontWeight: 600, color: C.inkSoft, marginTop: 18, opacity: interpolate(f, [246, 260], [0, 1], clamp)}}>Describe → design → review → .pptx</div>
			</Step>

			<div style={{position: 'absolute', left: M, right: M, top: 1220, textAlign: 'center', fontFamily: display, fontSize: 28, color: C.inkSoft, opacity: interpolate(f, [54, 70], [0, 1], clamp)}}>Node.js 22.12+ · your AI assistant / model</div>

			<Audio name="Setup" from={4} src={staticFile('launch/audio/pop.wav')} volume={0.3} premountFor={fps} />
			{[72, 84, 96].map((at) => <Audio key={at} name={`Command line ${at}`} from={at} src={staticFile('launch/audio/land.wav')} volume={0.23} premountFor={fps} />)}
			<Audio name="Ask" from={204} src={staticFile('launch/audio/typing-short.wav')} volume={0.26} premountFor={fps} />
		</AbsoluteFill>
	);
};
