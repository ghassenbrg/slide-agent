import type { CanvasElementSpec, SlideSpec } from "../types/index.js";
import type { Grid } from "./grid.js";
import type { DeckTokens } from "./tokens.js";

/**
 * Renders a deck in two languages.
 *
 * `SlideCommunicationPlan.secondaryLanguage` has existed in the type since the
 * beginning and was never rendered — a model could carefully supply a French
 * title and Slide Agent would store it in the manifest and drop it. These modes
 * make it visible.
 */

export type BilingualMode = "parallel" | "stacked" | "notes";

/** Scripts written right-to-left, which need the paragraph direction flipped. */
const RTL_SCRIPTS = /[֐-׿؀-ۿ܀-ݏݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/;

export function isRightToLeft(text: string): boolean {
  return RTL_SCRIPTS.test(text);
}

/**
 * A conservative script-aware fallback chain. A deck whose secondary language
 * is Arabic or Hebrew needs a font that actually contains those glyphs, or
 * PowerPoint substitutes one and the careful typography is lost anyway.
 */
export function fallbackFontFor(text: string, tokens: DeckTokens): string | undefined {
  if (/[؀-ۿﭐ-﷿ﹰ-﻿]/.test(text)) return "Arial";       // Arabic
  if (/[֐-׿]/.test(text)) return "Arial";                                  // Hebrew
  // Kana before Han: Japanese mixes both, Chinese uses no kana, so the
  // presence of kana is what actually identifies the language.
  if (/[぀-ヿ]/.test(text)) return "Yu Gothic";                              // Japanese
  if (/[一-鿿㐀-䶿]/.test(text)) return "Microsoft YaHei";           // Han
  if (/[가-힯]/.test(text)) return "Malgun Gothic";                          // Hangul
  if (/[ऀ-ॿ]/.test(text)) return "Nirmala UI";                             // Devanagari
  if (/[฀-๿]/.test(text)) return "Leelawadee UI";                          // Thai
  return tokens.fonts.body;
}

export interface SecondaryText {
  language: string;
  title?: string;
  subtitle?: string;
  labels?: Record<string, string>;
}

export function secondaryTextFor(slide: SlideSpec): SecondaryText | undefined {
  const secondary = slide.communication?.secondaryLanguage;
  if (!secondary || typeof secondary.language !== "string") return undefined;
  return {
    language: secondary.language,
    ...(typeof secondary.title === "string" ? { title: secondary.title } : {}),
    ...(typeof secondary.subtitle === "string" ? { subtitle: secondary.subtitle } : {}),
    ...(secondary.labels && typeof secondary.labels === "object" ? { labels: secondary.labels as Record<string, string> } : {}),
  };
}

/**
 * Adds the secondary-language elements a slide's canvas is missing.
 *
 * `parallel` places the translation beside its primary element; `stacked`
 * places it directly beneath. Both keep the translation as its own editable
 * text box rather than concatenating the two languages into one string, so a
 * reviewer can correct one without disturbing the other.
 */
export function withSecondaryLanguage(
  slide: SlideSpec,
  mode: BilingualMode,
  tokens: DeckTokens,
  grid: Grid,
): SlideSpec {
  const secondary = secondaryTextFor(slide);
  if (!secondary || mode === "notes") {
    if (!secondary) return slide;
    // Notes mode keeps the slide monolingual and puts the translation where a
    // presenter can read it.
    const lines = [
      `[${secondary.language}]`,
      ...(secondary.title ? [secondary.title] : []),
      ...(secondary.subtitle ? [secondary.subtitle] : []),
      ...Object.entries(secondary.labels ?? {}).map(([key, value]) => `${key}: ${value}`),
    ];
    return { ...slide, speakerNotes: [...(slide.speakerNotes ?? []), ...lines] };
  }

  const canvas = slide.canvas;
  if (!canvas?.length) return slide;

  const additions: CanvasElementSpec[] = [];
  const byRole = (role: string): CanvasElementSpec | undefined =>
    canvas.find((element) => element.type === "text" && element.role === role);

  const pair = (roleName: string, translation: string | undefined, suffix: string): void => {
    if (!translation) return;
    const anchor = byRole(roleName);
    if (!anchor || anchor.type !== "text") return;
    const fontSize = Math.max(tokens.type.caption, Math.round((anchor.style?.fontSize ?? tokens.type.body) * 0.62));
    const height = Math.max(fontSize / 72 * 1.6, tokens.space.md);
    const rightToLeft = isRightToLeft(translation);

    const frame = mode === "parallel"
      ? {
        x: anchor.x,
        y: anchor.y + anchor.h + tokens.space.xs,
        w: anchor.w,
        h: height,
      }
      : {
        x: anchor.x,
        y: anchor.y + anchor.h + tokens.space.xs,
        w: anchor.w,
        h: height,
      };

    const clamped = grid.clamp(frame);
    additions.push({
      id: `${anchor.id}-${suffix}`,
      type: "text",
      ...clamped,
      role: `${roleName}-secondary`,
      text: translation,
      style: {
        fontSize,
        fontFace: fallbackFontFor(translation, tokens),
        ...(anchor.style?.color ? { color: anchor.style.color } : {}),
        italic: true,
        align: rightToLeft ? "right" : anchor.style?.align ?? "left",
        fit: "shrink",
        // PptxGenJS passes rtlMode through to the paragraph properties, which is
        // what makes punctuation and digits sit on the correct side.
        ...(rightToLeft ? { options: { rtlMode: true } } : {}),
      },
    });
  };

  pair("title", secondary.title, "secondary");
  pair("subtitle", secondary.subtitle, "secondary");

  for (const [role, translation] of Object.entries(secondary.labels ?? {})) {
    pair(role, translation, `secondary-${role}`);
  }

  if (additions.length === 0) {
    // Nothing matched by role, so keep the translation reachable rather than
    // silently dropping it.
    return withSecondaryLanguage(slide, "notes", tokens, grid);
  }
  return { ...slide, canvas: [...canvas, ...additions] };
}
