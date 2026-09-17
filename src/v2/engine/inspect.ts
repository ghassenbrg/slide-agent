import { PptxInspector } from "../../editing/pptx-inspector.js";
import { assertInsideWorkspace } from "../../security/policy.js";
import { importTemplate } from "./brand.js";

/**
 * What a foreign deck or template holds, compactly: layouts and their
 * placeholders, the brand tokens and locks a build would inherit, and a
 * per-slide outline. Paged so a large deck stays within a response budget.
 */
export async function inspectFile(file: string, options: { page?: number; pageSize?: number } = {}): Promise<Record<string, unknown>> {
  const resolved = assertInsideWorkspace(file, "file");
  const pageSize = options.pageSize ?? 15;
  const page = Math.max(0, options.page ?? 0);
  const [inspection, brand] = await Promise.all([
    new PptxInspector().inspect(resolved),
    importTemplate(resolved).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })),
  ]);
  const slides = inspection.manifest.slides;
  const outline = slides.slice(page * pageSize, (page + 1) * pageSize).map((slide) => {
    const texts = slide.elements.filter((element) => element.text).map((element) => ({ name: element.name, text: String(element.text).replace(/\s+/g, " ").slice(0, 90) }));
    return {
      slide: slide.number,
      title: slide.title || texts[0]?.text || "",
      elements: slide.elements.length,
      text: texts.slice(1, 5).map((entry) => entry.text),
    };
  });
  return {
    file: resolved,
    slides: slides.length,
    size: { width: inspection.manifest.width, height: inspection.manifest.height },
    ...("error" in brand
      ? { brandError: brand.error }
      : {
          brand: {
            name: brand.name,
            palette: brand.language.color.palette,
            fonts: { display: brand.language.type.display.family, body: brand.language.type.body.family },
            locks: brand.locks,
            use: `design: {"brand": "${file}"} — the model still writes the concept, unlocked language, and compositions`,
          },
          layouts: brand.layouts.map((layout) => ({ name: layout.name, type: layout.type, placeholders: layout.placeholders.map((placeholder) => `${placeholder.type}${placeholder.idx !== undefined ? `#${placeholder.idx}` : ""}`) })),
        }),
    outline,
    page,
    pages: Math.ceil(slides.length / pageSize),
    warnings: inspection.warnings.slice(0, 10),
    unsupportedFeatures: inspection.unsupportedFeatures,
  };
}
