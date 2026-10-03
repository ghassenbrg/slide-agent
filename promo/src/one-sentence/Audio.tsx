import React from 'react';
import {Sequence, staticFile} from 'remotion';
import {Audio} from '@remotion/media';
import {K, SHOTS, TOTAL, VO, WORDS, clipFrames} from './timeline';
import {DL} from './scenes/Deliver';
import {CLOSE_CUES} from './scenes/Close';

// ── Music: "House Vibez" (Lily J, Mixkit Free License), ducked under the voice ──
const GAP = 0.42;
const UNDER = 0.12;
const speechAt = (f: number) => WORDS.some((w) => f >= (w.start - 0.12) * 30 && f <= (w.end + 0.22) * 30);
const MUSIC: number[] = (() => {
	const v: number[] = [];
	let cur = UNDER;
	for (let f = 0; f < TOTAL; f++) {
		const target = speechAt(f) ? UNDER : GAP;
		cur += (target - cur) * (target < cur ? 0.35 : 0.08); // fast duck, slow release
		const fadeIn = Math.min(1, f / 8);
		const fadeOut = Math.min(1, (TOTAL - f) / 75);
		v.push(cur * fadeIn * fadeOut);
	}
	return v;
})();

type Sfx = {from: number; src: string; volume: number; dur?: number; note: string};
const s = (from: number, src: string, volume: number, note: string, dur?: number): Sfx => ({from, src, volume, note, dur});

// Declarative SFX table: every entry is pinned to the visual action it supports.
export const SFX: Sfx[] = [
	s(K.typeStart, 'typing.wav', 0.3, 'request typed (procedural keys)', K.typeEnd - K.typeStart + 4),
	s(K.send - 1, 'switch-click-quick.mp3', 0.55, 'Send pressed'),
	s(K.send + 4, 'swoosh-quick.mp3', 0.32, '"timeline" lifts off'),
	s(K.send + 12, 'sweep-short.mp3', 0.28, '"budget" lifts off'),
	s(K.send + 20, 'swoosh-quick.mp3', 0.22, '"risks" lifts off'),
	s(K.firstLand - 1, 'bass-hit-short.mp3', 0.2, 'hit 1: first component lands'),
	s(K.firstLand + 8, 'hit-weak.mp3', 0.3, 'budget lands'),
	s(K.firstLand + 16, 'hit-weak.mp3', 0.22, 'risks land'),
	s(K.brand - 4, 'sparkle-touch.mp3', 0.3, 'Slide Agent lockup'),
	s(SHOTS.install.from + 12, 'typing.wav', 0.22, 'install command typed', 34),
	...[0, 1, 2].map((i) => s(Math.round(WORDS.find((w) => w.line === 'install' && w.index === [8, 10, 12][i])!.start * 30), 'switch-tap.mp3', 0.3 - i * 0.04, 'agent chip lights')),
	s(K.dock - 4, 'air-woosh-quick.mp3', 0.3, 'icon docks into the agent'),
	s(K.dock + 10, 'switch-click-quick.mp3', 0.3, 'docked'),
	s(SHOTS.workflow.from - 4, 'transition-soft.mp3', 0.3, 'agent session opens'),
	...[6, 10, 13, 17].map((wi, i) => s(Math.round(WORDS.find((w) => w.line === 'workflow' && w.index === wi)!.start * 30) + 2, 'switch-light.mp3', 0.9, `step ${i + 1} checked`)),
	...[0, 1, 2, 3, 4].map((i) => s(Math.round(WORDS.find((w) => w.line === 'workflow' && w.index === 10)!.start * 30) - 8 + i * 5, i % 2 ? 'paper-move-quick.mp3' : 'paper-slide.mp3', 0.3 - i * 0.035, `slide ${i + 1} built into the reply`)),
	s(K.deal - 2, 'bass-hit-short.mp3', 0.28, 'hit 2: the finished deck lifts'),
	s(SHOTS.depth.from + 2, 'swoosh-slow.mp3', 0.26, 'camera rises to the timeline slide', 30),
	s(K.tlZoom, 'air-woosh-quick.mp3', 0.2, 'push into the gantt'),
	s(K.tlZoom + 6, 'sweep-digital.mp3', 0.12, 'marker advances', 60),
	s(K.tlZoom + 66, 'swoosh-slow.mp3', 0.22, 'travel to the budget slide', 30),
	s(K.budget + 8, 'sweep-short.mp3', 0.2, 'bars reveal'),
	s(K.risks - 10, 'swoosh-slow.mp3', 0.22, 'travel to the risks slide', 30),
	s(K.overview - 22, 'air-woosh-quick.mp3', 0.22, 'pull back to the whole deck'),
	s(K.arch - 16, 'typing.wav', 0.2, 'request re-typed: architecture', 24),
	s(K.arch + 4, 'transition-soft.mp3', 0.28, 'architecture deck rises'),
	s(K.arch + 44, 'sweep-digital.mp3', 0.26, 'signal follows the connectors', 48),
	s(K.road - 16, 'typing.wav', 0.2, 'request re-typed: roadmap', 24),
	s(K.road + 4, 'transition-soft.mp3', 0.26, 'roadmap deck rises'),
	s(K.road + 40, 'swoosh-slow.mp3', 0.18, 'today marker travels', 52),
	s(K.data - 16, 'typing.wav', 0.2, 'request re-typed: data story', 24),
	s(K.data + 4, 'transition-soft.mp3', 0.26, 'data deck rises'),
	s(K.data + 30, 'sweep-short.mp3', 0.22, 'acquisition bars reveal'),
	s(K.data + 48, 'sweep-short.mp3', 0.16, 'retention line reveals'),
	...[0, 1, 2, 3].map((i) => s(K.data + 68 + i * 5, 'switch-tap.mp3', 0.16 - i * 0.02, `funnel row ${i + 1}`)),
	s(K.data + 94, 'hit-weak.mp3', 0.3, 'takeaway band lands'),
	s(K.deliver + DL.deal, 'paper-slide.mp3', 0.26, 'Fern slides dealt over the data deck'),
	...DL.folds.map((d, i) => s(K.deliver + DL.fold + d, 'paper-move-quick.mp3', 0.3 - i * 0.04, `slide ${i + 1} folds into the file`)),
	s(K.deliver + DL.seal, 'lock-quick.mp3', 0.4, 'file sealed'),
	s(K.deliver + DL.open - 2, 'transition-soft.mp3', 0.24, 'file opens'),
	s(K.deliver + DL.text, 'switch-tap.mp3', 0.26, 'title selected: editable text'),
	s(K.deliver + DL.chart, 'switch-tap.mp3', 0.22, 'chart selected'),
	s(K.deliver + DL.sheet, 'paper-move-quick.mp3', 0.24, 'chart data sheet pops out'),
	s(SHOTS.close.from - 14, 'swoosh-slow.mp3', 0.18, 'file shrinks back into the deck wall', 30),
	s(K.close - 2, 'impact-cine-big.mp3', 0.34, 'hit 3: lockup lands', 70),
	s(K.close + 36, 'shimmer-sparkle-sweep.mp3', 0.22, 'website appears'),
	s(CLOSE_CUES.explore + 2, 'switch-tap.mp3', 0.14, '"Explore the examples" lands as spoken'),
	s(CLOSE_CUES.install + 2, 'switch-tap.mp3', 0.12, '"Install guide" lands as spoken'),
];

export const AudioBed: React.FC<{bgm: boolean}> = ({bgm}) => (
	<>
		{bgm && <Audio name="Music · House Vibez" src={staticFile('one-sentence/audio/music.mp3')} volume={(f) => MUSIC[Math.min(TOTAL - 1, f)]} />}
		{VO.map((c, i) => (
			<Sequence key={`vo${i}`} name={`VO ${c.line}`} from={c.at} durationInFrames={clipFrames(c)} layout="none">
				<Audio src={staticFile(`one-sentence/audio/${c.line}.wav`)} trimBefore={Math.round(c.startS * 30)} trimAfter={Math.round(c.endS * 30)} volume={0.9} />
			</Sequence>
		))}
		{SFX.map((x, i) => (
			<Sequence key={`sfx${i}`} name={`SFX ${x.note}`} from={x.from} durationInFrames={x.dur ?? 90} layout="none">
				<Audio src={staticFile(`one-sentence/sfx/${x.src}`)} volume={x.volume} />
			</Sequence>
		))}
	</>
);

