import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/load-config.js";
import type { DeckManifest } from "../../src/types/index.js";
import { ManifestValidator } from "../../src/validation/manifest-validator.js";

describe("ManifestValidator", () => {
  it("detects intentional fixture problems", async () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const manifest = JSON.parse(await readFile(path.join(root, "tests/fixtures/invalid-layout.pptx.manifest.json"), "utf8")) as DeckManifest;
    const issues = new ManifestValidator(await loadConfig(path.join(root, "config"))).validate(manifest);
    const codes = new Set(issues.map((item) => item.code));
    expect(codes).toContain("object-outside-slide");
    expect(codes).toContain("overlapping-elements");
    expect(codes).toContain("text-overflow");
    expect(codes).toContain("font-too-small");
    expect(codes).toContain("poor-contrast");
    expect(codes).toContain("missing-image");
    expect(codes).toContain("unsupported-font");
    expect(codes).toContain("misaligned-elements");
  });
});
