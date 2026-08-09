#!/usr/bin/env node
/**
 * Production dependency audit, with exceptions that have to justify
 * themselves.
 *
 * `npm audit --audit-level=high` is the right gate until an advisory has no
 * fix. Then it becomes a build that cannot go green, and the pressure is to
 * delete the gate — which is how a project stops noticing the advisories that
 * *do* have fixes. This keeps the gate and allows a named exception instead,
 * on three conditions:
 *
 *   1. It names specific advisory IDs. Anything else still fails.
 *   2. It expires. A stale exception fails the build and forces a re-read.
 *   3. It states a reason a machine can re-check. If the reason stops being
 *      true, the exception fails on its own without anyone remembering to
 *      look.
 *
 * Run with `--json` for machine-readable output.
 */
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Severities this gate refuses. Matches `npm audit --audit-level=high`. */
export const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

/**
 * Module specifiers that would mean a package really does load `image-size`.
 * pptxgenjs's own (commented-out) call site asks for `sizeof`, which is not
 * even the package's name, so both spellings are checked.
 */
const IMAGE_SIZE_SPECIFIERS = /(^|[/'"])(image-size|sizeof)$/i;

/**
 * Strip comments before deciding whether a reference is live. The whole point
 * of the pptxgenjs exception is that its only reference sits inside a
 * `/* ... *\/` block marked "currently unused".
 */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Every module specifier a bundle actually imports at runtime. */
export function importedSpecifiers(source) {
  const live = stripComments(source);
  const found = new Set();
  for (const match of live.matchAll(/(?:require|import)\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) found.add(match[2]);
  for (const match of live.matchAll(/\bfrom\s*(['"])([^'"]+)\1/g)) found.add(match[2]);
  return [...found];
}

/**
 * The reason the image-size advisories are accepted: pptxgenjs declares the
 * dependency but never loads it, so the vulnerable ICNS, JXL, and HEIF parsers
 * are unreachable. Re-checked on every run, because a pptxgenjs upgrade could
 * make it false.
 */
export async function pptxgenjsNeverLoadsImageSize() {
  const distDirectory = path.join(root, "node_modules", "pptxgenjs", "dist");
  const entries = await readdir(distDirectory).catch(() => []);
  const bundles = entries.filter((name) => name.endsWith(".js"));
  if (bundles.length === 0) {
    return { holds: false, detail: "pptxgenjs is not installed, so the exception cannot be verified. Run npm ci first." };
  }
  for (const bundle of bundles) {
    const source = await readFile(path.join(distDirectory, bundle), "utf8");
    const offending = importedSpecifiers(source).filter((specifier) => IMAGE_SIZE_SPECIFIERS.test(specifier));
    if (offending.length > 0) {
      return {
        holds: false,
        detail: `pptxgenjs/dist/${bundle} now imports ${offending.join(", ")}. The vulnerable parsers are reachable and this exception no longer applies.`,
      };
    }
  }
  return { holds: true, detail: `checked ${bundles.length} pptxgenjs bundle(s); no live image-size import` };
}

/**
 * Advisories accepted for now, each with an expiry and a re-checkable reason.
 * Keep this list short and argue for every line.
 */
export const ACCEPTED_ADVISORIES = [
  {
    ids: ["GHSA-w3rx-r6r6-pgpr", "GHSA-5p2g-fcmc-qvqq"],
    module: "image-size",
    expires: "2026-11-09",
    reason: [
      "Denial of service through infinite loops in the ICNS, JXL, and HEIF parsers.",
      "Every published image-size version is affected (<=2.0.2), so there is no upgrade that resolves it,",
      "and npm's suggested fix downgrades pptxgenjs from 4.0.1 to 1.1.5 — a five-major regression, not a fix.",
      "pptxgenjs declares image-size as a dependency but never loads it: its only call site is a commented-out",
      "function marked \"currently unused\" that asks for a module named `sizeof`, which does not exist.",
      "Slide Agent additionally accepts only PNG, JPEG, GIF, and WebP by magic bytes, so an ICNS, JXL, or HEIF",
      "file cannot reach an image parser through this package at all.",
    ].join(" "),
    verify: pptxgenjsNeverLoadsImageSize,
  },
];

/** Flatten `npm audit --json` into one entry per advisory. */
export function collectFindings(report) {
  const findings = new Map();
  for (const [module, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== "object") continue;
      const id = via.url?.split("/").pop() ?? via.source ?? via.title;
      if (!id) continue;
      findings.set(id, {
        id,
        module: via.name ?? module,
        severity: via.severity ?? vulnerability.severity,
        title: via.title ?? "",
        url: via.url ?? "",
      });
    }
  }
  return [...findings.values()];
}

/**
 * Decide the build's fate. Pure, so the policy is testable without running
 * npm or reaching the network.
 */
export function evaluate(findings, { now = new Date(), verified = new Map() } = {}) {
  const problems = [];
  const accepted = [];
  const blocking = findings.filter((finding) => BLOCKING_SEVERITIES.has(finding.severity));

  for (const finding of blocking) {
    const exception = ACCEPTED_ADVISORIES.find((entry) => entry.ids.includes(finding.id));
    if (!exception) {
      problems.push(`${finding.severity}: ${finding.module} ${finding.id} — ${finding.title || "no title"} (${finding.url})`);
      continue;
    }
    const expiry = new Date(`${exception.expires}T00:00:00Z`);
    if (now >= expiry) {
      problems.push(`${finding.module} ${finding.id}: the accepted exception expired on ${exception.expires}. Re-check whether a fix exists, then extend it or remove the dependency.`);
      continue;
    }
    const check = verified.get(exception);
    if (check && !check.holds) {
      problems.push(`${finding.module} ${finding.id}: the exception no longer holds — ${check.detail}`);
      continue;
    }
    accepted.push({ ...finding, expires: exception.expires, evidence: check?.detail ?? "not re-checked" });
  }

  // An exception nobody needs any more is dead weight, and quietly stops
  // anyone noticing the advisory was fixed upstream.
  for (const exception of ACCEPTED_ADVISORIES) {
    if (!exception.ids.some((id) => blocking.some((finding) => finding.id === id))) {
      problems.push(`The accepted exception for ${exception.module} (${exception.ids.join(", ")}) matches nothing npm reports. It is probably fixed upstream — remove it from scripts/audit-dependencies.mjs.`);
    }
  }

  return { problems, accepted, blocking };
}

async function npmAudit() {
  const { stdout } = await run("npm", ["audit", "--omit=dev", "--json"], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
    shell: process.platform === "win32",
  }).catch((error) => {
    // npm exits non-zero whenever it finds anything, which is the normal path.
    if (error?.stdout) return { stdout: error.stdout };
    throw error;
  });
  return JSON.parse(stdout);
}

export async function auditDependencies({ now = new Date() } = {}) {
  const findings = collectFindings(await npmAudit());
  const verified = new Map();
  for (const exception of ACCEPTED_ADVISORIES) {
    verified.set(exception, exception.verify ? await exception.verify() : { holds: true, detail: "no automated check" });
  }
  return evaluate(findings, { now, verified });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = await auditDependencies();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    for (const entry of result.accepted) {
      process.stdout.write(`accepted  ${entry.module} ${entry.id} (${entry.severity}) until ${entry.expires}\n          ${entry.evidence}\n`);
    }
    if (result.problems.length === 0) {
      process.stdout.write(`Dependency audit passed. ${result.accepted.length} documented exception(s), no unreviewed high or critical advisories.\n`);
    }
  }
  if (result.problems.length > 0) {
    process.stderr.write(`Dependency audit failed:\n${result.problems.map((problem) => `  ${problem}`).join("\n")}\n`);
    process.exitCode = 1;
  }
}
