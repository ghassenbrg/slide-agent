#!/usr/bin/env node
/**
 * Builds every showcase deck the way a delivery should be built: rendered, with
 * the clean-directory round-trip gate on, and with the repair mode left at its
 * default so nothing silently restyles what the scenes authored.
 *
 * The point of running it is not the .pptx files. It is that the run either
 * proves each package rebuilds from its own emitted scene, or says which one
 * does not.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { readdir } from "node:fs/promises";

import { SlideAgent } from "../src/pipeline.js";
import { silentLogger } from "../src/logging/logger.js";

const root = path.resolve(import.meta.dirname, "..");
const showcase = path.join(root, "examples", "showcase");
const output = path.join(showcase, "output");

await rm(output, { recursive: true, force: true });

const agent = new SlideAgent(silentLogger);
const scenes = (await readdir(showcase)).filter((name) => name.endsWith(".ndjson")).sort();

let failed = 0;
for (const scene of scenes) {
  const name = path.basename(scene, ".ndjson");
  const result = await agent.create({
    command: "create",
    scene: path.join(showcase, scene),
    output: path.join(output, name, `${name}.pptx`),
    render: true,
    validate: true,
    roundTrip: true,
  });
  const readiness = result.presentationReadiness ?? "unknown";
  const roundTrip = result.validation?.roundTrip?.status ?? "skipped";
  const line = `${name.padEnd(26)} package=${(result.packageStatus ?? "?").padEnd(8)} readiness=${readiness.padEnd(10)} round-trip=${roundTrip}`;
  process.stdout.write(`${line}\n`);
  if (readiness !== "ready") {
    for (const reason of result.validation?.readinessReasons ?? []) process.stdout.write(`    ${reason}\n`);
  }
  if (result.packageStatus === "fail" || roundTrip === "fail") {
    failed += 1;
    for (const reason of result.validation?.readinessReasons ?? []) process.stderr.write(`    ${reason}\n`);
    if (result.validation?.roundTrip?.reason) process.stderr.write(`    round-trip: ${result.validation.roundTrip.reason}\n`);
  }
}

if (failed > 0) {
  process.stderr.write(`\n${failed} showcase package(s) did not hold together.\n`);
  process.exitCode = 1;
}
