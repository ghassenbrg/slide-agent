import { describe, expect, it } from "vitest";

import { ALLOWED_LINK_SCHEMES, checkLink, sanitizeNativeOptions, toNativeHyperlink } from "../../src/utils/links.js";

describe("link checking", () => {
  it("accepts the schemes a real deck needs", () => {
    expect(checkLink("https://example.com/report").link?.url).toBe("https://example.com/report");
    expect(checkLink("http://example.com").link?.url).toBe("http://example.com/");
    expect(checkLink("mailto:security@example.com").link?.url).toBe("mailto:security@example.com");
    expect(ALLOWED_LINK_SCHEMES).toEqual(["http:", "https:", "mailto:"]);
  });

  it("reads a bare host as https rather than refusing it", () => {
    expect(checkLink("example.com/pricing").link?.url).toBe("https://example.com/pricing");
  });

  it("refuses schemes that reach outside the web", () => {
    for (const hostile of [
      "file:///etc/passwd",
      "file://C:/Users/someone/secrets.txt",
      "smb://fileserver/share",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      "ms-msdt:/id",
    ]) {
      const { link, rejected } = checkLink(hostile);
      expect(link, hostile).toBeUndefined();
      expect(rejected, hostile).toMatch(/Refused/);
    }
  });

  it("accepts an in-deck slide link", () => {
    expect(checkLink({ slide: 4 }).link).toEqual({ slide: 4 });
    expect(checkLink({ slide: 0 }).rejected).toMatch(/1-based/);
    expect(checkLink({ slide: 2.5 }).rejected).toMatch(/1-based/);
  });

  it("keeps a tooltip, which is what a screen reader announces", () => {
    expect(checkLink({ url: "https://example.com", tooltip: "The full report" }).link)
      .toEqual({ url: "https://example.com/", tooltip: "The full report" });
  });

  it("refuses what cannot be parsed as a link at all", () => {
    expect(checkLink("").rejected).toMatch(/empty/);
    expect(checkLink("   ").rejected).toMatch(/empty/);
    expect(checkLink(42).rejected).toMatch(/must be a URL/);
    expect(checkLink({ href: "https://example.com" }).rejected).toMatch(/must be a URL/);
    expect(checkLink("https://exa mple.com\u0000/x").rejected).toMatch(/Refused/);
  });

  it("treats an absent link as no link rather than an error", () => {
    expect(checkLink(undefined)).toEqual({});
    expect(checkLink(null)).toEqual({});
  });

  it("renders the PptxGenJS shape of a checked link", () => {
    expect(toNativeHyperlink({ url: "https://example.com/", tooltip: "Report" }))
      .toEqual({ url: "https://example.com/", tooltip: "Report" });
    expect(toNativeHyperlink({ slide: 3 })).toEqual({ slide: 3 });
  });
});

describe("native options passthrough", () => {
  it("leaves options without a hyperlink untouched", () => {
    const options = { shadow: { type: "outer" }, rotate: 12 };
    expect(sanitizeNativeOptions(options)).toBe(options);
    expect(sanitizeNativeOptions(undefined)).toBeUndefined();
  });

  it("keeps a hyperlink that passes the same check as the contract field", () => {
    expect(sanitizeNativeOptions({ hyperlink: { url: "https://example.com" } }))
      .toEqual({ hyperlink: { url: "https://example.com/" } });
  });

  it("strips a hyperlink smuggled through the passthrough and says why", () => {
    const rejections: string[] = [];
    const result = sanitizeNativeOptions(
      { bold: true, hyperlink: { url: "file:///Users/someone/.ssh/id_rsa" } },
      (reason) => rejections.push(reason),
    );
    expect(result).toEqual({ bold: true });
    expect(rejections).toHaveLength(1);
    expect(rejections[0]).toMatch(/file:/);
  });
});
