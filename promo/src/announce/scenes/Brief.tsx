import {Audio} from '@remotion/media';
import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Caret, typed} from '../../launch/components/ui';
import {accentWord, C, clamp, display, ease, mono} from '../../launch/theme';
import {ANALYTICS_BRIEF} from '../data';
import {Card, CW, M, Title} from '../kit';

export const Brief: React.FC = () => {
	const f = useCurrentFrame();
	const {fps} = useVideoConfig();
	const text = typed(ANALYTICS_BRIEF, f, 8, 90);
	const reply = interpolate(f, [106, 122], [0, 1], {...clamp, easing: ease.out});
	const exit = interpolate(f, [198, 210], [0, 1], {...clamp, easing: ease.in});
	return (
		<AbsoluteFill style={{opacity: 1 - exit}}>
			<Title size={76} top={136}>Start with a brief.<br /><span style={accentWord()}>Bring your context.</span></Title>
			<Card style={{left: M, top: 350, width: CW, height: 800, overflow: 'hidden'}}>
				<div style={{height: 92, padding: '0 28px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: `1px solid ${C.line}`}}>
					<Img src={staticFile('icon.png')} style={{width: 48, height: 48}} />
					<div style={{fontFamily: display, fontSize: 34, fontWeight: 700, color: C.ink}}>Your AI assistant</div>
					<div style={{marginLeft: 'auto', fontFamily: mono, fontSize: 18, color: C.dim}}>WITH SLIDE AGENT</div>
				</div>
				<div style={{margin: '30px 28px 0 60px', borderRadius: '24px 24px 6px 24px', padding: '24px 28px', background: C.blue, color: '#fff', fontFamily: display, fontSize: 38, fontWeight: 500, lineHeight: 1.3, minHeight: 245}}>
					{text}<Caret height={38} color="#fff" from={8} solid={text.length < ANALYTICS_BRIEF.length} style={{marginLeft: 4, opacity: text.length === ANALYTICS_BRIEF.length ? 0 : 1}} />
				</div>
				<div style={{display: 'flex', gap: 14, margin: '18px 28px 0 60px'}}>
					{[{name: 'notes.md', detail: 'Context & takeaways'}, {name: 'metrics.csv', detail: 'Six months of data'}].map((file, i) => <div key={file.name} style={{flex: 1, padding: '16px 20px', borderRadius: 14, background: '#F1F4FB', opacity: interpolate(f, [50 + i * 10, 66 + i * 10], [0, 1], clamp)}}>
						<div style={{fontFamily: mono, fontSize: 27, fontWeight: 500, color: C.ink}}>{file.name}</div>
						<div style={{fontFamily: display, fontSize: 25, color: C.inkSoft, marginTop: 8}}>{file.detail}</div>
					</div>)}
				</div>
				<div style={{margin: '34px 60px 0 28px', padding: '24px 28px', borderRadius: '24px 24px 24px 6px', background: C.blueSoft, color: C.ink, opacity: reply, translate: `0px ${(1 - reply) * 20}px`}}>
					<div style={{fontFamily: mono, fontSize: 20, color: C.blue, letterSpacing: '0.08em'}}>PLAN → DESIGN → BUILD</div>
					<div style={{fontFamily: display, fontSize: 35, fontWeight: 600, lineHeight: 1.25, marginTop: 14}}>I’ll shape the story, choose a design language and build the slides.</div>
				</div>
			</Card>
			<div style={{position: 'absolute', left: M, right: M, top: 1202, textAlign: 'center', fontFamily: display, fontSize: 34, fontWeight: 600, color: C.inkSoft}}>Your brief + your notes + your data.</div>
			<div style={{position: 'absolute', left: M, top: 1272, fontFamily: mono, fontSize: 20, color: C.dim}}>WORKFLOW ILLUSTRATION · SAMPLE DATA</div>
			<Audio name="Brief" from={8} src={staticFile('launch/audio/typing.wav')} volume={0.24} premountFor={fps} />
			<Audio name="Plan starts" from={106} src={staticFile('launch/audio/pop.wav')} volume={0.26} premountFor={fps} />
		</AbsoluteFill>
	);
};
