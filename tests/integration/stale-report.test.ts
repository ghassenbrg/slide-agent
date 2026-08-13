import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SlideAgent } from "../../src/pipeline.js";
import { silentLogger } from "../../src/logging/logger.js";
import type { PresentationOutline } from "../../src/types/index.js";

/**
 * What a failed build leaves behind for the next reader.
 *
 * The CLI says the build failed and exits non-zero, which is what a shell
 * notices. What a model reads is `report.json` — and that file used to be the
 * last *successful* run's, unchanged, still saying `pass`, with nothing on it
 * to say which build it described. Build, then read the report, is the obvious
 * next step and it returned a green verdict for a build that never happened.
 */
let workspace: string;
const agent = new SlideAgent(silentLogger);

beforeAll(async () => { workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-stale-")); });
afterAll(async () => { await rm(workspace, { recursive: true, force: true }); });

function deck(title: string, broken: boolean): PresentationOutline {
  return {
    brief: {
      title, audience: "Reviewers", objective: "Check what a failed build leaves behind",
      presentationType: "technical", tone: "plain", visualDirection: "fixture",
      slideCount: 1, language: "English", outputRequirements: [], keyTopics: [], sourcePrompt: "test",
    },
    narrative: "One slide.",
    slides: [{
      id: "one", kind: "custom", title,
      canvas: [
        { id: "t", type: "text", x: 1, y: 1, w: 8, h: 1, text: title, role: "title", style: { fontSize: 40 } },
        // A native chart whose data is an object where the writer requires an
        // array. It throws inside the chart writer, which is a realistic way
        // for a build to die: deep, and with a message naming nothing the
        // author wrote.
        ...(broken
          ? [{ id: "c", type: "native-chart", nativeType: "bar", x: 1, y: 3, w: 6, h: 3, data: { categories: ["a"] } } as never]
          : []),
      ],
    }],
  };
}

describe("a failed build does not leave the previous verdict on disk", () => {
  it("replaces a passing report with one that records the failure", async () => {
    const output = path.join(workspace, "deck.pptx");
    const reportPath = path.join(workspace, "report.json");

    const good = await agent.create({
      command: "create", outline: deck("Good", false), output, reportPath,
      validate: true, render: false, roundTrip: false,
    });
    expect(good.status).not.toBe("error");
    expect(JSON.parse(await readFile(reportPath, "utf8")).status).toBe("pass");

    const bad = await agent.create({
      command: "create", outline: deck("Broken", true), output, reportPath,
      validate: true, render: false, roundTrip: false,
    });
    expect(bad.status).toBe("error");

    const written = JSON.parse(await readFile(reportPath, "utf8")) as {
      status: string;
      presentationReadiness: string;
      readinessReasons: string[];
      issueGroups: Array<{ severity: string; example: string }>;
    };
    // The report on disk must describe the build that just happened.
    expect(written.status).toBe("fail");
    expect(written.presentationReadiness).toBe("not-ready");
    expect(written.readinessReasons[0]).toContain("The build failed");
    // And it must carry the reason, so a reader is not sent back to the logs.
    expect(written.issueGroups[0]?.severity).toBe("error");
    expect(written.issueGroups[0]?.example.length).toBeGreaterThan(0);
  });

  it("leaves nothing behind when validation was never asked for", async () => {
    const output = path.join(workspace, "novalidate.pptx");
    const reportPath = path.join(workspace, "novalidate-report.json");
    const result = await agent.create({
      command: "create", outline: deck("Broken", true), output, reportPath,
      validate: false, render: false, roundTrip: false,
    });
    expect(result.status).toBe("error");
    // No report was promised, so none is invented.
    await expect(readFile(reportPath, "utf8")).rejects.toThrow();
  });
});
