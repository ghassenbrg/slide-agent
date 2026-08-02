import path from "node:path";

import type { NativePresentation } from "../components/pptx-values.js";
import { ensureDir } from "../utils/files.js";
import { PptxSanitizer } from "./pptx-sanitizer.js";

export class PptxExporter {
  public async export(presentation: NativePresentation, outputPath: string): Promise<string> {
    const resolved = path.resolve(outputPath);
    if (path.extname(resolved).toLowerCase() !== ".pptx") {
      throw new Error(`PowerPoint output must end in .pptx: ${resolved}`);
    }
    await ensureDir(path.dirname(resolved));
    await presentation.writeFile({ fileName: resolved, compression: true });
    await new PptxSanitizer().sanitizeFile(resolved);
    return resolved;
  }
}
