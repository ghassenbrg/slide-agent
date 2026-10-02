# What is Slide Agent?

Slide Agent turns a description — and any notes or data you give it — into a
native, editable PowerPoint deck.

> Make me a 10-slide board deck on the zero-trust migration. Dense and
> technical, dark, no stock photography.

## The model directs. The engine executes.

The work is split in two:

| Your model decides | The engine computes |
|---|---|
| The message, what is emphasised, what is cut | Measurement, capacity, exact character budgets |
| The concept, palette, typefaces and type scale | Contrast verification, font resolution and embedding |
| Composition, proportion, white space | Frames, reading order, connector routing, placeholders |
| Chart form, what to highlight, the takeaway | Chart maths and native chart parts with their data |
| Sequence and pacing | Rhythm analysis — notes, never decisions |

That division is what makes a deck good without making it generic: every
design decision stays with the model, and everything with a right answer is
computed.

## What you get

- **A real `.pptx`.** Title placeholders, theme colours and fonts, native
  charts with an embedded workbook, native tables, diagrams as shapes and
  connectors, icons as editable geometry, embedded typefaces. No slide is ever
  flattened into a picture.
- **A verdict.** Each build says whether the deck is mechanically sound, what
  the engine adjusted (and lets you refuse it), and which choices need an
  answer — for example a headline that needs to be shorter, with the exact
  character budget.
- **A preview.** A contact sheet to look at before you finalize.
- **A portable folder.** Your intent, the compiled design tokens, the scene,
  the deck, and the previews — move it anywhere and it rebuilds.

## Four ways to use it

1. **You direct** (default) — your assistant writes the design; no model runs
   inside Slide Agent.
2. **Draft** — preset themes and automatic recipes, labelled as a draft.
3. **Engine-managed** — `slide-agent generate` for when there is no assistant
   in the loop: a director writes, a critic reviews, the director revises.
4. **Template-fill** — direct a template once, then fill it from a CSV, one
   deck per row, with no model at all.

Next: [install it](./install).
