import type { SceneElement, SceneSlide } from "../ir/scene.js";

/**
 * Rhythm analysis: silhouettes and density across the deck.
 *
 * In directed decks this returns notes, never decisions — repetition can be
 * deliberate, and the model decides. Signatures are centred before comparing,
 * which fixes V1's saturated cosine (every slide with a title and a body looked
 * 0.93 similar to every other).
 */

const COLUMNS = 12;
const ROWS = 7;

const ROLE_WEIGHT: Record<string, number> = {
  title: 1, subtitle: 0.8, metric: 1.3, quote: 1, body: 0.6, label: 0.4, caption: 0.3,
  media: 1.2, data: 1, container: 0.35, connector: 0.2, decorative: 0.15, chrome: 0,
};

export function signature(elements: SceneElement[], size: { width: number; height: number }): { vector: number[]; density: number } {
  const vector = new Array<number>(COLUMNS * ROWS).fill(0);
  const cellW = size.width / COLUMNS;
  const cellH = size.height / ROWS;
  let covered = 0;
  for (const element of elements) {
    const weight = ROLE_WEIGHT[element.role] ?? 0.5;
    if (weight === 0) continue;
    const { x, y, w, h } = element.frame;
    for (let row = 0; row < ROWS; row += 1) {
      for (let column = 0; column < COLUMNS; column += 1) {
        const cx = column * cellW;
        const cy = row * cellH;
        const overlapW = Math.max(0, Math.min(x + w, cx + cellW) - Math.max(x, cx));
        const overlapH = Math.max(0, Math.min(y + h, cy + cellH) - Math.max(y, cy));
        const fraction = (overlapW * overlapH) / (cellW * cellH);
        vector[row * COLUMNS + column] = Math.min(2, vector[row * COLUMNS + column]! + fraction * weight);
      }
    }
    if (element.role !== "container" && element.role !== "decorative") covered += Math.min(w * h, size.width * size.height);
  }
  return { vector: vector.map((value) => Math.round(value * 1000) / 1000), density: Math.round(Math.min(1, covered / (size.width * size.height)) * 1000) / 1000 };
}

export function similarity(left: number[], right: number[]): number {
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const a = left.map((value) => value - mean(left));
  const b = right.map((value) => value - mean(right));
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index]! * (b[index] ?? 0);
    normA += a[index]! ** 2;
    normB += (b[index] ?? 0) ** 2;
  }
  if (normA === 0 || normB === 0) return normA === normB ? 1 : 0;
  return Math.round((dot / Math.sqrt(normA * normB)) * 1000) / 1000;
}

export interface RhythmNote {
  slides: [string, string];
  similarity: number;
  note: string;
}

export function rhythmNotes(slides: Pick<SceneSlide, "id" | "signature" | "density" | "hidden">[], limit = 5): RhythmNote[] {
  const visible = slides.filter((slide) => !slide.hidden);
  const notes: RhythmNote[] = [];
  for (let index = 1; index < visible.length; index += 1) {
    const previous = visible[index - 1]!;
    const current = visible[index]!;
    const score = similarity(previous.signature, current.signature);
    if (score >= 0.9) notes.push({ slides: [previous.id, current.id], similarity: score, note: "adjacent slides share a silhouette" });
  }
  let runStart = 0;
  for (let index = 1; index <= visible.length; index += 1) {
    const inRun = index < visible.length && Math.abs(visible[index]!.density - visible[runStart]!.density) <= 0.08;
    if (!inRun) {
      if (index - runStart >= 4) notes.push({ slides: [visible[runStart]!.id, visible[index - 1]!.id], similarity: 0, note: `${index - runStart} slides in a row at the same density` });
      runStart = index;
    }
  }
  return notes.sort((left, right) => right.similarity - left.similarity).slice(0, limit);
}

/** Median pairwise similarity across decks' slides — the nightly "house look" proxy. */
export function interDeckSimilarity(decks: number[][][]): number {
  const scores: number[] = [];
  for (let left = 0; left < decks.length; left += 1) {
    for (let right = left + 1; right < decks.length; right += 1) {
      for (const a of decks[left]!) for (const b of decks[right]!) scores.push(similarity(a, b));
    }
  }
  if (scores.length === 0) return 0;
  scores.sort((a, b) => a - b);
  return scores[Math.floor(scores.length / 2)]!;
}
