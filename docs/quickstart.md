# Quickstart

Pick the path that matches how you work. All of them produce the same thing: a
real, editable PowerPoint file with native placeholders, theme colours, and
charts that still carry their data.

You need Node.js 22.12 or newer. Nothing else is required.

```bash
npx --yes --package @slide-agent/core@latest -- slide-agent install
```

One command. No clone, no `sudo`. It installs a user-local CLI and MCP server
under `~/.local`, registers the skill with the assistants on your machine, and
runs `slide-agent doctor`.

---

## The easiest way — VS Code

**Install the [Slide Agent extension](https://marketplace.visualstudio.com/items?itemName=ghassenbrg.slide-agent-vscode).**
A getting-started guide opens by itself.

1. Click **Slide Agent** in the status bar (bottom right) → **Set up Slide
   Agent**. About a minute, no admin rights.
2. Click it again → **Create a presentation**.
3. Describe the deck in plain language and pick which AI model designs it.

---

## If you already use an AI assistant

After the install command above, just ask for a presentation:

> Make me a 10-slide board deck on the zero-trust migration. Dense and
> technical, dark, no stock photography.

The assistant reads the composition grammar, writes the design — palette,
typefaces, concept, and a composition per slide — and Slide Agent builds it,
fits the text, verifies contrast, and hands back a contact sheet to look at.
Works with Claude Code, Codex, GitHub Copilot, and any MCP app such as Cursor or
Zed — see the [MCP reference](mcp.md).

Start a new chat if one was already open — most assistants read their skills at
startup.

Confirm it worked:

```bash
slide-agent doctor --deep
```

`--deep` builds a real deck end to end. A green report without it only proves
that files exist.

---

## By hand, from the command line

Read the language once, write an intent, build it, look at it.

```bash
slide-agent catalog --grammar > grammar.md
```

`grammar.md` is the composition language: grids, rows and columns, layers,
roles, and tokens. It is about 1,300 tokens and it is the only page you have to
read. [`examples/v2/zero-trust-rollout.intent.json`](../examples/v2/zero-trust-rollout.intent.json)
is a complete directed deck to copy from.

An intent is a brief, a direction, a design language, and one composition per
slide. This is a complete one — it builds:

```json
{
  "schema": "slide-agent.intent/1",
  "brief": {
    "title": "Zero-trust rollout",
    "audience": "IT steering committee",
    "goal": "Approve the pilot-first rollout plan",
    "format": "16:9"
  },
  "direction": {
    "concept": "An engineering drawing: quiet paper, ink-dark type, one signal colour reserved for the gate where waves fail."
  },
  "design": { "language": {
    "color": {
      "palette": { "paper": "#F5F3EE", "panel": "#E9E5DC", "ink": "#1D2228", "graphite": "#5B6168", "signal": "#C2410C" },
      "roles": { "background": "paper", "surface": "panel", "text": "ink", "muted": "graphite", "accent": "signal" }
    },
    "type": {
      "display": { "family": "Source Serif 4", "weight": 600 },
      "body": { "family": "Inter" },
      "scale": { "base": 18, "ratio": 1.25 }
    },
    "space": { "unit": 8, "margin": 44, "gutter": 20 },
    "grid": { "columns": 12, "rows": 6 },
    "shape": { "radius": 2, "stroke": 0 }
  } },
  "slides": [
    {
      "id": "cover",
      "message": "We are asking to approve a pilot-first rollout",
      "compose": { "grid": "12x6", "items": [
        { "at": "c1-9 r3-5", "column": { "gap": "space.2", "justify": "end", "items": [
          { "text": "Board decision", "role": "label", "tone": "accent", "case": "upper" },
          { "text": "Zero trust, one wave at a time", "role": "title", "size": "+2" },
          { "text": "A six-gate rollout that fails small, at the pilot", "role": "lead", "tone": "muted" }
        ] } }
      ] }
    }
  ]
}
```

Nothing there is in inches and nothing is a colour literal outside the palette.
`role`, `tone`, and `space.2` are yours to define in the language; the engine
resolves them.

If you would rather start from a theme than author one, `"design": {"preset":
"technical"}` works in its place, and every verdict says the design came from a
preset. `slide-agent catalog --include presets` lists them.

Then:

```bash
slide-agent build --intent deck.intent.json --deck out/   # build and preview
slide-agent view  --deck out/ --what sheet                # look at the contact sheet
slide-agent edit  --deck out/ --ops edits.json            # answer choices, change the design
slide-agent finalize --deck out/ --export pdf             # render, verify, export
```

`slide-agent check --intent deck.intent.json` validates and solves without
writing anything — useful while you are still drafting.

Undecided about the direction? Try two:

```bash
slide-agent explore --deck out/ --designs two-directions.json --slides cover,evidence
```

It renders up to three design languages across the same slides, side by side.

---

## Without a model of your own

If you have no host model and want Slide Agent to run one, this is the only mode
that calls an API:

```bash
export ANTHROPIC_API_KEY=...
npm install @anthropic-ai/sdk
slide-agent generate --deck out/ --brief brief.md --sources notes.md,data.csv --profile balanced
```

A director writes the deck, a critic reviews the rendered preview, the director
revises. `--profile quality` spends more; `--profile draft` spends less but never
drops the judgement calls to a small model.

---

## At volume, with no model at all

Direct one template, then fill it from data:

```bash
slide-agent fill --template qbr.intent.json --data accounts.csv --out decks/
```

One deck per row, deterministic. The template uses `{{bindings}}`, `$each`, and
`$if`; every deck is the design you directed, with different numbers in it.

---

## Reading the result

Every command returns one JSON object on stdout:

```json
{
  "verdict": {
    "state": "ready-unrendered",
    "slides": 4,
    "authoring": { "composed": 3, "recipe": 1, "draft": 0, "canvas": 0, "design": "authored" },
    "designReview": "none",
    "issues": [
      { "code": "font-unavailable", "severity": "major", "count": 3,
        "where": ["/design/language/type/display/family"],
        "hint": "Run `slide-agent font --add <family>`, choose an available face, or allow downloads." }
    ],
    "adjustments": [
      { "kind": "type-step", "count": 2, "where": ["route/text5", "route/text25"] },
      { "kind": "contrast", "count": 1, "where": ["ask/text15"] }
    ],
    "suggestedEdits": [],
    "rhythm": [],
    "views": { "sheet": "/…/out/previews/sheet.png", "pptx": "/…/out/deck.pptx" },
    "cost": { "engineMs": 2395 }
  }
}
```

Five things to read, in this order:

- **`state`** is mechanical: `broken` (the package itself is unsound),
  `needs-attention` (a blocking finding, or a choice you have not answered),
  `ready-unrendered` (sound, but not yet rendered), `ready` (rendered and
  verified). It never means the design is good.
- **`authoring`** says how much of the deck you actually directed. `recipe` and
  `draft` counts above zero mean the engine supplied composition you did not.
- **`adjustments`** are changes the engine made to *your* decisions — a type
  step, a contrast repair. If you disagree, pin it in an edit and the engine will
  find another way or report a residual instead of quietly overruling you.
- **`suggestedEdits`** are decisions the engine refused to make for you: widen
  this region, split this slide, shorten this text to 84 characters. Each one has
  options; answer with an `EditOp` of `op: "choose"`.
- **`issues`** are defects, grouped by code with a count, the pointers they
  apply to, and a hint. A `blocking` one holds the deck at `needs-attention`.

`rhythm` reports slide pairs that are near-identical in composition — the deck
repeating itself. `cost` carries the engine time, and the model tokens and
dollars when a model ran.

`designReview` stays `none` until a model or a person actually looked at the
deck. Nothing in Slide Agent will set it for you.

Why does a slide look the way it does?

```bash
slide-agent explain --deck out/ --slide evidence --element headline
```

---

## Changing one slide

Do not rebuild the deck by hand — edit the intent and let only what changed be
rebuilt:

```bash
slide-agent edit --deck out/ --ops edits.json
```

`edits.json` is a list of EditOps: replace a composition, change a design token,
answer a choice, pin an adjustment you refuse. Pins survive rebuilds.

If you would rather say it in words (needs a model, as above):

```bash
slide-agent edit --deck out/ --instruction "the evidence slide feels crowded"
```

[Editing existing decks](editing.md) covers the operations and their limits.

---

## Previews and the final render

Previews are drawn in-process from the same measurements the fit engine used —
fast, and honest about being previews, not PowerPoint renders. For a real render
and PDF/PNG exports:

```bash
slide-agent install --with-render-deps      # LibreOffice + Poppler
slide-agent finalize --deck out/ --export pdf,png
```

`finalize` also rebuilds the deck from its own `intent.json` in a clean
directory and compares the bytes. If that round trip does not match, it says so.

Look at the PNGs full size. Automated checks catch geometry, contrast, and
overflow; they cannot tell you whether the deck reads well as a sequence.

---

## Coming from 0.x

Scenes, outlines, and build scripts still build unchanged, and `canvas` slides
are a first-class V2 slide kind. To convert:

```bash
slide-agent migrate --input scene.ndjson --output deck.intent.json
```

The report says what mapped to which recipe and what came through as a canvas.
[MIGRATION-2.0.md](../MIGRATION-2.0.md) covers the rest.

---

## If something does not work

Run `slide-agent doctor`. It distinguishes what it *registered* from what it
can *verify*, so it will tell you honestly when an assistant may not have
picked up the skill. [Troubleshooting](troubleshooting.md) covers the common
cases.
