// Portable manifest for the video-shotcraft motion workbench: shots, captions, audio,
// all derived from the single timeline (SHOTS) so a decomposed edit stays lossless.
import {Opening} from './scenes/Opening';
import {Install} from './scenes/Install';
import {Workflow} from './scenes/Workflow';
import {Depth} from './scenes/Depth';
import {Range} from './scenes/Range';
import {Deliver} from './scenes/Deliver';
import {Close} from './scenes/Close';
import {Captions} from './Captions';
import {Film} from './Film';
import {SFX} from './Audio';
import {SHOTS, TOTAL, VO, clipFrames} from './timeline';

export const WORKBENCH = {
	name: 'Slide Agent — One Sentence',
	fps: 30,
	width: 1080,
	height: 1350,
	total: TOTAL,
	background: '#060D26',
	shots: [
		{id: 'opening', label: 'Request becomes a real deck', ...SHOTS.opening, component: Opening},
		{id: 'install', label: 'Install once in a supported agent', ...SHOTS.install, component: Install},
		{id: 'workflow', label: 'Agent session (recreated, condensed)', ...SHOTS.workflow, component: Workflow},
		{id: 'depth', label: 'One deck, camera tour', ...SHOTS.depth, component: Depth},
		{id: 'range', label: 'Three real decks', ...SHOTS.range, component: Range},
		{id: 'deliver', label: 'Native PowerPoint file', ...SHOTS.deliver, component: Deliver},
		{id: 'close', label: 'Name and website', ...SHOTS.close, component: Close},
	],
	captions: [{id: 'captions', label: 'English captions', from: 0, duration: TOTAL, component: Captions}],
	voice: VO.map((c) => ({from: c.at, duration: clipFrames(c), src: `one-sentence/audio/${c.line}.wav`, trimBefore: Math.round(c.startS * 30)})),
	sfx: SFX.map((s) => ({from: s.from, duration: s.dur ?? 90, src: `one-sentence/sfx/${s.src}`, volume: s.volume, note: s.note})),
	bgm: [{from: 0, duration: TOTAL, src: 'one-sentence/audio/music.mp3', volume: 0.3}],
	original: Film,
};
