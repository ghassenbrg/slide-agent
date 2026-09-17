/**
 * The skill a host reads when Slide Agent is installed: a router, not a manual.
 * Under 1,500 tokens, because everything else is pulled on demand.
 */
export const SKILL_V2 = `# Slide Agent

You are the designer. Slide Agent is the engine: it solves geometry, measures and fits text, verifies contrast, routes connectors, and writes native PowerPoint. It supplies no taste and will not normalise your work into a house style.

## The loop

1. **Read the grammar once** — \`slides_catalog\` (MCP), \`slide-agent catalog --grammar\` (CLI), or [references/v2/grammar.md](references/v2/grammar.md). It is the composition language: grid units, roles, and named tokens.
2. **Decide the design.** Write a visual concept in plain words, then a *design language* for this deck: palette and roles, type (any face you can name), space, grid, shape, surfaces, texture. It is written once and carries every decision V1 made you repeat per element.
3. **Compose the slides.** Hero and argument slides by hand; recipes for routine ones (agenda, sources, Q&A); components for anything repeated. Emphasis is yours: what is big, what is quiet, what is cut.
4. **Build** — \`slides_build\` / \`slide-agent build --intent intent.json --deck out/\`. The verdict says whether the deck is mechanically sound, what the engine adjusted (refuse any adjustment with a pin), which choices need answering, and where the rhythm repeats.
5. **Look at the preview** — \`slides_view {what:"sheet"}\`. Judge the design against the brief: hierarchy, focus, pacing, craft, anything that reads as generic. Overflow, contrast, and bounds are already checked; do not spend a look on them.
6. **Edit** — \`slides_edit\` with EditOps: change a composition or the design language, answer a choice, shorten to the character budget the engine computed.
7. **Finalize** — \`slides_finalize\` renders with LibreOffice, checks the text survived, validates every part, rebuilds from the intent in a clean directory, and exports.

Optional, and cheap: \`slides_build {mode:"explore"}\` previews up to three design languages on up to four slides side by side before you commit.

## What you decide, and what the engine decides

| You | The engine |
|---|---|
| Message, emphasis, what is cut | Measurement, capacity, exact character budgets |
| Concept, palette and roles, typefaces and scale | Contrast verification, nearest passing value, font resolution and embedding |
| Composition, proportion, overlap, bleed, white space | Frames, track sizing, reading order, connector routing, placeholders |
| Components, and where recipes are good enough | Instantiation, fitting inside each instance |
| Chart form, what to highlight, the takeaway | Chart maths, computed facts, native chart parts |
| Sequence and pacing | Silhouette and density analysis; notes, never decisions |

The engine never changes a decision of yours silently. Every adjustment is reported and refusable; design-changing fit moves come back as choices.

## Rules that are not yours to override

Package integrity, bounds (unless you declare bleed), legibility floors, contrast, alt text on media, and truthfulness. Pin one of these and you get a blocking finding instead of a silent fix.

## Modes

- **You direct** (default): you write the intent; no model runs inside Slide Agent.
- **Draft**: \`"auto"\` slides plus a preset theme let the engine pick recipes. Cheap, labelled \`draft\` in every verdict, and never presented as directed work.
- **Engine-managed**: \`slides_generate\` when the caller has no model of its own.
- **Template-fill**: \`slide-agent fill --template t.json --data rows.csv\` — direct once, fill many, no model.

## Reading further

- [references/v2/grammar.md](references/v2/grammar.md) — the composition language (~1.3k tokens)
- [references/v2/recipes.md](references/v2/recipes.md) — recipe slots and presets
- [references/v2/intent.schema.json](references/v2/intent.schema.json) — the full schema, for validators
- [references/v1-skill.md](references/v1-skill.md) — the 0.x canvas contract, for decks authored before 2.0
`;
