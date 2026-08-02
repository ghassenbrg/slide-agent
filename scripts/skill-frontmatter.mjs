export function hasSlideAgentFrontmatter(source) {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const frontmatter = normalized.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/)?.[1];
  if (!frontmatter) return false;
  return frontmatter.split("\n").some((line) => {
    const value = line.match(/^name\s*:\s*(.*?)\s*$/)?.[1] ?? "";
    return value.replace(/^(?:"([^"]*)"|'([^']*)')$/, "$1$2") === "slide-agent";
  });
}
