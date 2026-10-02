import type React from 'react';
import {C, mono} from '../theme';

const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|([{}[\],:])|(\s+)|([^\s"{}[\],:]+)/g;

type Token = {text: string; color: string};

const tokenize = (line: string): Token[] => {
	const out: Token[] = [];
	for (const m of line.matchAll(TOKEN)) {
		if (m[1] !== undefined) {
			out.push({text: m[1], color: m[2] ? '#8FB0FF' : C.cyan});
			if (m[2]) out.push({text: m[2], color: C.dim});
		} else if (m[3] !== undefined) {
			out.push({text: m[3], color: C.dim});
		} else {
			out.push({text: m[0], color: C.amber});
		}
	}
	return out;
};

type CodeProps = {
	readonly code: string;
	// How many characters are visible (the typing head).
	readonly chars: number;
	readonly fontSize?: number;
	readonly caretOn?: boolean;
};

// Syntax-highlighted JSON that "types" itself out character by character.
export const Code: React.FC<CodeProps> = ({code, chars, fontSize = 25, caretOn = true}) => {
	let remaining = Math.floor(chars);
	const lines = code.split('\n');
	let caretPlaced = false;

	return (
		<div style={{fontFamily: mono, fontSize, lineHeight: 1.62, whiteSpace: 'pre'}}>
			{lines.map((line, li) => {
				if (remaining < 0) return <div key={li}>&nbsp;</div>;
				const tokens = tokenize(line);
				const spans: React.ReactNode[] = [];
				for (const [ti, tok] of tokens.entries()) {
					if (remaining <= 0) break;
					const shown = tok.text.slice(0, remaining);
					remaining -= shown.length;
					spans.push(
						<span key={ti} style={{color: tok.color}}>
							{shown}
						</span>,
					);
				}
				const isCaretLine = !caretPlaced && remaining <= 0;
				if (isCaretLine) caretPlaced = true;
				// Newline counts as one typed character.
				remaining -= 1;
				return (
					<div key={li} style={{display: 'flex', minHeight: fontSize * 1.62}}>
						<span style={{width: 46, color: 'rgba(140,155,208,0.4)', flexShrink: 0}}>{li + 1}</span>
						<span>
							{spans}
							{isCaretLine && caretOn ? (
								<span style={{display: 'inline-block', width: fontSize * 0.55, height: fontSize * 1.15, backgroundColor: C.cyan, verticalAlign: 'middle', marginLeft: 2}} />
							) : null}
						</span>
					</div>
				);
			})}
		</div>
	);
};

export const codeLength = (code: string) => code.length;
