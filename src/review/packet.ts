import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildArtifactGraph, identify } from "../artifacts/package.js";
import { CONTRACT_VERSION } from "../contract/version.js";
import { outputLayout } from "../output/output-layout.js";
import { PptxInspector } from "../editing/pptx-inspector.js";
import { extractRenderedText, previewFilesIn } from "../rendering/text-extraction.js";
import { compareRenderedText, intendedText } from "../validation/fidelity.js";
import { parseSceneNdjson } from "../serialization/scene-ndjson.js";
import type {
  ArtifactIdentity,
  DeckManifest,
  PresentationOutline,
  ValidationIssue,
  ValidationReport,
} from "../types/index.js";
import { exists, readUtf8 } from "../utils/files.js";
import type { ReviewPacket, ReviewSlide, VisualReviewFinding } from "./types.js";

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
  const words = slide.elements
    .map((element) => element.text?.trim().split(/\s+/).length ?? 0)
    .reduce((sum, count) => sum + count, 0);
  const hasArtifact = slide.elements.some((element) => ["image", "chart", "table"].includes(element.type));

  if (slide.plan?.narrativeJob) {
    questions.push(`Slide ${slide.number} was planned to "${slide.plan.narrativeJob}". Looking at the render, does it do that?`);
  }
  if (slide.plan?.silhouette) {
    questions.push(`The intended silhouette was "${slide.plan.silhouette}". Does the render read that way, or has it settled into the same shape as its neighbours?`);
  }
  if (slide.designIntent) {
    questions.push(`Design intent: "${slide.designIntent}". Is that legible to someone seeing the slide for six seconds?`);
  }
  if (!hasArtifact && words > deckAverageWords * 1.2) {
    questions.push("This slide carries more words than the deck's average and shows no chart, table, or image. Is the claim being asserted rather than evidenced?");
  }
  if (slide.text.missing.length > 0 || slide.text.truncated.length > 0) {
    questions.push("Some authored text does not survive to the render. Is the box too small, the type too large, or the copy too long?");
  }
  questions.push("Where does the eye land first, and is that where the claim is?");
  return questions;
}

const DECK_QUESTIONS = [
  "Do these slides look designed for this subject, or could they be about anything?",
  "Does the sequence have a shape — does anything get quieter or louder — or is every slide the same temperature?",
  "Is any visual carrying meaning, or is it decoration on top of prose?",
  "Which single slide would you cut, and what does that say about the ones you kept?",
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

  const issuesFor = (slideNumber: number): ValidationIssue[] =>
    [...(report?.issues ?? []), ...fidelity.issues].filter((issue) => issue.slide === slideNumber);

  const slides: ReviewSlide[] = included.map((number) => {
    const slide = manifest.slides.find((entry) => entry.number === number)!;
    const authored = outline?.slides[number - 1];
    const comparison = fidelity.report.slides.find((entry) => entry.slide === number);
    return {
      number,
      id: slide.id,
      title: slide.title,
      kind: slide.kind,
      ...(slide.compositionMode ? { compositionMode: slide.compositionMode } : {}),
      ...(slide.designIntent ? { designIntent: slide.designIntent } : {}),
      ...(authored?.communication ? { communication: authored.communication } : {}),
      ...(planById.get(slide.id) ? { plan: planById.get(slide.id)! } : {}),
      ...(claimsBySlide.get(slide.id) ? { claims: claimsBySlide.get(slide.id)! } : {}),
      elements: slide.elements.map((element) => ({
        id: element.name,
        type: element.type,
        role: element.role,
        bbox: [element.x, element.y, element.w, element.h] as [number, number, number, number],
        ...(element.editability ? { editability: element.editability } : {}),
        ...(element.layer ? { layer: element.layer } : {}),
        ...(element.groupId ? { groupId: element.groupId } : {}),
        ...(element.text ? { text: element.text } : {}),
        ...(element.altText ? { altText: element.altText } : {}),
      })),
      ...(previews[number - 1] ? { preview: previews[number - 1]! } : {}),
      neighbors: {
        ...(previews[number - 2] ? { previous: previews[number - 2]! } : {}),
        ...(previews[number] ? { next: previews[number]! } : {}),
      },
      text: {
        intended: intendedText(manifest, number),
        observed: extracted.pages.find((page) => page.page === number)?.lines ?? [],
        missing: comparison?.missing ?? [],
        unexpected: comparison?.unexpected ?? [],
        truncated: comparison?.truncated ?? [],
        method: fidelity.report.method,
        confidence: fidelity.report.confidence,
        ...(fidelity.report.note ? { note: fidelity.report.note } : {}),
      },
      issues: issuesFor(number),
    };
  });

  const totalWords = manifest.slides.flatMap((slide) => slide.elements)
    .reduce((sum, element) => sum + (element.text?.trim().split(/\s+/).length ?? 0), 0);
  const averageWords = totalWords / Math.max(1, manifest.slides.length);

  const previewIdentities = (await Promise.all(previews.map((preview) => identify(layout.artifacts, preview, [graph.pptx.path]))))
    .filter((entry): entry is ArtifactIdentity => Boolean(entry));

  return {
    schemaVersion: "1.0",
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
    slides,
    observations: {
      ...(report?.heuristics ?? report?.quality ? { heuristics: (report.heuristics ?? report.quality)! } : {}),
      issues: [...(report?.issues ?? []), ...fidelity.issues],
      visualFindings: options.visualFindings ?? report?.visualFindings ?? [],
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
