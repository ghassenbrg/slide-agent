import path from "node:path";

/**
 * One canonical place for everything a build produces.
 *
 * The previous layout scattered the deck's own blueprint under
 * `artifacts/intermediate_files/<name>.inspect.ndjson`, the report under
 * `artifacts/logs/`, and the PDF beside the deck. Nothing was wrong with it
 * except that a delivered package had no single root a reader could point at,
 * and asset paths inside the scene were absolute — so moving the directory
 * broke every rebuild.
 *
 * `artifacts/` is now that root: the scene, the manifest, the reports, the
 * previews, the PDF, and the content-addressed assets all live under it, and
 * every asset path inside the scene is relative to the scene's own directory.
 * Move the folder anywhere and it still rebuilds.
 *
 * One deviation from the roadmap's sketch, which showed the canonical files
 * directly under `artifacts/`: they sit under `artifacts/<deck name>/`. Two
 * decks built into the same directory would otherwise share one
 * `manifest.json`, and the second build would silently overwrite the first
 * deck's blueprint — a worse failure than the one this layout set out to fix.
 * The names inside are the canonical ones, and a package with a single deck
 * still moves as a unit.
 */

export interface OutputLayout {
  root: string;
  baseName: string;
  pptx: string;
  pdf: string;
  /** `<root>/artifacts` — the shared root all packages live under. */
  artifactsRoot: string;
  /** `<root>/artifacts/<deck name>` — this deck's own package. */
  artifacts: string;
  /** Content-addressed copies of every asset the deck embeds. */
  assets: string;
  images: string;
  beforeImages: string;
  generatedAssets: string;
  logs: string;
  temporaryFiles: string;
  manifest: string;
  /** The round-trippable deck blueprint. */
  inspect: string;
  metadata: string;
  validation: string;
  review: string;
  beforePdf: string;
  /** Paths earlier versions wrote to, still read when discovering a package. */
  legacy: {
    manifest: string;
    inspect: string;
    metadata: string;
    validation: string;
    images: string;
    pdf: string;
  };
}

export function outputLayout(outputPath: string): OutputLayout {
  const pptx = path.resolve(outputPath);
  const root = path.dirname(pptx);
  const baseName = path.basename(pptx, path.extname(pptx));
  const artifactsRoot = path.join(root, "artifacts");
  const artifacts = path.join(artifactsRoot, baseName);
  const legacyIntermediate = path.join(artifactsRoot, "intermediate_files");
  const legacyLogs = path.join(artifactsRoot, "logs");
  return {
    root,
    baseName,
    pptx,
    pdf: path.join(artifacts, "deck.pdf"),
    artifactsRoot,
    artifacts,
    assets: path.join(artifacts, "assets"),
    images: path.join(artifacts, "previews"),
    beforeImages: path.join(artifacts, "previews", "before"),
    generatedAssets: path.join(artifacts, "generated_assets"),
    logs: legacyLogs,
    temporaryFiles: path.join(artifacts, "temporary_files"),
    manifest: path.join(artifacts, "manifest.json"),
    inspect: path.join(artifacts, "scene.ndjson"),
    metadata: path.join(artifacts, "metadata.json"),
    validation: path.join(artifacts, "validation.json"),
    review: path.join(artifacts, "review.json"),
    beforePdf: path.join(artifacts, "before.pdf"),
    legacy: {
      manifest: path.join(legacyIntermediate, `${baseName}.manifest.json`),
      inspect: path.join(legacyIntermediate, `${baseName}.inspect.ndjson`),
      metadata: path.join(legacyLogs, `${baseName}.metadata.json`),
      validation: path.join(legacyLogs, `${baseName}.validation.json`),
      images: path.join(artifactsRoot, "images"),
      pdf: path.join(root, `${baseName}.pdf`),
    },
  };
}
