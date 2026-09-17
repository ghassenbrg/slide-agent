import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Engine } from "../../../src/v2/engine/engine.js";
import { digest, ingest } from "../../../src/v2/ingest/index.js";
import { classifyInstruction, editWithInstruction } from "../../../src/v2/llm/edit-router.js";
import { generateDeck } from "../../../src/v2/llm/generate.js";
import { BudgetGuard, loadModelsConfig, resolveProfile } from "../../../src/v2/llm/profiles.js";
import { CachingProvider, extractJson, priceOf, ScriptedProvider } from "../../../src/v2/llm/provider.js";
import { DIRECTOR_SYSTEM, PROMPT_VERSION } from "../../../src/v2/llm/prompts.js";
import { setWorkspaceRoots } from "../../../src/security/policy.js";
import { fixtureRegistry, intent } from "./helpers.js";

let workspace: string;
const engine = new Engine({ registry: fixtureRegistry(), previewWidth: 320 });

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-llm-"));
  setWorkspaceRoots([workspace, tmpdir()]);
});

afterAll(async () => {
  setWorkspaceRoots(undefined);
  await rm(workspace, { recursive: true, force: true });
});

const directed = intent([
  { id: "claim", message: "Incidents fell", sources: ["s1#1"], compose: { grid: "12x6", items: [{ at: "c1-9 r2-3", text: "Incidents fell 71% in the pilot units", role: "title" }] } },
  { id: "tight", message: "Too long", compose: { grid: "12x6", items: [{ at: "c1-2 r1", text: "A headline far too long for two narrow columns and a single row of the grid", role: "h2" }] } },
]);

describe("model runtime", () => {
  it("extracts JSON from fenced or chatty answers and reports truncation", () => {
    expect(extractJson("Here you go:\n```json\n{\"a\": [1, \"}\"]}\n```")).toEqual({ a: [1, "}"] });
    expect(extractJson("prefix {\"b\": 2} suffix")).toEqual({ b: 2 });
    expect(() => extractJson("{\"cut\": [1, 2")).toThrow(/cut off/);
    expect(() => extractJson("no json")).toThrow(/no JSON/);
  });

  it("prices usage and keeps the system prompt cache-stable", () => {
    expect(priceOf("claude-opus-5", { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 })).toBe(30);
    expect(DIRECTOR_SYSTEM).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(PROMPT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("enforces the creative floor for judgement tasks outside the draft profile", async () => {
    expect(resolveProfile("balanced").routes.direct.model).toBe("claude-sonnet-5");
    expect(() => resolveProfile("quality", { profiles: { quality: { routes: { critique: { model: "claude-haiku-4-5" } } } } })).toThrow(/cannot run on claude-haiku/);
    expect(resolveProfile("draft", { profiles: { draft: { routes: { direct: { model: "claude-haiku-4-5" } } } } }).routes.direct.model).toBe("claude-haiku-4-5");
    expect(resolveProfile("balanced", { profiles: { balanced: { routes: { "alt-text": { model: "claude-haiku-4-5" } }, maxUsd: 0.2 } } }).maxUsd).toBe(0.2);
    const guard = new BudgetGuard(0.1);
    guard.add(0.09);
    expect(guard.allows(0.02)).toBe(false);
    expect(await loadModelsConfig(workspace)).toEqual({});
  });

  it("caches exact inputs only", async () => {
    const scripted = new ScriptedProvider(["first", "second"]);
    const cache = new CachingProvider(scripted, path.join(workspace, "responses"));
    const request = { task: "direct", system: "s", messages: [{ role: "user" as const, text: "x" }], model: "claude-sonnet-5", maxTokens: 10, promptVersion: "1" };
    expect((await cache.complete(request)).text).toBe("first");
    const again = await cache.complete(request);
    expect(again.text).toBe("first");
    expect(again.cached).toBe(true);
    expect((await cache.complete({ ...request, messages: [{ role: "user", text: "y" }] })).text).toBe("second");
  });

  it("directs, builds, critiques the preview, and revises by answering choices", async () => {
    const provider = new ScriptedProvider([
      `Sure.\n${JSON.stringify(directed)}`,
      JSON.stringify({ overall: "Clear, but the second slide crams its headline.", notes: [{ slide: "tight", severity: "major", note: "Give the headline the full width." }] }),
      (request) => {
        const choice = /"id":"(fit-tight-\d+)"/.exec(request.messages.at(-1)!.text)?.[1];
        return JSON.stringify({ ops: [{ level: "intent", op: "choose", edit: choice, option: 0 }], declined: [] });
      },
    ]);
    const result = await generateDeck(engine, provider, { deck: path.join(workspace, "generated"), brief: "Tell the board the pilot worked.", profile: "balanced" });
    expect(provider.requests.map((request) => request.task)).toEqual(["direct", "critique", "revise"]);
    expect(provider.requests[1]!.messages[0]!.images?.[0]?.mediaType).toBe("image/png");
    expect(provider.requests.every((request) => request.task === "revise" || request.model === "claude-sonnet-5")).toBe(true);
    expect(result.verdict.designReview).toBe("critic");
    expect(result.verdict.cost.usd).toBeGreaterThan(0);
    expect(result.modelCalls).toHaveLength(3);
    expect(result.verdict.suggestedEdits.filter((edit) => edit.slide === "tight" && edit.kind === "choose")).toEqual([]);
    const record = JSON.parse(await readFile(path.join(workspace, "generated", "run.json"), "utf8"));
    expect(record.command).toBe("generate");
    expect(record.modelCalls).toHaveLength(3);
  });

  it("repairs an invalid intent with the exact findings, and fails after three attempts", async () => {
    const provider = new ScriptedProvider([
      JSON.stringify({ ...directed, slides: [{ id: "x", mesage: "typo", compose: {} }] }),
      JSON.stringify(directed),
      JSON.stringify({ overall: "ok", notes: [] }),
      JSON.stringify({ ops: [] }),
    ]);
    await generateDeck(engine, provider, { deck: path.join(workspace, "repaired"), brief: "A brief long enough." });
    expect(provider.requests[1]!.messages.at(-1)!.text).toContain("does not validate");
    const broken = new ScriptedProvider(["nope", "still nope", "no"]);
    await expect(generateDeck(engine, broken, { deck: path.join(workspace, "broken"), brief: "A brief long enough." })).rejects.toThrow(/three attempts/);
  });

  it("skips the critic in the draft profile and degrades by budget, never by tier", async () => {
    const draft = new ScriptedProvider([JSON.stringify(directed), JSON.stringify({ ops: [] })]);
    const result = await generateDeck(engine, draft, { deck: path.join(workspace, "draft"), brief: "A draft brief.", profile: "draft" });
    expect(draft.requests.map((request) => request.task)).toEqual(["direct", "revise"]);
    expect(result.verdict.designReview).toBe("none");
    const poor = new ScriptedProvider([JSON.stringify(directed), JSON.stringify({ ops: [] })]);
    const degraded = await generateDeck(engine, poor, { deck: path.join(workspace, "poor"), brief: "A budget brief." }, { profiles: { balanced: { maxUsd: 0.000001 } } });
    expect(degraded.degraded.some((entry) => entry.includes("critic skipped"))).toBe(true);
    expect(poor.requests[0]!.model).toBe("claude-sonnet-5");
  });

  it("routes natural-language edits by kind", async () => {
    expect(classifyInstruction("make slide 2 calmer")).toBe("design");
    expect(classifyInstruction("change the Q3 number to 42")).toBe("mechanical");
    await engine.build({ deck: path.join(workspace, "nl"), intent: directed });
    const provider = new ScriptedProvider([JSON.stringify({ ops: [{ level: "intent", op: "set", path: "/slides/0/compose/items/0/text", value: "Incidents fell 72%" }] })]);
    const result = await editWithInstruction(engine, provider, { deck: path.join(workspace, "nl"), instruction: "change 71% to 72%" });
    expect(result.route).toBe("mechanical");
    expect(provider.requests[0]!.model).toBe("claude-haiku-4-5");
    expect(result.verdict.changed).toEqual(["claim"]);
  });
});

describe("ingestion", () => {
  it("extracts markdown, csv, json, and docx into cited spans and a bounded digest", async () => {
    await writeFile(path.join(workspace, "notes.md"), "# Findings\n\nIncidents fell 71%.\n\nCosts rose 4%.");
    await writeFile(path.join(workspace, "data.csv"), "quarter,incidents\nQ1,42\n\"Q2, late\",37\n");
    await writeFile(path.join(workspace, "facts.json"), JSON.stringify({ arr: "$4.2M" }));
    const docx = new JSZip();
    docx.file("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>Pilot first &amp; fail small</w:t></w:r></w:p></w:body></w:document>");
    await writeFile(path.join(workspace, "memo.docx"), await docx.generateAsync({ type: "nodebuffer" }));
    const pack = await ingest(["notes.md", "data.csv", "facts.json", "memo.docx"].map((name) => path.join(workspace, name)));
    expect(pack.documents.map((document) => document.kind)).toEqual(["markdown", "csv", "json", "docx"]);
    expect(pack.documents[1]!.tables![0]!.rows[1]![0]).toBe("Q2, late");
    const text = digest(pack);
    expect(text).toContain("[s1#1]");
    expect(text).toContain("Pilot first & fail small");
    expect(digest(pack, 60)).toContain("truncated");
    await writeFile(path.join(workspace, "x.exe"), "binary");
    await expect(ingest([path.join(workspace, "x.exe")])).rejects.toThrow(/supported sources/);
  });
});
