// Synthesizes the score for the LinkedIn announcement (60 s, 4:5) into
// public/announcement3/audio. Upbeat from the first frame — no dark intro — and
// shaped to the picture:
//
//   0.0  introduction — immediate product name, pad/kick/bass
//   4.0  brief        — arp joins
//  10.0  story        — claps join
//  25.0  editable     — short breakdown, returning at 27
//  43.0  installation — lift
//  53.0  CTA          — drums fall away; chord rings out
//
//   node scripts/make-announcement3-audio.mjs
//
// The UI sound effects are shared with the 16:9 film (public/launch/audio).

import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {addAt, clap, hat, impact, kick, midiToHz, mulberry32, Reverb, riser, Saw, SR, sparkle, stereo, SVF, writeWav} from './dsp.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'announcement3', 'audio');

const BEAT = 0.5;
const BAR = BEAT * 4;
const DURATION = 60;

const T = {
	arp: 4,
	claps: 10,
	breakStart: 25,
	breakEnd: 27,
	lift: 43,
	close: 53,
};

// Fadd9 – C/E – Dm7 – B♭maj7, one chord per bar.
const CHORDS = [
	{root: 41, notes: [53, 57, 60, 67]},
	{root: 40, notes: [52, 55, 60, 67]},
	{root: 38, notes: [50, 57, 60, 65]},
	{root: 34, notes: [50, 58, 62, 69]},
];
const chordAt = (t, origin) => CHORDS[Math.floor(Math.max(0, t - origin) / BAR) % CHORDS.length];

// Where the groove plays: everything up to the close, minus the breakdown.
const GROOVE = [
	[0, T.breakStart],
	[T.breakEnd, T.close],
];
const inGroove = (t) => GROOVE.some(([a, b]) => t >= a && t < b);
const grooveStart = (t) => GROOVE.find(([a, b]) => t >= a && t < b)?.[0] ?? 0;
const chordOrigin = () => 0;

const score = () => {
	const rand = mulberry32(19);
	const mix = stereo(DURATION);
	const [L, R] = mix;
	const send = stereo(DURATION);

	// ------------------------------------------------ the light

	const kicks = [];
	for (const [a, b] of GROOVE) for (let t = a; t < b - 0.01; t += BEAT) kicks.push(t);
	const duck = new Float32Array(L.length).fill(1);
	for (const kt of kicks) {
		const s = Math.round(kt * SR);
		for (let i = 0; i < SR * 0.4 && s + i < duck.length; i++) duck[s + i] = Math.min(duck[s + i], 1 - 0.55 * Math.exp(-i / SR / 0.12));
	}

	// Pad: the hook, then from the reveal to the end (the last chord held from the close).
	{
		const voices = [];
		for (let v = 0; v < 4; v++) for (const det of [-0.1, 0, 0.1]) voices.push({v, det, osc: new Saw(rand()), pan: det === 0 ? 0 : det > 0 ? 0.75 : -0.75});
		const fl = new SVF();
		const fr = new SVF();
		let prev = null;
		let since = 0;
		for (let i = 0; i < L.length; i++) {
			const t = i / SR;
			const ch = t >= T.close ? CHORDS[0] : chordAt(t, chordOrigin(t));
			if (ch !== prev) {
				prev = ch;
				since = t;
			}
			let l = 0;
			let r = 0;
			for (const vo of voices) {
				const s = vo.osc.next(midiToHz(ch.notes[vo.v] + vo.det));
				l += s * (1 - Math.max(0, vo.pan));
				r += s * (1 + Math.min(0, vo.pan));
			}
			const swell = Math.min(1, (t - since) / 0.12) * Math.min(1, t / 0.05);
			let cutoff = t < T.arp ? 1800 + 600 * (t / T.arp) : 2400;
			if (t >= T.breakStart && t < T.breakEnd) cutoff = 900 + 1500 * ((t - T.breakStart) / (T.breakEnd - T.breakStart)) ** 2;
			if (t >= T.lift && t < T.close) cutoff = 3000;
			if (t >= T.close) cutoff = 2600 - 900 * Math.min(1, (t - T.close) / 5);
			let level = (t >= T.close ? 0.085 : 0.07) * swell;
			if (t > DURATION - 1.4) level *= Math.max(0, (DURATION - t) / 1.4);
			const g = inGroove(t) ? duck[i] : 1;
			const dl = fl.process(l, cutoff, 0.8).lp * level * g;
			const dr = fr.process(r, cutoff, 0.8).lp * level * g;
			L[i] += dl;
			R[i] += dr;
			send[0][i] += dl * 0.6;
			send[1][i] += dr * 0.6;
		}
	}

	// Bass: root eighths wherever the groove plays.
	{
		const osc = new Saw();
		const osc2 = new Saw(0.3);
		const f = new SVF();
		for (let i = 0; i < L.length; i++) {
			const t = i / SR;
			if (!inGroove(t)) continue;
			const g0 = grooveStart(t);
			const ch = chordAt(t, chordOrigin(t));
			const eighth = BEAT / 2;
			const local = (t - g0) % eighth;
			const off = Math.floor((t - g0) / eighth) % 2 === 1;
			const env = off ? Math.exp(-local / 0.13) : 0.35 * Math.exp(-local / 0.08);
			const hz = midiToHz(ch.root - 12 + (off ? 12 : 0));
			const out = f.process(osc.next(hz) * 0.6 + osc2.next(hz * 1.004) * 0.4, 170 + 1000 * env, 1.2).lp * env * 0.3;
			L[i] += out;
			R[i] += out;
		}
	}

	// Pluck arp from the plan step, an octave up in the range.
	{
		const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
		const osc = new Saw();
		const f = new SVF();
		const arp = new Float32Array(L.length);
		const eighth = BEAT / 2;
		for (let i = Math.round(T.arp * SR); i < Math.round(T.close * SR); i++) {
			const t = i / SR;
			const idx = Math.floor((t - T.arp) / eighth);
			const local = t - T.arp - idx * eighth;
			const ch = chordAt(t, 0);
			const env = Math.exp(-local / 0.09);
			let level = t < T.claps ? 0.06 : 0.09;
			if (t >= T.breakStart && t < T.breakEnd) level *= 0.5;
			if (t < T.arp + BAR) level *= (t - T.arp) / BAR;
			arp[i] = f.process(osc.next(midiToHz(ch.notes[pattern[idx % 8]] + (t >= T.lift ? 24 : 12))), 1100 + 3200 * env, 1.1).lp * env * level;
		}
		const d = Math.round(BEAT * 0.75 * SR);
		const dl = new Float32Array(L.length);
		const dr = new Float32Array(L.length);
		for (let i = 0; i < L.length; i++) {
			dl[i] = arp[i] + (i >= d ? dr[i - d] * 0.4 : 0);
			dr[i] = i >= d ? dl[i - d] * 0.4 : 0;
			L[i] += arp[i] * 0.8 + (i >= d ? dl[i - d] * 0.3 : 0);
			R[i] += arp[i] * 0.8 + (i >= d ? dr[i - d] * 0.3 : 0);
			send[0][i] += arp[i] * 0.3;
			send[1][i] += arp[i] * 0.3;
		}
	}

	// Drums.
	for (const kt of kicks) addAt(mix, kick(rand), kt, kt < T.claps ? 0.3 : 0.36);
	for (const [a, b] of GROOVE) {
		for (let t = a; t < b - 0.01; t += BEAT / 2) {
			const off = Math.round((t - a) / (BEAT / 2)) % 2 === 1;
			addAt(mix, hat(rand, off ? 0.05 : 0.022), t, off ? 0.12 : 0.045, off ? 0.25 : -0.25);
		}
	}
	for (let t = T.claps + BEAT; t < T.close; t += BEAT * 2) {
		const c = clap(rand);
		addAt(mix, c, t, 0.17);
		addAt(send, c, t, 0.22);
	}

	// Lifts and hits.
	addAt(mix, impact(rand), 0, 0.3);
	addAt(mix, riser(rand, 1.2), T.breakEnd - 1.2, 0.18);
	addAt(mix, riser(rand, 2), T.lift - 2, 0.24);
	addAt(mix, impact(rand), T.breakEnd, 0.3);
	addAt(mix, impact(rand), T.lift, 0.32);
	addAt(mix, sparkle(rand), T.close + 0.05, 0.4);
	addAt(send, sparkle(rand), T.close + 0.05, 0.4);

	{
		const rl = new Reverb(1);
		const rr = new Reverb(1.07);
		for (let i = 0; i < L.length; i++) {
			L[i] += rl.process(send[0][i]) * 0.5;
			R[i] += rr.process(send[1][i]) * 0.5;
		}
	}

	// Master: gentle saturation; keep the cut silent; fade the last second.
	for (let i = 0; i < L.length; i++) {
		const t = i / SR;
		const fade = t > DURATION - 1 ? Math.max(0, DURATION - t) : 1;
		L[i] = Math.tanh(L[i] * 1.35) * fade;
		R[i] = Math.tanh(R[i] * 1.35) * fade;
	}
	return mix;
};

writeWav(OUT, 'score.wav', score(), -1.2);
