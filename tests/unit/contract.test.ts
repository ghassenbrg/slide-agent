import { describe, expect, it } from "vitest";

import {
  CONTRACT_VERSION,
  ContractValidationError,
  SCENE_SCHEMA_ID,
  allContractJsonSchemas,
  authoringGuide,
  contractDescriptor,
  contractJsonSchema,
  guideAsMarkdown,
  guideAsPrompt,
  guideSectionIds,
  parseContract,
  parseSceneElement,
  supportsContractVersion,
} from "../../src/contract/index.js";
import { parseStructuredRequest } from "../../src/types/schemas.js";

const brief = {
  title: "Contract test",
  audience: "Reviewers",
  objective: "Verify the contract",
  presentationType: "technical",
  tone: "precise",
  visualDirection: "editorial",
  slideCount: 2,
  language: "English",
  outputRequirements: ["editable PowerPoint"],
  keyTopics: ["contract"],
  sourcePrompt: "test",
};

describe("contract descriptor", () => {
  it("publishes a version independent of the engine version", () => {
    expect(CONTRACT_VERSION).toMatch(/^\d+\.\d+$/);
    expect(supportsContractVersion(CONTRACT_VERSION)).toBe(true);
    // A 0.x contract makes no compatibility promise across minor versions —
    // that is what 0.x means — so a minor bump must read as incompatible.
    const [major = 0, minor = 0] = CONTRACT_VERSION.split(".").map(Number);
    expect(supportsContractVersion(`${major}.${minor + 1}`)).toBe(major !== 0);
    expect(supportsContractVersion(`${major + 1}.0`)).toBe(false);
  });

  it("names every schema a host can request", () => {
    const descriptor = contractDescriptor();
    expect(descriptor.sceneSchema).toBe(SCENE_SCHEMA_ID);
    expect(descriptor.schemas).toContain("outline");
    expect(descriptor.schemas).toContain("canvasElement");
    for (const name of descriptor.schemas) {
      expect(contractJsonSchema(name).$schema, name).toBeTruthy();
    }
    expect(Object.keys(allContractJsonSchemas())).toEqual(descriptor.schemas);
  });

  it("publishes a discriminated canvas-element schema rather than an opaque object", () => {
    const schema = contractJsonSchema("canvasElement") as { oneOf?: unknown[]; anyOf?: unknown[] };
    const variants = (schema.oneOf ?? schema.anyOf ?? []) as Array<{ properties?: { type?: { const?: string } } }>;
    // Assert the element types by name; a bare count silently drifts whenever a
    // new element type is added, which is the change most worth noticing.
    expect(variants.map((variant) => variant.properties?.type?.const).sort()).toEqual([
      "chart", "connector", "diagram", "image", "native-chart", "shape", "table", "text",
    ]);
  });
});

describe("contract validation", () => {
  it("reports the exact path of every problem", () => {
    expect.assertions(3);
    try {
      parseContract("outline", { brief, narrative: "n", slides: [{ id: "a", kind: "title", title: "T", canvas: [{ id: "x", type: "text", x: 1, y: 1, w: "wide", h: 1, text: "hi" }] }] });
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValidationError);
      const issues = (error as ContractValidationError).issues;
      expect(issues.some((issue) => issue.path.includes("slides[0].canvas[0]"))).toBe(true);
      expect((error as ContractValidationError).message).toContain("authoring contract");
    }
  });

  it("keeps open-ended fields a model adds for its own reasoning", () => {
    const outline = parseContract("outline", {
      brief,
      narrative: "n",
      creativeDirection: { name: "Test", myOwnField: "kept", palette: { accent: "FF0000", custom: { spark: "00FF00" } } },
      slides: [{ id: "a", kind: "invented-kind", title: "T", myOwnSlideField: 42 }],
    });
    expect((outline.creativeDirection as Record<string, unknown>).myOwnField).toBe("kept");
    expect((outline.slides[0] as Record<string, unknown>).myOwnSlideField).toBe(42);
  });

  it("rejects a chart whose series do not line up with its labels", () => {
    expect(() => parseContract("chart", { kind: "bar", labels: ["A", "B"], series: [{ name: "One", values: [1] }] }))
      .toThrow(/one value per category label/);
  });

  it("rejects a pie chart with more than one series", () => {
    expect(() => parseContract("chart", { kind: "pie", labels: ["A"], series: [{ name: "a", values: [1] }, { name: "b", values: [2] }] }))
      .toThrow(/exactly one series/);
  });

  it("requires alt text on images", () => {
    expect(() => parseContract("canvasElement", { id: "i", type: "image", x: 1, y: 1, w: 1, h: 1, path: "a.png" }))
      .toThrow(ContractValidationError);
  });

  it("requires text or runs on a text element", () => {
    expect(() => parseContract("canvasElement", { id: "t", type: "text", x: 1, y: 1, w: 1, h: 1 }))
      .toThrow(/either text or at least one run/);
  });

  it("accepts hex colors with or without a leading hash", () => {
    for (const color of ["FF0000", "#FF0000", "F00", "#f00"]) {
      expect(() => parseContract("canvasElement", { id: "s", type: "shape", x: 0, y: 0, w: 1, h: 1, style: { fill: color } })).not.toThrow();
    }
    expect(() => parseContract("canvasElement", { id: "s", type: "shape", x: 0, y: 0, w: 1, h: 1, style: { fill: "rebeccapurple" } }))
      .toThrow(/hex color/);
  });
});

describe("scene records", () => {
  it("converts an element record into a canvas element", () => {
    const element = parseSceneElement({ kind: "textbox", slide: 1, id: "title", bbox: [1, 2, 3, 4], text: "Hello", style: { fontSize: 40 } });
    expect(element).toMatchObject({ type: "text", id: "title", x: 1, y: 2, w: 3, h: 4 });
  });

  it("rejects a malformed bbox with a usable message", () => {
    expect(() => parseSceneElement({ kind: "shape", slide: 1, id: "s", bbox: [1, 2, 3] }))
      .toThrow(/bbox: \[x, y, w, h\] in inches/);
  });

  it("rejects an unknown element kind", () => {
    expect(() => parseSceneElement({ kind: "hologram", slide: 1, id: "h", bbox: [0, 0, 1, 1] }))
      .toThrow(/Unsupported scene element kind: hologram/);
  });

  it("drops the inspection marker rather than treating it as element data", () => {
    const element = parseSceneElement({ kind: "shape", mode: "inspection", slide: 1, id: "s", bbox: [0, 0, 1, 1] });
    expect(element).not.toHaveProperty("mode");
  });
});

describe("authoring guide", () => {
  it("covers every section a host needs to author a deck", () => {
    const ids = guideSectionIds();
    for (const required of ["role", "creative-direction", "narrative", "canvas", "scene", "accessibility", "honesty"]) {
      expect(ids).toContain(required);
    }
  });

  it("filters to a single section on request", () => {
    expect(authoringGuide("accessibility").sections).toHaveLength(1);
    expect(authoringGuide("accessibility").sections[0]!.id).toBe("accessibility");
  });

  it("renders a prompt that names the scene schema and forbids fenced output", () => {
    const prompt = guideAsPrompt();
    expect(prompt).toContain(SCENE_SCHEMA_ID);
    expect(prompt).toMatch(/No Markdown fences/);
    expect(prompt.length).toBeGreaterThan(2000);
  });

  it("renders Markdown carrying the contract version", () => {
    expect(guideAsMarkdown()).toContain(`Contract version ${CONTRACT_VERSION}`);
  });
});

describe("request boundary", () => {
  it("validates a supplied outline instead of accepting anything", () => {
    expect(() => parseStructuredRequest({
      command: "create",
      output: "deck.pptx",
      outline: { brief, narrative: "n", slides: [{ id: "a", title: "no kind" }] },
    })).toThrow();
  });

  it("accepts a well-formed outline", () => {
    const request = parseStructuredRequest({
      command: "create",
      output: "deck.pptx",
      outline: { brief, narrative: "n", slides: [{ id: "a", kind: "title", title: "T" }] },
    });
    expect(request.command).toBe("create");
  });

  it("still accepts a partial brief as request-level overrides", () => {
    const request = parseStructuredRequest({
      command: "create",
      output: "deck.pptx",
      prompt: "something",
      brief: { audience: "Board members" },
    });
    expect(request.command).toBe("create");
  });
});
