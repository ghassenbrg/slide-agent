# Migrating to contract 0.10

Contract `0.10` ships with Slide Agent 0.11.0. Every change is additive: a host
that authored against `0.9` keeps working without edits, and this engine still
accepts `0.9` scenes and requests during the transition.

You only need to read this if you want the new capabilities, or if you read
`report.status` and `report.quality` in code.

---

## Nothing breaks

- `SCENE_SCHEMA_ID` stays `slide-agent.scene/1`. Existing scene files build
  identically.
- Every `0.9` field is still accepted, including `creativeDirection.geometry`
  and `creativeDirection.density`.
- `report.status` and `report.quality` are still emitted and still mean what
  they meant.
- `supportsContractVersion` accepts both `0.9` and `0.10`.

---

## What is new, and why you might want it

### Your own design language, not ours

`creativeDirection.visualSystem` holds the deck's own variables, named styles,
motifs, and constraints. The names are yours — `excavation-note`, `signal-fog`,
`runway-crop` — and Slide Agent reserves none of them.

```jsonc
"visualSystem": {
  "variables": { "map-ink": "1B2A41", "field-note-size": 13 },
  "styles": {
    "field-note": { "style": { "fontSize": { "$var": "field-note-size" }, "color": { "$var": "map-ink" } } },
    "field-note-loud": { "basedOn": ["field-note"], "style": { "bold": true, "fontSize": 20 } }
  }
}
```

Elements reference them with `styleRef`, and their own `style` is always the
final override. A reference that does not resolve is an error naming the styles
that do exist; a variable that lands on a property it cannot satisfy is an error
naming the type mismatch. Neither is silently ignored, and neither is coerced.

### The engine no longer picks a shape language for you

Omitting `creativeDirection.geometry` used to fall through to `sharp`, which
gave every unspecified deck a corner treatment nobody asked for. It now
resolves to `authored`, which contributes nothing.

`geometry` and `density` are deprecated as closed enums. They still work and
still feed the fallback layouts. Prefer the open prose fields:
`geometryLanguage`, `spatialRhythm`, `materialLanguage`. The engine reads them
for a signal and never reduces them to an enum.

### The canvas got wider

New element types: `group` (children positioned relative to the group origin,
expanded into individually editable native elements) and `symbol-instance`
(one placement of a symbol the deck declared itself, with per-instance scale,
text, colour, and style overrides).

New text properties, out of `options` and into the schema: `lineSpacing`,
`lineSpacingMultiple`, `charSpacing`, `indent`, `columns`, `bullet`, `noBreak`,
`underline`.

New picture properties: `treatment.crop`, `treatment.focalPoint`,
`treatment.maskShape`, `treatment.duotone`, `treatment.grayscale`,
`treatment.tint`, and `vector` for SVG artwork with honest `editable` metadata.

New on every element: `layer`, and `allowBleed` for anything meant to run past
the slide edge. Without `allowBleed`, an element outside the slide is still
reported as a defect — which is what you want for the ones that were a mistake.

Read `capabilities().canvas` for the complete, derived-from-the-schema list.

### Planning metadata that survives round-trip

`exploration`, `sequencePlan`, `claims`, `sourceLedger`, and `hostCapabilities`
are optional deck-level records. They are never rendered. They exist so a later
critique has a declared intention to compare the render against, and so a claim
nobody verified cannot quietly ship.

---

## What changed in the report

### Two verdicts instead of one

```jsonc
{
  "status": "warning",              // still here, still package-oriented
  "packageStatus": "pass",          // does the file hold together?
  "presentationReadiness": "review",// would you put it in front of the audience?
  "readinessReasons": ["…"]         // what decided it, in order
}
```

`status` is documented as package-oriented and stays for `0.9` readers. Plan to
move to the two new fields; `status` goes away only in a future breaking
contract.

Readiness is not a weighted average. One critical dimension — text that did not
survive the render, a missing packaged asset, a failed round-trip, an unresolved
blocking review finding — blocks readiness however good everything else is.

### `quality` is now `heuristics`

Both keys are emitted with the same object. The rename is the point: these are
proxies for design qualities, not measurements of them, and calling them a
quality score implied the engine had judged your design.

What changed underneath:

- **density** counts the union of element areas, not the sum. A full-bleed
  photograph with a caption over it no longer reports as 130% covered.
- **variety** measures geometry — occupancy, dominant mass, whitespace topology,
  reading path, slide-to-slide rhythm — instead of counting element types.
- **evidence** requires a declared relationship: a chart or table, an image with
  alt text, a diagram of at least three related nodes, or an element your claim
  ledger points at. Two diagram nodes are no longer evidence.
- **bands have per-dimension floors.** Clean typography can no longer disguise
  unreadable contrast.

### New report sections

- `fidelity` — the words read back off the render, compared with the deck's own
  text. From the PDF's text layer where Poppler is installed (exact), from OCR
  where only Tesseract is (probabilistic, and reported as such).
- `artifacts` — every file the report describes, bound by SHA-256, with what it
  was derived from. A stale preview cannot pass as evidence.
- `roundTrip` — the result of rebuilding the emitted scene in a clean directory
  from the packaged assets alone. Off by default; pass `roundTrip: true` or
  `--round-trip` before you deliver.
- `suggestedRepairs` / `appliedRepairs` — see below.

---

## Repairs no longer happen behind your back

The default repair mode for a model-authored canvas is now **`suggest`**: the
engine reports exactly what it would change, from what, to what, and why — and
changes nothing.

```jsonc
"suggestedRepairs": [
  {
    "issueCode": "poor-contrast",
    "slide": 3,
    "elementIds": ["field-note"],
    "property": "style.color",
    "before": "8B877E",
    "after": "A9A49B",
    "rationale": "Raised the contrast of field-note on slide 3.",
    "changesAuthorIntent": true
  }
]
```

Pass `repair: "safe"` (or `--repair safe`) to have them applied. Every applied
repair records its rollback value, and if the render's text gets worse the whole
run is rolled back and rebuilt as authored.

`autoFix: false` still means "change nothing" and is equivalent to
`repair: "off"`. Prompt-only drafts still default to `safe` — nobody designed
them, so there is nothing to preserve.

---

## The package layout moved

```text
deck.pptx
artifacts/<deck name>/
  scene.ndjson
  manifest.json
  validation.json
  review.json
  metadata.json
  deck.pdf
  previews/slide-01.png
  assets/<sha256>.<ext>
```

Every asset the deck embeds is copied into `assets/` under its own content hash,
and the emitted scene references it **relative to the scene's own directory**.
Move the folder to another machine and it still rebuilds — which was not true
before, and which is what `--round-trip` now proves.

The older `artifacts/intermediate_files/` and `artifacts/logs/` paths are still
read when discovering an existing package, so a deck built by 0.10 still
validates, revises, and patches under 0.11.

Use `outputLayout()` rather than hard-coding paths.

> The roadmap sketched these files directly under `artifacts/`. They sit under
> `artifacts/<deck name>/` because two decks built into one directory would
> otherwise share a `manifest.json`, and the second build would silently
> overwrite the first deck's blueprint.

---

## New commands

```bash
slide-agent review --input deck.pptx --slide 4
slide-agent patch  --input deck.pptx --operations fix.json --dry-run
slide-agent patch  --input deck.pptx --operations fix.json --output revised.pptx --render
slide-agent create --scene deck.ndjson --output deck.pptx --render --round-trip
slide-agent capabilities --canvas
```

And the matching MCP tools: `review_presentation`, `patch_presentation`, plus
`slide-agent://capabilities/canvas` as a resource.

`patch` addresses elements by id on an explicit slide. There is no fuzzy
matching and no "make it nicer" operation — taste is the host's, and a
deterministic engine guessing at it would just be a house style.

---

## If you only change one thing

Ask for `--round-trip` on the build you are going to deliver, and read
`presentationReadiness` instead of `status`. Those two together are the
difference between "the file opens" and "this is finished".
