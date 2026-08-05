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

const registry = new ExtensionRegistry({ diagrams: [houseGrammar], checks: [legalFooter] });
registry.capabilities();   // what this installation can do
```

| Interface | Replaces |
|---|---|
| `DiagramGrammar` | A named diagram form |
| `ChartRenderer` | How one or more chart kinds are drawn |
| `QualityCheck` | An organisation's own validation rules |
| `RenderBackend` | Preview generation, e.g. without LibreOffice |
| `AssetResolver` | How image paths and URLs resolve |
| `DesignTokenizer` | How `creativeDirection` becomes a design system |

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
