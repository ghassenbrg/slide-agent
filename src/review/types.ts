import type { TokenBudget } from "../evaluation/token-budget.js";
import type {
  ArtifactIdentity,
  ClaimLedgerItem,
  QualityScore,
  SequencePlanItem,
  SlideCommunicationPlan,
  ValidationIssue,
} from "../types/index.js";

/**
 * What a host AI needs to critique a deck it cannot open.
 *
 * A scene that validates is not evidence. The audience sees a render, so the
 * critique has to start from the render — bound by hash to the exact package it
 * came from, so a packet can never describe one deck while showing another.
 *
 * Everything here is either measured or quoted. Slide Agent supplies no
 * aesthetic verdict and asks questions instead of answering them: the taste is
 * the host's, and a packet that pre-judged the design would be teaching the
 * model what Slide Agent decks look like.
 */

export interface ReviewSlideText {
  /**
   * What the scene and manifest say should be on this slide.
   *
   * Omitted when it is exactly the text already carried by `elements`, which
   * on a healthy deck at full detail it always is.
   */
  intended?: string[];
  /**
   * What was actually read back off the render.
   *
   * Present when the comparison found a disagreement, and at `full` detail.
   * When it is absent the comparison still ran — `missing`, `unexpected`, and
   * `truncated` are its findings, and `observedLineCount` says how much text
   * was read — it is the working that has been left out, not the check.
   */
  observed?: string[];
  /** How many lines were read off the render, whether or not they are listed. */
  observedLineCount: number;
  /** Intended strings that did not survive to the render. */
  missing: string[];
  /** Strings on the render that no intended text accounts for. */
  unexpected: string[];
  /** Intended strings the render shows only the beginning of. */
  truncated: Array<{ intended: string; observed: string }>;
}

/**
 * How the words were read back off the render, and how far to trust it.
 *
 * One property of one extraction run, so it is stated once. It used to be
 * repeated on every slide, which on a machine without Poppler meant the same
 * 180-character explanation twelve times over.
 */
export interface TextExtractionMethod {
  method: "pdf-text" | "ocr" | "none";
  confidence: "high" | "medium" | "low";
  note?: string;
}

export interface ReviewElement {
  id: string;
  type: string;
  role: string;
  bbox: [number, number, number, number];
  editability?: string;
  layer?: string;
  groupId?: string;
  text?: string;
  altText?: string;
}

/**
 * The elements a defect-first packet did not list individually.
 *
 * A twelve-slide packet spent 15,930 characters reciting geometry and text the
 * model had itself authored moments earlier. What it could not have known is
 * the part worth sending: which elements something is measurably wrong with.
 * The rest becomes a census — enough to notice a slide with forty elements or
 * none, without paying to read all forty back.
 */
export interface ReviewElementCensus {
  total: number;
  /** How many elements of each type the slide holds. */
  byType: Record<string, number>;
  /** How many elements carry each declared role. */
  byRole: Record<string, number>;
  /** Total words across every element's text. */
  words: number;
}

export interface ReviewSlide {
  number: number;
  id: string;
  title: string;
  kind: string;
  compositionMode?: string;
  /** The author's declared intent, to compare the render against. */
  designIntent?: string;
  communication?: SlideCommunicationPlan;
  plan?: SequencePlanItem;
  /**
   * Other slides whose composition is near-identical to this one.
   *
   * The sequence plan states an intended silhouette per slide, and nothing used
   * to check the render against it. This is the measurable half of that: two
   * slides that came out as the same drawing, named by number.
   */
  twins?: Array<{ slide: number; similarity: number }>;
  claims?: ClaimLedgerItem[];
  /**
   * At `defects` detail, the elements an issue names. At `full`, every element.
   * The `elementCensus` says what the shorter list left out.
   */
  elements: ReviewElement[];
  /** Present only at `defects` detail, and only when elements were summarised. */
  elementCensus?: ReviewElementCensus;
  /** Path to this slide's full-size render. */
  preview?: string;
  /** Paths to the slides either side, for judging pacing. */
  neighbors: { previous?: string; next?: string };
  text: ReviewSlideText;
  issues: ValidationIssue[];
}

export interface ReviewPacket {
  /**
   * `2.0`: the packet became defect-first.
   *
   * A reader of `1.0` finds real differences — `text.method`, `confidence`, and
   * `note` moved to a single `textExtraction` block rather than being repeated
   * per slide; `text.intended` and `text.observed` appear when the comparison
   * found something and at `full` detail; `observations.issues` carries the
   * deck-wide issues while slide-scoped ones live on their slide. The authoring
   * contract is untouched: nothing a host *writes* has changed, so
   * `contractVersion` stays where it was.
   */
  schemaVersion: "2.0";
  generatedAt: string;
  contractVersion: string;
  /** Every artifact this packet describes, bound by hash. */
  artifacts: {
    pptx: ArtifactIdentity;
    scene?: ArtifactIdentity;
    manifest?: ArtifactIdentity;
    report?: ArtifactIdentity;
    pdf?: ArtifactIdentity;
    previews: ArtifactIdentity[];
    contactSheet?: ArtifactIdentity;
  };
  deck: {
    title: string;
    slideCount: number;
    width: number;
    height: number;
    narrative?: string;
    /** The visual thesis the author committed to, for comparison. */
    chosenThesis?: string;
    renderBackend: string;
    renderMode: "render" | "schematic" | "none";
  };
  /** How the words were read back off the render, for the whole packet. */
  textExtraction: TextExtractionMethod;
  /**
   * How much of each slide was included, and how to ask for more.
   *
   * Stated once for the packet rather than repeated on every slide: it is a
   * property of the request, not of any slide in it.
   */
  detail: {
    level: "defects" | "full";
    note: string;
  };
  /** The selected slides, honouring --slide/--from/--to. */
  slides: ReviewSlide[];
  /**
   * Measured facts, engine heuristics, and reviewer judgements kept apart, so
   * nothing here reads as a verdict that it is not.
   */
  observations: {
    heuristics?: QualityScore;
    /**
     * Deterministic findings that belong to the deck rather than to one slide.
     *
     * Anything with a slide number is reported on that slide and not repeated
     * here; `issueCount` is the total either way, so a reader can tell an empty
     * list from an omitted one.
     */
    issues: ValidationIssue[];
    issueCount: number;
    /** Findings supplied by a host or an installed reviewer. */
    visualFindings: VisualReviewFinding[];
  };
  /** What to look at. Questions, never answers. */
  reviewQuestions: string[];
  /**
   * What this packet cost the reader, when it was delivered over a transport
   * that can price it. Absent from a packet written to a file, which nobody is
   * billed for.
   */
  tokenBudget?: TokenBudget;
  /** Where the packet was trimmed to fit a context window. */
  truncation?: { slidesOmitted: number; imagesOmitted: number; note: string };
}

export type VisualFindingSeverity = "blocking" | "major" | "minor" | "note";

/**
 * One thing a reviewer saw. Every field is required to be explainable: an
 * unexplainable scalar score cannot be acted on, argued with, or waived.
 */
export interface VisualReviewFinding {
  id: string;
  reviewer: string;
  severity: VisualFindingSeverity;
  slide: number;
  elementIds?: string[];
  /** What is visible. */
  observation: string;
  /** Why it matters for this deck's audience and intent. */
  rationale: string;
  /** What the fixed state would look like. */
  suggestedTarget: string;
  /** Set when a human or host deliberately accepted the finding as-is. */
  waived?: { by: string; reason: string; at: string };
}
