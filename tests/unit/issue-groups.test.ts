import { describe, expect, it } from "vitest";

import { groupIssues, reportForDisk, ungroupIssues } from "../../src/validation/issue-groups.js";
import type { ValidationIssue } from "../../src/types/index.js";

function issue(overrides: Partial<ValidationIssue> & { code: string }): ValidationIssue {
  return {
    severity: "info",
    message: `${overrides.code} happened`,
    fixable: false,
    ...overrides,
  };
}

/** The shape a real report arrives in: one code, many nearly identical entries. */
function belowScale(slide: number, element: string, fontSize: number): ValidationIssue {
  return issue({
    code: "font-below-scale",
    slide,
    elementIds: [`00${slide}-${element}`],
    message: `${element} uses ${fontSize}pt where the fallback type scale would use 16pt for a body. That is your call — check it reads at presentation distance.`,
    details: { fontSize, minimum: 16, compositionMode: "model-authored" },
  });
}

describe("grouping issues", () => {
  it("says a repeated finding once and keeps every call site", () => {
    const issues = [belowScale(2, "note", 11), belowScale(3, "caption", 12), belowScale(3, "footer", 11)];
    const [group] = groupIssues(issues);

    expect(group?.code).toBe("font-below-scale");
    expect(group?.count).toBe(3);
    // Every occurrence still names its slide and its element, which is what a
    // patch needs. What stops repeating is the explanation.
    expect(group?.where).toEqual([
      { slide: 2, element: "note", fontSize: 11 },
      { slide: 3, element: "caption", fontSize: 12 },
      { slide: 3, element: "footer", fontSize: 11 },
    ]);
  });

  it("lifts the details that never vary out of the rows", () => {
    const [group] = groupIssues([belowScale(2, "note", 11), belowScale(3, "caption", 12)]);
    // `minimum` and `compositionMode` describe the finding, not the occurrence.
    expect(group?.shared).toEqual({ minimum: 16, compositionMode: "model-authored" });
    // ...so they must not also appear on each row.
    expect(group?.where.every((row) => !("minimum" in row))).toBe(true);
  });

  it("keeps one message in full rather than a rule with the specifics removed", () => {
    const [group] = groupIssues([belowScale(2, "note", 11)]);
    // A reader needs to see what one of these actually says, including the
    // advice at the end — that is the part that tells them what to do.
    expect(group?.example).toContain("check it reads at presentation distance");
  });

  it("strips the paint-sequence prefix so the name is the one a patch uses", () => {
    const [group] = groupIssues([belowScale(2, "slide-title", 11)]);
    expect(group?.where[0]?.element).toBe("slide-title");
  });

  it("orders errors before warnings before advice, then by how often each fires", () => {
    const groups = groupIssues([
      belowScale(1, "a", 11), belowScale(2, "b", 11), belowScale(3, "c", 11),
      issue({ code: "text-overflow", severity: "error", slide: 4 }),
      issue({ code: "repeated-silhouette", severity: "warning", slide: 5 }),
    ]);
    // The flat array could put a hundred `info` entries between two errors.
    expect(groups.map((group) => group.code)).toEqual(["text-overflow", "repeated-silhouette", "font-below-scale"]);
  });

  it("reports a group fixable only when every occurrence is", () => {
    const groups = groupIssues([
      issue({ code: "poor-contrast", fixable: true, slide: 1 }),
      issue({ code: "poor-contrast", fixable: false, slide: 2 }),
    ]);
    expect(groups[0]?.fixable).toBe(false);
  });

  it("takes the worst severity a code was ever reported at", () => {
    const groups = groupIssues([
      issue({ code: "font-below-scale", severity: "info", slide: 1 }),
      issue({ code: "font-below-scale", severity: "warning", slide: 2 }),
    ]);
    expect(groups[0]?.severity).toBe("warning");
  });

  it("names both elements when a finding is about a pair", () => {
    const [group] = groupIssues([
      issue({ code: "overlapping-elements", severity: "warning", slide: 3, elementIds: ["012-caption", "027-chrome-foot"] }),
    ]);
    expect(group?.where[0]).toMatchObject({ elements: ["caption", "chrome-foot"] });
  });
});

describe("reading a grouped report back", () => {
  const issues = [
    belowScale(2, "note", 11),
    belowScale(3, "caption", 12),
    issue({ code: "text-overflow", severity: "error", slide: 4, elementIds: ["009-headline"], fixable: true, details: { box: { w: 2, h: 1 } } }),
  ];

  it("recovers every fact an author or a check would act on", () => {
    const recovered = ungroupIssues(groupIssues(issues));
    // Element ids come back as the authored name a patch addresses rather than
    // the OOXML shape name that carries the paint order; the packet's join
    // accepts either, and the name is the one a reader can use. Detail keys
    // come back in a different order, which JSON cares about and nothing else
    // does — so both sides are normalised before comparison.
    const facts = (list: ValidationIssue[]) => list
      .map((item) => JSON.stringify({
        code: item.code,
        severity: item.severity,
        slide: item.slide,
        elements: (item.elementIds ?? []).map((id) => id.replace(/^\d+-/, "")),
        details: Object.fromEntries(Object.entries(item.details ?? {}).sort(([left], [right]) => left.localeCompare(right))),
        fixable: item.fixable,
      }))
      .sort();
    expect(facts(recovered)).toEqual(facts(issues));
  });

  it("says when a message is the group's example rather than this row's own words", () => {
    const recovered = ungroupIssues(groupIssues(issues));
    const shared = recovered.filter((item) => item.code === "font-below-scale");
    // Two occurrences, one sentence: the wording is the redundancy grouping
    // removes, so it must not be passed off as each element's own.
    expect(shared.every((item) => item.exemplar === true)).toBe(true);
    // A code that fired once has no ambiguity to declare.
    expect(recovered.find((item) => item.code === "text-overflow")?.exemplar).toBe(false);
  });

  it("survives a report that has no findings at all", () => {
    expect(ungroupIssues(groupIssues([]))).toEqual([]);
  });
});

describe("choosing what a report carries to disk", () => {
  const report = { issues: [{ code: "a" }], issueGroups: [{ code: "a", count: 1 }], status: "pass" };

  it("writes groups by default and does not also write the flat array", () => {
    const written = reportForDisk(report) as Record<string, unknown>;
    expect(written.issueGroups).toBeDefined();
    expect("issues" in written).toBe(false);
    expect(written.status).toBe("pass");
  });

  it("writes the flat array on request, for tools that parse it today", () => {
    const written = reportForDisk(report, "flat") as Record<string, unknown>;
    expect(written.issues).toBeDefined();
    expect("issueGroups" in written).toBe(false);
  });
});
