import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/load-config.js";
import { RequestAnalyzer } from "../../src/planner/request-analyzer.js";

const configDir = path.resolve(import.meta.dirname, "../../config");

describe("RequestAnalyzer", () => {
  it("extracts a usable presentation brief without clarification", async () => {
    const analyzer = new RequestAnalyzer(await loadConfig(configDir));
    const brief = analyzer.analyze(`
# Platform migration decision
Audience: Engineering directors
Objective: Approve the target architecture
Tone: precise
Slides: 7
Topics: architecture, workflow, roadmap
`);
    expect(brief.title).toBe("Platform migration decision");
    expect(brief.audience).toBe("Engineering directors");
    expect(brief.slideCount).toBe(7);
    expect(brief.presentationType).toBe("technical");
    expect(brief.keyTopics).toContain("architecture");
  });

  it("clamps unsafe slide counts to configured limits", async () => {
    const config = await loadConfig(configDir);
    const brief = new RequestAnalyzer(config).analyze("# Test\nSlides: 500");
    expect(brief.slideCount).toBe(config.generation.maximumSlideCount);
  });
});
