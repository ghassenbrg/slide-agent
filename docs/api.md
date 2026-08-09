# API and extension points

```bash
npm install @slide-agent/core
```

Installing the library runs no lifecycle scripts and writes nothing outside
your project.

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
| `DesignTokenizer` | How `creativeDirection` becomes a design system |

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
