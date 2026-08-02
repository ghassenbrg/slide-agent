#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveDependency(packages, packagePath, dependencyName) {
  let current = packagePath;
  while (true) {
    const candidate = current
      ? `${current}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;
    if (packages[candidate]) return candidate;
    if (!current) return undefined;
    const marker = current.lastIndexOf("/node_modules/");
    current = marker >= 0 ? current.slice(0, marker) : "";
  }
}

export function unresolvedLockfileDependencies(lockfile) {
  const packages = lockfile.packages ?? {};
  const missing = [];
  for (const [packagePath, metadata] of Object.entries(packages)) {
    for (const field of ["dependencies", "optionalDependencies"]) {
      for (const [dependencyName, range] of Object.entries(metadata[field] ?? {})) {
        if (!resolveDependency(packages, packagePath, dependencyName)) {
          missing.push({ packagePath: packagePath || "<root>", field, dependencyName, range });
        }
      }
    }
  }
  return missing;
}

export async function verifyLockfile(file = path.join(root, "package-lock.json")) {
  const lockfile = JSON.parse(await readFile(file, "utf8"));
  const missing = unresolvedLockfileDependencies(lockfile);
  if (missing.length) {
    const details = missing.map(({ packagePath, field, dependencyName, range }) =>
      `${packagePath} ${field}.${dependencyName} (${range})`,
    );
    throw new Error(`Lockfile has unresolved dependency entries:\n${details.join("\n")}`);
  }
  return { packagesChecked: Object.keys(lockfile.packages ?? {}).length };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  verifyLockfile()
    .then(({ packagesChecked }) => process.stdout.write(`Lockfile verification passed (${packagesChecked} packages).\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
