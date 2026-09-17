import { describe, expect, it } from "vitest";

import * as v2 from "../../../src/v2/index.js";
import { fixtureRegistry } from "./helpers.js";

/**
 * The `./v2` barrel is the SDK surface. Exporting a class without the types its
 * only method takes makes that class unusable from outside the package, which
 * is how `TextEngine` shipped until `parseRichText` joined it here.
 */
describe("public API", () => {
  it("exports the entry points the documentation names", () => {
    for (const name of [
      "Engine", "validateIntent", "buildScene", "applyEdits", "fillDecks", "inspectFile", "importTemplate",
      "compileDesign", "themeToDtcg", "languageFromDtcg", "presetLanguage",
      "TextEngine", "parseRichText", "sharedFontRegistry", "fetchFamily", "searchFamilies",
      "solveSlide", "RECIPES", "getRecipe", "rhythmNotes", "interDeckSimilarity",
      "writePackage", "SvgRenderer", "svgToPng", "buildVerdict", "readiness",
      "COMMANDS", "catalog", "GRAMMAR", "SKILL_V2", "buildV2McpServer",
      "generateDeck", "resolveProfile", "BudgetGuard", "migrateOutline", "searchIcons",
    ]) {
      expect(v2, name).toHaveProperty(name);
    }
  });

  it("can measure a line of text using only what it exports", async () => {
    const text = new v2.TextEngine(fixtureRegistry());
    const face = await text.load({ family: "Inter", weight: 400, italic: false });
    const laid = text.layout({
      paragraphs: v2.parseRichText("Waves fail at the pilot, not in production"),
      size: 32,
      leading: 1.1,
      width: 5.2,
      faceFor: () => face,
    });
    expect(laid.lineCount).toBeGreaterThan(1);
    expect(laid.height).toBeGreaterThan(0);
    expect(laid.widest).toBeLessThanOrEqual(5.2);
    expect(v2.plainText(v2.parseRichText("a\nb"))).toContain("a");
  });
});
