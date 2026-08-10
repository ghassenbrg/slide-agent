import path from "node:path";

import type { NativePresentation } from "../components/pptx-values.js";
import type { ColorsConfig } from "../types/index.js";
import { ensureDir } from "../utils/files.js";
import { writeThemeColors } from "../themes/theme-manager.js";
import { PptxSanitizer } from "./pptx-sanitizer.js";
import type { ShapePostProcess } from "./pptx-postprocess.js";

export class PptxExporter {
  /**
   * `colors` writes the deck's palette into the theme's colour scheme.
   * PptxGenJS only exposes the two typefaces, so without this the package
   * carries the stock Office scheme while the slides carry the model's
   * palette — the deck looks right but its theme lies about it, which shows up
   * the moment anyone picks a "theme colour" in PowerPoint or reads the deck
   * back as a template.
   *
   * `postProcess` carries the authored properties PptxGenJS cannot emit, keyed
   * by element id, and is applied to the package's slide parts on the way out.
   */
  public async export(
    presentation: NativePresentation,
    outputPath: string,
    colors?: ColorsConfig,
    postProcess: ShapePostProcess[] = [],
  ): Promise<string> {
    const resolved = path.resolve(outputPath);
    if (path.extname(resolved).toLowerCase() !== ".pptx") {
      throw new Error(`PowerPoint output must end in .pptx: ${resolved}`);
    }
    await ensureDir(path.dirname(resolved));
    await presentation.writeFile({ fileName: resolved, compression: true });
    if (colors) await writeThemeColors(resolved, colors);
    await new PptxSanitizer().sanitizeFile(resolved, postProcess);
    return resolved;
  }
}
