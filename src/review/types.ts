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
  /** What the scene and manifest say should be on this slide. */
  intended: string[];
  /** What was actually read back off the render. */
  observed: string[];
  /** Intended strings that did not survive to the render. */
  missing: string[];
  /** Strings on the render that no intended text accounts for. */
  unexpected: string[];
  /** Intended strings the render shows only the beginning of. */
  truncated: Array<{ intended: string; observed: string }>;
  /** How the text was read back, and how far to trust it. */
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
  claims?: ClaimLedgerItem[];
  elements: ReviewElement[];
  /** Path to this slide's full-size render. */
  preview?: string;
  /** Paths to the slides either side, for judging pacing. */
  neighbors: { previous?: string; next?: string };
  text: ReviewSlideText;
  issues: ValidationIssue[];
}

export interface ReviewPacket {
  schemaVersion: "1.0";
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
  /** The selected slides, honouring --slide/--from/--to. */
  slides: ReviewSlide[];
  /**
   * Measured facts, engine heuristics, and reviewer judgements kept apart, so
   * nothing here reads as a verdict that it is not.
   */
  observations: {
    heuristics?: QualityScore;
    /** Deterministic findings across the whole deck. */
    issues: ValidationIssue[];
    /** Findings supplied by a host or an installed reviewer. */
    visualFindings: VisualReviewFinding[];
  };
  /** What to look at. Questions, never answers. */
  reviewQuestions: string[];
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
