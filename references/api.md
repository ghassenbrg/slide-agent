# TypeScript and JSON API

## Contents

- TypeScript entrypoints
- Create request
- Edit request
- Render and validate requests
- Result contract
- Model-authored creative direction
- Freeform slide canvas
- NDJSON scene input and companion output
- Custom integration points

## TypeScript entrypoints

Import from the package root:

```ts
import {
  SlideAgent,
  executeAgentRequest,
  parseStructuredRequest,
  DeckBuilder,
  LayoutRegistry,
  PptxEditor,
  PptxInspector,
  PresentationRenderer,
  PresentationValidator,
} from "@slide-agent/core";
```

Use `executeAgentRequest(request)` for an extension boundary. Use the lower-level classes only when the host needs custom layouts, its own logging sink, or a split workflow.

## Create request

Provide one of `outline`, inline `sceneNdjson`, a `scene` path, `brief` plus `prompt`, or `prompt` alone. `outline` has the highest precedence.

```json
{
  "command": "create",
  "prompt": "Create an eight-slide launch decision deck.",
  "output": "/workspace/launch.pptx",
  "validate": true,
  "autoFix": true,
  "maxRetries": 2
}
```

Creation, editing, and validation default to `render: false`, so the editable `.pptx` is produced with Node.js alone. Set `render: true` only when PDF/PNG previews are required and LibreOffice plus Poppler are available.

A complete `PresentationOutline` contains a `brief`, a one-line `narrative`, an optional open-ended `completeness` knowledge map, an optional open-ended `creativeDirection`, and typed `slides`. Each slide may include a `communication` contract that records its audience question, claim, evidence, artifact, explanation, implication, and action without prescribing a layout. See `src/types/index.ts` for every content structure.

`CreateRequest.creativeDirection` overrides the direction embedded in an outline. This lets a host model form the storyline and art direction in separate reasoning stages.

Instead of `outline`, pass `scene` with a path or `sceneNdjson` with inline `slide-agent.scene/1` content. Precedence is `outline`, inline scene, scene path, then prompt planning.

## Model-authored creative direction

The renderer does not select a named theme. A host may supply any fields that help it reason, while `palette` and `typography` provide concrete native defaults:

```json
{
  "name": "Kinetic field notes",
  "concept": "Observed fragments assemble into a decisive map",
  "palette": {
    "background": "F4F0E6",
    "ink": "17211B",
    "accent": "EA4B2F",
    "accentAlt": "316B53",
    "custom": { "specimenBlue": "4D73B9" }
  },
  "typography": {
    "display": "Georgia",
    "body": "Aptos",
    "mono": "Aptos Mono"
  },
  "compositionPrinciples": ["Asymmetric evidence clusters", "Annotations behave like field marks"],
  "diagramLanguage": "Measured routes, specimen labels, and few containers"
}
```

Missing semantic colors receive a prompt-derived fallback. Supplied colors and fonts are not limited by the files under `config/`.

## Freeform slide canvas

`SlideSpec.canvas` is an array of editable native elements at model-authored coordinates. Its presence bypasses `LayoutRegistry`, so `layout` may be omitted or arbitrary. Supported element types are `text`, `shape`, `connector`, `image`, `table`, `chart`, and unrestricted `native-chart`; shape names and advanced PptxGenJS options are open-ended.

```json
{
  "id": "argument",
  "kind": "visual-essay",
  "title": "The signal converges",
  "background": "101014",
  "designIntent": "Use scale and convergence to make the system boundary undeniable.",
  "composition": "Small inputs enter diagonally; one luminous plane dominates the right half.",
  "canvas": [
    {
      "id": "deck-title",
      "type": "text",
      "x": 0.7, "y": 0.8, "w": 7.8, "h": 1.6,
      "role": "title",
      "text": "The signal converges",
      "style": { "fontFace": "Georgia", "fontSize": 50, "color": "F8F5E8", "bold": true }
    },
    {
      "id": "route",
      "type": "connector",
      "x": 1.0, "y": 5.7, "w": 7.6, "h": -2.4,
      "zIndex": -5,
      "style": { "color": "B8FF32", "width": 2.5, "arrow": true }
    },
    {
      "id": "boundary",
      "type": "shape",
      "shape": "hexagon",
      "x": 8.7, "y": 2.1, "w": 3.2, "h": 3.2,
      "style": { "fill": "FF4FD8", "rotate": 10 }
    }
  ]
}
```

Read [freeform-canvas.md](freeform-canvas.md) for rich text, layers, native chart/table options, arbitrary shapes, images, and QA behavior.

## NDJSON scene input and companion output

Every create operation writes `artifacts/intermediate_files/<name>.inspect.ndjson` under the output directory by default. Set `inspectPath` to override it. The file is a round-trippable creative blueprint with one record per deck, slide, element, or notes block.

```json
{
  "command": "create",
  "scene": "/workspace/artifacts/intermediate_files/source.inspect.ndjson",
  "output": "/workspace/regenerated.pptx",
  "inspectPath": "/workspace/artifacts/intermediate_files/regenerated.inspect.ndjson"
}
```

Extension hosts can use `serializeSceneNdjson()`, `parseSceneNdjson()`, `readSceneNdjson()`, and `writeSceneNdjson()` from the package root. Read [scene-ndjson.md](scene-ndjson.md) for the record schema.

## Edit request

Use a non-destructive output path:

```json
{
  "command": "edit",
  "input": "/workspace/source.pptx",
  "output": "/workspace/updated.pptx",
  "operations": [
    {
      "type": "replace-text",
      "find": "Old product",
      "replace": "New product",
      "replaceAll": true
    },
    {
      "type": "reorder-slides",
      "order": [1, 3, 2, 4]
    }
  ],
  "render": true,
  "validate": true
}
```

Read [editing.md](editing.md) for every edit operation.

## Render and validate requests

```json
{
  "command": "render",
  "input": "/workspace/deck.pptx",
  "output": "/workspace/previews",
  "width": 1600,
  "height": 900
}
```

```json
{
  "command": "validate",
  "input": "/workspace/deck.pptx",
  "report": "/workspace/validation.json",
  "manifest": "/workspace/deck.pptx.manifest.json",
  "previewsDir": "/workspace/previews",
  "render": true
}
```

Pass the generation manifest when available. For third-party decks, the validator builds a manifest by inspecting OOXML.

## Result contract

`AgentResult` contains:

- `status`: `success`, `warning`, or `error`.
- `primaryOutput`: the main `.pptx` for a create/edit operation.
- `deliverables`: top-level `.pptx` and `.pdf` files intended for handoff.
- `artifacts`: previews, logs, manifests, scenes, and edit-comparison files.
- `generatedFiles`: absolute paths.
- `slideCount`.
- `warnings`.
- `validation`: optional structured report.
- `errors`: code, message, and optional details.
- `metadata`: request ID, command, timing, retries, and package version.

Treat `status: "error"` as a failed operation even when a diagnostic artifact was written.

## Custom integration points

- Supply a `Logger` to capture structured events in the extension host.
- Supply an `ImageResolver` to connect an approved image search or generation service.
- Author a model-directed canvas for unique compositions; no registration is required.
- Register a `LayoutRenderer` only when a reusable fallback or host-specific integration is useful.
- Call `DeckBuilder.build()` and `PptxExporter.export()` separately when the host controls the repair loop.
- Call `PptxInspector.inspect()` before proposing edits to a source deck.
