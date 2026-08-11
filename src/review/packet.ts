import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildArtifactGraph, identify } from "../artifacts/package.js";
import { CONTRACT_VERSION } from "../contract/version.js";
import { outputLayout } from "../output/output-layout.js";
import { PptxInspector } from "../editing/pptx-inspector.js";
import { extractRenderedText, previewFilesIn } from "../rendering/text-extraction.js";
import { compareRenderedText, intendedText } from "../validation/fidelity.js";
import { repeatedSilhouettes } from "../evaluation/visual-signature.js";
import { parseSceneNdjson } from "../serialization/scene-ndjson.js";
import type {
  ArtifactIdentity,
  DeckManifest,
  PresentationOutline,
  ValidationIssue,
  ValidationReport,
} from "../types/index.js";
import { exists, readUtf8 } from "../utils/files.js";
import { words } from "../utils/text.js";
import type { ReviewElementCensus, ReviewPacket, ReviewSlide, VisualReviewFinding } from "./types.js";

/**
 * Assembling the evidence a host AI needs to critique its own deck.
 *
 * Everything here already existed somewhere — in the manifest, the report, the
 * previews, the PDF's text layer — and none of it was in one place a model
 * could read without opening five files and hoping they belonged to the same
 * build. The packet is that one place, and the hashes are what make "the same
 * build" a fact rather than an assumption.
 *
 * It deliberately contains no aesthetic verdict. The questions at the end are
 * questions: a packet that answered them would be handing the model Slide
 * Agent's taste back as if it were the model's own.
 */

export interface ReviewOptions {
  /** A single slide, 1-based. */
  slide?: number;
  from?: number;
  to?: number;
  /** Cap on how many slides land in one packet. */
  maximumSlides?: number;
  /**
   * How much of each slide's element list to include.
   *
   * `defects` names the elements something is measurably wrong with and
   * summarises the rest; `full` lists every element. A packet asked for one
   * slide is always full: the caller has already narrowed it, and narrowing it
   * twice would answer a question nobody asked.
   */
  detail?: "defects" | "full";
  /** Findings a host or reviewer already produced, folded in. */
  visualFindings?: VisualReviewFinding[];
  /** Override the discovered scene path. */
  scene?: string;
  /** Override the discovered manifest path. */
  manifest?: string;
  /** Override the discovered report path. */
  report?: string;
}

const DEFAULT_MAXIMUM_SLIDES = 12;

/** The two identities every element carries, and the words it draws. */
type IdentifiedElement = { id: string; name: string; text?: string };

/**
 * The elements worth naming individually on a slide nothing is wrong with:
 * none. Anything an issue, a fidelity mismatch, or a reviewer finding points
 * at is named; the rest is counted.
 *
 * A deck gives every element two legitimate identities, and the manifest
 * records both: `name` is the authored id a patch addresses (`slide-title`),
 * `id` is the OOXML shape name the writer derives from it, which carries the
 * paint sequence (`002-slide-title`). Validation issues cite the second and the
 * packet publishes the first, so the join is done on the record that holds
 * them both rather than by taking a prefix off a string and hoping.
 *
 * Exported for its own tests. The failure mode is silent — a mismatch does not
 * throw, it just omits the defect the packet exists to surface — so it is worth
 * checking directly rather than only through a build that has a defect in it.
 */
export function defectiveElementIds(
  slide: { elements: IdentifiedElement[] },
  issues: ValidationIssue[],
  findings: VisualReviewFinding[],
  missingText: string[],
  truncated: Array<{ intended: string }>,
): Set<string> {
  const flagged = new Set<string>();
  for (const issue of issues) for (const id of issue.elementIds ?? []) flagged.add(id);
  for (const finding of findings) for (const id of finding.elementIds ?? []) flagged.add(id);

  const named = new Set<string>();
  for (const element of slide.elements) {
    if (flagged.has(element.id) || flagged.has(element.name)) named.add(element.name);
  }

  // Text that did not survive to the render rarely carries an element id, so
  // the element is found by the string it was supposed to draw. Without this
  // the one element the author most needs to see would be summarised away.
  const wanted = [...missingText, ...truncated.map((entry) => entry.intended)];
  if (wanted.length > 0) {
    for (const element of slide.elements) {
      const text = element.text?.trim();
      if (text && wanted.some((value) => text.includes(value) || value.includes(text))) named.add(element.name);
    }
  }
  return named;
}

/** Words an element draws, counted the way the rest of the toolkit counts them. */
function wordCount(text: string | undefined): number {
  return text ? words(text).length : 0;
}

export function censusOf(elements: Array<{ type: string; role: string; text?: string }>): ReviewElementCensus {
  const byType: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  let total = 0;
  for (const element of elements) {
    byType[element.type] = (byType[element.type] ?? 0) + 1;
    byRole[element.role] = (byRole[element.role] ?? 0) + 1;
    total += wordCount(element.text);
  }
  return { total: elements.length, byType, byRole, words: total };
}

async function readJson<T>(filePath: string | undefined): Promise<T | undefined> {
  if (!filePath || !(await exists(filePath))) return undefined;
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** The first path in the list that exists. */
async function firstExisting(...candidates: Array<string | undefined>): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (candidate && await exists(candidate)) return candidate;
  }
  return undefined;
}

function selectedSlides(total: number, options: ReviewOptions): number[] {
  if (options.slide) return options.slide >= 1 && options.slide <= total ? [options.slide] : [];
  const from = Math.max(1, options.from ?? 1);
  const to = Math.min(total, options.to ?? total);
  const all: number[] = [];
  for (let number = from; number <= to; number += 1) all.push(number);
  return all;
}

/**
 * The questions worth asking about this particular slide.
 *
 * They are derived from what is measurably true — a slide with no artifact, a
 * slide whose declared job is not visible, one carrying most of the deck's
 * words — so they point at something real without prescribing what the answer
 * should look like.
 */
function questionsFor(slide: ReviewSlide, deckAverageWords: number): string[] {
  const questions: string[] = [];
  // The census, when there is one: at `defects` detail the element list holds
  // only what a check named, so counting words from it would ask whether a
  // dense slide is dense using the two elements that happened to be flagged.
  const slideWords = slide.elementCensus?.words
    ?? slide.elements.reduce((sum, element) => sum + wordCount(element.text), 0);
  const hasArtifact = slide.elementCensus
    ? ["image", "chart", "table"].some((type) => (slide.elementCensus!.byType[type] ?? 0) > 0)
    : slide.elements.some((element) => ["image", "chart", "table"].includes(element.type));

  if (slide.plan?.narrativeJob) {
    questions.push(`Slide ${slide.number} was planned to "${slide.plan.narrativeJob}". Looking at the render, does it do that?`);
  }
  if (slide.plan?.silhouette) {
    questions.push(`The intended silhouette was "${slide.plan.silhouette}". Does the render read that way, or has it settled into the same shape as its neighbours?`);
  }
  // "Has it settled into the same shape as its neighbours" is a question the
  // engine can already answer for itself, so where it can, it does — with the
  // slide number, which is the part an author can act on.
  if (slide.twins?.length) {
    const twins = slide.twins.map((twin) => `${twin.slide} (${Math.round(twin.similarity * 100)}%)`).join(", ");
    questions.push(`This slide's composition is near-identical to slide ${twins}. Are they making the same point, or do they only look like they are?`);
  }
  if (slide.designIntent) {
    questions.push(`Design intent: "${slide.designIntent}". Is that legible to someone seeing the slide for six seconds?`);
  }
  if (!hasArtifact && slideWords > deckAverageWords * 1.2) {
    questions.push("This slide carries more words than the deck's average and shows no chart, table, or image. Is the claim being asserted rather than evidenced?");
  }
  if (slide.text.missing.length > 0 || slide.text.truncated.length > 0) {
    questions.push("Some authored text does not survive to the render. Is the box too small, the type too large, or the copy too long?");
  }
  return questions;
}

/**
 * Asked once for the deck rather than once per slide.
 *
 * "Where does the eye land first" is the right question about every slide,
 * which is exactly why repeating it per slide was worth nothing: twelve
 * identical sentences are one sentence and eleven copies. It moves here, where
 * the other questions that apply to everything already live.
 */
const DECK_QUESTIONS = [
  "Do these slides look designed for this subject, or could they be about anything?",
  "Does the sequence have a shape — does anything get quieter or louder — or is every slide the same temperature?",
  "Is any visual carrying meaning, or is it decoration on top of prose?",
  "Which single slide would you cut, and what does that say about the ones you kept?",
  "On each slide, where does the eye land first, and is that where the claim is?",
];

export interface ReviewPacketInput {
  /** The exact PPTX being reviewed. */
  input: string;
  options?: ReviewOptions;
}

export async function buildReviewPacket({ input, options = {} }: ReviewPacketInput): Promise<ReviewPacket> {
  const pptx = path.resolve(input);
  const layout = outputLayout(pptx);
  const scenePath = await firstExisting(options.scene, layout.inspect, layout.legacy.inspect);
  const manifestPath = await firstExisting(options.manifest, layout.manifest, layout.legacy.manifest);
  const reportPath = await firstExisting(options.report, layout.validation, layout.legacy.validation);

  const report = await readJson<ValidationReport>(reportPath);
  let manifest = await readJson<DeckManifest>(manifestPath);
  if (!manifest) manifest = (await new PptxInspector().inspect(pptx)).manifest;

  let outline: PresentationOutline | undefined;
  if (scenePath) {
    try {
      outline = parseSceneNdjson(await readUtf8(scenePath));
    } catch {
      outline = undefined;
    }
  }

  const previewsDir = await firstExisting(layout.images, layout.legacy.images);
  const previews = report?.render?.previewFiles?.length
    ? report.render.previewFiles
    : previewsDir ? await previewFilesIn(previewsDir) : [];
  const pdfPath = await firstExisting(report?.render?.pdfPath, layout.pdf, layout.legacy.pdf);

  // Read the words back off the render rather than trusting the scene: what
  // the audience sees is the only thing worth critiquing.
  const extracted = await extractRenderedText({
    ...(pdfPath ? { pdfPath } : {}),
    previewFiles: previews,
  });
  const fidelity = compareRenderedText(manifest, extracted);

  const graph = await buildArtifactGraph({
    root: layout.artifacts,
    pptx,
    ...(scenePath ? { scene: scenePath } : {}),
    ...(manifestPath ? { manifest: manifestPath } : {}),
    ...(reportPath ? { validation: reportPath } : {}),
    ...(pdfPath ? { pdf: pdfPath } : {}),
    previews,
    render: {
      backend: "libreoffice+poppler",
      mode: report?.render?.mode ?? (previews.length ? "render" : "none"),
    },
  });

  const chosen = selectedSlides(manifest.slides.length, options);
  const limit = options.maximumSlides ?? DEFAULT_MAXIMUM_SLIDES;
  const included = chosen.slice(0, limit);
  const planById = new Map((outline?.sequencePlan ?? []).map((entry) => [entry.slideId, entry]));
  const claimsBySlide = new Map<string, typeof outline extends undefined ? never : NonNullable<PresentationOutline["claims"]>>();
  for (const claim of outline?.claims ?? []) {
    if (!claim.slideId) continue;
    claimsBySlide.set(claim.slideId, [...(claimsBySlide.get(claim.slideId) ?? []), claim]);
  }

  const allIssues: ValidationIssue[] = [...(report?.issues ?? []), ...fidelity.issues];
  const issuesFor = (slideNumber: number): ValidationIssue[] =>
    allIssues.filter((issue) => issue.slide === slideNumber);

  // Computed once for the deck, then attached to each slide it names.
  const twinsBySlide = new Map<number, Array<{ slide: number; similarity: number }>>();
  if (manifest.slides.length >= 3) {
    for (const pair of repeatedSilhouettes(manifest)) {
      twinsBySlide.set(pair.left, [...(twinsBySlide.get(pair.left) ?? []), { slide: pair.right, similarity: pair.similarity }]);
      twinsBySlide.set(pair.right, [...(twinsBySlide.get(pair.right) ?? []), { slide: pair.left, similarity: pair.similarity }]);
    }
  }

  // A caller who asked for one slide has already narrowed the packet;
  // narrowing it a second time would answer a question nobody asked.
  const detail = options.slide !== undefined ? "full" : options.detail ?? "defects";
  const findings = options.visualFindings ?? report?.visualFindings ?? [];

  const slides: ReviewSlide[] = included.map((number) => {
    const slide = manifest.slides.find((entry) => entry.number === number)!;
    const authored = outline?.slides[number - 1];
    const comparison = fidelity.report.slides.find((entry) => entry.slide === number);
    const slideIssues = issuesFor(number);
    const describe = (element: (typeof slide.elements)[number]) => ({
      id: element.name,
      type: element.type,
      role: element.role,
      bbox: [element.x, element.y, element.w, element.h] as [number, number, number, number],
      ...(element.editability ? { editability: element.editability } : {}),
      ...(element.layer ? { layer: element.layer } : {}),
      ...(element.groupId ? { groupId: element.groupId } : {}),
      ...(element.text ? { text: element.text } : {}),
      ...(element.altText ? { altText: element.altText } : {}),
    });

    const named = detail === "full" ? undefined : defectiveElementIds(
      slide,
      slideIssues,
      findings.filter((finding) => finding.slide === number),
      comparison?.missing ?? [],
      comparison?.truncated ?? [],
    );
    const elements = named
      ? slide.elements.filter((element) => named.has(element.name)).map(describe)
      : slide.elements.map(describe);

    // Both sides of the fidelity comparison are sent when the comparison found
    // something, and neither when it did not. `missing`, `unexpected`, and
    // `truncated` are the finding; `intended` and `observed` are the working,
    // and the working is worth its cost only when there is a disagreement to
    // look into. At full detail everything is sent, because that is what full
    // detail means.
    const mismatched = (comparison?.missing.length ?? 0) > 0
      || (comparison?.unexpected.length ?? 0) > 0
      || (comparison?.truncated.length ?? 0) > 0;
    const showWorking = detail === "full" || mismatched;
    const intended = intendedText(manifest, number);
    const observed = extracted.pages.find((page) => page.page === number)?.lines ?? [];
    // At full detail the element list already carries every intended string, so
    // repeating them under `text` would be the same words twice.
    const includeIntended = showWorking
      && !intended.every((value) => elements.some((element) => element.text?.includes(value)));

    return {
      number,
      id: slide.id,
      title: slide.title,
      kind: slide.kind,
      ...(slide.compositionMode ? { compositionMode: slide.compositionMode } : {}),
      ...(slide.designIntent ? { designIntent: slide.designIntent } : {}),
      ...(authored?.communication ? { communication: authored.communication } : {}),
      ...(planById.get(slide.id) ? { plan: planById.get(slide.id)! } : {}),
      ...(twinsBySlide.get(number) ? { twins: twinsBySlide.get(number)! } : {}),
      ...(claimsBySlide.get(slide.id) ? { claims: claimsBySlide.get(slide.id)! } : {}),
      elements,
      ...(named && elements.length < slide.elements.length
        ? { elementCensus: censusOf(slide.elements) }
        : {}),
      ...(previews[number - 1] ? { preview: previews[number - 1]! } : {}),
      neighbors: {
        ...(previews[number - 2] ? { previous: previews[number - 2]! } : {}),
        ...(previews[number] ? { next: previews[number]! } : {}),
      },
      text: {
        ...(includeIntended ? { intended } : {}),
        ...(showWorking ? { observed } : {}),
        observedLineCount: observed.length,
        missing: comparison?.missing ?? [],
        unexpected: comparison?.unexpected ?? [],
        truncated: comparison?.truncated ?? [],
      },
      issues: slideIssues,
    };
  });

  const totalWords = manifest.slides.flatMap((slide) => slide.elements)
    .reduce((sum, element) => sum + wordCount(element.text), 0);
  const averageWords = totalWords / Math.max(1, manifest.slides.length);

  const previewIdentities = (await Promise.all(previews.map((preview) => identify(layout.artifacts, preview, [graph.pptx.path]))))
    .filter((entry): entry is ArtifactIdentity => Boolean(entry));

  return {
    schemaVersion: "2.0",
    generatedAt: new Date().toISOString(),
    contractVersion: CONTRACT_VERSION,
    artifacts: {
      pptx: graph.pptx,
      ...(graph.scene ? { scene: graph.scene } : {}),
      ...(graph.manifest ? { manifest: graph.manifest } : {}),
      ...(graph.validation ? { report: graph.validation } : {}),
      ...(graph.pdf ? { pdf: graph.pdf } : {}),
      previews: previewIdentities,
    },
    deck: {
      title: manifest.presentationTitle,
      slideCount: manifest.slides.length,
      width: manifest.width,
      height: manifest.height,
      ...(outline?.narrative ? { narrative: outline.narrative } : {}),
      ...(outline?.exploration?.chosen ? { chosenThesis: outline.exploration.chosen } : {}),
      renderBackend: graph.render.backend,
      renderMode: graph.render.mode,
    },
    textExtraction: {
      method: fidelity.report.method,
      confidence: fidelity.report.confidence,
      ...(fidelity.report.note ? { note: fidelity.report.note } : {}),
    },
    detail: {
      level: detail,
      note: detail === "full"
        ? "Every element's geometry and text is listed."
        : "Elements a check names are listed; the rest are counted under elementCensus. Ask for detail:\"full\", or for one slide by number, to see them all.",
    },
    slides,
    observations: {
      ...(report?.heuristics ?? report?.quality ? { heuristics: (report.heuristics ?? report.quality)! } : {}),
      // An issue with a slide number is already reported on that slide. Listing
      // it again here was every finding twice, and the second copy is the one
      // nobody can act on, because it is furthest from the slide it concerns.
      issues: allIssues.filter((issue) => issue.slide === undefined),
      issueCount: allIssues.length,
      visualFindings: findings,
    },
    reviewQuestions: [
      ...slides.flatMap((slide) => questionsFor(slide, averageWords)),
      ...DECK_QUESTIONS,
    ],
    ...(included.length < chosen.length
      ? {
        truncation: {
          slidesOmitted: chosen.length - included.length,
          imagesOmitted: chosen.length - included.length,
          note: `Showing ${included.length} of ${chosen.length} selected slides. Use --from/--to or --slide to review the rest.`,
        },
      }
      : {}),
  };
}
