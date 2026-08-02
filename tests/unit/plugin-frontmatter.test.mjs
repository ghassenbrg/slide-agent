import { describe, expect, it } from "vitest";

import { hasSlideAgentFrontmatter } from "../../scripts/skill-frontmatter.mjs";

describe("Codex plugin skill frontmatter", () => {
  it.each([
    ["LF", "---\nname: slide-agent\ndescription: Test\n---\n"],
    ["CRLF", "---\r\nname: slide-agent\r\ndescription: Test\r\n---\r\n"],
    ["BOM and quoted name", "\uFEFF---\r\nname: \"slide-agent\"\r\ndescription: Test\r\n---\r\n"],
    ["leading metadata", "---\nlicense: MIT\nname: 'slide-agent'\ndescription: Test\n---\n"],
  ])("accepts valid %s frontmatter", (_label, source) => {
    expect(hasSlideAgentFrontmatter(source)).toBe(true);
  });

  it.each([
    "name: slide-agent\n",
    "---\nname: another-skill\n---\n",
    "---\ndescription: Missing name\n---\n",
  ])("rejects invalid frontmatter", (source) => {
    expect(hasSlideAgentFrontmatter(source)).toBe(false);
  });
});
