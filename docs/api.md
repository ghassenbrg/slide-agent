# API and extension points

```bash
npm install @slide-agent/core
```

Installing the library runs no lifecycle scripts and writes nothing outside
your project.

Two APIs, matching the two engines. `@slide-agent/core/v2` is the 2.x engine and
the one to reach for; the root export is the 0.x API, still supported, and also
carries `v2` as a namespace.

---

# 2.x: `@slide-agent/core/v2`

## Building a deck

```ts
import { Engine } from "@slide-agent/core/v2";

const engine = new Engine();
const { verdict, files } = await engine.build({
  deck: "./out",                  // the deck directory
  intent,                         // a slide-agent.intent/1 document
  previews: "sheet",
});

if (verdict.suggestedEdits.length) {
  // The engine declined to make a design decision. Answer it.
  await engine.edit({ deck: "./out", ops: [
    { level: "intent", op: "choose", edit: verdict.suggestedEdits[0].id, option: 0 },
  ] });
}
```

`Engine` also has `edit`, `explain`, `finalize`, and `inspect`. Every method
returns the verdict alongside the files it wrote; nothing throws for a deck that
merely has findings, because a verdict with findings is the normal result and
the caller decides what is acceptable.

## Validating without building

```ts
import { validateIntent, buildScene } from "@slide-agent/core/v2";

const { intent, findings } = validateIntent(candidate);
if (!intent) return findings;   // each carries the JSON pointer it applies to
```

`buildScene` goes one step further — compile, expand, solve, fit — without
writing a package. This is what `mode: "check"` uses.

## Compiling a design language on its own

```ts
import { compileDesign, contrastRatio, nearestPassing } from "@slide-agent/core/v2";

const theme = await compileDesign({ language }, { format: "16:9", text });
theme.slots;        // the twelve PowerPoint theme slots
theme.findings;     // contrast repairs, unavailable fonts, unknown roles
```

`themeToDtcg` and `languageFromDtcg` move a language in and out of W3C DTCG
tokens, which is the supported way to share one with a design system.

## Measuring text

```ts
import { TextEngine, sharedFontRegistry, parseRichText } from "@slide-agent/core/v2";

const text = new TextEngine(sharedFontRegistry());
const face = await text.load({ family: "Helvetica", weight: 400, italic: false });

const laid = text.layout({
  paragraphs: parseRichText("Waves fail at the pilot, not in production"),
  size: 32,
  leading: 1.1,
  width: 5.2,          // inches
  faceFor: () => face,
});

laid.lineCount;   // 2 — where it actually broke
laid.height;      // 0.978 inches
laid.widest;      // 5.166 inches
```

This is the same engine the solver and the previews use, which is why a preview
shows the lines the fit ladder measured rather than a browser's guess at them.

## Template fill

```ts
import { fillDecks } from "@slide-agent/core/v2";

const decks = await fillDecks(new Engine(), {
  template: "qbr.intent.json",
  data: "accounts.csv",
  out: "decks/",
  nameBy: "account",
});
```

No model, one deck per row, deterministic.

## Everything else

The `/v2` entry point exports the IR types, the recipe library, rhythm
analysis, the OOXML writer, SVG and PNG rendering, the QA checks, the command
registry, the MCP server factory, migration from 0.x, and the engine-managed
pieces (`generateDeck`, providers, routing profiles). The module list in
[architecture.md](architecture.md#v2-modules) says which is which.

## Engine-managed mode, and the creative floor

```ts
import { generateDeck, AnthropicProvider, resolveProfile } from "@slide-agent/core/v2";
```

One thing to know before you configure a profile: `resolveProfile` **throws** if
a routing profile would send a judgement task — directing, critiquing, a design
edit — to a model below the `balanced` tier. That is not a warning to be ignored
in production; it is the guarantee that cost pressure cannot quietly turn the
design over to a cheap model. Under a budget ceiling the guard drops the second
revise pass, then the critic, then stops. It never downgrades the tier. See
[ADR 0010](adr/0010-creative-floor-in-routing.md).

---

# 0.x API

## Executing a request

```ts
import { executeAgentRequest, type CreateRequest } from "@slide-agent/core";

const result = await executeAgentRequest({
  command: "create",
  outline,                       // validated against the contract
  output: "/workspace/deck.pptx",
  brand: "./brand.json",
  validate: true,
} satisfies CreateRequest);
```

Commands: `create`, `revise`, `edit`, `render`, `validate`.

## The contract

```ts
import {
  CONTRACT_VERSION,
  contractJsonSchema,
  guideAsPrompt,
  parseContract,
} from "@slide-agent/core/contract";

const schema = contractJsonSchema("outline");   // for structured output
const guide = guideAsPrompt();                  // for a system prompt
const outline = parseContract("outline", candidate);  // throws with field paths
```

`parseContract` reports every problem with the path that caused it, e.g.
`slides[2].canvas[0].bbox: expected 4 numbers`.

## Extension points

Pass extensions instead of forking:

```ts
import { ExtensionRegistry, type DiagramGrammar, type QualityCheck } from "@slide-agent/core";

const houseGrammar: DiagramGrammar<{ nodes: string[] }> = {
  id: "house-flow",
  description: "Our standard process notation",
  render(writer, spec, frame, { tokens, grid }) {
    for (const [index, cell] of grid.divide(frame, spec.nodes.length).entries()) {
      writer.addShape(`flow-${index}`, "rect", cell, { fill: tokens.palette.surface });
    }
  },
};

const legalFooter: QualityCheck = {
  id: "legal-footer",
  run(manifest) {
    return manifest.slides
      .filter((slide) => !slide.elements.some((element) => element.name === "brand-footer"))
      .map((slide) => ({
        code: "missing-legal-footer",
        severity: "error" as const,
        message: `Slide ${slide.number} has no legal footer.`,
        slide: slide.number,
        fixable: false,
      }));
  },
};

// Extensions reach the pipeline through the agent that runs it.
const agent = new SlideAgent(logger, { diagrams: [houseGrammar], checks: [legalFooter] });
agent.capabilities();   // what this installation can do

// Or build the registry first and share it across runs.
const registry = new ExtensionRegistry({ diagrams: [houseGrammar] });
const shared = new SlideAgent(logger, registry);
```

A host grammar or layout registered under a built-in id replaces it. A
`ChartRenderer` can replace how an existing kind is drawn; a kind the contract
does not define goes through `native-chart` instead.

| Interface | Replaces |
|---|---|
| `DiagramGrammar` | A named diagram form |
| `ChartRenderer` | How one or more chart kinds are drawn |
| `QualityCheck` | An organisation's own validation rules |
| `RenderBackend` | Preview generation, e.g. without LibreOffice |
| `ImageResolver` | Where pictures come from — see below |
| `DesignTokenizer` | How `creativeDirection` becomes the fallback design system |
| `VisualReviewer` | A reviewer that consumes the deterministic review packet |

### Visual reviewers

`VisualReviewer` receives the same `ReviewPacket` a host AI does and returns
findings. The core ships the interface and the packet, never a bundled model,
so nothing here favours one provider.

```ts
import { SlideAgent, type VisualReviewer } from "@slide-agent/core";

const houseReviewer: VisualReviewer = {
  id: "house-rules",
  description: "Checks our own composition rules against the render",
  review: (packet) => packet.slides
    .filter((slide) => slide.text.truncated.length > 0)
    .map((slide) => ({
      id: `truncated-${slide.number}`,
      reviewer: "house-rules",
      severity: "blocking" as const,
      slide: slide.number,
      elementIds: slide.elements.map((element) => element.id),
      observation: "Text is cut short in the render.",
      rationale: "The audience cannot read a claim that ends mid-sentence.",
      suggestedTarget: "The full string visible at the authored size.",
    })),
};

new SlideAgent(undefined, { reviewers: [houseReviewer] });
```

A finding must explain itself — severity, slide, elements where known,
observation, rationale, and a suggested target. An unexplainable scalar score
cannot be acted on, argued with, or waived.

### Sourcing images

`ImageResolver` is the seam for stock search, an internal asset library, or an
image generator. Slide Agent ships none of them deliberately: choosing imagery
is the model's judgement, and a stock API or a generation service inside the
build tool would put credentials, licence terms, and outbound network policy in
a package whose whole posture is that it does not fetch things.

```ts
const stock: ImageResolver = {
  id: "acme-asset-library",
  async resolve(source) {
    // `source` is whatever the model wrote in the element's `path`.
    return source.startsWith("acme:") ? downloadFromLibrary(source) : localPath(source);
  },
};

const agent = new SlideAgent(logger, { assets: stock });
```

A resolver replaces the built-in entirely, including its remote-asset policy,
so a resolver that fetches is responsible for its own timeouts, size caps, and
address filtering.

Whatever it returns, the model should record `provenance` on the element —
`credit`, `license`, and `generated`. Those travel into the deck's speaker
notes under `[Credits]`, and validation reports a web image with neither a
credit nor a licence.

## Reviewing and patching

```ts
import { SlideAgent } from "@slide-agent/core";

const agent = new SlideAgent();

// The exact render, the words read back off it, the geometry, and the intent.
const packet = await agent.review("deck.pptx", { from: 3, to: 6 });
packet.artifacts.pptx.sha256;        // what this packet describes, by content
packet.slides[0]?.text.missing;      // authored strings the render does not show
packet.reviewQuestions;              // questions, never answers

// Change one thing, and prove what was left alone.
const result = await agent.patch({
  command: "patch",
  input: "deck.pptx",
  output: "revised.pptx",
  render: true,
  operations: [{ op: "update-text", slide: 4, elementId: "title", text: "Revised" }],
});
result.patch?.untouched;             // every element that did not move
```

## The deck's own visual system

```ts
import { VisualSystem, applyVisualSystem } from "@slide-agent/core";

const system = new VisualSystem(creativeDirection.visualSystem);
system.styleNames;                   // exactly what the author declared
applyVisualSystem(system, element, 1);
```

Resolution failures throw with the names that do exist and the type that did
not fit. Nothing is coerced, and nothing is silently dropped.

## Portability and structural signature

```ts
import { buildArtifactGraph, compareSignatures, signDeck, verifyArtifactGraph } from "@slide-agent/core";

const problems = await verifyArtifactGraph(packageRoot, report.artifacts!);
// [{ path: "previews/slide-01.png", problem: "changed" }]

const result = compareSignatures(signDeck(left), signDeck(right));
result.verdict;                      // "near-duplicate" | "similar" | "distinct"
```

The signature is a diagnostic. It says two decks are structurally the same; it
never prescribes a replacement layout, and it never rewards novelty.

## Design system

```ts
import { Grid, resolveTokens, slideFormat } from "@slide-agent/core";

const dimensions = slideFormat("9:16");
const tokens = resolveTokens(config, creativeDirection);
const grid = new Grid(dimensions, tokens);

grid.span(0, 6);          // a horizontal region
grid.flow(region, 3);     // row on wide stages, column on narrow ones
grid.packRows(region, heights);
```

## Data and comparison

```ts
import { chartFromData, diffDecks, loadDataTable, provenanceNote } from "@slide-agent/core";

const table = await loadDataTable("./revenue.csv");
const chart = chartFromData(table, { kind: "line" });
const note = provenanceNote(table);      // for the speaker notes

const changes = diffDecks(beforeManifest, afterManifest);
```
