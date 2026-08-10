import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { DeckManifest, RoundTripReport } from "../types/index.js";
import { exists, readUtf8 } from "../utils/files.js";

/**
 * Proving the emitted scene actually rebuilds the deck.
 *
 * A scene that parses is not a scene that reproduces. The only way to know is
 * to take the package somewhere else, with nothing but what the package
 * contains, and build it again — which is exactly the situation of the person
 * who receives the deliverable, and exactly the case that used to break
 * silently when the scene held the author's own absolute image paths.
 *
 * The rebuild happens in a fresh temporary directory with the artifacts copied
 * in and nothing else, so anything the original build needed from outside the
 * package shows up here as a failure rather than at the recipient's end.
 */

/** Properties whose drift would change what the audience sees. */
const COMPARED_PROPERTIES = [
  "type", "role", "text", "fontSize", "fontFace", "textColor", "fillColor", "altText", "editability",
] as const;

const GEOMETRY_TOLERANCE = 0.005;

export interface RoundTripOptions {
  /** The delivered package root: the directory holding `artifacts/`. */
  root: string;
  /** The emitted scene, inside that package. */
  scenePath: string;
  /** The manifest the original build produced. */
  manifest: DeckManifest;
  /**
   * Builds the scene at `scenePath` into `outputPath` and returns the manifest
   * it produced. Injected so this module never depends on the pipeline that
   * calls it.
   */
  rebuild: (scenePath: string, outputPath: string) => Promise<DeckManifest | undefined>;
}

export async function verifyRoundTrip(options: RoundTripOptions): Promise<RoundTripReport> {
  if (!(await exists(options.scenePath))) {
    return { status: "skipped", reason: `No emitted scene was found at ${options.scenePath}.` };
  }
  const workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-roundtrip-"));
  try {
    const artifacts = path.join(options.root, "artifacts");
    if (!(await exists(artifacts))) {
      return { status: "skipped", reason: `No artifacts directory was found beside the deck at ${artifacts}.` };
    }
    // Only `artifacts/` travels. If the deck needs anything outside it, the
    // rebuild has to fail here rather than at whoever receives the package.
    await cp(artifacts, path.join(workspace, "artifacts"), { recursive: true });
    const scene = path.join(workspace, "artifacts", path.relative(artifacts, options.scenePath));
    if (!(await exists(scene))) {
      return { status: "fail", reason: `The scene is not inside the package's artifacts directory, so the package cannot rebuild on its own: ${options.scenePath}.` };
    }
    // Read it once to fail early and clearly on an unreadable blueprint.
    await readUtf8(scene);

    const rebuilt = await options.rebuild(scene, path.join(workspace, "rebuilt.pptx"));
    if (!rebuilt) {
      return { status: "fail", reason: "Rebuilding the emitted scene in a clean directory produced no deck. The package is not self-contained." };
    }
    return compareManifests(options.manifest, rebuilt);
  } catch (error) {
    return {
      status: "fail",
      reason: `Rebuilding the emitted scene in a clean directory failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export function compareManifests(original: DeckManifest, rebuilt: DeckManifest): RoundTripReport {
  const slideCountMatches = original.slides.length === rebuilt.slides.length;
  const missingElementIds: string[] = [];
  const changedProperties: NonNullable<RoundTripReport["changedProperties"]> = [];

  for (const slide of original.slides) {
    const other = rebuilt.slides.find((candidate) => candidate.number === slide.number);
    if (!other) {
      missingElementIds.push(...slide.elements.map((element) => `slide ${slide.number}: ${element.id}`));
      continue;
    }
    const byName = new Map(other.elements.map((element) => [element.name, element]));
    for (const element of slide.elements) {
      const rebuiltElement = byName.get(element.name);
      if (!rebuiltElement) {
        missingElementIds.push(`slide ${slide.number}: ${element.name}`);
        continue;
      }
      for (const property of COMPARED_PROPERTIES) {
        const before = element[property];
        const after = rebuiltElement[property];
        if (before !== after) {
          changedProperties.push({ slide: slide.number, elementId: element.name, property, before, after });
        }
      }
      for (const axis of ["x", "y", "w", "h"] as const) {
        if (Math.abs(element[axis] - rebuiltElement[axis]) > GEOMETRY_TOLERANCE) {
          changedProperties.push({ slide: slide.number, elementId: element.name, property: axis, before: element[axis], after: rebuiltElement[axis] });
        }
      }
    }
  }

  const elementIdsMatch = missingElementIds.length === 0;
  const status: RoundTripReport["status"] = slideCountMatches && elementIdsMatch && changedProperties.length === 0
    ? "pass"
    : "fail";
  return {
    status,
    slideCountMatches,
    elementIdsMatch,
    ...(missingElementIds.length ? { missingElementIds } : {}),
    ...(changedProperties.length ? { changedProperties } : {}),
    ...(status === "fail"
      ? {
        reason: [
          slideCountMatches ? "" : `slide count ${original.slides.length} → ${rebuilt.slides.length}`,
          elementIdsMatch ? "" : `${missingElementIds.length} element(s) missing from the rebuild`,
          changedProperties.length ? `${changedProperties.length} property difference(s)` : "",
        ].filter(Boolean).join("; "),
      }
      : {}),
  };
}
