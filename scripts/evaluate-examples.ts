#!/usr/bin/env node
/**
 * Does the showcase actually demonstrate range, or six palettes over one deck?
 *
 * An open schema proves nothing on its own. This builds every showcase scene,
 * takes each deck's geometry signature, and compares them pairwise — so the
 * claim "these are six different designs" is a measurement rather than an
 * assertion. It also builds a deliberate palette-only restyle of one of them
 * and checks that the signature calls it what it is: the same deck.
 *
 * The report is a diagnostic. Nothing here prescribes a replacement layout, and
 * nothing rewards novelty for its own sake: a metric that did either would be
 * the next cage.
 */
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { SlideAgent } from "../src/pipeline.js";
import { silentLogger } from "../src/logging/logger.js";
import { outputLayout } from "../src/output/output-layout.js";
import {
  NEAR_DUPLICATE_THRESHOLD,
  SIMILAR_THRESHOLD,
  compareSignatures,
  signDeck,
  type DeckSignature,
} from "../src/evaluation/visual-signature.js";
import type { DeckManifest } from "../src/types/index.js";

const root = path.resolve(import.meta.dirname, "..");
const showcaseDirectory = path.join(root, "examples", "showcase");
const reportPath = path.join(showcaseDirectory, "similarity-report.json");

const check = process.argv.includes("--check");

async function buildSignature(agent: SlideAgent, scene: string, output: string): Promise<DeckSignature> {
  const result = await agent.create({
    command: "create",
    scene,
    output,
    validate: false,
    render: false,
    autoFix: false,
  });
  if (result.status === "error") {
    throw new Error(`${path.basename(scene)} did not build: ${result.errors[0]?.message ?? "unknown error"}`);
  }
  const manifest = JSON.parse(await readFile(outputLayout(output).manifest, "utf8")) as DeckManifest;
  return signDeck(manifest);
}

/**
 * The control case: the same deck with every colour changed and nothing else.
 * If the signature cannot tell this apart from a genuine second design, it is
 * measuring paint rather than composition.
 */
async function paletteOnlyRestyle(scene: string, workspace: string): Promise<string> {
  const original = await readFile(scene, "utf8");
  const swapped = original.replace(/"([0-9A-F]{6})"/g, (match, hex: string) => {
    const rotated = hex.slice(2) + hex.slice(0, 2);
    return `"${rotated}"`;
  });
  const target = path.join(workspace, "palette-restyle.ndjson");
  await writeFile(target, swapped);
  return target;
}

const workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-evaluate-"));
try {
  const agent = new SlideAgent(silentLogger);
  const scenes = (await readdir(showcaseDirectory))
    .filter((name) => name.endsWith(".ndjson"))
    .sort()
    .map((name) => path.join(showcaseDirectory, name));

  if (scenes.length === 0) throw new Error(`No showcase scenes found in ${showcaseDirectory}.`);

  const signatures = new Map<string, DeckSignature>();
  for (const scene of scenes) {
    const name = path.basename(scene, ".ndjson");
    signatures.set(name, await buildSignature(agent, scene, path.join(workspace, name, `${name}.pptx`)));
  }

  const pairs: Array<{ left: string; right: string; similarity: number; verdict: string; explanation: string }> = [];
  const names = [...signatures.keys()];
  for (let index = 0; index < names.length; index += 1) {
    for (let other = index + 1; other < names.length; other += 1) {
      const left = names[index]!;
      const right = names[other]!;
      const result = compareSignatures(signatures.get(left)!, signatures.get(right)!);
      pairs.push({ left, right, similarity: result.similarity, verdict: result.verdict, explanation: result.explanation });
    }
  }

  // The control: a palette-only restyle must read as the same deck.
  const control = names[0]!;
  const restyledScene = await paletteOnlyRestyle(path.join(showcaseDirectory, `${control}.ndjson`), workspace);
  const restyled = await buildSignature(agent, restyledScene, path.join(workspace, "control", "control.pptx"));
  const controlResult = compareSignatures(signatures.get(control)!, restyled);

  const worst = pairs.reduce((highest, pair) => pair.similarity > highest.similarity ? pair : highest, pairs[0]!);
  const report = {
    schemaVersion: "1.0" as const,
    generatedAt: new Date().toISOString(),
    thresholds: { nearDuplicate: NEAR_DUPLICATE_THRESHOLD, similar: SIMILAR_THRESHOLD },
    decks: names.map((name) => {
      const signature = signatures.get(name)!;
      return {
        name,
        slides: signature.slideCount,
        silhouetteVariety: Number(signature.silhouetteVariety.toFixed(3)),
        rhythm: Number(signature.rhythm.toFixed(3)),
      };
    }),
    pairs: [...pairs].sort((left, right) => right.similarity - left.similarity),
    mostSimilarPair: { left: worst.left, right: worst.right, similarity: worst.similarity, verdict: worst.verdict },
    paletteOnlyControl: {
      deck: control,
      similarity: controlResult.similarity,
      verdict: controlResult.verdict,
      note: "A colour-only restyle of one showcase deck. It must read as near-duplicate; if it does not, the signature is measuring paint rather than composition.",
    },
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (check) {
    const failures: string[] = [];
    for (const pair of pairs) {
      if (pair.similarity >= NEAR_DUPLICATE_THRESHOLD) {
        failures.push(`${pair.left} and ${pair.right} are near-duplicates (${pair.similarity}).`);
      }
    }
    if (controlResult.verdict !== "near-duplicate") {
      failures.push(`The palette-only control scored ${controlResult.similarity} and was classified "${controlResult.verdict}". A colour swap must read as the same deck.`);
    }
    process.stdout.write(`${serialized}`);
    if (failures.length > 0) {
      process.stderr.write(`\n${failures.join("\n")}\n`);
      process.exitCode = 1;
    }
  } else {
    await writeFile(reportPath, serialized);
    process.stdout.write(`Wrote ${path.relative(root, reportPath)}\n`);
    for (const pair of report.pairs) {
      process.stdout.write(`  ${pair.similarity.toFixed(3)}  ${pair.verdict.padEnd(14)}  ${pair.left} ↔ ${pair.right}\n`);
    }
    process.stdout.write(`\n  control (palette-only restyle of ${control}): ${controlResult.similarity.toFixed(3)} → ${controlResult.verdict}\n`);
  }
} finally {
  await rm(workspace, { recursive: true, force: true });
}
