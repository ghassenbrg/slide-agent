import { createHash } from "node:crypto";
import { copyFile, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type {
  ArtifactGraph,
  ArtifactIdentity,
  CanvasElementSpec,
  DeckSymbol,
  PresentationOutline,
  SlideSpec,
} from "../types/index.js";
import { ensureDir, exists } from "../utils/files.js";
import { buildTimestamp } from "../utils/reproducible.js";

/**
 * Making a delivered deck portable, and provable.
 *
 * Two failures motivated this. A scene emitted beside a deck referenced images
 * by the author's absolute path, so moving the directory — or handing it to
 * anyone else — broke every rebuild. And a report named its previews by path,
 * so a preview left over from the revision before last still counted as
 * evidence. Content addressing fixes the first; hashing fixes the second.
 *
 * Provenance is kept separately from the package path on purpose. Where a
 * picture came from is a fact about the deck's honesty; where the bytes live
 * is a fact about the package. Collapsing them loses the credit line the
 * licence requires the moment the file is copied.
 */

/**
 * Where packaged assets live, relative to the package root — which is the
 * directory the emitted scene sits in, so a path inside the scene is relative
 * to the scene itself and survives the whole folder being moved.
 */
export const ASSET_DIRECTORY = "assets";

export async function sha256Of(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

/** One artifact, identified by content and located relative to the package. */
export async function identify(
  root: string,
  filePath: string,
  derivedFrom: string[] = [],
): Promise<ArtifactIdentity | undefined> {
  const resolved = path.resolve(filePath);
  if (!(await exists(resolved))) return undefined;
  const info = await stat(resolved);
  if (!info.isFile()) return undefined;
  return {
    path: relativeToPackage(root, resolved),
    sha256: await sha256Of(resolved),
    bytes: info.size,
    ...(derivedFrom.length ? { derivedFrom } : {}),
    createdAt: buildTimestamp().toISOString(),
  };
}

/**
 * A POSIX-style path relative to the package root, so an identity written on
 * Windows still matches the same file on Linux.
 */
export function relativeToPackage(root: string, filePath: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(filePath));
  return relative.split(path.sep).join("/");
}

export interface PackagedAsset {
  /** Path inside the package, e.g. `artifacts/assets/<sha256>.png`. */
  packagePath: string;
  absolutePath: string;
  sha256: string;
  /** What the author originally wrote. Kept as provenance, never as a path. */
  origin: string;
}

/**
 * Copies one asset into the package under its own content hash and returns
 * where it now lives. Copying by hash means the same picture used on nine
 * slides is stored once and can never be confused with a different picture of
 * the same name.
 */
export async function packageAsset(root: string, sourcePath: string, origin: string): Promise<PackagedAsset> {
  const resolved = path.resolve(sourcePath);
  const digest = await sha256Of(resolved);
  const extension = path.extname(resolved).toLowerCase() || ".bin";
  const directory = path.join(root, ASSET_DIRECTORY);
  await ensureDir(directory);
  const absolutePath = path.join(directory, `${digest}${extension}`);
  if (!(await exists(absolutePath))) await copyFile(resolved, absolutePath);
  return {
    packagePath: `${ASSET_DIRECTORY}/${digest}${extension}`,
    absolutePath,
    sha256: digest,
    origin,
  };
}

/** Every image path one canvas references, groups included. */
function canvasImages(canvas: CanvasElementSpec[] | undefined): CanvasElementSpec[] {
  const found: CanvasElementSpec[] = [];
  for (const element of canvas ?? []) {
    if (element.type === "image") found.push(element);
    else if (element.type === "group") found.push(...canvasImages(element.children));
  }
  return found;
}

export interface PortableOutlineResult {
  outline: PresentationOutline;
  assets: PackagedAsset[];
  /** Assets that could not be packaged, with why. */
  unresolved: Array<{ source: string; reason: string }>;
}

/**
 * Rewrites every asset reference in an outline to a path inside the package,
 * copying the bytes in as it goes.
 *
 * The emitted scene is what a later rebuild reads, so it must not carry a
 * single path that only exists on the machine that built it. The author's
 * original reference survives as `provenance.source`, because that is the
 * answer to "where did this picture come from" — which stays true after the
 * package moves, and which the licence may require.
 */
export async function makeOutlinePortable(
  root: string,
  outline: PresentationOutline,
  resolvedPathFor: (element: CanvasElementSpec) => string | undefined,
): Promise<PortableOutlineResult> {
  const assets: PackagedAsset[] = [];
  const unresolved: Array<{ source: string; reason: string }> = [];
  const byOrigin = new Map<string, PackagedAsset>();

  const packageOne = async (element: CanvasElementSpec): Promise<CanvasElementSpec> => {
    if (element.type === "group") {
      return { ...element, children: await Promise.all(element.children.map(packageOne)) };
    }
    if (element.type !== "image") return element;
    const origin = String(element.provenance?.source ?? element.path);
    const local = resolvedPathFor(element) ?? element.path;
    const cached = byOrigin.get(origin);
    if (cached) {
      return { ...element, path: cached.packagePath, provenance: { ...element.provenance, source: origin } };
    }
    if (!(await exists(local))) {
      unresolved.push({ source: origin, reason: `The resolved file does not exist: ${local}` });
      return element;
    }
    const packaged = await packageAsset(root, local, origin);
    assets.push(packaged);
    byOrigin.set(origin, packaged);
    const vector = element.vector && await exists(path.resolve(element.vector.path))
      ? await packageAsset(root, element.vector.path, element.vector.source ?? element.vector.path)
      : undefined;
    if (vector) assets.push(vector);
    return {
      ...element,
      path: packaged.packagePath,
      provenance: { ...element.provenance, source: origin },
      ...(vector && element.vector ? { vector: { ...element.vector, path: vector.packagePath } } : {}),
    };
  };

  const slides: SlideSpec[] = await Promise.all(outline.slides.map(async (slide) => (
    slide.canvas ? { ...slide, canvas: await Promise.all(slide.canvas.map(packageOne)) } : slide
  )));
  const symbols: DeckSymbol[] | undefined = outline.symbols
    ? await Promise.all(outline.symbols.map(async (symbol) => ({
      ...symbol,
      elements: await Promise.all(symbol.elements.map(packageOne)),
    })))
    : undefined;

  return {
    outline: { ...outline, slides, ...(symbols ? { symbols } : {}) },
    assets,
    unresolved,
  };
}

/** Every asset an outline references, for a freshness check. */
export function referencedAssetPaths(outline: PresentationOutline): string[] {
  const paths = new Set<string>();
  const collect = (canvas: CanvasElementSpec[] | undefined) => {
    for (const element of canvasImages(canvas)) {
      if (element.type !== "image") continue;
      paths.add(element.path);
      if (element.vector) paths.add(element.vector.path);
    }
  };
  for (const slide of outline.slides) collect(slide.canvas);
  for (const symbol of outline.symbols ?? []) collect(symbol.elements);
  return [...paths];
}

export interface ArtifactGraphInput {
  root: string;
  pptx: string;
  scene?: string;
  manifest?: string;
  validation?: string;
  review?: string;
  pdf?: string;
  previews?: string[];
  assets?: string[];
  render: ArtifactGraph["render"];
}

/**
 * Binds the whole delivery together by content.
 *
 * Every derived artifact records what it came from, so a reader can prove the
 * preview in front of them was rendered from the PPTX the report describes —
 * rather than trusting that two files that sit near each other belong to the
 * same build.
 */
export async function buildArtifactGraph(input: ArtifactGraphInput): Promise<ArtifactGraph> {
  const root = path.resolve(input.root);
  const pptx = await identify(root, input.pptx);
  if (!pptx) {
    throw new Error(`Cannot build an artifact graph: the presentation does not exist at ${input.pptx}.`);
  }
  const fromDeck = [pptx.path];
  const scene = input.scene ? await identify(root, input.scene, fromDeck) : undefined;
  const manifest = input.manifest ? await identify(root, input.manifest, fromDeck) : undefined;
  const pdf = input.pdf ? await identify(root, input.pdf, fromDeck) : undefined;
  const previews = (await Promise.all(
    (input.previews ?? []).map((preview) => identify(root, preview, pdf ? [pptx.path, pdf.path] : fromDeck)),
  )).filter((entry): entry is ArtifactIdentity => Boolean(entry));
  const validation = input.validation
    ? await identify(root, input.validation, [pptx.path, ...(manifest ? [manifest.path] : []), ...previews.map((entry) => entry.path)])
    : undefined;
  const review = input.review ? await identify(root, input.review, [pptx.path, ...previews.map((entry) => entry.path)]) : undefined;
  const assets = (await Promise.all((input.assets ?? []).map((asset) => identify(root, asset))))
    .filter((entry): entry is ArtifactIdentity => Boolean(entry));

  return {
    schemaVersion: "1.0",
    root: path.basename(root),
    pptx,
    ...(scene ? { scene } : {}),
    ...(manifest ? { manifest } : {}),
    ...(validation ? { validation } : {}),
    ...(review ? { review } : {}),
    ...(pdf ? { pdf } : {}),
    previews,
    assets,
    render: input.render,
  };
}

/**
 * Re-checks a graph against the files on disk.
 *
 * This is what makes a stale preview impossible to report as evidence: the
 * hash recorded at render time either still matches the bytes now, or the
 * artifact is not describing this deck.
 */
export async function verifyArtifactGraph(root: string, graph: ArtifactGraph): Promise<Array<{
  path: string;
  problem: "missing" | "changed";
}>> {
  const entries: ArtifactIdentity[] = [
    graph.pptx,
    ...(graph.scene ? [graph.scene] : []),
    ...(graph.manifest ? [graph.manifest] : []),
    ...(graph.pdf ? [graph.pdf] : []),
    ...graph.previews,
    ...graph.assets,
  ];
  const problems: Array<{ path: string; problem: "missing" | "changed" }> = [];
  for (const entry of entries) {
    const absolute = path.resolve(root, entry.path);
    if (!(await exists(absolute))) {
      problems.push({ path: entry.path, problem: "missing" });
      continue;
    }
    if (await sha256Of(absolute) !== entry.sha256) problems.push({ path: entry.path, problem: "changed" });
  }
  return problems;
}
