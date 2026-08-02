---
name: slide-agent
description: Invent, create, edit, render, validate, repair, and export distinctive editable PowerPoint presentations with model-authored art direction, typography, color, composition, diagrams, charts, imagery, and slide-native elements. Use for new `.pptx` decks, existing PowerPoint edits, visual storytelling, themes or brand systems, freeform slide canvases, native charts/tables/diagrams, previews, layout QA, structured JSON requests, or any workflow that must return a production-ready PowerPoint rather than flattened screenshots.
---

# Slide Agent

Act as the presentation's creative director, information designer, and craftsperson. The toolkit supplies editable PowerPoint primitives; it does not prescribe the aesthetic.

## Keep creative authority with the model

For every new deck, invent an art direction from the content, audience, objective, emotional register, and cultural context. Do not default to Slide Agent's JSON colors, fonts, title rule, card treatment, or built-in layouts. Those are fallback mechanics for prompt-only operation, not a house style.

Do not select from a closed list of themes. Name and articulate the deck's own visual thesis. Choose any suitable colors, typefaces, spatial logic, image treatment, shape language, chart treatment, and diagram grammar. A model-authored `canvas` bypasses the layout registry completely; use it whenever a custom composition better communicates the slide.

Respect actual user constraints such as supplied brand guidelines, licensed assets, accessibility needs, and output dimensions. Preserve technical QA—valid files, editable objects, legibility, bounds, and intentional overlap—but never mistake those checks for aesthetic rules.

For new decks, read [creative-direction.md](references/creative-direction.md). For technical, educational, strategic, or other knowledge-rich decks, also read [professional-depth.md](references/professional-depth.md). Read [freeform-canvas.md](references/freeform-canvas.md) before authoring model-directed canvases or advanced native formatting. Read [scene-ndjson.md](references/scene-ndjson.md) when a line-oriented blueprint will make generation, inspection, or revision easier. Read [diagrams.md](references/diagrams.md) when the story needs diagrams, charts, systems, processes, or quantitative evidence.

## Define the communication job

Infer minor missing details and continue. Ask only when a missing choice would materially change the outcome.

Determine the audience, desired outcome, context, presentation type, tone, language, duration or slide count, source constraints, supplied assets, brand constraints, and output paths. Express the internal job as: “By the end, [audience] should [outcome] because [central takeaway].” Never expose production instructions to the audience.

## Plan the story before styling it

Choose a cumulative narrative appropriate to the objective: context to stakes to evidence to action; question to analysis to answer; problem to options to recommendation; current state to future state; or another structure invented for the material.

Give every slide one narrative job and one primary claim. Use takeaway titles when visible titles help; a model-authored visual slide may instead carry its claim through composition. Open with purpose, tension, or an intriguing frame. Close by resolving the story with a decision, action, synthesis, or productive question—not a generic thank-you page.

Before styling, make an audience-question map and store it in `outline.completeness`. Cover the questions that determine whether the audience can understand, trust, operate, decide, or act on the material. Include required evidence and a closing contract such as ownership, next action, readiness, risk, troubleshooting, or limitations when the task needs them. Completeness is not a mandatory section list and must not become padding.

For each substantive slide, define `communication` with the audience question, answer or claim, evidence, truthful artifact form, explanation, implication, and action as applicable. These fields are open planning metadata, not visible placeholders and not a layout schema. A slide about code should be allowed to show code; a slide about ownership should be allowed to become a matrix; a slide about behavior should be allowed to become a conditional system diagram.

## Invent the deck's visual thesis

Populate `outline.creativeDirection` with the model's intent. It is open-ended and may include:

- `name`, `concept`, and `rationale`.
- Mood and pacing.
- A concrete semantic palette plus any additional custom colors.
- Display, heading, body, monospaced, or numeric typography.
- Composition principles and spatial rhythm.
- Visual, image, shape, texture, chart, and diagram languages.
- Deliberate exclusions in `avoid`.

Make the design system specific enough that another designer could recognize the deck, yet flexible enough that slides do not become repeated templates. Derive choices from meaning: topology can shape an architecture deck; material layers can shape a transformation story; a field-note language can suit research; monumental type can suit a manifesto. Avoid arbitrary decoration.

Do not confuse creative freedom with loud styling. Dense technical manuals, monochrome reports, quiet editorial essays, archival collages, exuberant launches, and unfamiliar hybrids are all valid. Oversized type, neon accents, abstract geometry, vast negative space, or cinematic imagery are choices—not default signs of creativity.

Do not reuse the same palette, font pairing, cover structure, title placement, panel grid, diagram boxes, or closing treatment across unrelated decks merely because it worked before.

## Compose slides from first principles

Prefer a model-authored `SlideSpec.canvas` for high-quality new work. The canvas accepts editable text (including rich runs), arbitrary PptxGenJS shape names, connectors, images, native tables, and native charts at model-selected coordinates, layers, colors, typography, rotations, transparency, and advanced native options.

For each slide, define:

- `communication`: what question the slide resolves, its claim, evidence, artifact, explanation, implication, and action.
- `designIntent`: why this composition communicates the claim.
- `composition`: the intended visual hierarchy, balance, rhythm, and reading path.
- `background`: an optional per-slide color.
- `canvas`: the actual editable scene.

Choose any semantic `kind`; it is metadata, not a whitelist. When `canvas` exists, `layout` is ignored—even if it names no registered layout. Built-in layouts remain useful compatibility fallbacks for fast drafts, but they do not define the model's range.

For long or highly designed decks, prefer the model-friendly NDJSON scene representation. It stores one `deck`, `slide`, `textbox`, `shape`, `connector`, image, table, chart, or `notes` record per line. Slide Agent writes `artifacts/intermediate_files/<deck>.inspect.ndjson` and can regenerate the deck from it with `--scene`. The blueprint contains creative intent and styling, not only a read-only inventory.

Vary silhouettes and scale across the sequence while preserving the deck's underlying visual logic. Use contrast between dense and sparse, quiet and loud, diagrammatic and photographic, or structured and expressive slides to create pacing. Avoid repeated card grids, small UI panels, and mechanically centered content unless the story specifically calls for them.

Use content-driven density. “Avoid overcrowding” does not mean leaving most of every slide empty. Detailed decks may need three to five visible hierarchy levels and many editable objects. Establish legibility with grouping, scale, alignment, semantic color, rules, and attached annotations. Preserve real artifacts—code, configuration, file trees, decision tables, diagnostic output, screenshots, or data—when they help the audience understand the subject.

## Use the full visual vocabulary

Preserve editability:

- Add words as text boxes or rich text runs.
- Build graphic systems and simple illustrations from native shapes.
- Build diagrams from editable shapes and connectors; create edges before nodes or place them on lower `zIndex` layers.
- Use native tables for precise lookup and native charts for data relationships.
- Use editable shapes for custom quantitative forms when a standard chart is not the right visual argument.
- Use images for photography, artwork, screenshots, textures, or supplied visual evidence—not as flattened full-slide substitutes.

The model may pass advanced PptxGenJS options through element `style.options` or chart/table options. Use this capability purposefully and verify the render because not every PowerPoint viewer interprets advanced effects identically.

For sourced claims and assets, add a `[Sources]` block to speaker notes:

```text
[Sources]
- Source label — https://example.com
[/Sources]
```

Never invent sources, data, people, or quotations.

## Build, render, inspect, and repair

Prefer a complete `PresentationOutline` supplied by the host model. Prompt-only mode is a vendor-neutral fallback and cannot replace model judgment.

For a first-time installation without a source checkout, run `npx --yes --package @slide-agent/core@latest -- slide-agent install`. This one pass persistently installs the user-local CLI and MCP server plus discovery links for Codex, Copilot, Claude, and Gemini, then runs `slide-agent doctor`. Node.js is the only core dependency. LibreOffice and Poppler are optional preview tools and are attempted only when the user explicitly adds `--with-render-deps`. `npx` is only the bootstrap. Do not use `npm link`, an administrator-owned global npm prefix, or manual skill copying. The launcher lives under the user's `~/.local/bin`. Use `slide-agent uninstall` for a guarded removal.

When deliberately developing from a repository checkout, `./install.sh` on macOS/Linux and `install.cmd`/`install.ps1` on Windows use the same setup engine locally.

For local skill discovery, use the bundled `scripts/install-codex.sh`, `install-copilot.sh`, `install-claude.sh`, or `install-gemini.sh`. Use `install-all-agents.sh` to link the same source skill into every supported personal skill directory. These installers preserve one editable source of truth and refuse to replace conflicting installations.

```bash
slide-agent create --prompt request.md --output presentation.pptx
slide-agent create --scene artifacts/intermediate_files/presentation.inspect.ndjson --output regenerated.pptx
slide-agent run --request create-request.json
```

Or call `executeAgentRequest()` from TypeScript. Read [api.md](references/api.md) for the full contract.

The pipeline resolves assets, composes editable elements, exports a `.pptx` and manifest, validates structure and geometry, and applies bounded repairs to fixable defects. Rendering is opt-in with `--render`; without the optional tools, creation and structural validation still complete normally.

Inspect every rendered slide at full size. Evaluate the design as a sequence, not only as isolated frames. Check hierarchy, type wrapping, spacing, image crops, visual tension, chart reading, table legibility, connector routing, pacing, clipping, and accidental overlaps. Mark deliberate collisions with `intentionalOverlap` or `allowOverlapWith`; do not disable QA globally.

Run a depth review as well as a visual review. Verify that material audience questions are answered, evidence is shown rather than merely asserted, explanations sit next to what they clarify, and the close completes the audience's knowledge or action loop. Do not add detail for its own sake.

```bash
slide-agent render --input presentation.pptx --output previews/
slide-agent validate --input presentation.pptx --report validation.json
```

Treat validation `fail` as unresolved work. Quality checks may identify technical problems, but they must not normalize asymmetry or force a model-authored canvas back onto template margins. Read [validation.md](references/validation.md) for issue policy.

## Edit existing presentations safely

Always write edits to a new `.pptx`. Render before and after when preview tools are available or when the user requests visual comparison.

```bash
slide-agent edit --input existing.pptx --prompt changes.md --output updated.pptx
```

Preserve unaffected OOXML parts. Do not rebuild an existing deck in a new style unless the user explicitly approves the fidelity tradeoff. Read [editing.md](references/editing.md) before changing decks with SmartArt, macros, animations, OLE objects, or unusual charts.

## Return artifacts honestly

Keep the final `.pptx` and `.pdf` at the requested output root. Keep previews under `artifacts/images`, generated sources under `artifacts/generated_assets`, manifests and scenes under `artifacts/intermediate_files`, and validation/metadata under `artifacts/logs`. Return the primary deliverable links, slide count, creative-direction summary, validation status, artifacts, and any manual-verification note. Do not claim success when validation failed or conceal unsupported content by deleting it.
