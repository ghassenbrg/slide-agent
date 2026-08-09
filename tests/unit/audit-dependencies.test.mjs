import { describe, expect, it } from "vitest";

import {
  ACCEPTED_ADVISORIES,
  collectFindings,
  evaluate,
  importedSpecifiers,
  pptxgenjsNeverLoadsImageSize,
  stripComments,
} from "../../scripts/audit-dependencies.mjs";

const IMAGE_SIZE = ACCEPTED_ADVISORIES.find((entry) => entry.module === "image-size");

/** The shape `npm audit --omit=dev --json` produces for this advisory pair. */
function report(overrides = {}) {
  return {
    vulnerabilities: {
      "image-size": {
        name: "image-size",
        severity: "high",
        via: [
          { source: 1, name: "image-size", severity: "high", title: "ICNS parser allows denial of service through an infinite loop", url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr", range: "<=2.0.2" },
          { source: 2, name: "image-size", severity: "high", title: "JXL and HEIF parsers allow denial of service through infinite loops", url: "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq", range: "<=2.0.2" },
        ],
      },
      pptxgenjs: { name: "pptxgenjs", severity: "high", via: ["image-size"] },
      ...overrides,
    },
  };
}

const holds = new Map([[IMAGE_SIZE, { holds: true, detail: "no live image-size import" }]]);
const before = new Date("2026-09-01T00:00:00Z");

describe("reading the audit report", () => {
  it("collects one finding per advisory, not per package", () => {
    const findings = collectFindings(report());
    expect(findings.map((finding) => finding.id).sort()).toEqual(["GHSA-5p2g-fcmc-qvqq", "GHSA-w3rx-r6r6-pgpr"]);
    // pptxgenjs appears only as a transitive string, not its own advisory.
    expect(findings.every((finding) => finding.module === "image-size")).toBe(true);
  });

  it("tolerates a clean report", () => {
    expect(collectFindings({})).toEqual([]);
    expect(collectFindings({ vulnerabilities: {} })).toEqual([]);
  });
});

describe("the exception policy", () => {
  it("passes the advisories it names, and says until when", () => {
    const result = evaluate(collectFindings(report()), { now: before, verified: holds });
    expect(result.problems).toEqual([]);
    expect(result.accepted).toHaveLength(2);
    expect(result.accepted[0]?.expires).toBe(IMAGE_SIZE.expires);
  });

  it("fails on any other high advisory", () => {
    const withNew = report({
      jszip: {
        name: "jszip",
        severity: "critical",
        via: [{ source: 9, name: "jszip", severity: "critical", title: "Something new", url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc" }],
      },
    });
    const result = evaluate(collectFindings(withNew), { now: before, verified: holds });
    expect(result.problems.join(" ")).toContain("GHSA-aaaa-bbbb-cccc");
    expect(result.problems.join(" ")).toContain("critical");
  });

  it("ignores advisories below the blocking severity, as npm audit --audit-level=high does", () => {
    const moderate = { vulnerabilities: { thing: { name: "thing", severity: "moderate", via: [{ source: 4, name: "thing", severity: "moderate", title: "Minor", url: "https://github.com/advisories/GHSA-mmmm-mmmm-mmmm" }] } } };
    // The accepted entry now matches nothing, which is itself reported.
    const result = evaluate(collectFindings(moderate), { now: before, verified: holds });
    expect(result.problems.join(" ")).not.toContain("GHSA-mmmm-mmmm-mmmm");
  });

  it("fails once the exception expires, rather than carrying it forever", () => {
    const after = new Date(`${IMAGE_SIZE.expires}T00:00:01Z`);
    const result = evaluate(collectFindings(report()), { now: after, verified: holds });
    expect(result.problems.join(" ")).toContain("expired");
    expect(result.accepted).toEqual([]);
  });

  it("fails when the reason it was accepted stops being true", () => {
    const broken = new Map([[IMAGE_SIZE, { holds: false, detail: "pptxgenjs/dist/pptxgen.es.js now imports image-size." }]]);
    const result = evaluate(collectFindings(report()), { now: before, verified: broken });
    expect(result.problems.join(" ")).toContain("no longer holds");
    expect(result.problems.join(" ")).toContain("now imports image-size");
  });

  it("reports an exception that has become unnecessary", () => {
    // Silence here would mean nobody notices the upstream fix landed.
    const result = evaluate([], { now: before, verified: holds });
    expect(result.problems.join(" ")).toContain("matches nothing npm reports");
  });
});

describe("detecting a live import", () => {
  it("does not count a reference inside a block comment", () => {
    const source = `
      /* FIXME: currently unused
      function getSizeFromImage () { const sizeOf = require('sizeof') }
      */
      const zip = require('jszip');
    `;
    expect(importedSpecifiers(source)).toEqual(["jszip"]);
  });

  it("counts a real require, import, and dynamic import", () => {
    expect(importedSpecifiers(`const a = require("image-size");`)).toContain("image-size");
    expect(importedSpecifiers(`import sizeOf from 'image-size';`)).toContain("image-size");
    expect(importedSpecifiers(`await import("image-size");`)).toContain("image-size");
  });

  it("keeps a URL intact when stripping line comments", () => {
    expect(stripComments("const u = 'https://example.com/x'; // trailing")).toContain("https://example.com/x");
  });
});

describe("against the installed tree", () => {
  // Deliberately checks the reason rather than running `npm audit`: the test
  // suite must not need a registry, and this is the half that can go stale
  // silently when pptxgenjs is upgraded.
  it("confirms the installed pptxgenjs still never loads image-size", async () => {
    const check = await pptxgenjsNeverLoadsImageSize();
    expect(check.detail).toBeTruthy();
    expect(check.holds, check.detail).toBe(true);
  });
});
