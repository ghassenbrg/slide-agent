# Troubleshooting

## `slide-agent: command not found`

Open a new terminal, or add `~/.local/bin` to `PATH`. The VS Code extension
calls the launcher by absolute path and does not need this.

## npm engine errors during install

Check `node --version`. Slide Agent needs 22.12 or newer. VS Code being
current does not update your system Node.js. Install with nvm, fnm, or volta —
Slide Agent will not install a system runtime for you.

## My agent does not see the skill

Run `slide-agent doctor`. It distinguishes *registered* from *verified*: if a
target shows `registered` but not `verified`, Slide Agent placed the skill
where it expects the host to look but found no host configuration referencing
it. Check [agents.md](agents.md) for that target's support level — Gemini CLI
in particular has no documented personal-skills directory, so use the MCP
server or the CLI there.

Restart the chat or host after installing; most hosts scan skills at startup.

## The deck is generic and full of `[placeholders]`

You used the prompt path. `metadata.provenance` will read `template-draft`.
That path deliberately produces scaffolding rather than inventing content:
there is no model inside Slide Agent to design a deck.

Use `slide-agent draft --prompt brief.md --output request.json` instead. It
emits the same scaffolding as a request a model can fill in, and
`slide-agent run --request request.json` builds what the model authored. See
[quickstart](quickstart.md).

## PowerPoint asks to repair the file

Run `slide-agent validate --input deck.pptx`. `schema-violation` entries name
the offending XML part and line. Decks from current versions validate cleanly
against the official ECMA-376 schemas; please file an issue with the report.

## The previews are SVGs, not rendered slides

LibreOffice and Poppler are not installed, so Slide Agent drew the deck's own
geometry instead of rendering it. A schematic shows position, size, colour, and
where text wraps — enough to catch a collision, an overflow, or an empty
slide — and nothing about typography, chart drawing, or anything else
PowerPoint does. The result says `render.mode: "schematic"` and carries a
warning; every slide is labelled.

For a true render:

```bash
slide-agent install --with-render-deps
```

Pass `fallback: "none"` to the renderer if you would rather fail than receive a
schematic.

## `RENDER_DEPENDENCY_MISSING`

You asked for a true render — `fallback: "none"` — without LibreOffice and
Poppler:

```bash
slide-agent install --with-render-deps
```

Creation, editing, and validation all work without them.

If you set `SLIDE_AGENT_SOFFICE` or `SLIDE_AGENT_PDFTOPPM`, check the path: an
explicit pin is used or nothing is, so a typo there reports the tool as
missing rather than quietly running a different binary.

## The typography looks wrong in the preview

Run `slide-agent fonts --input deck.pptx`. A face the deck asks for that this
machine does not have is substituted in the preview only; the deck itself is
unaffected, and whoever opens it sees what they have installed.

## `REMOTE_ASSETS_DISABLED`

Remote image URLs are refused by default, because a canvas is model-authored
and often derived from untrusted input. Opt in per request with
`allowRemoteAssets: true`, or set `SLIDE_AGENT_ALLOW_REMOTE_IMAGES=1`.
Private, loopback, and link-local addresses stay blocked either way; narrow
further with `SLIDE_AGENT_ALLOWED_IMAGE_HOSTS`.

## `SCENE_NOT_FOUND` when revising

`revise` needs the `artifacts/` directory written beside the deck, because
that is where the round-trippable scene lives. Pass `--scene` if it sits
elsewhere. A deck Slide Agent did not create has no scene; use `edit` instead.

## Overlap errors on a deck I generated earlier

Keep `artifacts/` next to the deck. The manifest records intentional overlap,
and validation trusts it only while its recorded SHA-256 still matches the
file.

## Layouts overflow at a non-16:9 size

They should not — the format matrix covers 16:9, 4:3, 9:16, and A4 in both
orientations. Please file an issue with your `dimensions.json`.
