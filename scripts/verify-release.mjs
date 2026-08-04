#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { auditPublicContent } from "./audit-public-content.mjs";
import { verifyLockfile } from "./verify-lockfile.mjs";
import { hasWorkflowFragment, normalizeWorkflowText } from "./workflow-fragments.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const exists = async (relative) => access(path.join(root, relative)).then(() => true).catch(() => false);

export async function verifyRelease() {
  const problems = [];
  const execute = promisify(execFile);

  const packageJson = await json("package.json");
  const packageLock = await json("package-lock.json");
  const extensionJson = await json("extensions/vscode/package.json");
  const extensionLock = await json("extensions/vscode/package-lock.json");
  const pluginJson = await json("distribution/codex/plugins/slide-agent/.codex-plugin/plugin.json");
  const ciWorkflow = normalizeWorkflowText(await readFile(path.join(root, ".github/workflows/slide-agent-ci.yml"), "utf8"));
  const releaseWorkflow = normalizeWorkflowText(await readFile(path.join(root, ".github/workflows/release.yml"), "utf8"));
  const sourceVersion = (await readFile(path.join(root, "src/version.ts"), "utf8")).match(/VERSION\s*=\s*"([^"]+)"/)?.[1];
  const versions = {
    package: packageJson.version,
    packageLock: packageLock.version,
    packageLockRoot: packageLock.packages?.[""]?.version,
    extension: extensionJson.version,
    extensionLock: extensionLock.version,
    extensionLockRoot: extensionLock.packages?.[""]?.version,
    plugin: pluginJson.version,
    source: sourceVersion,
  };
  const allowedRuntimeLicenses = new Set(["MIT", "ISC", "(MIT AND Zlib)", "(MIT OR GPL-3.0-or-later)"]);
  await verifyLockfile().catch((error) => problems.push(error instanceof Error ? error.message : String(error)));
  for (const [packagePath, metadata] of Object.entries(packageLock.packages ?? {})) {
    if (!packagePath || metadata.dev) continue;
    if (!metadata.license) problems.push(`${packagePath} has no declared runtime license`);
    else if (!allowedRuntimeLicenses.has(metadata.license)) problems.push(`${packagePath} uses an unreviewed runtime license: ${metadata.license}`);
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.version)) problems.push(`invalid release version: ${packageJson.version}`);
  for (const [surface, version] of Object.entries(versions)) {
    if (version !== packageJson.version) problems.push(`${surface} version ${String(version)} does not match ${packageJson.version}`);
  }
  if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME !== `v${packageJson.version}`) {
    problems.push(`tag ${process.env.GITHUB_REF_NAME} does not match v${packageJson.version}`);
  }
  if (packageJson.private === true) problems.push("root npm package is marked private");
  if (packageJson.publishConfig?.access !== "public") problems.push("package publishConfig.access must be public");
  if (packageJson.publishConfig?.provenance !== true) problems.push("package publishConfig.provenance must be true");
  const expectedBins = {
    "slide-agent": "dist/cli.js",
    "slide-agent-mcp": "dist/mcp-server.js",
  };
  if (JSON.stringify(packageJson.bin) !== JSON.stringify(expectedBins)) {
    problems.push("npm bin entries must use npm-safe relative paths for slide-agent and slide-agent-mcp");
  }
  if (JSON.stringify(packageLock.packages?.[""]?.bin) !== JSON.stringify(expectedBins)) {
    problems.push("package-lock root bin entries do not match the publishable package metadata");
  }
  // Installing the library must not touch anything outside the project. Skill
  // registration belongs to the explicit `slide-agent install` command.
  for (const lifecycle of ["postinstall", "install", "preinstall"]) {
    if (packageJson.scripts?.[lifecycle]) problems.push(`npm package must not define a ${lifecycle} lifecycle script`);
  }
  if (packageLock.packages?.[""]?.hasInstallScript !== true) problems.push("package-lock root must record the npm install lifecycle script");
  if (packageJson.repository?.url !== "git+https://github.com/ghassenbrg/slide-agent.git") problems.push("npm repository URL is not the canonical public repository");
  if (extensionJson.publisher !== "ghassenbrg") problems.push("VS Code publisher id must be ghassenbrg");
  const requiredCiFragments = [
    "name: Slide Agent CI",
    "push:\n    branches:\n      - main",
    "pull_request:\n    branches:\n      - main\n    types:\n      - closed",
    "if: github.event_name == 'push' || github.event.pull_request.merged == true",
    "actions/checkout@v6",
    "actions/setup-node@v7",
  ];
  for (const fragment of requiredCiFragments) {
    if (!hasWorkflowFragment(ciWorkflow, fragment)) problems.push(`CI workflow is missing required configuration: ${fragment.split("\n")[0]}`);
  }
  const requiredReleaseFragments = [
    "name: Publish Slide Agent Release",
    "name: Verify Release",
    "name: Publish npm Package",
    "name: Publish VS Code Extension",
    "name: Create GitHub Release",
    "actions/checkout@v6",
    "actions/setup-node@v7",
    "actions/upload-artifact@v7",
    "actions/download-artifact@v7",
    "npm publish \"./release/slide-agent-core-${GITHUB_REF_NAME#v}.tgz\" --access public",
    "VSCE_PAT",
    "skipping VS Code extension publish.",
  ];
  for (const fragment of requiredReleaseFragments) {
    if (!hasWorkflowFragment(releaseWorkflow, fragment)) problems.push(`release workflow is missing required configuration: ${fragment.split("\n")[0]}`);
  }
  if (/actions\/(?:checkout|setup-node|upload-artifact|download-artifact)@v(?:1|2|3|4|5)(?:\D|$)/.test(`${ciWorkflow}\n${releaseWorkflow}`)) {
    problems.push("GitHub workflows contain an outdated JavaScript action generation");
  }
  const trackedPrivateArtifacts = (await execute("git", ["ls-files", "examples/output", "reference-material"], { cwd: root })).stdout.trim();
  if (trackedPrivateArtifacts) problems.push(`generated or private reference artifacts are tracked:\n${trackedPrivateArtifacts}`);
  for (const required of ["LICENSE", "README.md", "RELEASE.md", "SECURITY.md", "THIRD_PARTY_NOTICES.md"]) {
    if (!await exists(required)) problems.push(`missing required public file: ${required}`);
  }
  const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
  if (!changelog.includes(`## ${packageJson.version} -`)) problems.push(`CHANGELOG.md has no dated section for ${packageJson.version}`);
  const iconFiles = ["images/icon.png", "assets/icon.png", "extensions/vscode/icon.png", "distribution/codex/plugins/slide-agent/assets/icon.png"];
  const iconDigests = [];
  for (const relative of iconFiles) {
    if (!await exists(relative)) problems.push(`missing official icon: ${relative}`);
    else iconDigests.push(createHash("sha256").update(await readFile(path.join(root, relative))).digest("hex"));
  }
  if (new Set(iconDigests).size > 1) problems.push("distributed icons are not byte-identical");
  await auditPublicContent().catch((error) => problems.push(error instanceof Error ? error.message : String(error)));
  if (problems.length) {
    process.stderr.write(`Release verification failed:\n${problems.join("\n")}\n`);
    return 1;
  }

  process.stdout.write(`Release verification passed for ${packageJson.name}@${packageJson.version}.\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await verifyRelease();
  process.exitCode = exitCode;
}
