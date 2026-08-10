import type { DeckManifest, RenderFidelityReport, ValidationIssue } from "../types/index.js";
import type { ExtractedText } from "../rendering/text-extraction.js";

/**
 * Comparing what the deck says with what the render shows.
 *
 * The failure this exists to catch is the one nobody notices until the room
 * does: a title that autofit shrank until its last word fell off, a footnote
 * left behind after the sentence it referenced was deleted, a word broken in
 * half by a wrap the author never saw. None of those are visible in the scene,
 * the manifest, or the package — only in the render.
 *
 * Uncertainty is preserved rather than resolved. When the reading came from
 * OCR, a mismatch is something to look at; when it came from the PDF's own
 * text layer, it is a fact.
 */

/** Case, spacing, quotes, and dashes normalized so only real differences show. */
export function normalizeForComparison(value: string): string {
  return value
    .replace(/ /g, " ")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Strips everything but letters and digits, for a shape-only comparison. */
function skeleton(value: string): string {
  return normalizeForComparison(value).replace(/[^a-z0-9]/g, "");
}

/** The intended visible strings on one slide, in reading order. */
export function intendedText(manifest: DeckManifest, slideNumber: number): string[] {
  const slide = manifest.slides.find((entry) => entry.number === slideNumber);
  if (!slide) return [];
  return slide.elements
    .filter((element) => element.type === "text" && element.text?.trim())
    .map((element) => element.text!.trim());
}

interface SlideComparison {
  slide: number;
  missing: string[];
  unexpected: string[];
  truncated: Array<{ intended: string; observed: string }>;
  repeated: string[];
  splitWords: string[];
}

/**
 * A short string is not evidence of anything: a page number, a unit, or a
 * single letter appears and disappears for reasons that have nothing to do
 * with fidelity, and reporting them would bury the mismatches that matter.
 */
const SIGNIFICANT_LENGTH = 4;

/**
 * Did the *render* break this word, or did the extractor just space it oddly?
 *
 * PDF text extraction inserts spaces inside large display type — a 54pt title
 * comes back as "Re a ding the ha rbour wa ll" from a slide that reads
 * perfectly. Reporting that as a defect trains authors to ignore the check,
 * which is worse than not having it.
 *
 * The distinction is where the letters ended up. Odd spacing *within* one
 * extracted line is the extractor. Letters continuing onto the *next* line are
 * a word the renderer actually broke in half.
 */
function brokenAcrossLines(word: string, observedLines: string[]): boolean {
  const target = skeleton(word);
  if (target.length < SIGNIFICANT_LENGTH) return false;
  const lines = observedLines.map(skeleton).filter(Boolean);
  if (lines.some((line) => line.includes(target))) return false;
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (`${lines[index]!}${lines[index + 1]!}`.includes(target)) return true;
  }
  return false;
}

/**
 * Matching one authored string against the render.
 *
 * The render is read in physical reading order, so two text boxes side by side
 * interleave line for line, and a wrap splits one authored line into two. Both
 * are normal, and comparing the strings literally reported them as defects.
 *
 * So the unit of comparison is the word. Every significant word present means
 * the string survived, however it was laid out. A *suffix* of words missing is
 * the signature of clipping and autofit — they take the end, never the middle —
 * and that is the defect worth reporting.
 */
function matchSegment(
  segment: string,
  observedJoined: string,
  observedSkeleton: string,
): "present" | { truncatedAt: string } | { splitWords: string[] } | "missing" {
  const wanted = normalizeForComparison(segment);
  if (wanted.length < SIGNIFICANT_LENGTH) return "present";
  if (observedJoined.includes(wanted)) return "present";

  const tokens = wanted.split(" ").filter((word) => word.length > 2);
  if (tokens.length === 0) return observedJoined.includes(wanted) ? "present" : "missing";
  const found = tokens.map((word) => observedJoined.includes(word));
  if (found.every(Boolean)) return "present";

  const firstMissing = found.indexOf(false);
  const tail = tokens.slice(firstMissing);
  // Letters present but the word not: a wrap broke it. "contexts 101–128"
  // splitting across a line is a layout defect, not a lost string, and calling
  // it truncation would send an author looking for text that is on the slide.
  if (tail.every((word) => observedSkeleton.includes(skeleton(word)))) {
    return { splitWords: tail.filter((word) => word.length > 3) };
  }
  const tailAllMissing = found.slice(firstMissing).every((present) => !present);
  if (tailAllMissing && firstMissing >= Math.max(2, Math.ceil(tokens.length * 0.4))) {
    // Report the real prefix, not a rejoin of the filtered tokens: an author
    // comparing "the decision action you are" against their slide is being
    // shown a string that was never on it.
    const cut = wanted.indexOf(tokens[firstMissing]!);
    return { truncatedAt: (cut > 0 ? wanted.slice(0, cut) : tokens.slice(0, firstMissing).join(" ")).trim() };
  }
  return found.filter(Boolean).length <= tokens.length / 2 ? "missing" : "present";
}

function compareSlide(slideNumber: number, intended: string[], observedLines: string[]): SlideComparison {
  const observedJoined = normalizeForComparison(observedLines.join(" "));
  const observedSkeleton = skeleton(observedLines.join(" "));

  const missing: string[] = [];
  const truncated: Array<{ intended: string; observed: string }> = [];
  const splitWords: string[] = [];

  for (const source of intended) {
    // An authored string may carry its own line breaks. Each line is matched
    // separately, because that is how it reaches the page.
    for (const segment of source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
      const result = matchSegment(segment, observedJoined, observedSkeleton);
      if (result === "present") {
        // Present but not contiguous: check whether the render broke a word,
        // or the extractor merely spaced one oddly.
        const wanted = normalizeForComparison(segment);
        if (!observedJoined.includes(wanted)) {
          splitWords.push(...wanted.split(" ").filter(
            (word) => word.length > 6 && !observedJoined.includes(word) && brokenAcrossLines(word, observedLines),
          ));
        }
        continue;
      }
      if (result === "missing") {
        missing.push(segment);
        continue;
      }
      if ("splitWords" in result) {
        splitWords.push(...result.splitWords.filter((word) => brokenAcrossLines(word, observedLines)));
        continue;
      }
      truncated.push({ intended: segment, observed: result.truncatedAt });
    }
  }

  const intendedSkeletons = new Set(
    intended.flatMap((source) => source.split(/\r?\n/)).map(skeleton).filter((value) => value.length >= SIGNIFICANT_LENGTH),
  );
  const unexpected = observedLines
    .map((line) => line.trim())
    .filter((line) => normalizeForComparison(line).length >= SIGNIFICANT_LENGTH)
    .filter((line) => {
      const shape = skeleton(line);
      return ![...intendedSkeletons].some((wanted) => wanted.includes(shape) || shape.includes(wanted));
    });

  const seen = new Map<string, number>();
  for (const line of observedLines) {
    const key = normalizeForComparison(line);
    if (key.length < SIGNIFICANT_LENGTH) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const intendedCounts = new Map<string, number>();
  for (const source of intended) {
    const key = normalizeForComparison(source);
    intendedCounts.set(key, (intendedCounts.get(key) ?? 0) + 1);
  }
  const repeated = [...seen.entries()]
    .filter(([key, count]) => count > Math.max(1, intendedCounts.get(key) ?? 0))
    .map(([key]) => key);

  return { slide: slideNumber, missing, unexpected, truncated, repeated, splitWords: [...new Set(splitWords)] };
}

export interface FidelityResult {
  report: RenderFidelityReport;
  issues: ValidationIssue[];
}

export function compareRenderedText(manifest: DeckManifest, extracted: ExtractedText): FidelityResult {
  if (extracted.method === "none") {
    return {
      report: {
        status: "skipped",
        method: "none",
        confidence: "low",
        slides: [],
        ...(extracted.note ? { note: extracted.note } : {}),
      },
      issues: [],
    };
  }

  const slides = manifest.slides.map((slide) => compareSlide(
    slide.number,
    intendedText(manifest, slide.number),
    extracted.pages.find((page) => page.page === slide.number)?.lines ?? [],
  ));

  const issues: ValidationIssue[] = [];
  // A clipped string is a defect in the *deck*, not in the package, so it is a
  // warning here and blocks `presentationReadiness` through `fidelity.status`
  // instead. Reporting it as a package error would say the file is broken,
  // which it is not, and would fail builds whose only fault is that they are
  // not finished yet.
  const severity: ValidationIssue["severity"] = "warning";

  for (const slide of slides) {
    if (slide.missing.length > 0) {
      issues.push({
        code: "render-text-missing",
        severity,
        slide: slide.slide,
        message: `Slide ${slide.slide}: ${slide.missing.length} authored string(s) do not appear in the render: ${slide.missing.map((value) => JSON.stringify(value.slice(0, 60))).join(", ")}.`,
        details: { missing: slide.missing, method: extracted.method },
        fixable: false,
      });
    }
    if (slide.truncated.length > 0) {
      issues.push({
        code: "render-text-truncated",
        severity,
        slide: slide.slide,
        message: `Slide ${slide.slide}: text is cut short in the render. ${slide.truncated.map((entry) => `${JSON.stringify(entry.intended.slice(0, 60))} shows only ${JSON.stringify(entry.observed.slice(0, 60))}`).join("; ")}.`,
        details: { truncated: slide.truncated, method: extracted.method },
        fixable: false,
      });
    }
    if (slide.splitWords.length > 0) {
      issues.push({
        code: "render-word-split",
        severity: "warning",
        slide: slide.slide,
        message: `Slide ${slide.slide}: the render breaks ${slide.splitWords.length} word(s) that the source did not: ${slide.splitWords.slice(0, 6).join(", ")}. Widen the box, reduce the size, or mark the phrase noBreak.`,
        details: { splitWords: slide.splitWords },
        fixable: false,
      });
    }
    if (slide.repeated.length > 0) {
      issues.push({
        code: "render-text-repeated",
        severity: "warning",
        slide: slide.slide,
        message: `Slide ${slide.slide}: the render shows ${slide.repeated.length} string(s) more often than the deck authored them: ${slide.repeated.slice(0, 4).map((value) => JSON.stringify(value.slice(0, 40))).join(", ")}.`,
        details: { repeated: slide.repeated },
        fixable: false,
      });
    }
    if (slide.unexpected.length > 0) {
      issues.push({
        code: "render-text-unexpected",
        severity: "info",
        slide: slide.slide,
        message: `Slide ${slide.slide}: the render shows ${slide.unexpected.length} string(s) the manifest does not account for. Chart labels, table cells, and speaker-note artefacts often land here; check for leftover copy.`,
        details: { unexpected: slide.unexpected.slice(0, 20) },
        fixable: false,
      });
    }
  }

  const hasHardMismatch = slides.some((slide) => slide.missing.length > 0 || slide.truncated.length > 0);
  const hasSoftMismatch = slides.some((slide) => slide.splitWords.length > 0 || slide.repeated.length > 0);
  // Finding every intended string is positive evidence whichever tool found
  // them. A *mismatch* read by OCR is the uncertain case — it could be a real
  // defect or a misread — so that, and only that, becomes `review`.
  const status: RenderFidelityReport["status"] = extracted.method === "pdf-text"
    ? (hasHardMismatch ? "fail" : hasSoftMismatch ? "review" : "pass")
    : (hasHardMismatch || hasSoftMismatch ? "review" : "pass");

  return {
    report: {
      status,
      method: extracted.method,
      confidence: extracted.confidence,
      slides,
      ...(extracted.note ? { note: extracted.note } : {}),
    },
    issues,
  };
}
