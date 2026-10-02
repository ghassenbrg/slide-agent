// Shared synthesis primitives for the promo audio scripts: a seeded PRNG,
// a state-variable filter, band-limited saws, a small reverb, and the drum and
// UI voices. Everything is generated from code, so the audio is original,
// licence-free and reproducible.

import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export const SR = 44100;

// ---------------------------------------------------------------- helpers

export const mulberry32 = (seed) => () => {
	seed |= 0;
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const stereo = (seconds) => {
	const n = Math.ceil(seconds * SR);
	return [new Float32Array(n), new Float32Array(n)];
};

export const writeWav = (dir, name, [L, R], peakDb = -1) => {
	mkdirSync(dir, {recursive: true});
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
	writeFileSync(join(dir, name), buf);
	console.log(`wrote ${name} (${(n / SR).toFixed(2)} s)`);
};
// Topology-preserving state-variable filter (Zavalishin). Returns lp/bp/hp.
export class SVF {
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
export class Saw {
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
export class Reverb {
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

export const addAt = ([L, R], [l, r], atSeconds, gain = 1, pan = 0) => {
	const start = Math.round(atSeconds * SR);
	const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
	const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
	for (let i = 0; i < l.length && start + i < L.length; i++) {
		if (start + i < 0) continue;
		L[start + i] += l[i] * gl;
		R[start + i] += r[i] * gr;
	}
};

export const mono = (seconds, fn) => {
	const n = Math.ceil(seconds * SR);
	const a = new Float32Array(n);
	for (let i = 0; i < n; i++) a[i] = fn(i / SR, i);
	return [a, a.slice()];
};

// ---------------------------------------------------------------- drum voices

export const kick = (rand) =>
	mono(0.45, (t) => {
		// Pitch sweeps 155 Hz -> 45 Hz; this is its integrated phase.
		const phase = 2 * Math.PI * (45 * t + (110 * 0.035) * (1 - Math.exp(-t / 0.035)));
		const body = Math.sin(phase) * Math.exp(-t / 0.28);
		const click = (rand() * 2 - 1) * Math.exp(-t / 0.003) * 0.4;
		return Math.tanh((body + click) * 1.6);
	});

export const hat = (rand, decay = 0.035) => {
	const f = new SVF();
	return mono(0.12, (t) => {
		const n = rand() * 2 - 1;
		return f.process(n, 9000, 0.9).hp * Math.exp(-t / decay);
	});
};

export const clap = (rand) => {
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

// ---------------------------------------------------------------- sfx

export function riser(rand, seconds) {
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

export function impact(rand) {
	const f = new SVF();
	let ph = 0;
	return mono(1.6, (t) => {
		ph += (2 * Math.PI * (38 + 70 * Math.exp(-t / 0.08))) / SR;
		const sub = Math.sin(ph) * Math.exp(-t / 0.55);
		const n = f.process(rand() * 2 - 1, 1800 * Math.exp(-t / 0.2) + 120, 0.7).lp * Math.exp(-t / 0.35);
		return Math.tanh((sub * 1.1 + n * 0.9) * 1.3);
	});
}

export const whoosh = (rand, seconds, from, peak, to) => {
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

export const pop = () =>
	mono(0.16, (t) => {
		const ph = 2 * Math.PI * (300 * t + (600 * 0.02) * (1 - Math.exp(-t / 0.02)));
		return Math.sin(ph) * Math.exp(-t / 0.045);
	});

export const click = (rand) => {
	const f = new SVF();
	return mono(0.05, (t) => {
		const tone = Math.sin(2 * Math.PI * 2600 * t) * Math.exp(-t / 0.006);
		const n = f.process(rand() * 2 - 1, 5000, 1).bp * Math.exp(-t / 0.004);
		return tone * 0.6 + n * 0.8;
	});
};

export const typing = (rand, seconds, cps) => {
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

export const bell = (notes, seconds = 1.6) => {
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

export const sparkle = (rand) => {
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

export const slam = (rand) => {
	const f = new SVF();
	return mono(0.3, (t) => {
		const ph = 2 * Math.PI * (70 * t + (160 * 0.03) * (1 - Math.exp(-t / 0.03)));
		const body = Math.sin(ph) * Math.exp(-t / 0.12);
		const n = f.process(rand() * 2 - 1, 2500, 0.8).lp * Math.exp(-t / 0.025);
		return Math.tanh((body + n * 0.7) * 1.8);
	});
};

export const buzz = () =>
	mono(0.32, (t) => {
		const hz = t < 0.13 ? 233 : 196;
		const local = t < 0.13 ? t : t - 0.15;
		if (local < 0) return 0;
		const sq = Math.sign(Math.sin(2 * Math.PI * hz * local)) * 0.5 + Math.sin(2 * Math.PI * hz * local) * 0.5;
		return sq * Math.exp(-local / 0.07) * 0.6;
	});

export const tick = () => mono(0.03, (t) => Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t / 0.004));

