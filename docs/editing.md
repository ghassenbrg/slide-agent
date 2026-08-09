# Editing existing decks

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

Needs `artifacts/intermediate_files/<deck>.inspect.ndjson` beside the deck, or
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
