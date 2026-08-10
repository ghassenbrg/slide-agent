import type {
  QualityScore,
  RenderFidelityReport,
  RoundTripReport,
  ValidationIssue,
  ValidationReport,
  VisualReviewFinding,
} from "../types/index.js";

/**
 * Two questions, kept apart.
 *
 * "Does this package hold together?" and "would you put this in front of the
 * audience?" have different answers more often than not, and collapsing them
 * into one `status` meant a deck with a stale preview and a deck with an
 * unreadable title reported the same word. `packageStatus` is deterministic
 * file integrity. `presentationReadiness` is whether the deck is finished.
 *
 * Readiness is deliberately not a weighted average. One critical dimension —
 * text that did not survive the render, a missing asset, an unresolved blocking
 * review finding — blocks readiness no matter how good everything else is,
 * because that is how a person deciding whether to present would think about it.
 */

/** Defects in the package as a file: schema, parts, relationships, assets. */
const PACKAGE_CODES = new Set([
  "corrupt-pptx",
  "malformed-xml",
  "missing-package-part",
  "part-without-content-type",
  "content-type-missing-part",
  "duplicate-content-type",
  "broken-relationship-target",
  "missing-relationship-id",
  "duplicate-relationship-id",
  "relationship-without-id",
  "duplicate-shape-id",
  "invalid-shape-id",
  "duplicate-slide-id",
  "invalid-slide-id",
  "no-slide-parts",
  "empty-presentation",
  "schema-violation",
  "schema-validation-unavailable",
  "missing-image",
  "invalid-paragraph-order",
  "invalid-presentation-element-order",
  "invalid-notes-master-theme",
  "invalid-chart-sequence",
  "invalid-chart-series",
  "invalid-chart-axis",
  "undefined-chart-axis",
  "undefined-cross-axis",
  "missing-chart-grouping",
  "negative-shape-extent",
  "invalid-shape-preset",
  "render-failed",
  "render-slide-count-mismatch",
  "stale-preview",
  "missing-preview",
  "missing-packaged-asset",
  "asset-outside-package",
  "round-trip-failed",
]);

/**
 * Defects the audience would see. A deck can be a perfectly valid file and
 * still be unpresentable, which is the whole reason these are separated.
 */
const PRESENTATION_BLOCKING_CODES = new Set([
  "text-overflow",
  "object-outside-slide",
  "poor-contrast",
  "missing-alt-text",
  "missing-slide-title",
  "empty-slide",
  "invalid-chart-data",
  "render-text-missing",
  "render-text-truncated",
  "render-text-repeated",
  "render-word-split",
  "unsupported-content",
]);

export function isPackageIssue(issue: ValidationIssue): boolean {
  return PACKAGE_CODES.has(issue.code);
}

/** Per-dimension floors. An average cannot rescue a dimension that failed. */
export const HEURISTIC_FLOORS: Record<string, number> = {
  contrast: 45,
  accessibility: 55,
  hierarchy: 30,
  density: 25,
  variety: 25,
  evidence: 25,
};

export interface ReadinessInput {
  issues: ValidationIssue[];
  heuristics?: QualityScore;
  fidelity?: RenderFidelityReport;
  roundTrip?: RoundTripReport;
  visualFindings?: VisualReviewFinding[];
  render?: ValidationReport["render"];
  /** Claims still marked `needs-review`, by id. */
  unresolvedClaims?: string[];
  /** Slides still carrying an unresolved `[bracketed instruction]`. */
  placeholderSlides?: number;
}

export interface Verdict {
  packageStatus: ValidationReport["packageStatus"];
  presentationReadiness: ValidationReport["presentationReadiness"];
  readinessReasons: string[];
}

/**
 * Folds late evidence — the artifact graph and the clean-directory rebuild —
 * into a report that was written before either existed, and recomputes the
 * verdict from the whole picture.
 */
export function withPackageEvidence(
  report: ValidationReport,
  evidence: {
    artifacts?: ValidationReport["artifacts"];
    roundTrip?: RoundTripReport;
    extraIssues?: ValidationIssue[];
    unresolvedClaims?: string[];
  },
): ValidationReport {
  const issues = [...report.issues, ...(evidence.extraIssues ?? [])];
  const summary = {
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
  const verdict = computeVerdict({
    issues,
    ...(report.heuristics ? { heuristics: report.heuristics } : {}),
    ...(report.fidelity ? { fidelity: report.fidelity } : {}),
    ...(evidence.roundTrip ? { roundTrip: evidence.roundTrip } : {}),
    ...(report.visualFindings ? { visualFindings: report.visualFindings } : {}),
    ...(report.render ? { render: report.render } : {}),
    ...(evidence.unresolvedClaims ? { unresolvedClaims: evidence.unresolvedClaims } : {}),
  });
  return {
    ...report,
    issues,
    summary,
    status: summary.errors > 0 ? "fail" : summary.warnings > 0 ? "warning" : "pass",
    packageStatus: verdict.packageStatus,
    presentationReadiness: verdict.presentationReadiness,
    readinessReasons: verdict.readinessReasons,
    ...(evidence.artifacts ? { artifacts: evidence.artifacts } : {}),
    ...(evidence.roundTrip ? { roundTrip: evidence.roundTrip } : {}),
  };
}

export function computeVerdict(input: ReadinessInput): Verdict {
  const packageIssues = input.issues.filter(isPackageIssue);
  const packageErrors = packageIssues.filter((issue) => issue.severity === "error");
  const packageWarnings = packageIssues.filter((issue) => issue.severity === "warning");

  let packageStatus: ValidationReport["packageStatus"] = packageErrors.length > 0
    ? "fail"
    : packageWarnings.length > 0 ? "warning" : "pass";
  if (input.roundTrip?.status === "fail") packageStatus = "fail";

  const reasons: string[] = [];
  let blocked = false;
  let review = false;

  if (packageStatus === "fail") {
    blocked = true;
    reasons.push(
      input.roundTrip?.status === "fail"
        ? `The emitted scene does not rebuild to the same deck in a clean directory: ${input.roundTrip.reason ?? "see roundTrip"}.`
        : `The package itself has ${packageErrors.length} unresolved defect(s): ${[...new Set(packageErrors.map((issue) => issue.code))].join(", ")}.`,
    );
  }

  const presentationErrors = input.issues.filter(
    (issue) => issue.severity === "error" && PRESENTATION_BLOCKING_CODES.has(issue.code),
  );
  if (presentationErrors.length > 0) {
    blocked = true;
    reasons.push(`${presentationErrors.length} defect(s) the audience would see: ${[...new Set(presentationErrors.map((issue) => issue.code))].join(", ")}.`);
  }

  if (input.fidelity?.status === "fail") {
    blocked = true;
    const missing = input.fidelity.slides.flatMap((slide) => slide.missing).length;
    const truncated = input.fidelity.slides.flatMap((slide) => slide.truncated).length;
    reasons.push(`The render does not show all the intended text: ${missing} missing string(s), ${truncated} truncated.`);
  } else if (input.fidelity?.status === "review") {
    review = true;
    // Uncertainty is uncertainty. OCR that could not read a slide confidently
    // must not be reported as either a pass or a defect.
    reasons.push(`Render text could not be verified with confidence (${input.fidelity.method}, ${input.fidelity.confidence} confidence)${input.fidelity.note ? `: ${input.fidelity.note}` : "."}`);
  }

  const findings = (input.visualFindings ?? []).filter((finding) => !finding.waived);
  const blockingFindings = findings.filter((finding) => finding.severity === "blocking");
  if (blockingFindings.length > 0) {
    blocked = true;
    reasons.push(`${blockingFindings.length} unresolved blocking visual review finding(s): ${blockingFindings.map((finding) => `slide ${finding.slide} — ${finding.observation}`).join("; ")}.`);
  }
  const majorFindings = findings.filter((finding) => finding.severity === "major");
  if (majorFindings.length > 0) {
    review = true;
    reasons.push(`${majorFindings.length} unresolved major visual review finding(s).`);
  }

  if (input.render?.mode === "schematic") {
    review = true;
    reasons.push("Previews are schematic drawings of the geometry, not rendered slides, so nothing has confirmed what the audience will actually see.");
  } else if (!input.render || input.render.status === "skipped") {
    review = true;
    reasons.push("The deck was not rendered, so no evidence of the final appearance exists.");
  }

  for (const dimension of input.heuristics?.dimensions ?? []) {
    const floor = HEURISTIC_FLOORS[dimension.id];
    if (floor !== undefined && dimension.score < floor) {
      review = true;
      reasons.push(`Heuristic floor: ${dimension.id} scored ${dimension.score}, below ${floor}. ${dimension.summary}`);
    }
  }

  if (input.placeholderSlides && input.placeholderSlides > 0) {
    blocked = true;
    reasons.push(`${input.placeholderSlides} slide(s) still contain bracketed placeholders.`);
  }

  if (input.unresolvedClaims?.length) {
    review = true;
    reasons.push(`${input.unresolvedClaims.length} claim(s) are still marked needs-review: ${input.unresolvedClaims.join(", ")}.`);
  }

  const presentationReadiness: ValidationReport["presentationReadiness"] = blocked
    ? "not-ready"
    : review ? "review" : "ready";
  if (presentationReadiness === "ready") reasons.push("No blocking defect, unverified text, or unresolved finding.");

  return { packageStatus, presentationReadiness, readinessReasons: reasons };
}
