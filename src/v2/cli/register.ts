import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Command } from "commander";

import { readSceneNdjson } from "../../serialization/scene-ndjson.js";
import { COMMANDS, withinBudget } from "../commands/registry.js";
import { migrateOutline } from "../compat-v1/migrate.js";
import { Engine } from "../engine/engine.js";
import { fillDecks } from "../engine/fill.js";
import { importTemplate } from "../engine/brand.js";
import { fetchFamily } from "../text/fetch.js";
import { searchFamilies } from "../text/catalog.js";
import { sharedFontRegistry } from "../text/registry.js";

/**
 * V2 commands on the existing CLI. The registry supplies behaviour and
 * descriptions; this file only maps flags onto command inputs. `build` and
 * `edit` keep their V1 forms (`--script`, `--input`) and switch to V2 when
 * given `--intent`, `--deck`, `--ops`, or `--instruction`.
 */

type Print = (value: unknown) => void;

async function readJsonFile(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

function registryCommand(name: string) {
  const found = COMMANDS.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No command ${name}`);
  return found;
}

async function run(name: string, input: Record<string, unknown>, print: Print): Promise<void> {
  const definition = registryCommand(name);
  const engine = new Engine();
  const result = await (definition.run as (input: unknown, context: { engine: Engine }) => Promise<{ payload: Record<string, unknown>; images?: string[] }>)(definition.input.parse(input), { engine });
  print({ ...result.payload, ...(result.images?.length ? { images: result.images } : {}) });
  const verdict = result.payload.verdict as { state?: string } | undefined;
  if (verdict?.state === "broken" || verdict?.state === "needs-attention") process.exitCode = 2;
}

export function isV2Build(options: Record<string, unknown>): boolean {
  return Boolean(options.intent || options.deck) && !options.script;
}

export async function runV2Build(options: Record<string, unknown>, print: Print): Promise<void> {
  const deck = String(options.deck ?? (options.intent ? path.join(path.dirname(String(options.intent)), path.basename(String(options.intent)).replace(/(\.intent)?\.json$/i, "")) : ""));
  if (!deck) throw new Error("build needs --deck <directory> (and --intent <file> for a new deck).");
  await run("build", {
    deck,
    ...(options.intent ? { intentPath: String(options.intent) } : {}),
    ...(options.check ? { mode: "check" } : {}),
    ...(options.strict ? { strict: true } : {}),
  }, print);
}

export function isV2Edit(options: Record<string, unknown>): boolean {
  return Boolean(options.deck || options.ops || options.instruction);
}

export async function runV2Edit(options: Record<string, unknown>, print: Print): Promise<void> {
  if (!options.deck) throw new Error("edit needs --deck <directory or .pptx>.");
  await run("edit", {
    deck: String(options.deck),
    ...(options.ops ? { ops: await readJsonFile(String(options.ops)) } : {}),
    ...(options.instruction ? { instruction: String(options.instruction) } : {}),
    ...(options.profile ? { profile: String(options.profile) } : {}),
  }, print);
}

export function registerV2Commands(program: Command, print: Print): void {
  program.command("catalog")
    .description(registryCommand("catalog").description)
    .option("--include <sections>", "Comma-separated: grammar, components, recipes, fonts, icons, presets, textures, schema")
    .option("--fonts <query>", "Search fonts")
    .option("--icons <query>", "Search icons")
    .option("--grammar", "Print only the grammar page as Markdown")
    .action(async (options) => {
      if (options.grammar) {
        process.stdout.write((await import("../commands/catalog.js")).GRAMMAR);
        return;
      }
      await run("catalog", {
        ...(options.include ? { include: String(options.include).split(",").map((entry: string) => entry.trim()) } : {}),
        ...(options.fonts ? { fonts: options.fonts } : {}),
        ...(options.icons ? { icons: options.icons } : {}),
      }, print);
    });

  program.command("check")
    .description("Validate and solve an intent without writing anything (V2)")
    .requiredOption("--intent <file>", "slide-agent.intent/1 JSON")
    .option("--deck <directory>", "Deck directory used for relative assets and incremental comparison")
    .action(async (options) => {
      await run("build", { deck: options.deck ?? path.dirname(options.intent), intentPath: options.intent, mode: "check" }, print);
    });

  program.command("explore")
    .description("Render up to 3 design requests × 4 slides side by side (V2)")
    .requiredOption("--deck <directory>", "Deck directory")
    .requiredOption("--designs <file>", "JSON array of design requests")
    .requiredOption("--slides <ids>", "Comma-separated slide ids")
    .option("--intent <file>", "Intent to explore instead of the deck's")
    .action(async (options) => {
      await run("build", {
        deck: options.deck,
        mode: "explore",
        ...(options.intent ? { intent: await readJsonFile(options.intent) } : {}),
        explore: { designs: await readJsonFile(options.designs), slides: String(options.slides).split(",").map((entry) => entry.trim()) },
      }, print);
    });

  program.command("view")
    .description(registryCommand("view").description)
    .requiredOption("--deck <directory>", "Deck directory")
    .requiredOption("--what <view>", "sheet, slides, crop, rhythm, expand, report, or explain")
    .option("--slides <ids>", "Comma-separated slide ids")
    .option("--element <id>", "Element id (crop, explain)")
    .option("--issue <code>", "Issue code (crop)")
    .option("--page <n>", "Report page", Number)
    .action(async (options) => {
      await run("view", {
        deck: options.deck,
        what: options.what,
        ...(options.slides ? { slides: String(options.slides).split(",").map((entry) => entry.trim()) } : {}),
        ...(options.element ? { element: options.element } : {}),
        ...(options.issue ? { issue: options.issue } : {}),
        ...(options.page !== undefined ? { page: options.page } : {}),
      }, print);
    });

  program.command("explain")
    .description("Why a slide or element looks the way it does: provenance, fit steps, adjustments, decisions (V2)")
    .requiredOption("--deck <directory>", "Deck directory")
    .option("--slide <id>", "Slide id")
    .option("--element <id>", "Element id")
    .action(async (options) => {
      print(await new Engine().explain({ deck: options.deck, ...(options.slide ? { slide: options.slide } : {}), ...(options.element ? { element: options.element } : {}) }));
    });

  program.command("finalize")
    .description(registryCommand("finalize").description)
    .requiredOption("--deck <directory>", "Deck directory")
    .option("--export <formats>", "Comma-separated: pdf, png")
    .option("--no-round-trip", "Skip the clean-directory rebuild")
    .action(async (options) => {
      await run("finalize", { deck: options.deck, ...(options.export ? { exports: String(options.export).split(",").map((entry) => entry.trim()) } : {}), roundTrip: options.roundTrip !== false }, print);
    });

  program.command("inspect")
    .description(registryCommand("inspect").description)
    .requiredOption("--file <pptx>", "A .pptx or .potx")
    .option("--page <n>", "Outline page", Number)
    .action(async (options) => {
      await run("inspect", { file: options.file, ...(options.page !== undefined ? { page: options.page } : {}) }, print);
    });

  program.command("generate")
    .description(registryCommand("generate").description)
    .requiredOption("--deck <directory>", "Output deck directory")
    .requiredOption("--brief <file>", "Brief as text or Markdown")
    .option("--sources <files>", "Comma-separated source files (md, txt, csv, json, docx, pdf, pptx)")
    .option("--design <file>", "Design request JSON to direct within (e.g. {\"brand\": \"acme.potx\"})")
    .option("--profile <name>", "quality, balanced, or draft", "balanced")
    .option("--slides <n>", "Target slide count", Number)
    .option("--format <format>", "16:9, 4:3, 9:16, a4-landscape, a4-portrait")
    .action(async (options) => {
      await run("generate", {
        deck: options.deck,
        brief: await readFile(options.brief, "utf8"),
        ...(options.sources ? { sources: String(options.sources).split(",").map((entry) => entry.trim()) } : {}),
        ...(options.design ? { design: await readJsonFile(options.design) } : {}),
        profile: options.profile,
        ...(options.slides ? { slides: options.slides } : {}),
        ...(options.format ? { format: options.format } : {}),
      }, print);
    });

  program.command("fill")
    .description("Fill an intent template with data rows: one deck per row, no model (V2)")
    .requiredOption("--template <file>", "Intent template with {{bindings}}, $each, $if")
    .requiredOption("--data <file>", "JSON (object or array) or CSV/TSV")
    .requiredOption("--out <directory>", "Output directory; one deck per row")
    .option("--name-by <field>", "Data field naming each deck")
    .option("--previews", "Render a preview sheet per deck")
    .action(async (options) => {
      const results = await fillDecks(new Engine(), { template: options.template, data: options.data, out: options.out, ...(options.nameBy ? { nameBy: options.nameBy } : {}), previews: options.previews ? "sheet" : "none" });
      print({ decks: results.map((entry) => ({ name: entry.name, deck: entry.deck, state: entry.state, ...(entry.missing.length ? { missing: entry.missing } : {}), ...(entry.result ? { verdict: withinBudget(entry.result.verdict, 300) } : {}) })) });
      if (results.some((entry) => entry.state !== "ready-unrendered" && entry.state !== "ready")) process.exitCode = 2;
    });

  program.command("migrate")
    .description("Convert a V1 scene (.ndjson) or outline (.json) into a V2 intent, with a report of what mapped")
    .requiredOption("--input <file>", "V1 scene NDJSON or outline JSON")
    .requiredOption("--output <file>", "Intent JSON to write")
    .action(async (options) => {
      print(await migrateFile(String(options.input), String(options.output)));
    });

  program.command("brand")
    .description("Import a .potx/.pptx as a V2 brand pack: locked tokens, layouts, and placeholders")
    .requiredOption("--input <file>", "Template .potx or .pptx")
    .option("--output <file>", "Write the brand pack JSON here")
    .action(async (options) => {
      const pack = await importTemplate(options.input);
      if (options.output) {
        await writeFile(options.output, `${JSON.stringify(pack, null, 2)}\n`);
        print({ output: path.resolve(options.output), name: pack.name, locks: pack.locks, layouts: pack.layouts.length });
      } else {
        print(pack);
      }
    });

  program.command("font")
    .description("Search the font catalog, list local families, or fetch an open-licence family into the cache (V2)")
    .option("--search <query>", "Search catalogued families by name or class")
    .option("--add <family>", "Download an open-licence family from Google Fonts into the font cache")
    .option("--weights <list>", "Weights to fetch, e.g. 400,700")
    .option("--local", "List families found on this machine")
    .action(async (options) => {
      if (options.add) {
        const fetched = await fetchFamily(options.add, { ...(options.weights ? { weights: String(options.weights).split(",").map(Number) } : {}) });
        print({ family: options.add, files: fetched.map((entry) => ({ file: entry.file, weight: entry.weight, italic: entry.italic, sha256: entry.sha256 })) });
        return;
      }
      if (options.local) {
        print({ families: await sharedFontRegistry().families(), directories: sharedFontRegistry().searchDirectories() });
        return;
      }
      print({ families: searchFamilies(options.search ?? "", 30) });
    });

}

export async function migrateFile(input: string, output: string): Promise<Record<string, unknown>> {
  let outline;
  if (input.endsWith(".ndjson")) outline = await readSceneNdjson(input);
  else outline = JSON.parse(await readFile(input, "utf8"));
  const migrated = migrateOutline(outline);
  await writeFile(output, `${JSON.stringify(migrated.intent, null, 2)}\n`);
  return { output: path.resolve(output), report: migrated.report };
}
