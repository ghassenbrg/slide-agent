/**
 * What a call costs the host model to read.
 *
 * A deck is built inside a conversation, and the conversation is the largest
 * bill the project generates. Nothing measured it. Every option that trades
 * detail for tokens — `images`, `detail`, `include` — was therefore a choice a
 * model had to make blind, against a price list nobody had written down.
 *
 * These are estimates and they say so. The arithmetic is deliberately the
 * simple, published kind rather than a bundled tokenizer: a tokenizer would be
 * a large dependency, would be wrong for every model that is not the one it
 * ships for, and would buy accuracy that no decision here turns on. What the
 * decisions turn on is the ratio between two options, and the ratio survives
 * the approximation.
 */

/**
 * Characters per token for the JSON and English prose these results carry.
 *
 * Measured against the packets in `examples/output`, which run 3.6–4.2 for
 * compact JSON and prose alike. Indented JSON runs cheaper per character
 * because runs of spaces merge into single tokens — so this over-counts
 * pretty-printed payloads, which is the safe direction for a budget.
 */
export const CHARACTERS_PER_TOKEN = 4;

/**
 * The longest edge an image is allowed before the vision API downscales it.
 *
 * Rendering above this costs exactly what rendering at it costs, and shows
 * exactly as much, so it is the ceiling every returned preview is held to.
 */
export const IMAGE_LONG_EDGE_LIMIT = 1568;

/** Pixels per image token, from the published vision cost model. */
export const PIXELS_PER_IMAGE_TOKEN = 750;

/** Text tokens for a string, or for anything JSON-serializable. */
export function estimateTextTokens(value: string | unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return Math.ceil(text.length / CHARACTERS_PER_TOKEN);
}

/**
 * Image tokens for one image at a given pixel size.
 *
 * The downscale is applied first because the caller is charged for what the
 * API sees, not for what was sent: a 1600×900 preview and a 1568×882 preview
 * cost the same number of tokens.
 */
export function estimateImageTokens(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 0;
  const longest = Math.max(width, height);
  const scale = longest > IMAGE_LONG_EDGE_LIMIT ? IMAGE_LONG_EDGE_LIMIT / longest : 1;
  return Math.ceil((width * scale) * (height * scale) / PIXELS_PER_IMAGE_TOKEN);
}

/**
 * What one call put into the model's context, and what the cheaper or richer
 * option would have cost instead.
 *
 * `note` exists so the price list is visible at the point of decision. A model
 * that has just been handed one image should be able to read, in the same
 * result, what asking for all twelve would have cost.
 */
export interface TokenBudget {
  /** Estimated tokens for the JSON body of this result. */
  text: number;
  /** Estimated tokens for the images attached to this result. */
  images: number;
  /** How many images were attached. */
  imageCount: number;
  /** `text + images`. */
  total: number;
  /** The running total across every call this session has answered. */
  sessionTotal: number;
  /** How the numbers were arrived at, and what the alternatives cost. */
  note?: string;
  /** Always `"estimate"`. These are not tokenizer counts and never claim to be. */
  basis: "estimate";
}

export interface BudgetInput {
  /** The serialized result body, or the object about to be serialized. */
  text: string | unknown;
  /** Pixel dimensions of each attached image. */
  images?: Array<{ width: number; height: number }>;
  /** What the cheaper or richer option would have cost. */
  note?: string;
}

/**
 * The running total for one session, owned by whatever has one.
 *
 * A module-level counter would work only while "one process is one session"
 * happens to hold, and would silently merge the totals of two servers sharing a
 * host process — an assumption invisible from the module that made it. The
 * server creates one of these; anything else that wants a total creates its own.
 */
export class TokenAccount {
  private spent = 0;

  /** Everything this account has been asked to price. */
  public total(): number {
    return this.spent;
  }

  /**
   * Price a call and add it to the running total.
   *
   * Called once per tool result, after the payload is final — pricing a payload
   * that is still being assembled would report a number the caller never paid.
   */
  public accountFor({ text, images = [], note }: BudgetInput): TokenBudget {
    const budget = priceOf({ text, images, ...(note ? { note } : {}) });
    this.spent += budget.total;
    return { ...budget, sessionTotal: this.spent };
  }
}

/** What a payload costs, without recording it against any session. */
export function priceOf({ text, images = [], note }: BudgetInput): TokenBudget {
  const textTokens = estimateTextTokens(text);
  const imageTokens = images.reduce((sum, image) => sum + estimateImageTokens(image.width, image.height), 0);
  const total = textTokens + imageTokens;
  return {
    text: textTokens,
    images: imageTokens,
    imageCount: images.length,
    total,
    sessionTotal: total,
    ...(note ? { note } : {}),
    basis: "estimate",
  };
}

/**
 * A one-line saving, phrased for a model deciding what to ask for next.
 *
 * Only emitted when the saving is real: an alternative that costs the same or
 * more is not advice, it is noise in a field the reader has been told to trust.
 */
export function savingNote(chosen: number, alternative: number, describeAlternative: string): string | undefined {
  if (alternative <= chosen) return undefined;
  return `${describeAlternative} would cost about ${alternative.toLocaleString("en-US")} tokens (this call: ${chosen.toLocaleString("en-US")}).`;
}
