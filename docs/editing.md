# Editing existing decks

Pick the weakest operation that does the job.

| You have | Use |
|---|---|
| A V2 deck directory (`intent.json` beside `deck.pptx`) | `slide-agent edit --deck out/` with EditOps — below |
| Any `.pptx`, no intent | `slide-agent edit --deck theirs.pptx` with package-level ops, or the 0.x `edit --input` |
| A 0.x deck Slide Agent created | `slide-agent revise` — [0.x](#0x-editing) |

---

# 1.x: EditOps

One operation model, four levels. An edit goes to the highest level that can
express it, because the higher the level, the more the engine can re-derive.

```bash
slide-agent edit --deck out/ --ops edits.json
```

`edits.json` is a JSON array. Only the slides an op touches are rebuilt;
everything else is carried from the previous scene.

## `intent` — the deck's own document

```json
{ "level": "intent", "op": "set", "path": "/slides/2/compose/items/0/text", "value": "Waves fail at the pilot" }
```

`op` is `set`, `insert`, `remove`, `move`, `choose`, or `expand`. `path` is a
JSON pointer into `intent.json` — the same pointers the findings report, so a
finding can be acted on without searching for what it refers to.

**`choose`** answers a `suggestedEdit` and takes no path:

```json
{ "level": "intent", "op": "choose", "edit": "fit-evidence-headline", "option": 1 }
```

**`expand`** turns a recipe slide into the composition it would have produced,
so you can rework it as your own:

```json
{ "level": "intent", "op": "expand", "path": "/slides/3" }
```

That is the intended route out of a recipe. A recipe is a starting point; the
moment you want it to be different, expand it and it is yours.

## `design` — the language, not the slide

```json
{ "level": "design", "op": "set", "path": "/color/palette/signal", "value": "#B45309" }
```

Recompiles the design language and rebuilds every slide that referenced what
changed. `op: "brand"` swaps in a brand pack; paths the brand locks are refused
with `brand-locked` rather than silently ignored.

## `element` — a pin on one element

This is where you overrule the engine:

```json
{ "level": "element", "slide": "route", "element": "text5", "set": { "refuse": "type-step" } }
```

`refuse` takes `contrast`, `type-step`, `snap`, `font-substitute`, or
`clamp-bounds`. The engine will then find another way, or report a residual —
it will not apply the adjustment anyway. Contrast is the exception: a refused
contrast repair is reported as `contrast-pinned` and stays refused, because the
text would be unreadable either way and the engine will not pretend otherwise.

Pins survive rebuilds. A pin that no longer matches anything is reported as
`pin-unmatched` rather than dropped quietly.

`set` also takes `frame`, `hidden`, `size`, and `color` for a one-off override.

## `package` — straight through to the OOXML

For a `.pptx` that has no intent beside it — one someone handed you, or one
another tool produced — pass the file itself as the deck:

```bash
slide-agent edit --deck theirs.pptx --ops edits.json
```

```json
{ "level": "package", "op": { "type": "replace-text", "slide": 4, "find": "Q2", "replace": "Q3" } }
```

`op` is a 0.x OOXML operation, applied through the same editor documented
[below](#edit--ooxml-operations-on-any-deck). The result is written beside the
input as `theirs.edited.pptx`; the input is never overwritten.

Two rules follow from there being no intent: a `.pptx` on its own accepts
**package-level ops only** — the other three levels need an intent to edit — and
conversely, a deck directory that has one will not take package ops, because the
next rebuild would not reproduce them. Use `slide-agent inspect --file
theirs.pptx` first to see what is in a package you did not build.

## In words

```bash
slide-agent edit --deck out/ --instruction "the evidence slide feels crowded"
```

Needs a model. The instruction is routed by what it asks for: a number, a word,
or an order goes to a small model; anything about how the deck *looks* goes to
the director tier with the rendered preview attached, because a design edit made
without seeing the deck is a guess. The verdict reports which route it took and
the ops it produced, so you can check the reasoning rather than trust it.

## Confirming what changed

The verdict's `changed` lists the slide ids that were rebuilt. For a deeper
comparison, `slide-agent diff` still works on the packages.

---

# 0.x editing

Three different operations, with different guarantees. Pick the weakest one
that does the job.

| Command | Works on | Preserves |
|---|---|---|
| `revise` | A deck Slide Agent created | Every other slide, byte-identical |
| `edit` | Any `.pptx` | Every OOXML part the operation does not touch |
| `create --scene` | A scene blueprint | Nothing — it rebuilds the deck |

## `revise` — one slide, everything else untouched

```bash
slide-agent revise --input deck.pptx --slide 4 --records slide4.ndjson --output v2.pptx
```

Splices replacement records into the deck's own scene and rebuilds. Because
the scene round-trips, every slide you did not touch comes out identical.

Needs `artifacts/<deck>/scene.ndjson` beside the deck — the older
`artifacts/intermediate_files/<deck>.inspect.ndjson` is still read — or
an explicit `--scene`. A deck Slide Agent did not create has no scene — use
`edit`.

The replacement must include the slide record and at least one element record.
Records addressing another slide number are forced onto the target, so a
mislabelled line cannot damage its neighbours.

## `edit` — OOXML operations on any deck

PptxGenJS cannot import an existing presentation, so `edit` works at the OPC
layer with targeted mutations and validates the result.

| Operation | Notes |
|---|---|
| `replace-text` | Operates within individual text runs |
| `remove-slide` | |
| `duplicate-slide` / `add-slide` | Clones a source slide to preserve its master and layout |
| `import-slide` | Copies a slide out of another `.pptx`, with its images, charts, and notes |
| `reorder-slides` | |
| `apply-theme` | Updates theme parts |
| `replace-image` | |
| `update-table` | Within the existing grid |
| `update-chart` | Updates cached series and the embedded worksheet |

### Limits worth knowing before you rely on them

- Text split across differently formatted runs may need several targeted
  replacements.
- Adding a slide clones an existing one; `import-slide` copies one out of
  another presentation. An imported slide brings its own shapes, images,
  charts, embedded workbooks, and speaker notes, and is remapped onto a layout
  in the destination deck so the result carries one theme rather than two. The
  substitution is reported when the layouts do not correspond.
- A duplicated slide can share chart parts with its source. Do not update one
  copy's chart data without checking the other in PowerPoint.
- Direct per-shape formatting overrides a newly applied theme.
- Table edits cannot add rows or columns beyond the existing grid.
- Chart updates require the series count to stay the same. Multi-sheet formulas
  and external links need manual verification.
- SmartArt, macros, animations, OLE objects, and 3D models are detected and
  preserved where package-level operations allow, but not edited. They are
  reported in `warnings`.

Always write to a new file. `edit` refuses to overwrite its input.

## Confirming what changed

```bash
slide-agent diff --before deck.pptx --after v2.pptx
```

Compares semantically — which slides, which elements, which fields. A binary
diff is useless here, because the ZIP changes on every rebuild.
