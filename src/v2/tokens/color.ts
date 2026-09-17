/**
 * Colour: parsing, OKLCH, WCAG contrast, and the nearest passing value.
 *
 * The engine never picks a palette for a directed deck. It verifies the pairs
 * the model's design actually uses and, when one fails, moves only OKLCH
 * lightness — hue and chroma stay the model's — to the closest value that
 * passes, and reports the change.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export function normalizeHex(value: string): string | undefined {
  const trimmed = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) return trimmed.split("").map((character) => character + character).join("").toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  return undefined;
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex) ?? "000000";
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

function rgbToHex([red, green, blue]: [number, number, number]): string {
  return [red, green, blue]
    .map((channel) => Math.round(Math.max(0, Math.min(1, channel)) * 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h: c < 1e-4 ? 0 : h };
}

function oklchToLinear({ l: L, c, h }: Oklch): [number, number, number] {
  const hue = (h * Math.PI) / 180;
  const A = c * Math.cos(hue);
  const B = c * Math.sin(hue);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function inGamut(rgb: [number, number, number]): boolean {
  return rgb.every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4);
}

/** OKLCH to hex, reducing chroma (never hue or lightness) until the colour is in sRGB. */
export function oklchToHex(color: Oklch): string {
  let candidate = { ...color, l: Math.max(0, Math.min(1, color.l)) };
  let linear = oklchToLinear(candidate);
  if (!inGamut(linear)) {
    let low = 0;
    let high = candidate.c;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const middle = (low + high) / 2;
      if (inGamut(oklchToLinear({ ...candidate, c: middle }))) low = middle;
      else high = middle;
    }
    candidate = { ...candidate, c: low };
    linear = oklchToLinear(candidate);
  }
  return rgbToHex(linear.map((channel) => linearToSrgb(Math.max(0, Math.min(1, channel)))) as [number, number, number]);
}

/** `#RRGGBB`, `#RGB`, or `oklch(L C H)` (L as 0–1 or percent). */
export function parseColor(value: string): string | undefined {
  const hex = normalizeHex(value);
  if (hex) return hex;
  const match = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(value.trim());
  if (!match) return undefined;
  const lightness = Number(match[1]) / (match[2] ? 100 : 1);
  return oklchToHex({ l: lightness, c: Number(match[3]), h: Number(match[4]) });
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** WCAG 2.x: 3:1 for large text (≥ 18 pt, or ≥ 14 pt bold) and graphics; 4.5:1 otherwise. */
export function requiredContrast(sizePt: number, bold: boolean): number {
  return sizePt >= 18 || (bold && sizePt >= 14) ? 3 : 4.5;
}

/**
 * The passing colour closest to `foreground` in OKLCH lightness, keeping its hue
 * and chroma. Searches both directions and returns the smaller move; returns
 * the original when it already passes.
 */
export function nearestPassing(foreground: string, background: string, ratio: number): { hex: string; changed: boolean; deltaL: number } {
  if (contrastRatio(foreground, background) >= ratio) return { hex: normalizeHex(foreground) ?? foreground, changed: false, deltaL: 0 };
  const base = hexToOklch(foreground);
  const candidates: Array<{ hex: string; delta: number }> = [];
  for (const direction of [-1, 1]) {
    const limit = direction < 0 ? base.l : 1 - base.l;
    let low = 0;
    let high = limit;
    const at = (delta: number) => oklchToHex({ ...base, l: base.l + direction * delta });
    if (contrastRatio(at(high), background) < ratio) continue;
    for (let iteration = 0; iteration < 28; iteration += 1) {
      const middle = (low + high) / 2;
      if (contrastRatio(at(middle), background) >= ratio) high = middle;
      else low = middle;
    }
    // A hair past the threshold so rounding to 8 bits cannot land under it.
    let hex = at(high);
    let delta = high;
    for (let nudge = 0; nudge < 20 && contrastRatio(hex, background) < ratio; nudge += 1) {
      delta = Math.min(limit, delta + 0.002);
      hex = at(delta);
    }
    if (contrastRatio(hex, background) >= ratio) candidates.push({ hex, delta });
  }
  if (candidates.length === 0) {
    const black = contrastRatio("000000", background);
    const white = contrastRatio("FFFFFF", background);
    return { hex: black >= white ? "000000" : "FFFFFF", changed: true, deltaL: 1 };
  }
  candidates.sort((left, right) => left.delta - right.delta);
  return { hex: candidates[0]!.hex, changed: true, deltaL: candidates[0]!.delta };
}

/**
 * A tint or shade of a colour: `amount` in −100…100. Positive mixes toward
 * white in OKLCH lightness, negative toward black; `signal/20` is 20% toward
 * the background's lightness end.
 */
export function tint(hex: string, amount: number): string {
  const base = hexToOklch(hex);
  const fraction = Math.max(-1, Math.min(1, amount / 100));
  const l = fraction >= 0 ? base.l + (1 - base.l) * fraction : base.l * (1 + fraction);
  return oklchToHex({ l, c: base.c * (1 - Math.abs(fraction) * 0.6), h: base.h });
}

/** Alpha-composite `top` over `bottom`. */
export function composite(top: string, bottom: string, alpha: number): string {
  const a = hexToRgb(top);
  const b = hexToRgb(bottom);
  return rgbToHex([0, 1, 2].map((index) => a[index]! * alpha + b[index]! * (1 - alpha)) as [number, number, number]);
}

export function isDark(hex: string): boolean {
  return relativeLuminance(hex) < 0.18;
}

/** Simulated colour-vision deficiency (Machado et al. 2009, severity 1). */
export function simulateCvd(hex: string, kind: "protanopia" | "deuteranopia" | "tritanopia"): string {
  const matrices = {
    protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
    deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
    tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  } as const;
  const m = matrices[kind];
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
  const out: [number, number, number] = [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
  return rgbToHex(out.map((channel) => linearToSrgb(Math.max(0, Math.min(1, channel)))) as [number, number, number]);
}

/** Perceptual distance (ΔE OK), for checking that data colours stay distinguishable. */
export function deltaE(first: string, second: string): number {
  const a = hexToOklch(first);
  const b = hexToOklch(second);
  const toLab = (color: Oklch) => [color.l, color.c * Math.cos((color.h * Math.PI) / 180), color.c * Math.sin((color.h * Math.PI) / 180)];
  const [l1, a1, b1] = toLab(a) as [number, number, number];
  const [l2, a2, b2] = toLab(b) as [number, number, number];
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}
