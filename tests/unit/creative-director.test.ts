import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/load-config.js";
import { CreativeDirector } from "../../src/themes/creative-director.js";
import type { PresentationOutline } from "../../src/types/index.js";

const configDir = path.resolve(import.meta.dirname, "../../config");

function outline(title: string, visualDirection: string): PresentationOutline {
  return {
    brief: {
      title,
      audience: "Decision-makers",
      objective: "Make a clear decision",
      presentationType: "proposal",
      tone: "confident",
      visualDirection,
      slideCount: 1,
      language: "English",
      outputRequirements: ["editable PowerPoint"],
      keyTopics: [],
      sourcePrompt: title,
    },
    narrative: "Decision",
    slides: [{ id: "one", kind: "custom", title, canvas: [] }],
  };
}

describe("CreativeDirector", () => {
  it("derives different fallback systems instead of one package theme", async () => {
    const config = await loadConfig(configDir);
    const director = new CreativeDirector();
    const first = director.resolve(outline("A botanical field guide", "quiet, organic, sunlit"), config);
    const second = director.resolve(outline("A neon observability console", "dark, kinetic, technical"), config);
    expect(first.config.colors).not.toEqual(second.config.colors);
    expect(first.direction.name).toBe("Prompt-derived original direction");
  });

  it("accepts a model's arbitrary art direction as the design authority", async () => {
    const config = await loadConfig(configDir);
    const input = outline("Independent design", "model-authored");
    input.creativeDirection = {
      name: "Electric papercut",
      concept: "Layered fluorescent paper under hard editorial type",
      palette: { background: "101014", ink: "F8F5E8", accent: "FF4FD8", accentAlt: "B8FF32" },
      typography: { display: "Georgia", body: "Helvetica Neue", mono: "Menlo" },
      diagramLanguage: "Irregular constellations joined by hairline arrows",
    };
    const resolved = new CreativeDirector().resolve(input, config);
    expect(resolved.config.colors.accent).toBe("FF4FD8");
    expect(resolved.config.fonts.heading).toBe("Georgia");
    expect(resolved.config.fonts.body).toBe("Helvetica Neue");
    expect(resolved.config.fonts.supported).toContain("Menlo");
    expect(resolved.direction.diagramLanguage).toContain("constellations");
  });
});
