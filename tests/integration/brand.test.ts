import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyBrandKit, loadBrandKit, logoAppliesTo } from "../../src/design/brand.js";
import { SlideAgent } from "../../src/pipeline.js";
import { silentLogger } from "../../src/logging/logger.js";
import { outputLayout } from "../../src/output/output-layout.js";
import type { DeckManifest, PresentationOutline } from "../../src/types/index.js";

const root = path.resolve(import.meta.dirname, "../..");
const configDir = path.join(root, "config");
let workspace: string;
let brandPath: string;

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

const outline: PresentationOutline = {
  brief: {
    title: "Brand fixture",
    audience: "Reviewers",
    objective: "Verify brand-kit application",
    presentationType: "business",
    tone: "confident",
    visualDirection: "editorial",
    slideCount: 3,
    language: "English",
    outputRequirements: ["editable PowerPoint"],
    keyTopics: ["brand"],
    sourcePrompt: "brand test",
  },
  narrative: "Apply the brand without flattening the design.",
  creativeDirection: {
    name: "Model direction",
    palette: { accent: "FF00AA", background: "FFFFFF" },
    typography: { heading: "Georgia", body: "Palatino" },
  },
  slides: [
    { id: "title", kind: "title", title: "Brand fixture", subtitle: "With a mark", sectionLabel: "TEST" },
    { id: "body", kind: "text-image", title: "A content slide", body: "Body copy.", bullets: ["One", "Two"] },
    { id: "closing", kind: "closing", title: "The ask", subtitle: "Approve it", bullets: ["Decide"] },
  ],
};

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-brand-"));
  await mkdir(path.join(workspace, "assets"), { recursive: true });
  await writeFile(path.join(workspace, "assets", "logo.png"), PNG);
  brandPath = path.join(workspace, "brand.json");
  await writeFile(brandPath, JSON.stringify({
    name: "Northwind",
    palette: { accent: "0B5FFF", ink: "0A0A0A" },
    typography: { heading: "Arial", body: "Arial" },
    logo: { path: "assets/logo.png", placement: "bottom-right", widthInches: 1, slides: "title-and-closing" },
    footer: { text: "Northwind Confidential", slides: "all" },
    avoid: ["rounded corners"],
    locked: ["palette"],
  }, null, 2), "utf8");
});
afterAll(async () => { await rm(workspace, { recursive: true, force: true }); });

async function manifestFor(deck: string): Promise<DeckManifest> {
  return JSON.parse(await readFile(outputLayout(deck).manifest, "utf8")) as DeckManifest;
}

describe("brand kit", () => {
  it("resolves logo paths relative to the brand file", async () => {
    const kit = await loadBrandKit(brandPath);
    expect(path.isAbsolute(kit.logo!.path)).toBe(true);
    expect(kit.logo!.path).toBe(path.join(workspace, "assets", "logo.png"));
  });

  it("rejects a malformed kit with the offending field", async () => {
    const bad = path.join(workspace, "bad.json");
    await writeFile(bad, JSON.stringify({ name: "X", palette: { accent: "not-a-colour" } }), "utf8");
    await expect(loadBrandKit(bad)).rejects.toMatchObject({ code: "BRAND_KIT_INVALID" });
    await expect(loadBrandKit(path.join(workspace, "missing.json"))).rejects.toMatchObject({ code: "BRAND_KIT_NOT_FOUND" });
  });

  it("lets a locked aspect override the model and an unlocked one only fill gaps", async () => {
    const kit = await loadBrandKit(brandPath);
    const branded = applyBrandKit(outline, kit);
    // palette is locked, so the brand accent wins over the model's FF00AA.
    expect(branded.creativeDirection!.palette!.accent).toBe("0B5FFF");
    // typography is not locked, so the model keeps Georgia.
    expect(branded.creativeDirection!.typography!.heading).toBe("Georgia");
    expect(branded.creativeDirection!.avoid).toContain("rounded corners");
  });

  it("places the mark only on the slides the kit asks for", async () => {
    const kit = await loadBrandKit(brandPath);
    expect(logoAppliesTo(kit, 1, 3)).toBe(true);
    expect(logoAppliesTo(kit, 2, 3)).toBe(false);
    expect(logoAppliesTo(kit, 3, 3)).toBe(true);
  });

  it("stamps the logo and legal footer into the built deck", async () => {
    const output = path.join(workspace, "branded.pptx");
    const result = await new SlideAgent(silentLogger).create({
      command: "create",
      outline,
      output,
      configDir,
      brand: brandPath,
      validate: true,
    });
    expect(result.status, JSON.stringify(result.errors)).not.toBe("error");

    const manifest = await manifestFor(output);
    const names = manifest.slides.map((slide) => slide.elements.map((element) => element.name));
    expect(names[0]).toContain("brand-logo");
    expect(names[1]).not.toContain("brand-logo");
    expect(names[2]).toContain("brand-logo");
    for (const slideNames of names) expect(slideNames).toContain("brand-footer");

    const footer = manifest.slides[1]!.elements.find((element) => element.name === "brand-footer")!;
    expect(footer.text).toBe("Northwind Confidential");
    expect(manifest.creativeDirection!.palette!.accent).toBe("0B5FFF");
  });

  it("honours the brand's exclusions in the rendered geometry", async () => {
    const output = path.join(workspace, "squared.pptx");
    await new SlideAgent(silentLogger).create({
      command: "create",
      outline: { ...outline, creativeDirection: { ...outline.creativeDirection, geometry: "soft" } },
      output,
      configDir,
      brand: brandPath,
      validate: false,
    });
    const manifest = await manifestFor(output);
    // The kit forbids rounded corners, so no panel may carry a radius even
    // though the direction asked for soft geometry.
    const radii = manifest.slides.flatMap((slide) =>
      slide.elements.filter((element) => element.type === "shape").map((element) => element.metadata?.radius),
    );
    expect(radii.every((radius) => !radius)).toBe(true);
  });
});
