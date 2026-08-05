# Quickstart

Install to a deck worth showing, in five minutes.

## 1. Install

```bash
npx --yes --package @slide-agent/core@latest -- slide-agent install
```

Then confirm the installation actually works — not just that files were
written:

```bash
slide-agent doctor --deep
```

`--deep` builds a real deck end to end. A green report without it only proves
that files exist.

## 2. Let a model design the deck

This is the path that produces good output. Hand any model the authoring
guide, let it design, then build what it returns:

```bash
slide-agent contract --format prompt > guide.txt
```

The guide tells the model to invent an art direction, plan the narrative,
compose from first principles, and return newline-delimited JSON in the
`slide-agent.scene/1` format. Save its reply as `scene.ndjson`, then:

```bash
slide-agent create --scene scene.ndjson --output deck.pptx
```

If your agent has the skill or the MCP server installed, it does all of this
for you — just ask it for a presentation.

## 3. Read the report

```json
{
  "status": "success",
  "primaryOutput": "/…/deck.pptx",
  "validation": {
    "status": "pass",
    "quality": {
      "overall": 84,
      "band": "strong",
      "dimensions": [
        { "id": "evidence", "score": 71, "summary": "5 of 7 substantive slides show a chart, table, image, or diagram" }
      ]
    }
  }
}
```

`status` tells you whether the file is sound. `quality` tells you whether the
deck is worth showing — they are different questions. Any dimension scoring
below 70 carries `advice` naming the single most useful thing to change.

## 4. Revise one slide

Changing one slide does not mean regenerating the deck:

```bash
slide-agent revise --input deck.pptx --slide 4 \
  --records slide4.ndjson --output deck-v2.pptx
```

Every other slide comes through byte-identical. Confirm it:

```bash
slide-agent diff --before deck.pptx --after deck-v2.pptx
```

## 5. Optional: previews

```bash
slide-agent install --with-render-deps      # LibreOffice + Poppler
slide-agent render --input deck.pptx --output previews/
```

Inspect the PNGs at full size. Automated geometry checks are necessary but not
sufficient — look at the deck as a sequence, not as isolated frames.

## Starting from a prompt instead

```bash
slide-agent create --prompt brief.md --output draft.pptx
```

This produces a **structural draft**: your own topics, bracketed placeholders
where evidence belongs, and no art direction. `metadata.provenance` reads
`template-draft`. Use it to start; do not present it.
