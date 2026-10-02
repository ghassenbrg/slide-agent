// Synthesizes the promo's music bed and sound effects into public/audio.
// Everything is generated from code with a seeded PRNG, so the audio is
// original, licence-free and byte-for-byte reproducible.
//
//   node scripts/make-audio.mjs
//
// Tempo is 120 BPM: one beat is 0.5 s, i.e. 15 frames at 30 fps, so every
// scene cut in the video lands on a beat.

import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio');
mkdirSync(OUT, {recursive: true});

// ---------------------------------------------------------------- helpers

const mulberry32 = (seed) => () => {
	seed |= 0;
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

const stereo = (seconds) => {
	const n = Math.ceil(seconds * SR);
	return [new Float32Array(n), new Float32Array(n)];
};

const writeWav = (name, [L, R], peakDb = -1) => {
	let peak = 0;
	for (let i = 0; i < L.length; i++) {
		peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
	}
	const gain = peak > 0 ? Math.pow(10, peakDb / 20) / peak : 1;
	const n = L.length;
	const buf = Buffer.alloc(44 + n * 4);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + n * 4, 4);
	buf.write('WAVE', 8);
	buf.write('fmt ', 12);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20);
	buf.writeUInt16LE(2, 22);
	buf.writeUInt32LE(SR, 24);
	buf.writeUInt32LE(SR * 4, 28);
	buf.writeUInt16LE(4, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(n * 4, 40);
	for (let i = 0; i < n; i++) {
		const l = Math.max(-1, Math.min(1, L[i] * gain));
		const r = Math.max(-1, Math.min(1, R[i] * gain));
		buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
		buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
	}
	writeFileSync(join(OUT, name), buf);
	console.log(`wrote ${name} (${(n / SR).toFixed(2)} s)`);
};

// Topology-preserving state-variable filter (Zavalishin). Returns lp/bp/hp.
class SVF {
	constructor() {
		this.ic1 = 0;
		this.ic2 = 0;
	}
	process(x, cutoff, q = 0.707) {
		const g = Math.tan((Math.PI * Math.min(cutoff, SR * 0.45)) / SR);
		const k = 1 / q;
		const a1 = 1 / (1 + g * (g + k));
		const a2 = g * a1;
		const a3 = g * a2;
		const v3 = x - this.ic2;
		const v1 = a1 * this.ic1 + a2 * v3;
		const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
		this.ic1 = 2 * v1 - this.ic1;
		this.ic2 = 2 * v2 - this.ic2;
		return {lp: v2, bp: v1, hp: x - k * v1 - v2};
	}
}

// Band-limited sawtooth via polyBLEP.
const polyBlep = (t, dt) => {
	if (t < dt) {
		t /= dt;
		return t + t - t * t - 1;
	}
	if (t > 1 - dt) {
		t = (t - 1) / dt;
		return t * t + t + t + 1;
	}
	return 0;
};
class Saw {
	constructor(phase = 0) {
		this.p = phase;
	}
	next(hz) {
		const dt = hz / SR;
		const v = 2 * this.p - 1 - polyBlep(this.p, dt);
		this.p += dt;
		if (this.p >= 1) this.p -= 1;
		return v;
	}
}

// Small Schroeder reverb used as a send.
class Reverb {
	constructor(scale = 1) {
		const combs = [1557, 1617, 1491, 1422].map((d) => Math.round(d * scale));
		const aps = [225, 556].map((d) => Math.round(d * scale));
		this.combs = combs.map((d) => ({buf: new Float32Array(d), i: 0, fb: 0.84, lp: 0}));
		this.aps = aps.map((d) => ({buf: new Float32Array(d), i: 0}));
	}
	process(x) {
		let y = 0;
		for (const c of this.combs) {
			const out = c.buf[c.i];
			c.lp = out * 0.7 + c.lp * 0.3;
			c.buf[c.i] = x + c.lp * c.fb;
			c.i = (c.i + 1) % c.buf.length;
			y += out;
		}
		y *= 0.25;
		for (const a of this.aps) {
			const b = a.buf[a.i];
			const o = -y + b;
			a.buf[a.i] = y + b * 0.5;
			a.i = (a.i + 1) % a.buf.length;
			y = o;
		}
		return y;
	}
}

const addAt = ([L, R], [l, r], atSeconds, gain = 1, pan = 0) => {
	const start = Math.round(atSeconds * SR);
	const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
	const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
	for (let i = 0; i < l.length && start + i < L.length; i++) {
		if (start + i < 0) continue;
		L[start + i] += l[i] * gl;
		R[start + i] += r[i] * gr;
	}
};

const mono = (seconds, fn) => {
	const n = Math.ceil(seconds * SR);
	const a = new Float32Array(n);
	for (let i = 0; i < n; i++) a[i] = fn(i / SR, i);
	return [a, a.slice()];
};

// ---------------------------------------------------------------- drum voices

const kick = (rand) =>
	mono(0.45, (t) => {
		// Pitch sweeps 155 Hz -> 45 Hz; this is its integrated phase.
		const phase = 2 * Math.PI * (45 * t + (110 * 0.035) * (1 - Math.exp(-t / 0.035)));
		const body = Math.sin(phase) * Math.exp(-t / 0.28);
		const click = (rand() * 2 - 1) * Math.exp(-t / 0.003) * 0.4;
		return Math.tanh((body + click) * 1.6);
	});

const hat = (rand, decay = 0.035) => {
	const f = new SVF();
	return mono(0.12, (t) => {
		const n = rand() * 2 - 1;
		return f.process(n, 9000, 0.9).hp * Math.exp(-t / decay);
	});
};

const clap = (rand) => {
	const f = new SVF();
	return mono(0.35, (t) => {
		const n = rand() * 2 - 1;
		let env = Math.exp(-t / 0.09) * 0.7;
		for (const off of [0, 0.011, 0.022]) {
			if (t >= off) env += Math.exp(-(t - off) / 0.006) * 0.8;
		}
		return f.process(n, 1300, 1.4).bp * env * 2.2;
	});
};

// ---------------------------------------------------------------- music

const BPM = 120;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const DURATION = 60;

// Am – F – C – G, one chord per bar.
const CHORDS = [
	{root: 45, notes: [57, 60, 64, 69]},
	{root: 41, notes: [53, 57, 60, 65]},
	{root: 48, notes: [55, 60, 64, 67]},
	{root: 43, notes: [55, 59, 62, 67]},
];
const chordAt = (t) => CHORDS[Math.floor(t / BAR) % CHORDS.length];

// Section map (seconds). Scene cuts: 5, 9, 17, 29, 37, 46.5, 52.5.
const DROP = 5;
const CLAPS_IN = 9;
const ARP_IN = 17;
const BREAK_START = 35;
const BREAK_END = 37;
const OUTRO = 52.5;

const music = () => {
	const rand = mulberry32(7);
	const mix = stereo(DURATION);
	const [L, R] = mix;
	const send = stereo(DURATION);

	const kickTimes = [];
	for (let t = DROP; t < OUTRO; t += BEAT) {
		if (t >= BREAK_START && t < BREAK_END) continue;
		kickTimes.push(t);
	}
	// Sidechain envelope from kicks.
	const duck = new Float32Array(L.length).fill(1);
	for (const kt of kickTimes) {
		const s = Math.round(kt * SR);
		for (let i = 0; i < SR * 0.4 && s + i < duck.length; i++) {
			const d = 1 - 0.65 * Math.exp(-i / SR / 0.11);
			duck[s + i] = Math.min(duck[s + i], d);
		}
	}

	// Pad: detuned saw stack per chord tone, filter opens over the intro.
	{
		const voices = [];
		for (let v = 0; v < 4; v++) {
			for (const det of [-0.11, 0.0, 0.11]) {
				voices.push({v, det, osc: new Saw(rand()), pan: det === 0 ? 0 : det > 0 ? 0.7 : -0.7});
			}
		}
		const fl = new SVF();
		const fr = new SVF();
		let prevChord = null;
		let chordStart = 0;
		for (let i = 0; i < L.length; i++) {
			const t = i / SR;
			const ch = chordAt(t);
			if (ch !== prevChord) {
				prevChord = ch;
				chordStart = t;
			}
			let l = 0;
			let r = 0;
			for (const vo of voices) {
				const hz = midiToHz(ch.notes[vo.v] + vo.det);
				const s = vo.osc.next(hz);
				l += s * (1 - Math.max(0, vo.pan));
				r += s * (1 + Math.min(0, vo.pan));
			}
			const sinceChord = t - chordStart;
			const swell = Math.min(1, sinceChord / 0.08);
			let cutoff;
			if (t < DROP) cutoff = 350 + 1400 * Math.pow(t / DROP, 2);
			else if (t >= BREAK_START && t < BREAK_END) cutoff = 2600 + 1800 * ((t - BREAK_START) / 2);
			else if (t >= OUTRO) cutoff = 2200 - 1200 * Math.min(1, (t - OUTRO) / 7);
			else cutoff = 2200;
			let level = 0.065 * swell;
			if (t < 1.5) level *= t / 1.5;
			if (t > 57.5) level *= Math.max(0, (DURATION - t) / 2.5);
			const dl = fl.process(l, cutoff, 0.8).lp * level * duck[i];
			const dr = fr.process(r, cutoff, 0.8).lp * level * duck[i];
			L[i] += dl;
			R[i] += dr;
			send[0][i] += dl * 0.5;
			send[1][i] += dr * 0.5;
		}
	}

	// Bass: off-beat eighths, saw through a plucky lowpass.
	{
		const osc = new Saw();
		const osc2 = new Saw(0.3);
		const f = new SVF();
		for (let i = 0; i < L.length; i++) {
			const t = i / SR;
			if (t < DROP || t >= OUTRO + BAR) continue;
			if (t >= BREAK_START && t < BREAK_END) continue;
			const ch = chordAt(t);
			const eighth = BEAT / 2;
			const inEighth = (t - DROP) % eighth;
			const idx = Math.floor((t - DROP) / eighth);
			const offbeat = idx % 2 === 1;
			const env = offbeat ? Math.exp(-inEighth / 0.12) : 0.25 * Math.exp(-inEighth / 0.08);
			const hz = midiToHz(ch.root - 12 + (offbeat ? 12 : 0));
			const s = osc.next(hz) * 0.6 + osc2.next(hz * 1.005) * 0.4;
			let out = f.process(s, 180 + 1100 * env, 1.2).lp * env * 0.32;
			if (t >= OUTRO) out *= Math.max(0, 1 - (t - OUTRO) / BAR);
			L[i] += out;
			R[i] += out;
		}
	}

	// Arp: sixteenth-note pluck with a ping-pong dotted-eighth delay.
	{
		const pattern = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2];
		const osc = new Saw();
		const f = new SVF();
		const arp = new Float32Array(L.length);
		const six = BEAT / 4;
		for (let i = 0; i < L.length; i++) {
			const t = i / SR;
			if (t < ARP_IN - BAR) continue;
			const idx = Math.floor(t / six);
			const local = t - idx * six;
			const ch = chordAt(t);
			const note = ch.notes[pattern[idx % 16]] + 12;
			const env = Math.exp(-local / 0.07);
			let level = 0.11;
			if (t < ARP_IN) level *= Math.pow((t - (ARP_IN - BAR)) / BAR, 2);
			if (t > 56) level *= Math.max(0, (DURATION - t) / 4);
			const s = osc.next(midiToHz(note));
			arp[i] = f.process(s, 900 + 3800 * env, 1.1).lp * env * level;
		}
		const d = Math.round(BEAT * 0.75 * SR);
		const dl = new Float32Array(L.length);
		const dr = new Float32Array(L.length);
		for (let i = 0; i < L.length; i++) {
			const inL = arp[i] + (i >= d ? dr[i - d] * 0.45 : 0);
			const inR = i >= d ? dl[i - d] * 0.45 : 0;
			dl[i] = inL;
			dr[i] = inR;
			L[i] += arp[i] * 0.8 + (i >= d ? dl[i - d] * 0.35 : 0);
			R[i] += arp[i] * 0.8 + (i >= d ? dr[i - d] * 0.35 : 0);
			send[0][i] += arp[i] * 0.3;
			send[1][i] += arp[i] * 0.3;
		}
	}

	// Drums.
	for (const kt of kickTimes) addAt(mix, kick(rand), kt, 0.4);
	for (let t = 1; t < OUTRO + BAR; t += BEAT / 2) {
		const off = Math.round(t / (BEAT / 2)) % 2 === 1;
		const level = t < DROP ? 0.05 + 0.05 * (t / DROP) : off ? 0.14 : 0.06;
		addAt(mix, hat(rand, off ? 0.05 : 0.025), t, level, off ? 0.25 : -0.25);
	}
	for (let t = CLAPS_IN + BEAT; t < OUTRO; t += BEAT * 2) {
		if (t >= BREAK_START && t < BREAK_END) continue;
		const c = clap(rand);
		addAt(mix, c, t, 0.22);
		addAt(send, c, t, 0.25);
	}

	// Risers into each drop, and a soft impact on them.
	addAt(mix, riser(rand, 2.0), DROP - 2.0, 0.25);
	addAt(mix, riser(rand, 2.0), BREAK_END - 2.0, 0.25);
	addAt(mix, impact(rand), DROP, 0.5);
	addAt(mix, impact(rand), BREAK_END, 0.4);

	// Final chord: a held, open pad that rings out.
	{
		const ch = CHORDS[0];
		const tone = stereo(DURATION - OUTRO);
		const oscs = ch.notes.concat([ch.notes[0] + 12, ch.root]).map(() => [new Saw(rand()), new Saw(rand())]);
		const f = [new SVF(), new SVF()];
		for (let i = 0; i < tone[0].length; i++) {
			const t = i / SR;
			const env = Math.min(1, t / 0.4) * Math.max(0, 1 - Math.max(0, t - 4.5) / 3);
			let l = 0;
			let r = 0;
			const notes = ch.notes.concat([ch.notes[0] + 12, ch.root]);
			notes.forEach((n, k) => {
				l += oscs[k][0].next(midiToHz(n - 0.08));
				r += oscs[k][1].next(midiToHz(n + 0.08));
			});
			tone[0][i] = f[0].process(l, 1500, 0.7).lp * env * 0.035;
			tone[1][i] = f[1].process(r, 1500, 0.7).lp * env * 0.035;
		}
		addAt(mix, tone, OUTRO, 1);
		addAt(send, tone, OUTRO, 0.8);
	}

	// Reverb send.
	{
		const rl = new Reverb(1);
		const rr = new Reverb(1.07);
		for (let i = 0; i < L.length; i++) {
			L[i] += rl.process(send[0][i]) * 0.5;
			R[i] += rr.process(send[1][i]) * 0.5;
		}
	}

	// Master: gentle saturation and a final fade.
	for (let i = 0; i < L.length; i++) {
		const t = i / SR;
		const fade = t > DURATION - 1.2 ? Math.max(0, (DURATION - t) / 1.2) : 1;
		L[i] = Math.tanh(L[i] * 1.4) * fade;
		R[i] = Math.tanh(R[i] * 1.4) * fade;
	}
	return mix;
};

// ---------------------------------------------------------------- sfx

function riser(rand, seconds) {
	const f = new SVF();
	let ph = 0;
	return mono(seconds, (t) => {
		const p = t / seconds;
		const n = rand() * 2 - 1;
		const noise = f.process(n, 400 + 7000 * p * p, 2).bp;
		ph += (2 * Math.PI * (200 + 900 * p * p)) / SR;
		return (noise * 0.8 + Math.sin(ph) * 0.15) * Math.pow(p, 2.2);
	});
}

function impact(rand) {
	const f = new SVF();
	let ph = 0;
	return mono(1.6, (t) => {
		ph += (2 * Math.PI * (38 + 70 * Math.exp(-t / 0.08))) / SR;
		const sub = Math.sin(ph) * Math.exp(-t / 0.55);
		const n = f.process(rand() * 2 - 1, 1800 * Math.exp(-t / 0.2) + 120, 0.7).lp * Math.exp(-t / 0.35);
		return Math.tanh((sub * 1.1 + n * 0.9) * 1.3);
	});
}

const whoosh = (rand, seconds, from, peak, to) => {
	const fl = new SVF();
	const fr = new SVF();
	const n = Math.ceil(seconds * SR);
	const L = new Float32Array(n);
	const R = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const p = i / n;
		const cutoff = p < 0.55 ? from + (peak - from) * Math.pow(p / 0.55, 1.5) : peak + (to - peak) * ((p - 0.55) / 0.45);
		const env = Math.pow(Math.sin(Math.PI * Math.pow(p, 0.8)), 2);
		const pan = -0.8 + 1.6 * p;
		const a = fl.process(rand() * 2 - 1, cutoff, 1.6).bp * env;
		const b = fr.process(rand() * 2 - 1, cutoff * 1.04, 1.6).bp * env;
		L[i] = a * (1 - Math.max(0, pan));
		R[i] = b * (1 + Math.min(0, pan));
	}
	return [L, R];
};

const pop = () =>
	mono(0.16, (t) => {
		const ph = 2 * Math.PI * (300 * t + (600 * 0.02) * (1 - Math.exp(-t / 0.02)));
		return Math.sin(ph) * Math.exp(-t / 0.045);
	});

const click = (rand) => {
	const f = new SVF();
	return mono(0.05, (t) => {
		const tone = Math.sin(2 * Math.PI * 2600 * t) * Math.exp(-t / 0.006);
		const n = f.process(rand() * 2 - 1, 5000, 1).bp * Math.exp(-t / 0.004);
		return tone * 0.6 + n * 0.8;
	});
};

const typing = (rand, seconds, cps) => {
	const out = stereo(seconds);
	let t = 0.02;
	while (t < seconds - 0.08) {
		const f = new SVF();
		const pitch = 2200 + rand() * 1800;
		const key = mono(0.06, (u) => f.process(rand() * 2 - 1, pitch, 2.5).bp * Math.exp(-u / 0.012));
		addAt(out, key, t, 0.5 + rand() * 0.5, rand() * 0.6 - 0.3);
		t += (1 / cps) * (0.55 + rand() * 0.9);
	}
	return out;
};

const bell = (notes, seconds = 1.6) => {
	const out = stereo(seconds);
	notes.forEach(([m, at]) => {
		const hz = midiToHz(m);
		const b = mono(seconds - at, (t) => {
			const e = Math.exp(-t / 0.45);
			return (
				(Math.sin(2 * Math.PI * hz * t) + 0.4 * Math.sin(2 * Math.PI * hz * 2.76 * t) * Math.exp(-t / 0.15) + 0.2 * Math.sin(2 * Math.PI * hz * 5.4 * t) * Math.exp(-t / 0.06)) *
				e *
				Math.min(1, t / 0.002)
			);
		});
		addAt(out, b, at, 0.5);
	});
	return out;
};

const sparkle = (rand) => {
	const out = stereo(1.6);
	const scale = [84, 86, 88, 91, 93, 96, 98, 100];
	for (let k = 0; k < 9; k++) {
		const m = scale[Math.min(scale.length - 1, Math.floor(k * 0.9 + rand() * 1.5))];
		const at = k * 0.055;
		const hz = midiToHz(m);
		const b = mono(0.9, (t) => Math.sin(2 * Math.PI * hz * t) * Math.exp(-t / 0.22) * Math.min(1, t / 0.003));
		addAt(out, b, at, 0.25, Math.sin(k * 1.7) * 0.7);
	}
	return out;
};

const slam = (rand) => {
	const f = new SVF();
	return mono(0.3, (t) => {
		const ph = 2 * Math.PI * (70 * t + (160 * 0.03) * (1 - Math.exp(-t / 0.03)));
		const body = Math.sin(ph) * Math.exp(-t / 0.12);
		const n = f.process(rand() * 2 - 1, 2500, 0.8).lp * Math.exp(-t / 0.025);
		return Math.tanh((body + n * 0.7) * 1.8);
	});
};

const buzz = () =>
	mono(0.32, (t) => {
		const hz = t < 0.13 ? 233 : 196;
		const local = t < 0.13 ? t : t - 0.15;
		if (local < 0) return 0;
		const sq = Math.sign(Math.sin(2 * Math.PI * hz * local)) * 0.5 + Math.sin(2 * Math.PI * hz * local) * 0.5;
		return sq * Math.exp(-local / 0.07) * 0.6;
	});

const tick = () => mono(0.03, (t) => Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t / 0.004));

// ---------------------------------------------------------------- write

const r = mulberry32(42);
writeWav('music.wav', music(), -1.5);
writeWav('whoosh.wav', whoosh(r, 0.7, 250, 3200, 700), -3);
writeWav('whoosh-up.wav', whoosh(r, 0.5, 400, 5000, 4000), -4);
writeWav('pop.wav', pop(), -4);
writeWav('click.wav', click(r), -4);
writeWav('typing.wav', typing(r, 5.5, 22), -6);
writeWav('typing-short.wav', typing(r, 1.2, 18), -6);
writeWav('success.wav', bell([[88, 0], [95, 0.09]]), -3);
writeWav('sparkle.wav', sparkle(r), -4);
writeWav('impact.wav', impact(r), -1);
writeWav('riser.wav', riser(r, 1.5), -3);
writeWav('slam.wav', slam(r), -2);
writeWav('buzz.wav', buzz(), -6);
writeWav('tick.wav', tick(), -8);
