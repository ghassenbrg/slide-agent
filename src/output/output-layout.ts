import path from "node:path";

export interface OutputLayout {
  root: string;
  baseName: string;
  pptx: string;
  pdf: string;
  artifacts: string;
  images: string;
  beforeImages: string;
  generatedAssets: string;
  intermediateFiles: string;
  logs: string;
  temporaryFiles: string;
  manifest: string;
  inspect: string;
  metadata: string;
  validation: string;
  beforePdf: string;
}

export function outputLayout(outputPath: string): OutputLayout {
  const pptx = path.resolve(outputPath);
  const root = path.dirname(pptx);
  const baseName = path.basename(pptx, path.extname(pptx));
  const artifacts = path.join(root, "artifacts");
  const images = path.join(artifacts, "images");
  const intermediateFiles = path.join(artifacts, "intermediate_files");
  const logs = path.join(artifacts, "logs");
  return {
    root,
    baseName,
    pptx,
    pdf: path.join(root, `${baseName}.pdf`),
    artifacts,
    images,
    beforeImages: path.join(images, "before"),
    generatedAssets: path.join(artifacts, "generated_assets"),
    intermediateFiles,
    logs,
    temporaryFiles: path.join(artifacts, "temporary_files"),
    manifest: path.join(intermediateFiles, `${baseName}.manifest.json`),
    inspect: path.join(intermediateFiles, `${baseName}.inspect.ndjson`),
    metadata: path.join(logs, `${baseName}.metadata.json`),
    validation: path.join(logs, `${baseName}.validation.json`),
    beforePdf: path.join(intermediateFiles, `${baseName}.before.pdf`),
  };
}
