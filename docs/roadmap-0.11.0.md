# Slide Agent 0.11.0 roadmap — Uncaged authoring

**Status:** Proposed  
**Release theme:** Let the AI imagine; make Slide Agent excellent at realizing, checking, and refining that imagination.  
**Target engine version:** `0.11.0`  
**Target contract version:** `0.10` (a new pre-1.0 contract revision; its schema changes are additive, but hosts must still adopt the new minor explicitly)  
**Scene format:** keep `slide-agent.scene/1` compatible; add only optional records and fields

## Release thesis

Slide Agent must be a **creative instrument for AI**, not a catalogue of Slide Agent-looking designs.

The host AI owns:

- the story;
- the visual thesis;
- the deck-specific design language;
- the composition of each slide;
- the choice and treatment of evidence;
- the critique and revision decisions.

Slide Agent owns:

- a broad, accurately documented PowerPoint capability surface;
- faithful translation of authored intent into editable PPTX objects;
- portable assets and reproducible scenes;
- deterministic structural, accessibility, and data checks;
- rendered evidence that the AI can inspect;
- compact, actionable feedback for the next AI revision pass.

The release succeeds when an AI can invent a visual language Slide Agent has never seen before and the engine can preserve it without normalizing it back into sharp panels, a fixed type scale, or a familiar house style.

## The problem 0.11.0 must solve

The current contract says the right thing: the AI is the creative director, freeform canvas bypasses the layout registry, and built-in layouts are fallbacks. The implementation and examples still create several strong attractors:

1. `CreativeDirection` exposes open prose but the concrete token resolver collapses geometry to `sharp | soft | organic`, density to three choices, and typography/spacing/stroke/radius to one fixed schema.
2. Unspecified geometry becomes `sharp`, so the engine has a visual opinion even when the author did not ask for one.
3. The contract examples repeatedly demonstrate palette + fonts + geometry, teaching models that art direction is a themed token bundle.
4. Capability discovery foregrounds named layouts, diagrams, and chart kinds more than the raw expressive canvas.
5. The build loop can validate its internal model but cannot prove that the final render preserved the intended text, hierarchy, or visual result.
6. Auto-fix can silently rewrite authored style values to satisfy a proxy metric.
7. The delivery package can contain stale previews or non-portable asset paths while still reporting success.
8. There is no cross-deck evaluation that detects a recurring Slide Agent fingerprint.

Adding more layouts, palettes, or geometry enums would enlarge the cage rather than remove it.

## Product principles

Every 0.11.0 decision should pass these tests.

### 1. Capabilities, not aesthetics

Expose what PowerPoint can do: text, native shapes, media, vector artwork, native charts, tables, groups, layers, crop, rotation, transparency, connectors, notes, hyperlinks, and extensions. Do not prescribe what a good slide should look like through a closed visual vocabulary.

### 2. Open design language, hard production floor

The AI may invent arbitrary visual roles and tokens such as `excavation-note`, `signal-fog`, `runway-crop`, or `ink-bleed`. Hard constraints apply to package integrity, clipping, accessibility, truthfulness, and declared brand requirements—not to the AI’s aesthetic method.

### 3. Preserve before repairing

Model-authored canvas values are source material. The engine may reject an invalid value or suggest a repair, but it must not silently restyle authored work. Any automatic change must be explicit, reversible, and render-verified.

### 4. The render is evidence

A scene that validates is not enough. The exact final PPTX must be rendered, inspected, and bound to its previews and report. The AI must receive compact visual evidence so it can critique what the audience will actually see.

### 5. Creativity requires iteration

The primary AI workflow is not prompt → deck. It is:

```text
brief + research
       ↓
visual concept alternatives
       ↓
narrative and silhouette plan
       ↓
model-authored scene
       ↓
build + render + deterministic review packet
       ↓
AI visual/editorial critique
       ↓
targeted revision
       ↓
final readiness gate
```

### 6. Model- and provider-neutral

Slide Agent should help Codex, Claude, Copilot, local models, and future hosts use their own reasoning, vision, search, and image-generation capabilities. The core package must not require one LLM or image provider.

### 7. Draft fallbacks stay honest

Prompt-only layouts remain useful scaffolding, but their metadata and CLI language must call them drafts. They are not the premium path and should not be used as reference art direction for host models.

## 0.11.0 release outcomes

The release must deliver all six outcomes below.

1. **Open visual systems:** an AI can define arbitrary deck-specific variables, named styles, motifs, and constraints without selecting from a Slide Agent token list.
2. **Broader canvas:** the contract exposes the practical expressive surface of the renderer and adds the highest-value missing primitives.
3. **AI review loop:** the CLI, MCP server, and contract provide a first-class build → see → critique → patch workflow.
4. **Outcome-based QA:** package validity and presentation readiness are distinct, and the exact final render participates in readiness.
5. **Portable final artifacts:** scenes rebuild with packaged assets; reports and previews are cryptographically tied to the final PPTX.
6. **Demonstrated visual range:** new examples prove materially different composition grammars, not palette swaps over shared bboxes.

## Scope and non-goals

### Must ship

- Open-ended visual-system schema and named style references.
- No aesthetic normalization of model-authored freeform canvas.
- Expanded, machine-readable canvas capability discovery.
- Agent-oriented review packet and targeted scene patching.
- Portable asset packaging and round-trip verification.
- Separate package/readiness verdicts.
- Render/OCR text fidelity checks and safe repair modes.
- Cross-deck structural-similarity evaluation.
- A new premium example suite authored from independent visual concepts.

### Should ship if the must-ship gates are green

- Native groups/symbol instances where the PowerPoint/PptxGenJS stack preserves editability reliably.
- SVG/vector artwork as a documented illustration asset with clear editability metadata.
- A provider-neutral visual-review extension interface.
- Render-derived image contrast and crop diagnostics.

### Explicit non-goals for 0.11.0

- Shipping an embedded LLM, stock-photo API, or image-generation provider.
- Adding dozens of preset themes or layout templates.
- Claiming prompt-only mode autonomously creates a premium deck.
- Replacing deterministic checks with an opaque “AI quality score.”
- Breaking existing `slide-agent.scene/1` files.
- Making every illustrative asset natively editable; text, charts, tables, and semantic diagrams remain editable, while photography and authored artwork may be embedded assets with declared provenance.

## Workstream A — Open visual-system contract

### A1. Add a deck-authored `visualSystem`

Add an optional structure to `CreativeDirection`:

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface DeckVisualSystem {
  /** Arbitrary names chosen by the author. */
  variables?: Record<string, JsonValue>;
  /** Arbitrary reusable style names, with optional inheritance. */
  styles?: Record<string, {
    basedOn?: string[];
    style: Record<string, unknown>;
  }>;
  /** Subject-derived visual ideas and what they mean. */
  motifs?: Record<string, {
    description: string;
    meaning?: string;
    usage?: string;
    avoid?: string[];
  }>;
  /** Author-declared rules, not engine presets. */
  constraints?: {
    hard?: string[];
    soft?: string[];
  };
}
```

Add `styleRef?: string | string[]` to canvas elements. Resolve referenced styles in order, then apply the element’s explicit style as the final override. Allow style values to reference variables with one simple, unambiguous syntax, for example `{"$var":"map-ink"}`.

The names are deliberately arbitrary. Slide Agent must not reserve aesthetic names such as `card`, `premium`, `editorial`, or `modern`.

Variables are general JSON values rather than a fixed color/spacing/type-token schema. When a variable is referenced from a concrete element property, the resolver validates it against that property and reports a precise incompatibility instead of silently coercing it.

### A2. Demote fixed tokens to fallback implementation details

- Keep `DeckTokens` for built-in layouts, built-in chart defaults, and legacy integrations.
- Do not derive or apply those tokens to explicit text/shape/image styles on a model-authored canvas.
- Change unspecified geometry from `sharp` to `authored`/no-op internally.
- Deprecate `creativeDirection.geometry` and `density` as closed enums. Continue accepting their current values for compatibility, but remove them from primary examples.
- Introduce open prose fields such as `geometryLanguage`, `spatialRhythm`, and `materialLanguage` only as authoring metadata; the engine should not reduce them to an enum.
- Preserve every supplied concrete color, font, size, radius, line, crop, and rotation unless it is invalid or violates a declared hard constraint.

### A3. Rewrite contract examples around invention

Replace the canonical “palette + font + sharp geometry” example with three contrasting examples that do not share structure:

- an archival, layered research deck;
- a typographic, image-led cultural deck;
- a dense technical field manual.

Each example should define its own style names and motifs. The guide must explicitly state that tokens are conveniences for consistency, not the boundaries of imagination.

### A4. Compatibility

- Bump `CONTRACT_VERSION` from `0.9` to `0.10`.
- Keep `SCENE_SCHEMA_ID` at `slide-agent.scene/1` because all changes are optional.
- Existing scenes, outlines, extensions, and palette fields must continue to build identically.
- Add a contract migration note explaining that `geometry` and `density` are legacy hints, not recommended authoring fields.

**Primary files:**

- `src/types/index.ts`
- `src/contract/schemas.ts`
- `src/contract/scene.ts`
- `src/contract/guide.ts`
- `src/contract/version.ts`
- `src/design/tokens.ts`
- `src/themes/creative-director.ts`
- generated skill/reference documentation

**Acceptance criteria:**

- A scene with ten arbitrary style names round-trips without renaming or loss.
- Explicit element values are byte-for-byte equivalent in the emitted inspected scene unless a documented normalization is required by the file format.
- An omitted geometry field causes no corner-radius or shape-language decision on model-authored canvas elements.
- All 0.10 scenes accepted by the 0.11 engine produce the same visual output in legacy compatibility tests.

## Workstream B — Expressive canvas and capability discovery

### B1. Publish canvas capabilities, not just named helpers

Extend `Capabilities` with a `canvas` block describing:

- supported element types;
- supported text, shape, connector, image, table, and chart properties;
- native PowerPoint versus embedded-asset behavior;
- grouping/layering support;
- link and notes support;
- crop, rotation, transparency, line, fill, and text-run support;
- installed fonts and render-backend limitations;
- which features are core and which come from extensions.

This data must be available through CLI, MCP resources, and the TypeScript API. A model should be able to ask “can I build this idea?” before simplifying it into boxes.

### B2. Add high-value primitives

Implement in this order, gated by an editability and round-trip spike:

1. **Groups:** movable/editable native groups if reliable; otherwise a scene-level logical group that preserves relative transforms and expands to native elements.
2. **Symbols:** reusable authored element collections with per-instance position, scale, text, and color overrides. Symbols are user-defined, never a built-in icon vocabulary.
3. **Vector artwork:** SVG or another supported vector path as an illustration asset, with explicit `editable: false | "partial" | true` metadata. Preserve source/provenance.
4. **Image treatments:** focal point, explicit crop rectangle, mask shape where supported, and deterministic duotone/tint preprocessing as an opt-in asset transform.
5. **Richer text:** paragraph/runs, line spacing, character spacing, indentation, columns, and no-break spans exposed in the schema instead of hidden only in `options`.
6. **Layer metadata:** named layers and explicit z-order groups for review, without forcing a visual style.

Continue supporting raw `style.options`/native options as an escape hatch. The schema documents common capabilities; it does not become a whitelist that blocks future PowerPoint features.

### B3. Make editability truthful

Add `editability` to manifest records:

- `native`: editable PowerPoint object;
- `grouped-native`: editable components inside a group;
- `embedded-vector`: scalable artwork, not shape-editable;
- `embedded-raster`: pixels;
- `generated-native`: built by a grammar into editable primitives.

The contract should encourage native elements for semantic content and allow embedded artwork for illustration. This is more honest than claiming every visual is equally editable.

**Primary files:**

- `src/types/index.ts`
- `src/contract/schemas.ts`
- `src/contract/scene.ts`
- `src/components/element-writer.ts`
- `src/layouts/freeform-composer.ts`
- `src/components/pptx-values.ts`
- `src/extensions.ts`
- `src/images/image-manager.ts`

**Acceptance criteria:**

- Capability output is sufficient for a host model to discover every documented canvas feature without reading source code.
- New primitive records round-trip through scene export/import and survive slide-level revision.
- Every manifest element declares editability accurately.
- No new primitive bypasses `ElementWriter`.

## Workstream C — AI-native design and review protocol

Slide Agent should not hide an LLM inside the compiler. It should give a host AI better structured work products and feedback.

### C0. Add an authoring-capability handshake

Engine capability discovery describes what Slide Agent can render. The authoring session should also accept an optional declaration of what the **host AI** can do, for example:

```ts
interface HostAuthoringCapabilities {
  vision?: boolean;
  webResearch?: boolean;
  imageGeneration?: boolean;
  vectorGeneration?: boolean;
  codeExecution?: boolean;
  localFileAccess?: boolean;
  availableAssetProviders?: string[];
}
```

This is planning context, not a security grant. It lets the contract tell an image-capable AI to create bespoke artwork, a vision-capable AI to inspect every render, and a research-capable AI to build a source ledger instead of unnecessarily designing around the lowest common denominator. The core still performs no provider call by itself.

### C1. Formalize the design brief and sequence plan

Add optional, concise authoring metadata—not private chain-of-thought—to the deck record:

```ts
interface DesignExploration {
  alternatives?: Array<{
    name: string;
    thesis: string;
    differentiator: string;
    rejectedBecause?: string;
  }>;
  chosen?: string;
}

interface SequencePlanItem {
  slideId: string;
  narrativeJob: string;
  dominantArtifact?: string;
  silhouette?: string;
  energy?: "quiet" | "medium" | "loud" | string;
  transition?: string;
}
```

This makes the model commit to a deck-specific visual and narrative plan before it authors coordinates. It also gives later critique a declared intention to compare against.

Add an optional claim/source ledger alongside that plan:

```ts
interface ClaimLedgerItem {
  id: string;
  slideId?: string;
  claim: string;
  kind?: "fact" | "number" | "quote" | "recommendation" | "illustrative" | string;
  sourceIds?: string[];
  asOf?: string;
  calculation?: string;
  status?: "verified" | "needs-review" | "illustrative";
}
```

This is concise evidence metadata, not hidden reasoning. It lets a research-capable host AI use its strengths and gives revision checks enough structure to catch orphaned sources, stale qualifications, and unsupported precision.

### C2. Add `slide-agent review`

Create a deterministic command and matching MCP tool that returns an **agent review packet** for the exact PPTX:

- PPTX, scene, manifest, report, and preview hashes;
- a contact sheet plus per-slide renders;
- OCR-extracted visible text and comparison with intended scene text;
- slide dimensions and element bboxes;
- current structural/accessibility/data issues;
- quality observations clearly labeled as heuristics;
- the slide’s communication/design intent and its neighbors’ thumbnails;
- suggested review questions, not aesthetic answers.

The packet should be compact enough for an AI context window and allow `--slide`, `--from`, and `--to` selection.

Suggested MCP tool:

```text
review_presentation(input, scene?, manifest?, slides?, includeImages?)
```

### C3. Add targeted scene patching

One-slide replacement is safe but can force the model to restate every element on that slide. Add a semantic patch operation that can:

- add/remove an element;
- update text, style, bbox, z-index, or provenance by element ID;
- update slide intent/notes/sources;
- apply a style-system change across selected elements;
- preview the patch without writing;
- emit a before/after semantic diff.

Suggested interfaces:

```text
slide-agent patch --input deck.pptx --operations patch.json --output revised.pptx --render
patch_presentation(input, output, operations, render=true)
```

Patches must use IDs and explicit target slides. No fuzzy “make it nicer” operation belongs in the deterministic engine.

### C4. Change the recommended host workflow

The skill, MCP prompt, CLI guide, and docs should recommend:

1. read capabilities and contract;
2. research and write claim/source ledger;
3. invent at least two visual theses;
4. choose one and write a sequence/silhouette plan;
5. author a freeform scene;
6. build with rendering enabled;
7. call `review` and inspect every slide;
8. patch specific defects;
9. rerun readiness and round-trip checks;
10. deliver the canonical final package.

**Primary files:**

- `src/contract/guide.ts`
- `src/contract/schemas.ts`
- `src/types/index.ts`
- `src/cli.ts`
- `src/mcp-server.ts`
- `src/serialization/scene-ndjson.ts`
- `src/serialization/diff.ts`
- new `src/review/` module
- new scene patch module under `src/serialization/` or `src/editing/`

**Acceptance criteria:**

- The same contract adapts its recommended workflow to declared host capabilities without changing the visual vocabulary or binding to a named model.
- Claims, source IDs, dates, and calculations survive scene round-trip and remain addressable after slide patches.
- A host model can review one slide without loading the entire deck’s raw manifest.
- Patch operations preserve untouched slides and untouched elements exactly.
- Review packets always identify the exact PPTX hash they describe.
- Documentation never implies Slide Agent itself supplied taste or made the creative choice.

## Workstream D — Portable assets and final-artifact identity

### D1. Canonical package layout

Every final build should use one canonical artifact root:

```text
deck.pptx
artifacts/
  scene.ndjson
  manifest.json
  validation.json
  review.json
  previews/slide-01.png
  deck.pdf
  assets/<sha256>.<ext>
```

Local assets must be copied or content-addressed into `artifacts/assets/`. The emitted scene must reference portable paths relative to its own package, not the author’s absolute filesystem.

Retain original source/provenance separately from the package path. Remote URLs remain provenance; the build should not require them to reconstruct an already packaged deck.

### D2. Artifact graph

Add hashes and derivation metadata:

```ts
interface ArtifactIdentity {
  path: string;
  sha256: string;
  bytes: number;
  derivedFrom?: string[];
  createdAt: string;
}
```

The final validation/review result must bind:

- PPTX hash;
- final scene hash;
- manifest hash;
- packaged asset hashes;
- PDF hash;
- each preview hash;
- render backend and version.

### D3. Round-trip gate

For a final/readiness run, rebuild the emitted scene in a clean temporary directory using only packaged assets. Compare:

- slide count;
- scene semantics;
- manifest element IDs and key properties;
- rendered image similarity within a documented renderer tolerance.

Failure means `packageStatus: fail`, regardless of whether the original PPTX opens.

**Primary files:**

- `src/pipeline.ts`
- `src/images/image-manager.ts`
- `src/serialization/scene-ndjson.ts`
- `src/rendering/renderer.ts`
- validation report/result types
- package layout utilities

**Acceptance criteria:**

- Moving the complete deliverable directory to a different path or machine does not break scene reconstruction.
- A stale or missing preview cannot produce a passing package status.
- Revision replaces or invalidates all canonical derived artifacts.
- The Carthage/Fukuoka broken-path class is covered by regression tests.

## Workstream E — Outcome-based validation and safe repair

### E1. Split the verdict

Add two top-level statuses:

```ts
packageStatus: "pass" | "warning" | "fail";
presentationReadiness: "ready" | "review" | "not-ready";
```

Keep legacy `status` for 0.11 compatibility, document it as package-oriented, and plan its removal only in a future breaking contract.

`packageStatus` covers deterministic file, schema, asset, link, render-freshness, and round-trip integrity.

`presentationReadiness` combines:

- blocking deterministic presentation defects;
- render/OCR fidelity;
- unresolved source/data requirements;
- explicit visual-review findings supplied by a host or reviewer;
- minimum dimension gates;
- documented waivers.

Do not turn a weighted average into readiness. One critical dimension can block readiness even when the average is high.

### E2. Add render/OCR fidelity

For a real render:

- extract visible text from each preview/PDF;
- compare normalized OCR text with scene/manifest text;
- flag missing endings, orphaned fragments, unintended word splits, repeated strings, and unexpected text;
- check title/subtitle clearance and element-edge proximity from OCR boxes;
- identify font substitution when the renderer exposes it or when text geometry shifts materially.

OCR uncertainty should produce `review`, not fabricated certainty.

### E3. Make quality metrics more honest

- Rename current outputs as `heuristics` in the report.
- Density should use occupied-area union rather than sum of bboxes.
- Variety should use geometry, area hierarchy, whitespace topology, and reading path—not element-type counts alone.
- Evidence should require a declared claim/artifact relationship; two diagram nodes are not evidence by themselves.
- Accessibility must include rendered image-background contrast where measurable.
- A quality band must have per-dimension floors.

### E4. Add a provider-neutral visual-review hook

Define an optional extension:

```ts
interface VisualReviewer {
  id: string;
  review(packet: ReviewPacket): Promise<VisualReviewFinding[]>;
}
```

Findings require severity, slide, element IDs where possible, observation, rationale, and suggested target—not an unexplainable scalar score. The core ships the interface and deterministic packet, not an LLM provider.

### E5. Replace silent auto-fix with repair modes

Add:

- `safe`: only deterministic, semantics-preserving fixes that pass a render regression check;
- `suggest`: report proposed changes but do not mutate;
- `off`: no repair.

Make `suggest` the default for model-authored freeform canvases in 0.11.0. Keep legacy behavior behind an explicit compatibility flag during the transition.

Every accepted repair must record:

- before and after values;
- issue targeted;
- render/OCR comparison;
- whether author intent fields changed;
- rollback data.

**Primary files:**

- `src/validation/validator.ts`
- `src/validation/manifest-validator.ts`
- `src/validation/quality.ts`
- `src/validation/auto-fixer.ts`
- `src/validation/accessibility.ts`
- `src/rendering/renderer.ts`
- `src/pipeline.ts`
- `src/extensions.ts`
- report schemas/types and docs

**Acceptance criteria:**

- A deck cannot be `ready` when its report contains missing OCR text, stale previews, broken assets, or an unresolved critical visual finding.
- The modern-overview color/font repair regression is a golden test and must not recur.
- Quality output clearly distinguishes measured facts, heuristics, and reviewer judgments.
- No freeform canvas value changes silently under the default repair mode.

## Workstream F — Anti-template and originality evaluation

Freedom is not proved by an open schema alone. It must be visible in the output corpus.

### F1. Structural visual signature

Create a deck/slide signature from:

- normalized element bboxes and z-order;
- dominant visual masses and their area ratios;
- title/body/image/chart positions;
- alignment graph;
- whitespace distribution;
- color-field segmentation;
- text-to-visual ratio;
- slide-to-slide rhythm;
- repeated motif/component geometry.

Use the signature for evaluation and review warnings, not as a new style optimizer. It should say “these decks are structurally similar,” not force a different predetermined layout.

### F2. Independent concept requirement for examples

Every showcase deck must include:

- a separate visual thesis;
- a separate sequence plan;
- a separate scene authoring source;
- no copied bboxes from another deck unless the example is explicitly demonstrating templating;
- a similarity report against the other showcase decks.

Do not count palette/font transformations as independent design examples.

### F3. Human evaluation

Run a blinded review with presentation designers and target-audience readers. Ask separately:

- Does this look premium?
- Does it feel designed for this subject?
- Is the reading path clear?
- Is the visual evidence meaningful?
- Does it look like the same tool/template as the other decks?
- Would you present it without redesign?

Human ratings calibrate the release; they are not embedded into runtime validation.

**Primary files:**

- new `src/evaluation/visual-signature.ts` or test-only equivalent
- new `scripts/evaluate-examples.ts`
- example metadata and evaluation reports
- golden render fixtures

**Acceptance criteria:**

- No two showcase decks are near-duplicates by geometry signature.
- A palette-only restyle is correctly classified as structurally similar.
- At least 70% of blinded reviewers rate each release showcase deck 4/5 or better for subject-fit and craft.
- At least 60% say they would present each showcase deck with only minor edits.

## Workstream G — New showcase and regression suite

Replace the current proof strategy with six briefs that force different visual reasoning:

1. **Technical architecture:** precise, evidence-heavy, but not a dashboard or card grid.
2. **Cultural heritage:** archival/editorial and materially textured.
3. **Travel:** image-led and atmospheric, with accurate practical information.
4. **Board decision:** sparse, financially rigorous, and recommendation-led.
5. **Scientific explanation:** diagrammatic with typed data-to-geometry relationships.
6. **Fashion or arts launch:** typography and imagery as primary composition material.

For each brief, store:

- sources/claim ledger;
- design alternatives and chosen thesis;
- sequence plan;
- authored scene;
- final packaged assets;
- final PPTX/PDF/previews;
- deterministic report;
- visual review findings and revisions;
- structural similarity results;
- human evaluation summary.

No two examples may share a generated scene or bbox skeleton. Reusable engine tests can still share fixtures; showcase authorship cannot.

## Implementation plan and dependency order

### Milestone 0 — Architecture decisions and baselines

**Deliverables**

- ADR: creative freedom versus deterministic constraints.
- ADR: style references and arbitrary variable resolution.
- ADR: portable asset package and artifact graph.
- ADR/spike: native groups, symbols, and vector editability.
- Golden fixtures for the four reviewed decks, including known failure cases.
- Baseline geometry-similarity and human-review scores.

**Exit gate:** the team agrees on what the engine must never normalize on model-authored canvases.

### Milestone 1 — Contract 0.10 and uncaged canvas

**Depends on:** Milestone 0  
**Includes:** A1–A4, B1, initial B2 primitives  
**Exit gate:** arbitrary named visual systems and styles round-trip; legacy scenes remain stable.

### Milestone 2 — Portable package and artifact identity

**Depends on:** Milestone 1  
**Includes:** D1–D3  
**Exit gate:** every final example rebuilds in a clean directory; reports cannot reference stale/missing artifacts.

### Milestone 3 — Review packet and targeted patch loop

**Depends on:** Milestones 1–2  
**Includes:** C1–C4  
**Exit gate:** a host AI can see the exact render, identify a slide/element defect, patch it by ID, and receive a verified before/after result without regenerating the deck.

### Milestone 4 — Readiness, OCR, and safe repair

**Depends on:** Milestones 2–3  
**Includes:** E1–E5  
**Exit gate:** known clipping, stale-artifact, missing-asset, orphaned-copy, and harmful-auto-fix fixtures cannot report `ready`.

### Milestone 5 — Originality evaluation and showcase rebuild

**Depends on:** Milestones 1–4  
**Includes:** F1–F3 and G  
**Exit gate:** showcase decks meet the human and structural-diversity bars; no showcase relies on a shared bbox skeleton.

### Milestone 6 — Release hardening

**Deliverables**

- migration guide for contract 0.9 hosts;
- regenerated skills, MCP resources, prompt, and reference docs;
- public API and CLI documentation;
- full compatibility, unit, integration, consumer-install, and release-artifact suites;
- performance and review-packet size budgets;
- release notes with honest capability boundaries.

**Exit gate:** all release gates below pass on a clean install.

## Concrete work packages

| ID | Priority | Work package | Main dependency | Size |
|---|---|---|---|---|
| V011-01 | P0 | Contract 0.10 open visual-system schema | — | M |
| V011-02 | P0 | Style references and variable resolver | V011-01 | M |
| V011-03 | P0 | Stop canvas aesthetic normalization; compatibility tests | V011-01 | M |
| V011-04 | P0 | Machine-readable canvas capability surface | V011-01 | M |
| V011-05 | P0 | Portable asset store and relative scene paths | — | L |
| V011-06 | P0 | Artifact graph, hashes, freshness checks | V011-05 | M |
| V011-07 | P0 | Clean-directory scene round-trip gate | V011-05 | M |
| V011-08 | P0 | Review packet CLI/API/MCP | V011-04, V011-06 | L |
| V011-09 | P0 | Element-ID scene patching and semantic diff | V011-02 | L |
| V011-10 | P0 | Package status versus presentation readiness | V011-06 | M |
| V011-11 | P0 | Render/OCR text fidelity | V011-08 | L |
| V011-12 | P0 | Safe/suggest/off repair modes | V011-11 | L |
| V011-13 | P1 | Groups and symbols | capability spike | L |
| V011-14 | P1 | Vector/image treatment primitives | capability spike | L |
| V011-15 | P1 | Visual-review extension hook | V011-08 | M |
| V011-16 | P1 | Geometry-aware structural signature | V011-08 | L |
| V011-17 | P0 | Contract/skill workflow rewrite | V011-08–12 | M |
| V011-18 | P0 | Six-deck independent showcase suite | all core P0s | XL |
| V011-19 | P0 | Blinded human evaluation and release report | V011-18 | M |

## Release gates

0.11.0 must not ship until all P0 gates pass.

### Freedom and fidelity

- Arbitrary visual-system/style names round-trip without loss.
- Model-authored canvas style values are preserved by default.
- Omitted creative fields do not cause a default sharp-component language.
- Capability discovery exposes the expressive canvas before fallback layouts.

### Artifact trust

- 100% of final showcase packages rebuild from their emitted scenes in a clean directory.
- 100% of reported preview paths exist and match the final PPTX hash.
- A stale preview, missing asset, or mismatched PDF forces `packageStatus: fail`.

### Render fidelity

- Zero known clipped or incomplete visible strings across golden/showcase decks.
- OCR mismatches are either resolved or explicitly waived with evidence.
- No accepted safe repair creates a new visual/OCR regression.

### Design range

- Six showcase decks use independent scene skeletons.
- Geometry signature detects the two old technical variants as highly similar.
- No pair of new showcase decks crosses the agreed near-duplicate threshold.
- Human subject-fit/craft and presentability thresholds are met.

### Compatibility and engineering

- Existing scene/1 fixtures build without migration.
- `npm run verify`, `npm run verify:consumer`, plugin validation, and release audits pass.
- CLI, MCP, skill, generated docs, and TypeScript API expose the same contract version and capability model.

## Testing strategy

### Unit

- arbitrary variable/style resolution and inheritance;
- cycle/unknown-reference errors with actionable messages;
- scene record round-trip for every new primitive;
- portable path rewriting and provenance preservation;
- artifact hash graph and stale-file detection;
- semantic patch targeting and untouched-element preservation;
- geometry signature invariants;
- readiness gates and repair-mode behavior.

### Integration

- create → render → review → patch → rerender → readiness;
- package move to a new root → rebuild from scene;
- revision invalidates old derivatives;
- extension-provided visual reviewer consumes the same packet as an AI host;
- legacy contract/scene fixtures stay render-stable.

### Golden visual regression

Maintain explicit fixtures for:

- broken word wrap;
- low-contrast text over a photograph;
- title/subtitle collision;
- stale footnote after text removal;
- auto-fix color/font regression;
- same geometry with different palette;
- missing packaged image;
- stale preview from an earlier revision.

Golden image comparison should use tolerances appropriate to the render backend and never hide OCR or semantic mismatches behind a permissive pixel threshold.

### Human evaluation

Use blinded deck order and hide engine/version metadata. Record reviewer background and separate design craft from content usefulness. Preserve raw results and publish the aggregate criteria with the release examples.

## Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Open styles become untestable arbitrary JSON | Flexibility can hide malformed native options | Validate known common properties; sandbox/pass through native options with explicit warnings; preserve escape hatch |
| More freedom produces incoherent decks | Freedom is not taste | Require concept/sequence plan, render review, targeted critique, and human-calibrated examples—not more style rules |
| OCR is unreliable | False positives can block delivery | Track confidence; use `review` for uncertainty; compare PDF text extraction before image OCR where possible |
| Native grouping/vector support is renderer-dependent | Editability promises may be false | Capability spike first; report editability per element; ship logical groups if native groups are unreliable |
| Review packets become too large | AI hosts have context/image limits | Range selection, contact sheets, compact summaries, on-demand slide detail, image count/size budgets |
| Contract 0.10 breaks pre-1.0 hosts | Current compatibility treats 0.x minors strictly | Ship migration guide, continue legacy field acceptance, allow hosts to request contract 0.9 during a transition window if feasible |
| Visual-review hook becomes provider-biased | Core could accidentally favor one model | Provider-neutral interface and fixtures; no bundled reviewer required |
| Originality metric becomes another optimizer/cage | Models may game a score | Use for diagnosis/evaluation only; never prescribe a replacement layout or maximize novelty blindly |
| 0.11 scope becomes too broad | Quality can slip if everything lands at once | Protect P0 gates; move groups/vector treatments to 0.11.x if their spikes threaten artifact trust or review loop |

## Documentation and positioning changes

Update public language from:

> “Slide Agent generates designed presentations.”

to:

> “Your AI designs the presentation. Slide Agent gives it an expressive PowerPoint canvas, preserves the design as editable objects, and provides the render-and-revise feedback loop needed to finish well.”

Documentation should make three modes explicit:

1. **AI-authored freeform:** recommended for professional work.
2. **Structured native grammar:** useful when data/relationships have a known semantic form.
3. **Prompt-only fallback draft:** scaffolding, never presented as finished design.

The examples page must show the design brief, visual thesis, sequence plan, scene, and revision evidence—not only final screenshots. That demonstrates AI capability and tool faithfulness separately.

## Definition of done

Slide Agent 0.11.0 is done when:

- the AI can invent arbitrary deck-specific visual roles and use them directly;
- the engine does not coerce that work into a fixed aesthetic vocabulary;
- the capability surface is broad enough that the AI does not need to fall back to panels for lack of documented options;
- the exact final render is visible to the AI and tied to the exact final PPTX;
- targeted patches make critique inexpensive and preserve good work;
- final scenes are portable and reproducible;
- readiness means more than “the package opens”;
- the new examples look as if they were designed for six different subjects—not generated by one slide tool;
- independent reviewers describe the best examples as premium, subject-specific, and presentable with only minor edits.

The guiding sentence for every issue and pull request is:

> **Do not teach the AI what Slide Agent designs look like. Teach it what the medium can do, preserve what it authors, and give it the evidence to improve.**
