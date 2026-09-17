/**
 * The V2 engine's public API. One core, many surfaces: the CLI, the MCP
 * server, and this module are all generated from or built on the same pieces.
 */

export { Engine, SlideEngine, type BuildRequest, type BuildResult, type EngineOptions } from "./engine/engine.js";
export { buildScene, validateIntent, type BuildContext, type BuiltScene } from "./engine/scene-builder.js";
export { applyEdits, expandRecipeSlide, getAt, insertAt, removeAt, setAt, stripMetadata } from "./engine/edits.js";
export { fillDecks, fillTemplate, type FillRequest } from "./engine/fill.js";
export { inspectFile } from "./engine/inspect.js";
export { importTemplate, resolveBrand, type BrandPack } from "./engine/brand.js";

export * from "./ir/index.js";

export { compileDesign, resolveColor, roleColor, themeToDtcg, languageFromDtcg, COMPILER_VERSION, type ThemeSpec } from "./tokens/compile.js";
export { contrastRatio, nearestPassing, oklchToHex, hexToOklch, parseColor, simulateCvd, tint } from "./tokens/color.js";
export { presetLanguage, presetNames } from "./tokens/presets.js";

export { TextEngine, type LoadedFace } from "./text/measure.js";
export { FontRegistry, sharedFontRegistry, fontCacheDirectory, systemFontDirectories } from "./text/registry.js";
export { fetchFamily, fontDownloadsAllowed } from "./text/fetch.js";
export { searchFamilies, OPEN_FAMILIES, OFFICE_FAMILIES } from "./text/catalog.js";
export { parseFaces, embeddingAllowed, GlyphMetrics } from "./text/sfnt.js";

export { solveSlide, preloadFaces, type SolvedSlide } from "./layout/solve.js";
export { RECIPES, STARTER_COMPONENTS, getRecipe, recipeFamilies, RECIPES_VERSION, type Recipe } from "./compose/recipes.js";
export { selectRecipe, checkSlots, contentFor } from "./compose/selector.js";
export { rhythmNotes, signature, similarity, interDeckSimilarity } from "./compose/rhythm.js";
export { expandNode, substitute, applyAdjustments } from "./compose/expand.js";

export { writePackage, WRITER_VERSION, type WriteResult } from "./ooxml/writer.js";
export { subsetTrueType, toEot } from "./ooxml/fonts.js";
export { pathsToCustGeom, parsePath } from "./ooxml/custgeom.js";

export { SvgRenderer, sceneToSvgs } from "./render/svg.js";
export { rasterAvailable, sheetSvg, slidePng, svgToPng } from "./render/raster.js";

export { contentChecks, geometryChecks } from "./qa/checks.js";
export { buildVerdict, dedupeFindings, readiness } from "./qa/verdict.js";

export { COMMANDS, command, withinBudget, type CommandDefinition } from "./commands/registry.js";
export { catalog, GRAMMAR } from "./commands/catalog.js";
export { SKILL_V2 } from "./commands/skill.js";
export { buildV2McpServer, registerV2, V2_INSTRUCTIONS } from "./mcp/server.js";

export { generateDeck, type GenerateRequest, type GenerateResult } from "./llm/generate.js";
export { editWithInstruction, classifyInstruction } from "./llm/edit-router.js";
export { AnthropicProvider, CachingProvider, ScriptedProvider, priceOf, type ModelProvider } from "./llm/provider.js";
export { PROFILES, resolveProfile, loadModelsConfig, BudgetGuard, type Profile, type ProfileName } from "./llm/profiles.js";
export { ingest, digest, type SourcePack } from "./ingest/index.js";

export { migrateOutline, type MigrationReport } from "./compat-v1/migrate.js";
export { canvasToElements } from "./compat-v1/canvas.js";

export { computeFacts, chartFormProblem, suggestChartKind, toChartData } from "./charts/stats.js";
export { getIcon, searchIcons, resolveIcon, iconSetInfo } from "./icons/index.js";
