import { copyFile, mkdtemp, readdir, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Logger } from "../logging/logger.js";
import { silentLogger } from "../logging/logger.js";
import type { RenderResult } from "../types/index.js";
import { SlideAgentError } from "../utils/errors.js";
import { ensureDir, exists } from "../utils/files.js";
import { findExecutable, runProcess } from "../utils/process.js";

function slideNumber(fileName: string): number {
  return Number(fileName.match(/-(\d+)\.png$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

export class PresentationRenderer {
  public constructor(private readonly logger: Logger = silentLogger) {}

  public async render(inputPath: string, outputDir: string, options: { width?: number; height?: number; pdfPath?: string } = {}): Promise<RenderResult> {
    const input = path.resolve(inputPath);
    if (!(await exists(input))) throw new SlideAgentError("INPUT_NOT_FOUND", `Presentation not found: ${input}`);
    const output = await ensureDir(outputDir);
    for (const fileName of await readdir(output)) {
      if (/^slide-\d+\.png$/.test(fileName)) await unlink(path.join(output, fileName));
    }
    const soffice = await findExecutable(["soffice", "libreoffice"], process.env.SLIDE_AGENT_SOFFICE);
    const pdftoppm = await findExecutable(["pdftoppm"], process.env.SLIDE_AGENT_PDFTOPPM);
    if (!soffice || !pdftoppm) {
      throw new SlideAgentError(
        "RENDER_DEPENDENCY_MISSING",
        "Rendering requires LibreOffice (soffice) and Poppler (pdftoppm).",
        { soffice: soffice ?? null, pdftoppm: pdftoppm ?? null },
      );
    }

    const temporary = await mkdtemp(path.join(tmpdir(), "slide-agent-render-"));
    try {
      this.logger.info("render.start", "Rendering presentation", { input, output });
      const profile = path.join(temporary, "lo-profile");
      const conversion = await runProcess(soffice, [
        "--headless",
        `-env:UserInstallation=file://${profile}`,
        "--convert-to",
        "pdf",
        "--outdir",
        temporary,
        input,
      ]);
      if (conversion.exitCode !== 0) {
        throw new SlideAgentError("LIBREOFFICE_RENDER_FAILED", "LibreOffice could not convert the presentation to PDF.", {
          stdout: conversion.stdout,
          stderr: conversion.stderr,
          exitCode: conversion.exitCode,
        });
      }
      const convertedPdf = path.join(temporary, `${path.basename(input, path.extname(input))}.pdf`);
      if (!(await exists(convertedPdf))) {
        throw new SlideAgentError("PDF_NOT_CREATED", "LibreOffice reported success but did not create a PDF.", {
          temporary,
          stdout: conversion.stdout,
        });
      }
      const pdfPath = path.resolve(options.pdfPath ?? path.join(output, `${path.basename(input, path.extname(input))}.pdf`));
      await ensureDir(path.dirname(pdfPath));
      await copyFile(convertedPdf, pdfPath);
      const prefix = path.join(output, "slide");
      const width = options.width ?? 1600;
      const height = options.height ?? 900;
      const raster = await runProcess(pdftoppm, [
        "-png",
        "-scale-to-x",
        String(width),
        "-scale-to-y",
        String(height),
        pdfPath,
        prefix,
      ]);
      if (raster.exitCode !== 0) {
        throw new SlideAgentError("PDF_RASTER_FAILED", "Poppler could not rasterize the rendered PDF.", {
          stdout: raster.stdout,
          stderr: raster.stderr,
          exitCode: raster.exitCode,
        });
      }
      const previewFiles = (await readdir(output))
        .filter((fileName) => /^slide-\d+\.png$/.test(fileName))
        .sort((left, right) => slideNumber(left) - slideNumber(right))
        .map((fileName) => path.join(output, fileName));
      if (previewFiles.length === 0) throw new SlideAgentError("NO_PREVIEWS_CREATED", "Rendering produced no slide images.");
      for (const preview of previewFiles) {
        if ((await stat(preview)).size < 512) {
          throw new SlideAgentError("EMPTY_PREVIEW", `Rendered preview is unexpectedly small: ${preview}`);
        }
      }
      this.logger.info("render.complete", "Rendered presentation", { slides: previewFiles.length, output });
      return { previewFiles, pdfPath, width, height };
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}
