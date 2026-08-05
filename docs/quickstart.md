# Quickstart

Pick the path that matches how you work. All three produce the same thing: a
real, editable PowerPoint file.

---

## The easiest way — VS Code

**Install the [Slide Agent extension](https://marketplace.visualstudio.com/items?itemName=ghassenbrg.slide-agent-vscode).**
A getting-started guide opens by itself.

1. Click **Slide Agent** in the status bar (bottom right) → **Set up Slide
   Agent**. About a minute, no admin rights.
2. Click it again → **Create a presentation**.
3. Describe the deck in plain language and pick which AI model designs it.

That is the whole thing. You need Node.js 22.12 or newer — the extension checks
and links you to the download if it is missing — and an AI model in VS Code,
usually GitHub Copilot.

---

## If you already use an AI assistant

Install once, then stop thinking about it:

```bash
npx --yes --package @slide-agent/core@latest -- slide-agent install
```

This registers Slide Agent with the assistants on your machine. Afterwards,
just ask for a presentation:

> Make me a 10-slide board deck on the zero-trust migration. Dense and
> technical, dark, no stock photography.

The assistant reads the design guidance, writes the deck, and Slide Agent
builds and checks it. Works with Claude Code, Codex, GitHub Copilot, and any
MCP app such as Cursor or Zed.

Start a new chat if one was already open — most assistants read their skills at
startup.

Confirm it worked:

```bash
slide-agent doctor --deep
```

`--deep` builds a real deck end to end. A green report without it only proves
that files exist.

---

## From the command line

Same install command as above, then hand any model the design guide and build
what it returns:

```bash
slide-agent contract --format prompt > guide.txt
slide-agent create --scene scene.ndjson --output deck.pptx
```

`guide.txt` tells the model to invent an art direction, plan the narrative, and
return newline-delimited JSON in the `slide-agent.scene/1` format. Save its
reply as `scene.ndjson`.

There is also a no-model path:

```bash
slide-agent create --prompt brief.md --output draft.pptx
```

It produces a **structural draft** — your topics, with visible `[placeholders]`
where evidence belongs, and no art direction. It is a starting point, and it
says so on stderr. Do not present it.

---

## Reading the result

Every command returns one JSON object:

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
        { "id": "evidence", "score": 71,
          "summary": "5 of 7 substantive slides show a chart, table, image, or diagram" }
      ]
    }
  }
}
```

`status` says whether the file is sound. `quality` says whether the deck is
worth showing — different questions. Any dimension below 70 carries `advice`
naming the single most useful thing to change.

---

## Changing one slide

Do not regenerate the deck:

```bash
slide-agent revise --input deck.pptx --slide 4 \
  --records slide4.ndjson --output deck-v2.pptx
```

Every other slide comes through byte-identical. Check it:

```bash
slide-agent diff --before deck.pptx --after deck-v2.pptx
```

In VS Code, ask your assistant to change slide 4 — it uses the same mechanism.

---

## Optional: image previews

```bash
slide-agent install --with-render-deps      # LibreOffice + Poppler
slide-agent render --input deck.pptx --output previews/
```

Look at the PNGs full size. Automated checks catch geometry and contrast; they
cannot tell you whether the deck reads well as a sequence.

---

## If something does not work

Run `slide-agent doctor`. It distinguishes what it *registered* from what it
can *verify*, so it will tell you honestly when an assistant may not have
picked up the skill. [Troubleshooting](troubleshooting.md) covers the common
cases.
