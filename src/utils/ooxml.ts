import path from "node:path";

export function resolvePackageTarget(sourcePart: string, target: string): string {
  const normalizedTarget = target.replace(/\\/g, "/");
  if (normalizedTarget.startsWith("/")) return path.posix.normalize(normalizedTarget.slice(1));
  return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePart), normalizedTarget));
}

export function relationshipOwnerPath(relationshipPart: string): string {
  const directory = path.posix.dirname(path.posix.dirname(relationshipPart));
  const filename = path.posix.basename(relationshipPart).replace(/\.rels$/, "");
  return path.posix.join(directory, filename);
}
