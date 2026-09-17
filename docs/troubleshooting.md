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
it. Check [agents.md](agents.md) for that target's support level. Gemini /
Google Antigravity requires the global plugin manifest at
`~/.gemini/config/plugins/slide-agent-plugin/plugin.json`; reinstall the
`gemini` target if the manifest is missing.

Restart the chat or host after installing; most hosts scan skills at startup.

## `intent-invalid` and I cannot tell what is wrong

Read the `where` pointer, not just the hint — every finding carries the JSON
pointer into your intent that it applies to. The verdict truncates hints to 140
characters; `run.json` in the deck directory has the full message.

The two that catch people out:

- **`/design`** is a union of `{language}`, `{brand}`, `{preset}`, and
  `{tokens}`. A complete `language` needs `color` (a palette plus the roles
  `background`, `surface`, `text`, `muted`, `accent`), `type` (`display`,
  `body`, `scale`), `space`, `grid`, and `shape`. The finding names the specific
  key that is missing.
- **`/slides/N`** needs `id`, `message`, and exactly one of `compose`, `recipe`
  (with `content`), `auto`, or `canvas`.

## The deck is `needs-attention` but I cannot see anything wrong

Two things hold a deck there, and only one of them is a defect. Check
`suggestedEdits`: a choice you have not answered keeps the state at
`needs-attention` by design, because the engine is waiting on a decision it
will not make for you. Answer it:

```json
{ "level": "intent", "op": "choose", "edit": "<the id>", "option": 0 }
```

## The engine shrank my type / changed my colour

That is an `adjustment`, and it is reported precisely so you can refuse it:

```json
{ "level": "element", "slide": "route", "element": "text5", "set": { "refuse": "type-step" } }
```

The engine will then find another way or report a residual. Contrast is the
exception — a refused contrast repair is reported as `contrast-pinned` and
stays refused, because the text is unreadable either way and the engine will
not pretend the deck is fine.

`slide-agent explain --deck out/ --element text5` says which fit step ran and
why.

## `font-unavailable`

The face is not on this machine, so it cannot be measured or embedded and the
audience will see a substitute. Either fetch it:

```bash
slide-agent font --add "Source Serif 4" --weights 400,700
```

(off unless the operator set `SLIDE_AGENT_FONT_DOWNLOADS=1`, and every file is
hash-recorded), or name a face you have — `slide-agent font --local` lists them.
Office faces are never embedded and do not need fetching; they measure from
metric-compatible substitutes.

## Embedded fonts do not show up in LibreOffice

They will not. PowerPoint reads the EOT parts Slide Agent writes; LibreOffice
needs libeot, which most builds lack. The fidelity render reports this rather
than letting you read the render as what the audience will see. Check in
PowerPoint.

## Every slide looks the same

Read `rhythm` in the verdict — it names the pairs and scores them. If the
`authoring` counts show `recipe` or `draft` above zero, that is why: recipes are
starting points and several slides took the same one. `{"level": "intent", "op":
"expand", "path": "/slides/3"}` turns a recipe slide into a composition you can
rework.

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

Remote image URLs are refused unless **the operator** turned them on:

```bash
export SLIDE_AGENT_ALLOW_REMOTE_IMAGES=1
```

A request cannot turn fetching on. `allowRemoteAssets: false` in a request
narrows an operator's permission to nothing for that run; `true` does not widen
it. That asymmetry is deliberate — an intent is model-authored and often derived
from material nobody vouched for, so the decision to reach the network belongs
to whoever is running the process, not to whatever wrote the deck.

Private, loopback, and link-local addresses stay blocked either way, DNS is
pinned to the address that passed that check so a name cannot resolve twice to
two different places, and `SLIDE_AGENT_ALLOWED_IMAGE_HOSTS` narrows further.

## `PATH_OUTSIDE_WORKSPACE`

Every path in a request is resolved against the workspace roots and refused if
it lands outside — through a symlink too, since the check is on the real
location. Over MCP the roots come from the client; on the CLI they default to
the working directory. `SLIDE_AGENT_ROOTS` sets them explicitly.

## `SCRIPT_REFUSED`

A request asked to run a build script. A script is imported into this process
with its privileges, so one arriving in a request is arbitrary code from a
model. Run it yourself:

```bash
slide-agent build script.ts
```

Or, where you started the server, `SLIDE_AGENT_ALLOW_SCRIPTS=1`. Better: author
the deck as an intent, which is declarative and cannot execute anything.

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
