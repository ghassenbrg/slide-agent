# Line-oriented scene blueprints

## Why NDJSON

A large nested outline is effective for APIs but awkward for a model to inspect and revise. Slide Agent's `slide-agent.scene/1` NDJSON format writes one concept per line: the deck direction, a slide, an editable element, or notes. This makes the design easy to stream, diff, reorder, patch, audit, and regenerate.

Every newly created deck receives a round-trippable companion at `artifacts/intermediate_files/<name>.inspect.ndjson` unless `inspectPath` overrides it. Generate a PowerPoint directly from that blueprint:

```bash
slide-agent create \
  --scene artifacts/intermediate_files/system-review.inspect.ndjson \
  --output system-review-regenerated.pptx
```

The exact `slide-agent.scene/1` schema is richer than a read-only PowerPoint inventory: it includes art direction, slide intent, composition, native styling, data, notes, and sources.

## Deck record

The first non-empty line defines the creative and narrative system. Geometry uses inches.

```json
{"kind":"deck","schema":"slide-agent.scene/1","unit":"in","brief":{"title":"Signal through fog","audience":"Board","objective":"Approve the next gate","presentationType":"proposal","tone":"measured","visualDirection":"luminous uncertainty","slideCount":2,"language":"English","outputRequirements":["editable PowerPoint"],"keyTopics":[],"sourcePrompt":"..."},"narrative":"Uncertainty resolves into one controlled decision.","completeness":{"audienceQuestions":["What changed?","What evidence clears the gate?"],"requiredArtifacts":["decision map","evidence table"],"closingContract":["name an owner and review date"]},"creativeDirection":{"concept":"Sparse evidence emerges from a deep field","palette":{"background":"0B1020","surface":"151C2F","ink":"F5F2E9","muted":"A6AEC5","accent":"66E3FF","accentAlt":"F7C75E","accentSoft":"173847","rule":"34405B","positive":"65D39A","negative":"FF6B72","warning":"F7C75E"},"typography":{"heading":"Aptos Display","body":"Aptos","mono":"Aptos Mono"},"diagramLanguage":"Hairline routes and luminous junctions"}}
```

Use one deck record. The parser rejects unknown schema versions instead of guessing.

## Slide record

Each freeform slide declares its semantic job and design reasoning:

```json
{"kind":"slide","slide":1,"freeform":true,"id":"opening","semanticKind":"visual-argument","title":"One boundary absorbs the complexity","background":"0B1020","communication":{"audienceQuestion":"Where should complexity be controlled?","claim":"One boundary absorbs the complexity.","evidence":["Three independent routes converge at the control plane"],"artifact":"annotated convergence map","implication":"Workloads can move independently"},"designIntent":"Make convergence physical through scale and direction.","composition":"Small fragments enter diagonally; one luminous plane dominates the right."}
```

Slide numbers are positive, unique, and determine order. `title` is required metadata but does not render automatically.

A registry-based fallback slide can be represented in one line with `freeform:false` and a complete `spec` object:

```json
{"kind":"slide","slide":2,"freeform":false,"spec":{"id":"close","kind":"closing","title":"Approve the gate","bullets":["Name the owner","Set the date"]}}
```

Generated companions also place `mode:"inspection"` element records after fallback slides. They expose the final rendered geometry, text, fonts, colors, chart data, and object roles for model review while the parser continues to regenerate from the authoritative fallback `spec`. Model-authored canvas records need no duplicate inspection mode because their source lines already contain the complete design.

## Editable element records

Element records reference a slide and use `bbox:[x,y,w,h]` in inches. All other fields match the corresponding canvas element.

```json
{"kind":"textbox","slide":1,"bbox":[0.7,0.9,7.9,1.6],"id":"deck-title","role":"title","text":"One boundary absorbs the complexity","style":{"fontFace":"Georgia","fontSize":50,"color":"F5F2E9","bold":true}}
{"kind":"shape","slide":1,"bbox":[9.1,1.2,2.7,2.7],"id":"boundary","role":"diagram-node","shape":"hexagon","style":{"fill":"FF4FD8","lineColor":"B8FF32","lineWidth":2,"rotate":10}}
{"kind":"connector","slide":1,"bbox":[1.0,5.7,8.4,-2.7],"id":"route","zIndex":-5,"role":"connector","style":{"color":"66E3FF","width":2.5,"arrow":true}}
```

Other `kind` values are:

- `image` with `path`, `alt`, optional `fit`, and `style`.
- `table` with `table` and optional native `options`.
- `chart` with convenience `chart` data and optional `style.colors` / `style.options`.
- `native-chart` with any PptxGenJS `nativeType`, `data`, and `options`.
- `text` as an accepted alias for `textbox`.

Element IDs should be meaningful and unique within a slide. Array order is paint order; `zIndex` creates explicit layers. Advanced options remain inline and round-trip unchanged.

## Notes and sources

Use one optional notes record per slide:

```json
{"kind":"notes","slide":1,"notes":["Pause on the convergence before naming the boundary."],"sources":[{"label":"Architecture review","url":"https://example.com/review"}]}
```

Sources are converted into the standard `[Sources]` speaker-notes block during PowerPoint generation.

## Recommended model workflow

1. Write the deck record after forming the audience-question map, story, and visual thesis.
2. Write all slide records with communication contracts to establish narrative coverage, pacing, and silhouette intent.
3. Add background fields and connectors first, then shapes/images/charts, then text and annotations.
4. Keep each element on one line so it can be revised without rewriting the deck.
5. Parse and build the scene.
6. Render all slides and review the montage.
7. Patch only the lines responsible for geometry, content, style, or data defects.
8. Regenerate from the corrected NDJSON.

The NDJSON format is a creative intermediate representation, not a template system. It exposes every decision to the model without prescribing what those decisions must be.
