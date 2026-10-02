// Synthesizes the launch film's score and sound effects into
// public/launch/audio. The score is written against the film's scene map, so
// its sections land exactly on the picture:
//
//   0.0  hook       a low D-minor drone, a clock that starts to tick
//   5.0  the work   the clock speeds up, a muted pulse, a riser
//  14.67 collapse   hard stop — silence
//  15.5  reveal     the lights come on: an F-major swell
//  19.5  pipeline   a light four-on-the-floor groove under the product
//  30.5  build      plucked arp and claps join
//  50.5  range      the lift
//  55.0  CTA        drums fall away; the chord rings out
//
//   node scripts/make-launch-audio.mjs
//
// 120 BPM: one beat is 0.5 s = 15 frames at 30 fps.

import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
	addAt,
	bell,
	clap,
	click,
	hat,
	impact,
	kick,
	midiToHz,
	mono,
	mulberry32,
	pop,
	Reverb,
	riser,
	Saw,
	SR,
	sparkle,
	stereo,
	SVF,
	typing,
	whoosh,
	writeWav,
} from './dsp.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'launch', 'audio');

const BEAT = 0.5;
const BAR = BEAT * 4;
const DURATION = 60;

const T = {
	work: 5,
	faster: 9,
	fastest: 12,
	cut: 440 / 30,
	reveal: 15.5,
	groove: 19.5,
	build: 30.5,
	range: 50.5,
	cta: 55,
};

// Light half: Fadd9 – C/E – Dm7 – B♭maj7, one chord per bar from the reveal.
const CHORDS = [
	{root: 41, notes: [53, 57, 60, 67]},
	{root: 40, notes: [52, 55, 60, 67]},
	{root: 38, notes: [50, 57, 60, 65]},
	{root: 34, notes: [50, 58, 62, 69]},
];
const chordAt = (t) => CHORDS[Math.floor(Math.max(0, t - T.reveal) / BAR) % CHORDS.length];

const tickTock = (hz, decay) =>
	mono(0.06, (t) => (Math.sin(2 * Math.PI * hz * t) + 0.5 * Math.sin(2 * Math.PI * hz * 2.3 * t)) * Math.exp(-t / decay));

const score = () => {
	const rand = mulberry32(11);
	const mix = stereo(DURATION);
	const [L, R] = mix;
	const send = stereo(DURATION);

	// ---------------------------------------------------------- dark half

	// Drone: D and A, detuned saws through a slowly opening lowpass.
	{
		const oscs = [38, 45, 50].flatMap((m) => [-0.07, 0.07].map((d) => ({m: m + d, o: new Saw(rand()), pan: d > 0 ? 0.5 : -0.5})));
		const fl = new SVF();
		const fr = new SVF();
		for (let i = 0; i < Math.round(T.cut * SR); i++) {
			const t = i / SR;
			let l = 0;
			let r = 0;
			for (const v of oscs) {
				const s = v.o.next(midiToHz(v.m));
				l += s * (1 - Math.max(0, v.pan));
				r += s * (1 + Math.min(0, v.pan));
			}
			const p = t / T.cut;
			const cutoff = 160 + 900 * Math.pow(p, 2.2);
			const level = 0.05 * Math.min(1, t / 2) * (0.6 + 0.6 * p);
			const dl = fl.process(l, cutoff, 1.1).lp * level;
			const dr = fr.process(r, cutoff, 1.1).lp * level;
			L[i] += dl;
			R[i] += dr;
			send[0][i] += dl * 0.4;
			send[1][i] += dr * 0.4;
		}
	}

	// The clock: quarters, then eighths, then sixteenths.
	{
		const tick = tickTock(2100, 0.006);
		const tock = tickTock(1500, 0.008);
		let k = 0;
		for (let t = 1.5; t < T.cut - 0.01; k++) {
			const step = t < T.faster ? BEAT : t < T.fastest ? BEAT / 2 : BEAT / 4;
			const level = t < T.work ? 0.18 : 0.22 + 0.12 * ((t - T.work) / (T.cut - T.work));
			addAt(mix, k % 2 ? tock : tick, t, level, k % 2 ? 0.3 : -0.3);
			t += step;
		}
	}

	// Pulse: a muted D on every eighth, opening up as the pile grows.
	{
		const osc = new Saw();
		const f = new SVF();
		for (let i = Math.round(T.work * SR); i < Math.round(T.cut * SR); i++) {
			const t = i / SR;
			const local = (t - T.work) % (BEAT / 2);
			const env = Math.exp(-local / 0.09);
			const p = (t - T.work) / (T.cut - T.work);
			const out = f.process(osc.next(midiToHz(26)), 120 + 700 * p * env, 1.4).lp * env * (0.18 + 0.14 * p);
			L[i] += out;
			R[i] += out;
		}
	}
	addAt(mix, riser(rand, 3.2), T.cut - 3.2, 0.32);

	// Hard stop: nothing from the drone, clock or riser survives the cut.
	const cutAt = Math.round(T.cut * SR);
	for (let i = cutAt; i < Math.round(T.reveal * SR); i++) {
		L[i] = 0;
		R[i] = 0;
		send[0][i] = 0;
		send[1][i] = 0;
	}

	// ---------------------------------------------------------- light half

	const kickTimes = [];
	for (let t = T.groove; t < T.cta; t += BEAT) kickTimes.push(t);
	const duck = new Float32Array(L.length).fill(1);
	for (const kt of kickTimes) {
		const s = Math.round(kt * SR);
		for (let i = 0; i < SR * 0.4 && s + i < duck.length; i++) {
			duck[s + i] = Math.min(duck[s + i], 1 - 0.55 * Math.exp(-i / SR / 0.12));
		}
	}

	// Pad from the reveal to the end; the last chord is held from the CTA.
	{
		const voices = [];
		for (let v = 0; v < 4; v++) for (const det of [-0.1, 0, 0.1]) voices.push({v, det, osc: new Saw(rand()), pan: det === 0 ? 0 : det > 0 ? 0.75 : -0.75});
		const fl = new SVF();
		const fr = new SVF();
		let prev = null;
		let since = 0;
		for (let i = Math.round(T.reveal * SR); i < L.length; i++) {
			const t = i / SR;
			const ch = t >= T.cta ? CHORDS[0] : chordAt(t);
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
			const swell = Math.min(1, (t - since) / 0.12) * Math.min(1, (t - T.reveal) / 0.9);
			let cutoff = t < T.groove ? 700 + 1600 * ((t - T.reveal) / (T.groove - T.reveal)) : 2300;
			if (t >= T.range && t < T.cta) cutoff = 3000;
			if (t >= T.cta) cutoff = 2600 - 900 * Math.min(1, (t - T.cta) / 5);
			let level = 0.07 * swell;
			if (t >= T.cta) level = 0.085;
			if (t > DURATION - 1.4) level *= Math.max(0, (DURATION - t) / 1.4);
			const g = t >= T.groove && t < T.cta ? duck[i] : 1;
			const dl = fl.process(l, cutoff, 0.8).lp * level * g;
			const dr = fr.process(r, cutoff, 0.8).lp * level * g;
			L[i] += dl;
			R[i] += dr;
			send[0][i] += dl * 0.6;
			send[1][i] += dr * 0.6;
		}
	}

	// Bass: root eighths, plucky, under the groove.
	{
		const osc = new Saw();
		const osc2 = new Saw(0.3);
		const f = new SVF();
		for (let i = Math.round(T.groove * SR); i < Math.round(T.cta * SR); i++) {
			const t = i / SR;
			const ch = chordAt(t);
			const eighth = BEAT / 2;
			const local = (t - T.groove) % eighth;
			const idx = Math.floor((t - T.groove) / eighth);
			const off = idx % 2 === 1;
			const env = off ? Math.exp(-local / 0.13) : 0.35 * Math.exp(-local / 0.08);
			const hz = midiToHz(ch.root - 12 + (off ? 12 : 0));
			const s = osc.next(hz) * 0.6 + osc2.next(hz * 1.004) * 0.4;
			const out = f.process(s, 170 + 1000 * env, 1.2).lp * env * 0.3;
			L[i] += out;
			R[i] += out;
		}
	}

	// Pluck arp from the plan scene, an octave lift in the range.
	{
		const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
		const osc = new Saw();
		const f = new SVF();
		const arp = new Float32Array(L.length);
		const eighth = BEAT / 2;
		const start = 24.5;
		for (let i = Math.round(start * SR); i < Math.round(T.cta * SR); i++) {
			const t = i / SR;
			const idx = Math.floor((t - start) / eighth);
			const local = t - start - idx * eighth;
			const ch = chordAt(t);
			const up = t >= T.range ? 24 : 12;
			const env = Math.exp(-local / 0.09);
			let level = t < T.build ? 0.06 : 0.09;
			if (t < start + BAR) level *= (t - start) / BAR;
			arp[i] = f.process(osc.next(midiToHz(ch.notes[pattern[idx % 8]] + up)), 1100 + 3200 * env, 1.1).lp * env * level;
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
	for (const kt of kickTimes) addAt(mix, kick(rand), kt, kt < T.build ? 0.3 : 0.36);
	for (let t = T.groove; t < T.cta; t += BEAT / 2) {
		const off = Math.round((t - T.groove) / (BEAT / 2)) % 2 === 1;
		addAt(mix, hat(rand, off ? 0.05 : 0.022), t, off ? 0.12 : 0.045, off ? 0.25 : -0.25);
	}
	for (let t = T.build + BEAT; t < T.cta; t += BEAT * 2) {
		const c = clap(rand);
		addAt(mix, c, t, 0.17);
		addAt(send, c, t, 0.22);
	}

	// Lifts.
	addAt(mix, riser(rand, 1.5), T.groove - 1.5, 0.16);
	addAt(mix, riser(rand, 2), T.range - 2, 0.24);
	addAt(mix, impact(rand), T.reveal, 0.42);
	addAt(mix, impact(rand), T.range, 0.32);
	addAt(mix, sparkle(rand), T.reveal + 0.05, 0.5);
	addAt(send, sparkle(rand), T.reveal + 0.05, 0.5);

	// Reverb.
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
		if (t >= T.cut && t < T.reveal) {
			L[i] = 0;
			R[i] = 0;
			continue;
		}
		const fade = t > DURATION - 1 ? Math.max(0, DURATION - t) : 1;
		L[i] = Math.tanh(L[i] * 1.35) * fade;
		R[i] = Math.tanh(R[i] * 1.35) * fade;
	}
	return mix;
};

// ---------------------------------------------------------- sfx

// A soft paper-on-desk thump for each piece of work landing in the pile.
const thud = (rand) => {
	const f = new SVF();
	return mono(0.35, (t) => {
		const ph = 2 * Math.PI * (60 * t + 2.4 * (1 - Math.exp(-t / 0.02)));
		const body = Math.sin(ph) * Math.exp(-t / 0.09);
		const slap = f.process(rand() * 2 - 1, 1800, 0.7).lp * Math.exp(-t / 0.018);
		return Math.tanh((body + slap * 0.9) * 1.5);
	});
};

// The pile being pulled into one line: a whoosh played backwards.
const suck = (rand) => {
	const [l, r] = whoosh(rand, 1.3, 300, 4200, 900);
	const n = l.length;
	const L = new Float32Array(n);
	const R = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const p = i / n;
		const env = Math.pow(p, 1.6);
		L[i] = l[n - 1 - i] * env;
		R[i] = r[n - 1 - i] * env;
	}
	return [L, R];
};

// A soft UI tick for an element landing on the grid.
const land = () =>
	mono(0.08, (t) => {
		const ph = 2 * Math.PI * (900 * t + 8 * (1 - Math.exp(-t / 0.01)));
		return Math.sin(ph) * Math.exp(-t / 0.018);
	});

const r = mulberry32(42);
writeWav(OUT, 'score.wav', score(), -1.2);
writeWav(OUT, 'thud.wav', thud(r), -4);
writeWav(OUT, 'suck.wav', suck(r), -3);
writeWav(OUT, 'land.wav', land(), -6);
writeWav(OUT, 'click.wav', click(r), -4);
writeWav(OUT, 'pop.wav', pop(), -5);
writeWav(OUT, 'whoosh.wav', whoosh(r, 0.6, 300, 3600, 800), -4);
writeWav(OUT, 'typing.wav', typing(r, 3, 26), -6);
writeWav(OUT, 'typing-short.wav', typing(r, 1.1, 18), -6);
writeWav(OUT, 'success.wav', bell([[84, 0], [91, 0.09]]), -4);
writeWav(OUT, 'flag.wav', bell([[76, 0], [75, 0.1]], 1.2), -6);
writeWav(OUT, 'sparkle.wav', sparkle(r), -5);
