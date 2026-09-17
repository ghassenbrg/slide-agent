import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";

import { imageSizeOf } from "../../images/dimensions.js";
import { ImageManager, remoteAssetPolicy } from "../../images/image-manager.js";
import { VERSION } from "../../version.js";
import { canvasToElements } from "../compat-v1/canvas.js";
import { applyAdjustments, expandNode } from "../compose/expand.js";
import { getRecipe, RECIPES, STARTER_COMPONENTS } from "../compose/recipes.js";
import { rhythmNotes, signature, type RhythmNote } from "../compose/rhythm.js";
import { checkSlots, normalizeContent, selectRecipe } from "../compose/selector.js";
import { normalizeNode, type CompositionNode } from "../ir/compose.js";
import { deckIntent, slideMode, type AutoSlide, type ComponentDef, type DeckIntent, type Slide } from "../ir/intent.js";
import { didYouMean, joinPointer, pointer, type Finding } from "../ir/issues.js";
import type { SceneElement, SceneFont, SceneGraph, SceneSlide, TextElement } from "../ir/scene.js";
import type { SuggestedEdit } from "../ir/verdict.js";
import { contentArea, rect } from "../layout/geometry.js";
import { preloadFaces, solveSlide, type AssetInfo } from "../layout/solve.js";
import { compileDesign, resolveColor, roleColor, type CompileContext, type ThemeSpec } from "../tokens/compile.js";
import type { TextEngine } from "../text/measure.js";

/**
 * DeckIntent → SceneGraph: validate, compile the design, expand components and
 * recipes, solve each slide, and analyse rhythm. Deterministic for a given
 * intent, engine version, and set of font and image files.
 */

export interface BuildContext {
  text: TextEngine;
  /** Directory relative asset paths resolve from (normally the intent file's). */
  baseDir: string;
  brand?: CompileContext["brand"];
  acquireFont?: CompileContext["acquireFont"];
  /** Solve only these slides (ids); others are carried from `previous`. */
  only?: Set<string>;
  previous?: SceneGraph;
}

export interface BuiltScene {
  intent: DeckIntent;
  theme: ThemeSpec;
  scene: SceneGraph;
  findings: Finding[];
  suggestedEdits: SuggestedEdit[];
  rhythm: RhythmNote[];
  decisions: Array<{ slide?: string; kind: string; detail: string; score?: number }>;
  timings: Array<{ stage: string; ms: number; cached: number; computed: number }>;
  assets: Map<string, AssetInfo>;
}

export function validateIntent(raw: unknown): { intent?: DeckIntent; findings: Finding[] } {
  const parsed = deckIntent.safeParse(raw);
  if (parsed.success) {
    const findings: Finding[] = [];
    const seen = new Map<string, number>();
    parsed.data.slides.forEach((slide, index) => {
      if (seen.has(slide.id)) findings.push({ code: "slide-id-duplicate", severity: "blocking", tier: "T0", message: `Slide id "${slide.id}" is used by slides ${seen.get(slide.id)} and ${index}.`, path: pointer("slides", index, "id") });
      seen.set(slide.id, index);
    });
    return { intent: parsed.data, findings };
  }
  const findings: Finding[] = [];
  for (const issue of parsed.error.issues.slice(0, 40)) {
    const path = `/${issue.path.map(String).join("/")}`;
    // Slides are a union of four shapes; name the shape the author was going for.
    let message = issue.message;
    if (issue.code === "invalid_union" && /^\/slides\/\d+$/.test(path)) {
      message = "A slide needs id, message, and exactly one of compose, recipe (with content), auto, or canvas.";
      const slide = (raw as { slides?: unknown[] })?.slides?.[Number(path.split("/")[2] ?? -1)] as Record<string, unknown> | undefined;
      if (slide) {
        const allowed = ["id", "message", "notes", "sources", "pins", "tags", "background", "layout", "hidden", "compose", "recipe", "content", "adjust", "auto", "canvas"];
        const unknown = Object.keys(slide).filter((key) => !allowed.includes(key));
        if (unknown.length) message += ` Unknown: ${unknown.map((key) => `"${key}"${didYouMean(key, allowed)}`).join(", ")}.`;
        if (typeof slide.id !== "string") message += " Missing id.";
        if (typeof slide.message !== "string") message += " Missing message.";
      }
    }
    findings.push({ code: "intent-invalid", severity: "blocking", tier: "T0", message, path: path === "/" ? "" : path });
  }
  return { findings };
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

/** Every image reference in authored JSON (compositions, recipe content, canvas). */
function imageReferences(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) imageReferences(item, found);
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.image === "string") found.add(record.image);
    if (record.image && typeof record.image === "object" && typeof (record.image as Record<string, unknown>).asset === "string") found.add((record.image as { asset: string }).asset);
    if (record.type === "image" && typeof record.path === "string") found.add(record.path);
    if (typeof record.asset === "string") found.add(record.asset);
    for (const item of Object.values(record)) imageReferences(item, found);
  }
  return found;
}

async function resolveAssets(references: Set<string>, baseDir: string): Promise<Map<string, AssetInfo>> {
  const manager = new ImageManager(path.join(tmpdir(), `slide-agent-image-cache-${userInfo().username}`), remoteAssetPolicy(), baseDir);
  const assets = new Map<string, AssetInfo>();
  await Promise.all([...references].map(async (reference) => {
    if (reference.includes("{")) return;
    try {
      const file = await manager.resolve(reference);
      const bytes = await readFile(file);
      const size = imageSizeOf(bytes);
      assets.set(reference, { file, sha256: createHash("sha256").update(bytes).digest("hex"), ...(size ? { width: size.width, height: size.height } : {}) });
    } catch (error) {
      assets.set(reference, { error: error instanceof Error ? error.message : String(error) });
    }
  }));
  return assets;
}

export async function buildScene(raw: unknown, context: BuildContext): Promise<BuiltScene | { findings: Finding[]; intent?: undefined }> {
  const timings: BuiltScene["timings"] = [];
  const time = async <T>(stage: string, run: () => Promise<T> | T, computed = 1): Promise<T> => {
    const started = performance.now();
    const result = await run();
    timings.push({ stage, ms: Math.round((performance.now() - started) * 10) / 10, cached: 0, computed });
    return result;
  };

  const validated = await time("intent-validate", () => validateIntent(raw));
  if (!validated.intent) return { findings: validated.findings };
  const intent = validated.intent;
  const findings: Finding[] = [...validated.findings];
  const suggestedEdits: SuggestedEdit[] = [];
  const decisions: BuiltScene["decisions"] = [];

  const theme = await time("design-compile", () => compileDesign(intent.design, {
    format: intent.brief.format,
    text: context.text,
    ...(intent.pins ? { pins: intent.pins } : {}),
    ...(context.brand ? { brand: context.brand } : {}),
    ...(context.acquireFont ? { acquireFont: context.acquireFont } : {}),
    officeSafe: intent.options?.fonts === "office-safe",
  }));
  findings.push(...theme.findings);

  const components: Record<string, ComponentDef> = { ...(intent.components ?? {}) };
  for (const [name, starter] of Object.entries(STARTER_COMPONENTS)) components[`starter/${name}`] = starter as ComponentDef;
  const count = intent.slides.length;
  const assets = await time("assets", () => resolveAssets(imageReferences(intent), context.baseDir));

  const slides: SceneSlide[] = [];
  let previousRecipe: string | undefined;
  const started = performance.now();
  let computed = 0;
  for (const [index, slide] of intent.slides.entries()) {
    const slidePath = pointer("slides", index);
    const reuse = context.only && !context.only.has(slide.id) ? context.previous?.slides.find((candidate) => candidate.id === slide.id) : undefined;
    if (reuse) {
      slides.push({ ...reuse, index, elements: reuse.elements.filter((element) => element.role !== "chrome") });
      findings.push(...reuse.findings.filter((finding) => finding.tier !== "T3"));
      suggestedEdits.push(...(reuse.suggestedEdits ?? []));
      continue;
    }
    computed += 1;
    const built = await buildSlide(slide, index, count, slidePath, { intent, theme, text: context.text, components, assets, previousRecipe });
    if (built.recipe) previousRecipe = built.recipe;
    findings.push(...built.slide.findings);
    suggestedEdits.push(...built.suggestedEdits);
    decisions.push(...built.decisions);
    slides.push(built.slide);
  }
  timings.push({ stage: "expand+solve+fit", ms: Math.round(performance.now() - started), cached: count - computed, computed });

  const rhythm = await time("rhythm", () => rhythmNotes(slides));
  const fonts: SceneFont[] = (["display", "body", "mono"] as const).map((role) => {
    const font = theme.fonts[role];
    const face = font.regular;
    const embed = intent.options?.fonts !== "office-safe" && face.source === "font-file" && face.embeddable && !face.office;
    return {
      family: font.spec.family,
      role,
      resolved: face.typeface,
      ...(face.file ? { file: face.file } : {}),
      ...(face.sha256 ? { sha256: face.sha256 } : {}),
      embeddable: face.embeddable,
      embed,
      metrics: face.source === "font-file" ? "font-file" : "table",
      ...(face.substituteFor ? { substitute: face.typeface } : {}),
    };
  });
  for (const font of fonts) {
    if (!font.embeddable && font.metrics === "font-file" && !theme.fonts[font.role].regular.office && intent.options?.fonts !== "office-safe") {
      findings.push({ code: "font-not-embeddable", severity: "major", tier: "T1", message: `${font.family} cannot be embedded (licence bits or CFF outlines); machines without it will substitute.`, path: `/design/language/type/${font.role}/family` });
    }
  }

  const chromeSpec = theme.chrome;
  const footer = intent.options?.chrome?.footer ?? chromeSpec.footer;
  const slideNumber = intent.options?.chrome?.slideNumbers ?? chromeSpec.slideNumber ?? false;
  const chromeColor = chromeSpec.tone ? resolveColor(chromeSpec.tone, theme) ?? roleColor("muted", theme) : roleColor("muted", theme);
  const scene: SceneGraph = {
    schema: "slide-agent.scene/2",
    engine: VERSION,
    format: intent.brief.format,
    size: theme.slide,
    title: intent.brief.title,
    ...(intent.brief.author ? { author: intent.brief.author } : {}),
    language: intent.brief.language,
    theme: {
      colors: { ...theme.slots },
      fonts: { major: theme.fonts.display.regular.typeface, minor: theme.fonts.body.regular.typeface, mono: theme.fonts.mono.regular.typeface },
    },
    fonts,
    slides,
    ...(slideNumber || footer ? { chrome: { slideNumber, ...(footer ? { footer } : {}), color: chromeColor, font: theme.fonts.body.regular.typeface, size: Math.max(theme.floors.caption, Math.min(theme.sizes.caption, 12)), position: chromeSpec.position ?? "bottom-right" } } : {}),
  };
  if (scene.chrome) addChrome(scene, theme);
  return { intent, theme, scene, findings, suggestedEdits, rhythm, decisions, timings, assets };
}

interface SlideContext {
  intent: DeckIntent;
  theme: ThemeSpec;
  text: TextEngine;
  components: Record<string, ComponentDef>;
  assets: Map<string, AssetInfo>;
  previousRecipe?: string;
}

async function buildSlide(slide: Slide, index: number, count: number, slidePath: string, context: SlideContext): Promise<{ slide: SceneSlide; suggestedEdits: SuggestedEdit[]; decisions: BuiltScene["decisions"]; recipe?: string }> {
  const { theme, intent } = context;
  const mode = slideMode(slide);
  const findings: Finding[] = [];
  const decisions: BuiltScene["decisions"] = [];
  let elements: SceneElement[] = [];
  let suggestedEdits: SuggestedEdit[] = [];
  let recipeId: string | undefined;
  let background = roleColor("background", theme);
  if (slide.background) background = resolveColor(slide.background, theme) ?? background;

  if (mode === "canvas") {
    const converted = canvasToElements((slide as { canvas: Record<string, unknown>[] }).canvas, { theme, slideId: slide.id, path: slidePath, assets: context.assets });
    elements = converted.elements;
    findings.push(...converted.findings);
  } else {
    let root: CompositionNode | undefined;
    let draft = false;
    let rawRoot: unknown;
    if (mode === "compose") {
      rawRoot = expandNode((slide as { compose: unknown }).compose, joinPointer(slidePath, "compose"), {}, { components: context.components, findings, slide: slide.id, provenance: "composed" });
    } else {
      let content: Record<string, unknown>;
      let adjust: Array<{ node: string; set: Record<string, unknown> }> = [];
      if (mode === "recipe") {
        const recipeSlide = slide as { recipe: string; content: Record<string, unknown>; adjust?: typeof adjust };
        recipeId = recipeSlide.recipe;
        const recipe = getRecipe(recipeId);
        if (!recipe) {
          findings.push({ code: "recipe-unknown", severity: "blocking", tier: "T0", message: `No recipe "${recipeId}".${didYouMean(recipeId, RECIPES.map((candidate) => candidate.id))}`, path: joinPointer(slidePath, "recipe"), slide: slide.id });
        }
        content = normalizeContent(recipe, recipeSlide.content);
        adjust = recipeSlide.adjust ?? [];
        if (recipe) findings.push(...checkSlots(recipe, content, slidePath, slide.id));
      } else {
        draft = true;
        const selection = selectRecipe((slide as AutoSlide).auto, { index, count, ...(context.previousRecipe ? { previous: context.previousRecipe } : {}) });
        recipeId = selection.recipe;
        content = selection.content;
        decisions.push({ slide: slide.id, kind: "draft-selection", detail: selection.trail.map((entry) => `${entry.recipe} ${entry.score.toFixed(2)} (${entry.reason})`).join("; "), score: selection.trail[0]?.score ?? 0 });
        const recipe = getRecipe(recipeId)!;
        findings.push(...checkSlots(recipe, content, slidePath, slide.id, false).map((finding) => ({ ...finding, path: joinPointer(slidePath, "auto") })));
      }
      const recipe = recipeId ? getRecipe(recipeId) : undefined;
      if (recipe) {
        const substituted = expandNode(structuredClone(recipe.root), mode === "auto" ? joinPointer(slidePath, "auto") : joinPointer(slidePath, "content"), content, {
          components: context.components, findings, slide: slide.id, provenance: mode === "auto" ? "draft" : "recipe", recipe: recipe.id,
        });
        // Top-level holes in the recipe root are substituted by expansion of its children; the root itself too.
        rawRoot = substituted;
        if (adjust.length && rawRoot) applyAdjustments(rawRoot as never, adjust, findings, slide.id, slidePath);
      }
      if (mode === "recipe") decisions.push({ slide: slide.id, kind: "recipe", detail: `${recipeId} (model-chosen starting point)` });
    }
    if (rawRoot) root = normalizeNode(rawRoot, joinPointer(slidePath, mode === "compose" ? "compose" : mode === "auto" ? "auto" : "content"), { provenance: mode === "compose" ? "composed" : mode === "auto" ? "draft" : "recipe", findings, slide: slide.id, ...(recipeId ? { recipe: recipeId } : {}) });
    if (root && !findings.some((finding) => finding.severity === "blocking" && finding.tier === "T0" && finding.slide === slide.id && finding.code !== "alt-missing")) {
      await preloadFaces(root, theme, context.text);
      const solved = solveSlide({
        root,
        theme,
        text: context.text,
        slide: { id: slide.id, index, count, path: slidePath, pins: [...(slide.pins ?? []), ...(intent.pins ?? [])], tags: slide.tags ?? [], ...(slide.background ? { background: slide.background } : {}) },
        fit: intent.direction.fit,
        data: intent.data ?? {},
        assets: context.assets,
        draft,
      });
      elements = solved.elements;
      background = solved.background;
      findings.push(...solved.findings);
      suggestedEdits = solved.suggestedEdits;
      for (const decision of solved.decisions) decisions.push({ slide: slide.id, ...decision });
    }
  }

  elements = applyElementPins(elements, slide.pins ?? [], findings, slide.id, slidePath);
  const hasTitle = elements.some((element) => element.placeholder?.type === "title");
  if (!hasTitle && !slide.hidden) {
    findings.push({ code: "slide-no-title", severity: "minor", tier: "T4", message: "No text with role title: screen readers and the outline will show this slide as untitled.", slide: slide.id, path: slidePath, hint: "Give the slide's headline role: \"title\"." });
  }
  const sig = signature(elements, theme.slide);
  const notes = [slide.notes, ...(slide.sources?.length ? [`Sources: ${slide.sources.map((id) => intent.sources?.find((source) => source.id === id)?.title ?? id).join("; ")}`] : [])].filter(Boolean).join("\n\n");
  const sceneSlide: SceneSlide = {
    id: slide.id,
    index,
    message: slide.message,
    mode,
    ...(recipeId ? { recipe: recipeId } : {}),
    layout: hasTitle ? "title-only" : "blank",
    background,
    elements,
    ...(notes ? { notes } : {}),
    ...(slide.hidden ? { hidden: true } : {}),
    signature: sig.vector,
    density: sig.density,
    findings,
    ...(suggestedEdits.length ? { suggestedEdits } : {}),
    hash: "",
  };
  sceneSlide.hash = hash({ elements, background, notes, hidden: slide.hidden ?? false, engine: VERSION });
  return { slide: sceneSlide, suggestedEdits, decisions, ...(recipeId ? { recipe: recipeId } : {}) };
}

/** Footer and slide number, as chrome elements the writer binds to master placeholders. */
function addChrome(scene: SceneGraph, theme: ThemeSpec): void {
  const chrome = scene.chrome!;
  const area = contentArea(theme);
  const height = (chrome.size * 1.4) / 72;
  const y = theme.slide.height - theme.space.margin / 2 - height / 2;
  for (const slide of scene.slides) {
    slide.elements = slide.elements.filter((element) => element.role !== "chrome");
    if (slide.index === 0) continue;
    const base = { role: "chrome" as const, z: 100_000, provenance: { source: "composed" as const, path: "/options/chrome" }, fit: { status: "fit" as const, steps: ["measure"] } };
    const style = { font: chrome.font, fontRole: "body" as const, size: chrome.size, bold: false, italic: false, color: chrome.color, valign: "middle" as const, leading: 1.2, inset: [0, 0, 0, 0] as [number, number, number, number] };
    if (chrome.footer) {
      const element: TextElement = { ...base, kind: "text", id: `${slide.id}/chrome-footer`, typeRole: "caption", frame: rect(area.x, y, area.w * 0.6, height), paragraphs: [{ runs: [{ text: chrome.footer }] }], style: { ...style, align: "left" }, placeholder: { type: "ftr" } };
      slide.elements.push(element);
    }
    if (chrome.slideNumber) {
      const right = chrome.position !== "bottom-left";
      const element: TextElement = { ...base, kind: "text", id: `${slide.id}/chrome-number`, typeRole: "caption", frame: rect(right ? area.x + area.w - 0.8 : area.x, y, 0.8, height), paragraphs: [{ runs: [{ text: String(slide.index + 1) }] }], style: { ...style, align: right ? "right" : "left" }, placeholder: { type: "sldNum" } };
      if (!right && chrome.footer) element.frame = rect(area.x + area.w - 0.8, y, 0.8, height);
      slide.elements.push(element);
    }
  }
}

/**
 * Element-level pins (`{path: "/elements/<id>", …}`): refused adjustments and
 * overrides recorded by EditOps. They survive rebuilds and design changes. A
 * refused adjustment that protected a hard constraint becomes a blocking finding.
 */
function applyElementPins(elements: SceneElement[], pins: NonNullable<Slide["pins"]>, findings: Finding[], slideId: string, slidePath: string): SceneElement[] {
  let result = elements;
  for (const pin of pins) {
    if (typeof pin === "string" || !pin.path.startsWith("/elements/")) continue;
    const elementId = pin.path.slice("/elements/".length);
    const element = result.find((candidate) => candidate.id === elementId || candidate.id === `${slideId}/${elementId}`);
    if (!element) {
      findings.push({ code: "pin-unmatched", severity: "minor", tier: "T0", message: `A pin names ${elementId}, which this build did not produce; it is kept but has no effect.`, slide: slideId, path: `${slidePath}/pins` });
      continue;
    }
    element.pins = [...new Set([...(element.pins ?? []), pin.refuse ? `refuse:${pin.refuse}` : "override"])];
    if (pin.refuse) {
      const refused = (element.adjustments ?? []).filter((adjustment) => adjustment.kind === pin.refuse);
      element.adjustments = (element.adjustments ?? []).filter((adjustment) => adjustment.kind !== pin.refuse);
      for (const adjustment of refused) {
        if (element.kind === "text" && adjustment.kind === "type-step" && typeof adjustment.from === "number") {
          element.style.size = adjustment.from;
          element.fit = { status: "overflow", steps: [...(element.fit?.steps ?? []), "type-step refused"] };
          findings.push({ code: "adjustment-refused", severity: "blocking", tier: "T1", message: `${element.id} keeps ${adjustment.from} pt as pinned, and does not fit its region at that size.`, slide: slideId, element: element.id, path: adjustment.path, hint: "Widen the region, shorten the text, or drop the pin." });
        }
        if (element.kind === "text" && adjustment.kind === "contrast" && typeof adjustment.from === "string") {
          element.style.color = { hex: adjustment.from.replace(/^#/, "") };
          findings.push({ code: "contrast-pinned", severity: "blocking", tier: "T1", message: `${element.id} keeps a colour that fails contrast (${adjustment.reason}).`, slide: slideId, element: element.id, path: adjustment.path, hint: "Contrast is a hard constraint: drop the pin or choose a passing tone." });
        }
      }
    }
    const value = pin.value as { frame?: Partial<SceneElement["frame"]>; hidden?: boolean; size?: number; color?: string } | undefined;
    if (value?.hidden) result = result.filter((candidate) => candidate !== element);
    if (value?.frame) element.frame = { ...element.frame, ...value.frame };
    if (value?.size !== undefined && element.kind === "text") element.style.size = value.size;
    if (value?.color && element.kind === "text") element.style.color = { hex: value.color.replace(/^#/, "").toUpperCase() };
  }
  return result;
}
