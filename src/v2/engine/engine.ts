import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import JSZip from "jszip";

import { PptxEditor } from "../../editing/pptx-editor.js";
import { PresentationRenderer } from "../../rendering/renderer.js";
import { extractRenderedText } from "../../rendering/text-extraction.js";
import { assertInsideWorkspace } from "../../security/policy.js";
import type { EditOperation } from "../../types/index.js";
import { SlideAgentError } from "../../utils/errors.js";
import { loadZipSafely } from "../../utils/safe-zip.js";
import { PackageValidator } from "../../validation/package-validator.js";
import { SchemaValidator } from "../../validation/schema-validator.js";
import { VERSION } from "../../version.js";
import { RECIPES_VERSION } from "../compose/recipes.js";
import { similarity } from "../compose/rhythm.js";
import type { DesignRequest } from "../ir/design.js";
import { COMPOSE_GRAMMAR_ID, type DeckIntent } from "../ir/intent.js";
import type { Finding } from "../ir/issues.js";
import type { SceneGraph, SceneSlide, TextElement } from "../ir/scene.js";
import type { EditOp, RunRecord, SuggestedEdit, Verdict } from "../ir/verdict.js";
import { WRITER_VERSION, writePackage } from "../ooxml/writer.js";
import { contentChecks, geometryChecks } from "../qa/checks.js";
import { buildVerdict, dedupeFindings } from "../qa/verdict.js";
import { rasterAvailable, sheetSvg, slidePng, svgToPng } from "../render/raster.js";
import { COMPILER_VERSION, themeToDtcg } from "../tokens/compile.js";
import { fetchFamily, fontDownloadsAllowed } from "../text/fetch.js";
import { TextEngine } from "../text/measure.js";
import { FontRegistry, sharedFontRegistry } from "../text/registry.js";
import { resolveBrand } from "./brand.js";
import { applyEdits, expandRecipeSlide } from "./edits.js";
import { buildScene, validateIntent, type BuiltScene } from "./scene-builder.js";

/**
 * The orchestrator: one deck directory, a content-addressed build, a run
 * record, and the calls every surface (CLI, MCP, SDK) is generated from.
 *
 *   <deck>/intent.json        the model's decisions (canonical, diffable)
 *   <deck>/theme.tokens.json  the compiled design language (DTCG)
 *   <deck>/scene.json         what was built, round-trippable
 *   <deck>/deck.pptx          the native package
 *   <deck>/previews/          slide previews and the contact sheet
 *   <deck>/run.json           the latest run record; runs/ keeps history
 */

export interface EngineOptions {
  registry?: FontRegistry;
  /** Fetch open-licence faces a design names but this machine lacks. Operator policy. */
  fontDownloads?: boolean;
  /** Preview width per slide in pixels. */
  previewWidth?: number;
}

export interface BuildRequest {
  deck: string;
  intent?: unknown;
  intentPath?: string;
  mode?: "check" | "build";
  previews?: "sheet" | "changed" | "none";
  strict?: boolean;
  /** Record a design review done by the host (V1 visualFindings, renamed). */
  reviewed?: DeckIntent["reviewed"];
}

export interface BuildResult {
  verdict: Verdict;
  record: RunRecord;
  intent?: DeckIntent;
  scene?: SceneGraph;
  theme?: BuiltScene["theme"];
  files: { deck: string; pptx?: string; sheet?: string; previews: Record<string, string> };
}

const RUN_HISTORY = 20;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 1)}\n`, "utf8");
  const { rename } = await import("node:fs/promises");
  await rename(temporary, file);
}

function deckWideKey(intent: DeckIntent): string {
  return sha256(JSON.stringify({ design: intent.design, components: intent.components, data: intent.data, options: intent.options, brief: intent.brief, direction: intent.direction, pins: intent.pins, sources: intent.sources }));
}

export class Engine {
  private readonly registry: FontRegistry;

  public constructor(private readonly options: EngineOptions = {}) {
    this.registry = options.registry ?? sharedFontRegistry();
  }

  public textEngine(): TextEngine {
    return new TextEngine(this.registry);
  }

  private deckDir(deck: string): string {
    return assertInsideWorkspace(deck, "deck");
  }

  private async acquireFont(family: string, weights: number[]): Promise<boolean> {
    if (!(this.options.fontDownloads ?? fontDownloadsAllowed())) return false;
    const fetched = await fetchFamily(family, { weights, italic: true }).catch(() => []);
    if (fetched.length) this.registry.invalidate();
    return fetched.length > 0;
  }

  /** Validate, compile, solve, check — and in build mode, write the deck. */
  public async build(request: BuildRequest): Promise<BuildResult> {
    const started = performance.now();
    const startedAt = new Date().toISOString();
    const run = randomUUID();
    const deck = this.deckDir(request.deck);
    const mode = request.mode ?? "build";
    let raw = request.intent;
    let baseDir = deck;
    if (raw === undefined) {
      const intentPath = request.intentPath ? assertInsideWorkspace(request.intentPath, "intentPath") : path.join(deck, "intent.json");
      raw = await readJson(intentPath);
      if (raw === undefined) throw new SlideAgentError("INTENT_NOT_FOUND", `No readable intent at ${intentPath}.`, { path: intentPath });
      baseDir = path.dirname(intentPath);
    }
    if (request.reviewed && raw && typeof raw === "object") raw = { ...(raw as object), reviewed: request.reviewed };

    const previousIntent = await readJson<DeckIntent>(path.join(deck, "intent.json"));
    const previousScene = await readJson<SceneGraph>(path.join(deck, "scene.json"));
    const text = this.textEngine();

    // Incremental: when nothing deck-wide changed, only slides whose own JSON changed are solved.
    let only: Set<string> | undefined;
    const validated = validateIntent(raw);
    if (validated.intent && previousIntent && previousScene && previousScene.engine === VERSION && deckWideKey(previousIntent) === deckWideKey(validated.intent)) {
      only = new Set<string>();
      const before = new Map(previousIntent.slides.map((slide) => [slide.id, sha256(JSON.stringify(slide))]));
      for (const slide of validated.intent.slides) {
        if (before.get(slide.id) !== sha256(JSON.stringify(slide))) only.add(slide.id);
      }
      if (validated.intent.slides.length !== previousIntent.slides.length) only = undefined;
    }

    const built = await buildScene(raw, {
      text,
      baseDir,
      brand: async (reference) => resolveBrand(reference, baseDir),
      acquireFont: (family, weights) => this.acquireFont(family, weights),
      ...(only ? { only, previous: previousScene } : {}),
    });

    const files: BuildResult["files"] = { deck, previews: {} };
    if (!built.intent) {
      const verdict = this.failedVerdict(run, deck, built.findings, performance.now() - started);
      const record = this.record(run, mode, startedAt, raw, [], [], built.findings, [], verdict);
      if (mode === "build") await this.saveRecord(deck, record);
      return { verdict, record, files };
    }

    const findings: Finding[] = [...built.findings];
    for (const slide of built.scene.slides) {
      const geometry = geometryChecks(slide);
      findings.push(...geometry);
      slide.findings.push(...geometry);
    }
    findings.push(...contentChecks(built.scene));

    const changed = only ? [...only] : built.scene.slides.map((slide) => slide.id);
    let packageBroken = false;
    const timings = [...built.timings];
    const artifacts: RunRecord["artifacts"] = [];

    if (mode === "build") {
      await mkdir(deck, { recursive: true });
      // Local assets travel with the deck, so intent.json rebuilds anywhere.
      const packaged = await packageAssets(deck, built.intent, built.assets);
      await writeJsonFile(path.join(deck, "intent.json"), packaged);
      await writeJsonFile(path.join(deck, "scene.json"), built.scene);
      await writeJsonFile(path.join(deck, "theme.tokens.json"), themeToDtcg(built.theme));

      const writeStart = performance.now();
      const written = await writePackage(built.scene, { theme: built.theme, embedFonts: built.intent.options?.fonts !== "office-safe" });
      const pptx = path.join(deck, "deck.pptx");
      await writeFile(pptx, written.bytes);
      files.pptx = pptx;
      artifacts.push({ path: "deck.pptx", sha256: sha256(written.bytes), bytes: written.bytes.length, kind: "pptx" });
      for (const link of written.rejectedLinks) findings.push({ code: "link-refused", severity: "major", tier: "T2", message: `Refused hyperlink ${link}.` });
      const packageResult = await new PackageValidator().validate(pptx);
      for (const issue of packageResult.issues) {
        const blocking = issue.severity === "error";
        if (blocking) packageBroken = true;
        findings.push({ code: `package-${issue.code ?? "invalid"}`, severity: blocking ? "blocking" : "minor", tier: "T2", message: issue.message });
      }
      if (request.strict) {
        for (const issue of await new SchemaValidator().validate(pptx)) {
          findings.push({ code: "xsd-invalid", severity: "blocking", tier: "T2", message: issue.message });
          packageBroken = true;
        }
      }
      const totalColors = written.colorReferences.theme + written.colorReferences.literal;
      if (totalColors > 0 && written.colorReferences.theme / totalColors < 0.9 && built.theme.source === "authored") {
        findings.push({ code: "literal-colors", severity: "minor", tier: "T2", message: `${Math.round((written.colorReferences.literal / totalColors) * 100)}% of colour references are literals rather than theme colours.`, hint: "Name colours in the palette and use roles or palette names in compositions." });
      }
      timings.push({ stage: "write+package", ms: Math.round(performance.now() - writeStart), cached: 0, computed: 1 });

      if ((request.previews ?? "sheet") !== "none" && rasterAvailable()) {
        const previewStart = performance.now();
        await preloadSceneFaces(built.scene, text);
        const previews = await this.previews(deck, built, text, request.previews === "changed" ? new Set(changed) : undefined);
        Object.assign(files.previews, previews.slides);
        if (previews.sheet) files.sheet = previews.sheet;
        timings.push({ stage: "preview", ms: Math.round(performance.now() - previewStart), cached: previews.cached, computed: previews.computed });
      }
    }

    const verdict = buildVerdict({
      run,
      deck,
      intent: built.intent,
      theme: built.theme,
      scene: built.scene,
      findings,
      suggestedEdits: built.suggestedEdits,
      rhythm: built.rhythm,
      changed,
      rendered: files.sheet ? "preview" : "none",
      packageBroken,
      views: { ...(files.sheet ? { sheet: files.sheet } : {}), ...(files.pptx ? { pptx: files.pptx } : {}) },
      engineMs: performance.now() - started,
    });
    const record = this.record(run, mode, startedAt, built.intent, timings, built.decisions, findings, artifacts, verdict, built);
    if (mode === "build") await this.saveRecord(deck, record);
    return { verdict, record, intent: built.intent, scene: built.scene, theme: built.theme, files };
  }

  private failedVerdict(run: string, deck: string, findings: Finding[], ms: number): Verdict {
    const groups = new Map<string, { code: string; severity: Finding["severity"]; count: number; where: string[]; hint: string }>();
    for (const finding of dedupeFindings(findings)) {
      const group = groups.get(finding.code) ?? { code: finding.code, severity: finding.severity, count: 0, where: [], hint: finding.message.slice(0, 140) };
      group.count += 1;
      if (group.where.length < 8) group.where.push(finding.path ?? "intent");
      groups.set(finding.code, group);
    }
    return {
      run, deck, state: "needs-attention", slides: 0,
      authoring: { composed: 0, recipe: 0, draft: 0, canvas: 0, design: "authored" },
      designReview: "none",
      issues: [...groups.values()].slice(0, 12),
      adjustments: [], suggestedEdits: [], rhythm: [], views: {},
      cost: { engineMs: Math.round(ms) },
      more: findings.length > 12 ? `${findings.length} schema findings: slides_view report` : undefined,
    } as Verdict;
  }

  private record(run: string, command: string, startedAt: string, intent: unknown, stages: RunRecord["stages"], decisions: RunRecord["decisions"], findings: Finding[], artifacts: RunRecord["artifacts"], verdict: Verdict, built?: BuiltScene): RunRecord {
    const adjustments: RunRecord["adjustments"] = [];
    const fit: RunRecord["fit"] = [];
    for (const adjustment of built?.theme.adjustments ?? []) adjustments.push({ slide: "design", element: adjustment.path ?? "design", kind: adjustment.kind, from: adjustment.from, to: adjustment.to, reason: adjustment.reason });
    for (const slide of built?.scene.slides ?? []) {
      for (const element of slide.elements) {
        for (const adjustment of element.adjustments ?? []) adjustments.push({ slide: slide.id, element: element.id, kind: adjustment.kind, from: adjustment.from, to: adjustment.to, reason: adjustment.reason });
        if (element.fit && element.fit.status !== "fit") fit.push({ slide: slide.id, element: element.id, status: element.fit.status, steps: element.fit.steps });
      }
    }
    return {
      schema: "slide-agent.run/1",
      id: run,
      command,
      startedAt,
      finishedAt: new Date().toISOString(),
      versions: { engine: VERSION, grammar: COMPOSE_GRAMMAR_ID, recipes: RECIPES_VERSION, compiler: COMPILER_VERSION, writer: WRITER_VERSION },
      intentHash: sha256(JSON.stringify(intent ?? null)).slice(0, 16),
      stages,
      decisions,
      adjustments,
      findings: dedupeFindings(findings).map((finding) => ({ ...finding })),
      fit,
      artifacts,
      modelCalls: [],
      verdict,
      ...(built ? { suggestedEdits: built.suggestedEdits, fonts: built.scene.fonts } : {}),
    } as RunRecord;
  }

  private async saveRecord(deck: string, record: RunRecord): Promise<void> {
    await writeJsonFile(path.join(deck, "run.json"), record);
    const history = path.join(deck, "runs");
    await writeJsonFile(path.join(history, `${record.startedAt.replace(/[:.]/g, "-")}-${record.id.slice(0, 8)}.json`), record);
    const entries = (await readdir(history).catch(() => [])).sort();
    for (const stale of entries.slice(0, Math.max(0, entries.length - RUN_HISTORY))) await rm(path.join(history, stale), { force: true });
  }

  /** Slide PNGs cached by slide hash, and a contact sheet. */
  private async previews(deck: string, built: BuiltScene, text: TextEngine, onlySlides?: Set<string>): Promise<{ slides: Record<string, string>; sheet?: string; cached: number; computed: number }> {
    const directory = path.join(deck, "previews");
    await mkdir(directory, { recursive: true });
    const width = this.options.previewWidth ?? 960;
    const slides: Record<string, string> = {};
    const cells: Array<{ label: string; svg: string }> = [];
    let cached = 0;
    let computed = 0;
    const renderer = await import("../render/svg.js");
    const svg = new renderer.SvgRenderer({ text });
    for (const slide of built.scene.slides) {
      const file = path.join(directory, `${String(slide.index + 1).padStart(2, "0")}-${slide.id}-${slide.hash.slice(0, 8)}.png`);
      const slideSvg = svg.slide(slide, built.scene);
      cells.push({ label: `${slide.index + 1} · ${slide.id}${slide.recipe ? ` · ${slide.recipe}` : ""}`, svg: slideSvg });
      const exists = await stat(file).then(() => true).catch(() => false);
      if (exists) {
        cached += 1;
      } else if (!onlySlides || onlySlides.has(slide.id)) {
        const png = svgToPng(slideSvg, { width, text });
        if (png) await writeFile(file, png);
        computed += 1;
      }
      slides[slide.id] = file;
    }
    // Drop previews of slides that no longer exist in this form.
    const current = new Set(Object.values(slides).map((file) => path.basename(file)));
    for (const name of await readdir(directory)) {
      if (/^\d{2}-.+-[0-9a-f]{8}\.png$/.test(name) && !current.has(name)) await rm(path.join(directory, name), { force: true });
    }
    const aspect = built.scene.size.width / built.scene.size.height;
    const columns = built.scene.slides.length <= 4 ? 2 : built.scene.slides.length <= 12 ? 3 : 4;
    const sheet = sheetSvg(cells, { columns, cellWidth: 400, aspect, title: `${built.scene.title} — preview, not a PowerPoint render` });
    const sheetPng = svgToPng(sheet, { width: Math.min(1600, columns * 412 + 12), text });
    const sheetFile = path.join(directory, "sheet.png");
    if (sheetPng) await writeFile(sheetFile, sheetPng);
    return { slides, ...(sheetPng ? { sheet: sheetFile } : {}), cached, computed };
  }

  /** Try up to three design directions on up to four slides, side by side, without writing a deck. */
  public async explore(request: { deck: string; intent?: unknown; designs: DesignRequest[]; slides: string[] }): Promise<{ sheet?: string; designs: Array<{ index: number; blocking: number; adjustments: number; fonts: string[] }> }> {
    const deck = this.deckDir(request.deck);
    const raw = (request.intent ?? await readJson(path.join(deck, "intent.json"))) as DeckIntent | undefined;
    if (!raw) throw new SlideAgentError("INTENT_NOT_FOUND", "explore needs an intent inline or in the deck.");
    if (request.designs.length === 0 || request.designs.length > 3) throw new SlideAgentError("EXPLORE_DESIGNS", "explore takes one to three designs.");
    if (request.slides.length === 0 || request.slides.length > 4) throw new SlideAgentError("EXPLORE_SLIDES", "explore takes one to four slide ids.");
    const cells: Array<{ label: string; svg: string }> = [];
    const summaries: Array<{ index: number; blocking: number; adjustments: number; fonts: string[] }> = [];
    const text = this.textEngine();
    let aspect = 16 / 9;
    for (const [index, design] of request.designs.entries()) {
      const slides = request.slides.map((id) => raw.slides.find((slide) => slide.id === id)).filter(Boolean);
      if (slides.length !== request.slides.length) throw new SlideAgentError("EXPLORE_SLIDE_UNKNOWN", `Unknown slide ids: ${request.slides.filter((id) => !raw.slides.some((slide) => slide.id === id)).join(", ")}.`);
      const variant = { ...raw, design, slides };
      const built = await buildScene(variant, { text, baseDir: deck, brand: async (reference) => resolveBrand(reference, deck) });
      if (!built.intent) {
        summaries.push({ index, blocking: built.findings.length, adjustments: 0, fonts: [] });
        continue;
      }
      aspect = built.scene.size.width / built.scene.size.height;
      const renderer = new (await import("../render/svg.js")).SvgRenderer({ text });
      for (const slide of built.scene.slides) cells.push({ label: `${String.fromCharCode(65 + index)} · ${slide.id}`, svg: renderer.slide(slide, built.scene) });
      summaries.push({
        index,
        blocking: built.findings.filter((finding) => finding.severity === "blocking").length,
        adjustments: built.theme.adjustments.length + built.scene.slides.reduce((sum, slide) => sum + slide.elements.reduce((inner, element) => inner + (element.adjustments?.length ?? 0), 0), 0),
        fonts: built.scene.fonts.map((font) => `${font.family}${font.metrics === "table" ? " (unavailable)" : ""}`),
      });
    }
    if (!rasterAvailable() || cells.length === 0) return { designs: summaries };
    const sheet = sheetSvg(cells, { columns: request.slides.length, cellWidth: 360, aspect, title: "Design exploration — preview, not a PowerPoint render", rowLabels: request.designs.map((_, index) => `Design ${String.fromCharCode(65 + index)}`) });
    const png = svgToPng(sheet, { width: Math.min(1600, 120 + request.slides.length * 372 + 12), text });
    const directory = path.join(deck, "explore");
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `sheet-${sha256(JSON.stringify(request.designs) + request.slides.join()).slice(0, 10)}.png`);
    if (png) await writeFile(file, png);
    return { ...(png ? { sheet: file } : {}), designs: summaries };
  }

  /** Apply EditOps to the deck's intent and rebuild what changed. */
  public async edit(request: { deck: string; ops: EditOp[]; previews?: BuildRequest["previews"] }): Promise<BuildResult & { notes: string[] }> {
    const deck = this.deckDir(request.deck);
    if (/\.pptx$/i.test(deck)) return this.editPackage(deck, request.ops);
    const intent = await readJson<DeckIntent>(path.join(deck, "intent.json"));
    if (!intent) throw new SlideAgentError("INTENT_NOT_FOUND", `${deck} has no intent.json; build the deck first.`);
    const record = await readJson<RunRecord & { suggestedEdits?: SuggestedEdit[] }>(path.join(deck, "run.json"));
    const applied = applyEdits(intent, request.ops, { ...(record?.suggestedEdits ? { suggestedEdits: record.suggestedEdits } : {}) });
    const result = await this.build({ deck, intent: applied.intent, previews: request.previews ?? "sheet" });
    return { ...result, notes: applied.notes };
  }

  private async editPackage(file: string, ops: EditOp[]): Promise<BuildResult & { notes: string[] }> {
    const operations = ops.map((op) => {
      if (op.level !== "package") throw new SlideAgentError("EDIT_LEVEL_FOR_PPTX", "A .pptx without an intent accepts package-level edits only.");
      return op.op as unknown as EditOperation;
    });
    const output = file.replace(/\.pptx$/i, ".edited.pptx");
    const started = performance.now();
    const result = await new PptxEditor().edit(file, output, operations);
    const run = randomUUID();
    const issues = (await new PackageValidator().validate(output)).issues;
    const verdict: Verdict = {
      run, deck: output, state: issues.some((issue) => issue.severity === "error") ? "broken" : "ready-unrendered", slides: result.slideCount ?? 0,
      authoring: { composed: 0, recipe: 0, draft: 0, canvas: 0, design: "tokens" }, designReview: "none",
      issues: issues.slice(0, 12).map((issue) => ({ code: issue.code ?? "package", severity: issue.severity === "error" ? "blocking" : "minor", count: 1, where: [output], hint: issue.message.slice(0, 140) })),
      adjustments: [], suggestedEdits: [], rhythm: [], views: { pptx: output }, cost: { engineMs: Math.round(performance.now() - started) },
    };
    const record = this.record(run, "edit-package", new Date().toISOString(), { ops }, [], [], [], [], verdict);
    return { verdict, record, files: { deck: output, pptx: output, previews: {} }, notes: result.warnings ?? [] };
  }

  /** Read-only views of a built deck. */
  public async view(request: { deck: string; what: "sheet" | "slides" | "crop" | "rhythm" | "expand" | "report" | "explain"; slides?: string[]; issue?: string; element?: string; page?: number }): Promise<Record<string, unknown>> {
    const deck = this.deckDir(request.deck);
    const scene = await readJson<SceneGraph>(path.join(deck, "scene.json"));
    const record = await readJson<RunRecord & { suggestedEdits?: SuggestedEdit[] }>(path.join(deck, "run.json"));
    if (!scene || !record) throw new SlideAgentError("DECK_NOT_BUILT", `${deck} has not been built.`);
    switch (request.what) {
      case "sheet":
        return { sheet: path.join(deck, "previews", "sheet.png"), note: "Preview, not a PowerPoint render." };
      case "slides": {
        const previews = await readdir(path.join(deck, "previews")).catch(() => []);
        const wanted = request.slides?.length ? request.slides : scene.slides.map((slide) => slide.id);
        return {
          slides: wanted.map((id) => {
            const slide = scene.slides.find((candidate) => candidate.id === id);
            const file = slide ? previews.find((name) => name.startsWith(`${String(slide.index + 1).padStart(2, "0")}-${slide.id}-${slide.hash.slice(0, 8)}`)) : undefined;
            return { id, ...(file ? { preview: path.join(deck, "previews", file) } : { missing: true }) };
          }),
          note: "Previews, not PowerPoint renders.",
        };
      }
      case "crop": {
        const finding = record.findings.find((candidate, index) => `${candidate.code}:${index}` === request.issue || candidate.element === request.element || candidate.code === request.issue);
        const elementId = request.element ?? finding?.element;
        const slide = scene.slides.find((candidate) => candidate.elements.some((element) => element.id === elementId)) ?? scene.slides.find((candidate) => candidate.id === finding?.slide);
        if (!slide) throw new SlideAgentError("VIEW_CROP_TARGET", "Name an element or an issue that points at one.");
        const element = slide.elements.find((candidate) => candidate.id === elementId);
        const frame = element?.frame ?? { x: 0, y: 0, w: scene.size.width, h: scene.size.height };
        const margin = 0.4;
        const crop = { x: Math.max(0, frame.x - margin), y: Math.max(0, frame.y - margin), w: Math.min(scene.size.width, frame.w + margin * 2), h: Math.min(scene.size.height, frame.h + margin * 2) };
        const text = this.textEngine();
        await preloadSceneFaces(scene, text);
        const png = slidePng(slide, scene, { width: 400, text, crop, ...(element ? { highlight: [element.id] } : {}) }).png;
        const file = path.join(deck, "previews", `crop-${slide.id}-${sha256(JSON.stringify(crop)).slice(0, 8)}.png`);
        if (png) await writeFile(file, png);
        return { crop: file, slide: slide.id, ...(element ? { element: element.id } : {}), ...(finding ? { finding } : {}) };
      }
      case "rhythm": {
        const rows = scene.slides.map((slide, index) => {
          const previous = scene.slides[index - 1];
          const cells = slide.signature;
          const silhouette = Array.from({ length: 7 }, (_, row) => Array.from({ length: 12 }, (_, column) => {
            const value = cells[row * 12 + column] ?? 0;
            return value > 0.9 ? "█" : value > 0.5 ? "▓" : value > 0.2 ? "░" : "·";
          }).join("")).filter((_, row) => row % 2 === 0).join("/");
          return { id: slide.id, density: slide.density, ...(previous ? { similarToPrevious: similarity(previous.signature, slide.signature) } : {}), silhouette };
        });
        return { slides: rows, notes: record.verdict?.rhythm ?? [] };
      }
      case "expand": {
        const intent = await readJson<DeckIntent>(path.join(deck, "intent.json"));
        const ids = request.slides ?? [];
        return {
          expanded: ids.map((id) => {
            const index = intent!.slides.findIndex((slide) => slide.id === id);
            if (index < 0) return { id, error: "unknown slide" };
            try {
              return { id, compose: expandRecipeSlide(intent!, index) };
            } catch (error) {
              return { id, error: error instanceof Error ? error.message : String(error) };
            }
          }),
          note: "Apply with slides_edit {level:\"intent\", op:\"expand\", path:\"/slides/N\"} or set /slides/N/compose to an edited copy.",
        };
      }
      case "report": {
        const pageSize = 40;
        const page = Math.max(0, request.page ?? 0);
        const findings = record.findings;
        return { total: findings.length, page, pages: Math.ceil(findings.length / pageSize), findings: findings.slice(page * pageSize, (page + 1) * pageSize), adjustments: record.adjustments.slice(0, 60), suggestedEdits: record.suggestedEdits ?? [] };
      }
      case "explain":
        return this.explain({ deck, ...(request.slides?.[0] ? { slide: request.slides[0] } : {}), ...(request.element ? { element: request.element } : {}) });
    }
  }

  public async explain(request: { deck: string; slide?: string; element?: string }): Promise<Record<string, unknown>> {
    const deck = this.deckDir(request.deck);
    const scene = await readJson<SceneGraph>(path.join(deck, "scene.json"));
    const record = await readJson<RunRecord>(path.join(deck, "run.json"));
    if (!scene || !record) throw new SlideAgentError("DECK_NOT_BUILT", `${deck} has not been built.`);
    const slideId = request.slide ?? scene.slides.find((slide) => slide.elements.some((element) => element.id === request.element))?.id;
    const slide = scene.slides.find((candidate) => candidate.id === slideId);
    if (!slide) {
      return { run: record.id, versions: record.versions, stages: record.stages, decisions: record.decisions.slice(0, 40), fonts: scene.fonts };
    }
    const element = request.element ? slide.elements.find((candidate) => candidate.id === request.element || candidate.id === `${slide.id}/${request.element}`) : undefined;
    return {
      run: record.id,
      slide: { id: slide.id, mode: slide.mode, recipe: slide.recipe, message: slide.message, density: slide.density, hash: slide.hash },
      decisions: record.decisions.filter((decision) => decision.slide === slide.id),
      ...(element
        ? { element: { id: element.id, kind: element.kind, role: element.role, frame: element.frame, provenance: element.provenance, fit: element.fit, adjustments: element.adjustments ?? [], pins: element.pins ?? [], ...(element.kind === "text" ? { font: element.style.font, size: element.style.size, color: element.style.color } : {}) } }
        : { elements: slide.elements.map((candidate) => ({ id: candidate.id, kind: candidate.kind, role: candidate.role, source: candidate.provenance.source, fit: candidate.fit?.status, adjustments: candidate.adjustments?.length ?? 0 })) }),
      findings: record.findings.filter((finding) => finding.slide === slide.id && (!element || finding.element === element.id)),
    };
  }

  /**
   * Fidelity render (LibreOffice), T5 text survival, XSD validation, a
   * round-trip rebuild from intent.json, and exports.
   */
  public async finalize(request: { deck: string; exports?: Array<"pdf" | "png">; roundTrip?: boolean }): Promise<BuildResult> {
    const deck = this.deckDir(request.deck);
    const started = performance.now();
    const build = await this.build({ deck, previews: "sheet", strict: true });
    if (!build.intent || !build.scene || !build.files.pptx) return build;
    const findings: Finding[] = build.record.findings.map((finding) => ({ ...finding, tier: finding.tier as Finding["tier"], severity: finding.severity as Finding["severity"] }));
    const renderDir = path.join(deck, "render");
    let rendered: "preview" | "fidelity" = "preview";
    let fidelityPassed = false;
    try {
      const render = await new PresentationRenderer().render(build.files.pptx, renderDir, { pdfPath: path.join(renderDir, "deck.pdf"), fallback: "none", width: 1600, height: 900 });
      rendered = "fidelity";
      const extracted = await extractRenderedText({ ...(render.pdfPath ? { pdfPath: render.pdfPath } : {}), previewFiles: render.previewFiles });
      const lost: Finding[] = [];
      if (extracted.method !== "none") {
        for (const slide of build.scene.slides) {
          const page = extracted.pages.find((candidate) => candidate.page === slide.index + 1);
          const pageText = normalizeForCompare(page?.lines.join(" ") ?? "");
          for (const element of slide.elements) {
            if (element.kind !== "text" || element.role === "chrome") continue;
            const words = normalizeForCompare(textOfElement(element)).split(" ").filter((word) => word.length > 3);
            const missing = words.filter((word) => !pageText.includes(word));
            if (words.length > 0 && missing.length / words.length > 0.34) {
              lost.push({ code: "text-lost-in-render", severity: "blocking", tier: "T5", message: `${element.id}: ${missing.length} of ${words.length} words did not survive the render (${missing.slice(0, 4).join(", ")}).`, slide: slide.id, element: element.id });
            }
          }
          if (render.previewFiles.length < build.scene.slides.length) lost.push({ code: "render-missing-pages", severity: "blocking", tier: "T5", message: `The render has ${render.previewFiles.length} pages for ${build.scene.slides.length} slides.` });
        }
      }
      const substituted = build.scene.fonts.filter((font) => font.embed && font.metrics === "font-file");
      if (substituted.length) {
        findings.push({ code: "render-font-note", severity: "minor", tier: "T5", message: `LibreOffice does not read embedded fonts; the fidelity render may substitute ${substituted.map((font) => font.family).join(", ")}. PowerPoint uses the embedded faces.` });
      }
      findings.push(...lost);
      fidelityPassed = lost.length === 0;
      if (request.exports?.includes("pdf") && render.pdfPath) {
        await mkdir(path.join(deck, "exports"), { recursive: true });
        await copyFile(render.pdfPath, path.join(deck, "exports", "deck.pdf"));
      }
      if (request.exports?.includes("png")) {
        await mkdir(path.join(deck, "exports"), { recursive: true });
        for (const file of render.previewFiles) await copyFile(file, path.join(deck, "exports", path.basename(file)));
      }
    } catch (error) {
      findings.push({ code: "fidelity-unavailable", severity: "minor", tier: "T5", message: `No fidelity render: ${error instanceof Error ? error.message : String(error)}. The deck is ready-unrendered at best.` });
    }

    if (request.roundTrip !== false) {
      const temporary = await mkdtemp(path.join(tmpdir(), "slide-agent-roundtrip-"));
      try {
        const scene = JSON.parse(await readFile(path.join(deck, "scene.json"), "utf8")) as SceneGraph;
        const rebuilt = await this.build({ deck: temporary, intent: build.intent, previews: "none" });
        const same = rebuilt.scene ? sameSceneGeometry(scene, rebuilt.scene) : false;
        const partsEqual = rebuilt.files.pptx ? await samePackage(build.files.pptx, rebuilt.files.pptx) : false;
        if (!same || !partsEqual) findings.push({ code: "round-trip-mismatch", severity: "blocking", tier: "T2", message: `Rebuilding from intent.json in a clean directory gave a different ${same ? "package" : "scene"}.`, hint: "Check that every asset the intent names is available relative to the deck." });
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }

    const verdict = buildVerdict({
      run: build.record.id, deck, intent: build.intent, theme: build.theme!, scene: build.scene, findings,
      suggestedEdits: build.verdict.suggestedEdits, rhythm: build.verdict.rhythm, rendered, fidelityPassed,
      views: { ...build.verdict.views, ...(request.exports?.includes("pdf") ? { slides: [path.join(deck, "exports", "deck.pdf")] } : {}) },
      engineMs: performance.now() - started,
    });
    const record = { ...build.record, command: "finalize", findings: dedupeFindings(findings), verdict };
    await this.saveRecord(deck, record);
    return { ...build, verdict, record };
  }

}

/** Copy referenced local images into <deck>/assets and point the stored intent at the copies. */
async function packageAssets(deck: string, intent: DeckIntent, assets: BuiltScene["assets"]): Promise<DeckIntent> {
  const replacements = new Map<string, string>();
  for (const [reference, info] of assets) {
    if (!info.file || !info.sha256 || /^https?:/i.test(reference)) continue;
    const name = `assets/${info.sha256.slice(0, 16)}${path.extname(info.file).toLowerCase()}`;
    if (reference === name) continue;
    const target = path.join(deck, name);
    if (!(await stat(target).then(() => true).catch(() => false))) {
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(info.file, target);
    }
    replacements.set(reference, name);
  }
  if (replacements.size === 0) return intent;
  const visit = (value: unknown, key?: string): unknown => {
    if (typeof value === "string") return (key === "image" || key === "asset" || key === "path") && replacements.has(value) ? replacements.get(value) : value;
    if (Array.isArray(value)) return value.map((item) => visit(item));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, visit(item, childKey)]));
    return value;
  };
  return visit(intent) as DeckIntent;
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function textOfElement(element: TextElement): string {
  return element.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join("")).join(" ");
}

function sameSceneGeometry(left: SceneGraph, right: SceneGraph): boolean {
  const shape = (scene: SceneGraph) => scene.slides.map((slide: SceneSlide) => slide.elements.map((element) => `${element.id}:${element.frame.x},${element.frame.y},${element.frame.w},${element.frame.h}`).join(";")).join("|");
  return shape(left) === shape(right);
}

async function samePackage(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([loadZipSafely(await readFile(left)), loadZipSafely(await readFile(right))]);
  const names = (zip: JSZip) => Object.keys(zip.files).filter((name) => !zip.files[name]!.dir && name !== "docProps/core.xml").sort();
  const namesA = names(a);
  const namesB = names(b);
  if (namesA.join("|") !== namesB.join("|")) {
    if (process.env.SLIDE_AGENT_DEBUG_ROUNDTRIP) process.stderr.write(`round-trip parts differ: ${namesA.filter((name) => !namesB.includes(name)).join(",")} / ${namesB.filter((name) => !namesA.includes(name)).join(",")}\n`);
    return false;
  }
  for (const name of namesA) {
    const [contentA, contentB] = await Promise.all([a.file(name)!.async("uint8array"), b.file(name)!.async("uint8array")]);
    if (sha256(contentA) !== sha256(contentB)) {
      if (process.env.SLIDE_AGENT_DEBUG_ROUNDTRIP) process.stderr.write(`round-trip part differs: ${name}\n`);
      return false;
    }
  }
  return true;
}

export async function preloadSceneFaces(scene: SceneGraph, text: TextEngine): Promise<void> {
  const requests = new Map<string, { family: string; weight: number; italic: boolean }>();
  for (const slide of scene.slides) {
    for (const element of slide.elements) {
      const style = element.kind === "text" ? element.style : element.kind === "shape" && element.text ? element.text.style : undefined;
      if (!style) continue;
      const family = style.family ?? style.font;
      const weight = style.weight ?? (style.bold ? 700 : 400);
      for (const [w, italic] of [[weight, false], [Math.min(900, Math.max(700, weight + 300)), false], [weight, true]] as const) {
        requests.set(`${family}|${w}|${italic}`, { family, weight: w, italic });
      }
    }
  }
  await Promise.all([...requests.values()].map((request) => text.load(request)));
}

export { Engine as SlideEngine };
