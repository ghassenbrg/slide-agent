# MCP server

Slide Agent ships an MCP server, `slide-agent-mcp`, that speaks stdio. It is
the integration path for Cursor, Zed, Windsurf, Claude Desktop, and any other
MCP client — and unlike a skill, it does not depend on the host implementing a
particular skills directory.

The server publishes the whole authoring contract as resources, so a client
that has never heard of Slide Agent can learn how to use it at runtime.

---

## Connect it

`slide-agent install` puts the launcher on your PATH at
`~/.local/bin/slide-agent-mcp`. Then add it to your client.

**Cursor** — `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "slide-agent": { "command": "slide-agent-mcp" }
  }
}
```

**Claude Desktop** — `claude_desktop_config.json`

```json
{
  "mcpServers": {
    "slide-agent": { "command": "slide-agent-mcp" }
  }
}
```

**Claude Code**

```bash
claude mcp add slide-agent -- slide-agent-mcp
```

**Zed** — `settings.json`

```json
{
  "context_servers": {
    "slide-agent": { "command": { "path": "slide-agent-mcp", "args": [] } }
  }
}
```

**Without installing anything first** — any client, at the cost of a download
on each launch:

```json
{
  "mcpServers": {
    "slide-agent": {
      "command": "npx",
      "args": ["--yes", "-p", "@slide-agent/core@0.9.0", "slide-agent-mcp"]
    }
  }
}
```

If your client cannot resolve `slide-agent-mcp` from PATH, use the absolute
path — `slide-agent doctor` prints it, and also tells you whether any host
configuration currently references the server.

---

## The flow that produces good decks

It is not prompt → deck. It is build → see → critique → patch, and skipping the
seeing is the single most common reason output looks generic.

**1. Read what is possible.** Call `get_capabilities`. Its default answer is a
summary — what renders here, and whether this installation can source a picture
at all. Ask for `include: ["canvas"]` before you design: that block is the
expressive surface, derived from the schemas the engine enforces. Then read the
guide sections the deck actually needs with `get_authoring_contract`; the whole
guide is about 8,900 tokens and the router in `SKILL.md` says which sections
matter when.

**2. Plan before you place coordinates.** Write two visual theses that differ
structurally, choose one, and record a `sequencePlan` — one entry per slide with
its narrative job and intended silhouette. If you researched, write the `claims`
and `sourceLedger` too.

**3. Design the deck yourself.** Palette, typography, composition, diagrams, and
every element's coordinates are your decisions. For anything substantial, write
a build script — the same deck as a program runs about a third the length of its
NDJSON, and output tokens cost several times what input tokens cost. The full
JSON Schemas at `slide-agent://contract/schema/<name>` are there for validators;
the `canvas` capability block is the cheaper way to learn what you may author.

**4. Build it** with `slide_agent_run`, with `render` on.

**5. Look at it** with `review_presentation`. Start with `images: "overview"`:
one contact sheet, every slide in order and numbered, which is what makes the
deck-level questions answerable — whether the sequence has a shape, whether two
slides came out as the same drawing. It costs about one image instead of one per
slide. Then open the slides that looked wrong with `images: [n], imageDetail: "full"`.
The packet also carries the words read back off the render compared against the
deck's own text, the geometry, your declared intent, and questions worth asking.

**6. Fix exactly what is wrong** with `patch_presentation`, addressing elements
by id. Regenerating the deck to fix a caption discards every decision you are
not currently thinking about.

**7. Check readiness**, not just status, and run `roundTrip` before you deliver.

```jsonc
{
  "request": {
    "command": "create",
    "output": "/absolute/path/deck.pptx",
    "outline": {
      "brief": { "title": "…", "audience": "…", "objective": "…", "…": "…" },
      "narrative": "By the end, the board should approve the migration.",
      "creativeDirection": {
        "name": "Signal through fog",
        "palette": { "background": "0B1020", "ink": "F5F2E9", "accent": "66E3FF" },
        "typography": { "heading": "Georgia", "body": "Aptos" },
        "geometryLanguage": "Hairline routes between few, deliberately placed nodes",
        "visualSystem": {
          "variables": { "signal": "66E3FF" },
          "styles": { "fog-title": { "style": { "fontSize": 48, "color": "F5F2E9", "bold": true } } }
        },
        "avoid": ["rounded corners", "stock photography"]
      },
      "slides": [
        {
          "id": "opening",
          "kind": "statement",
          "title": "One boundary absorbs the complexity",
          "background": "0B1020",
          "canvas": [
            { "id": "title", "type": "text", "x": 0.8, "y": 1.2, "w": 9, "h": 1.6,
              "role": "title", "styleRef": "fog-title",
              "text": "One boundary absorbs the complexity" }
          ]
        }
      ]
    }
  }
}
```

Then read `validation.presentationReadiness` in the result before telling the
user it worked. `packageStatus` says the file holds together; readiness says
whether the deck is finished, and `readinessReasons` says why.

---

## Tools

| Tool | Required | Optional |
|---|---|---|
| Tool | Required | Optional | Default `images` |
|---|---|---|---|
| `slide_agent_run` | `request` | `images`, `imageDetail` | `all` |
| `get_capabilities` | — | `include` | — |
| `get_authoring_contract` | — | `section`, `schema` | — |
| `plan_presentation` | `prompt` | `slideCount` | — |
| `create_presentation` | `prompt`, `output` | `render`, `validate`, `autoFix`, `maxRetries`, `images`, `imageDetail` | `all` |
| `revise_presentation` | `input`, `output`, `slide`, `sceneNdjson` | `scene`, `validate`, `render`, `images`, `imageDetail` | `changed` |
| `edit_presentation` | `input`, `output`, `operations` | `render`, `validate`, `images`, `imageDetail` | `changed` |
| `render_presentation` | `input`, `output` | `width`, `height`, `images`, `imageDetail` | `all` |
| `validate_presentation` | `input` | `report`, `manifest`, `previewsDir`, `render`, `images`, `imageDetail` | `none` |
| `review_presentation` | `input` | `scene`, `manifest`, `slide`, `from`, `to`, `maxSlides`, `detail`, `images`, `imageDetail` | `all` |
| `patch_presentation` | `input`, `output`, `operations` | `scene`, `dryRun`, `render`, `roundTrip`, `validate`, `images`, `imageDetail` | `changed` |
| `slide_agent_doctor` | — | — | — |

### Knowing what is possible before you design

`get_capabilities` and `slide-agent://capabilities` report what this
installation can do. The tool answers with a summary by default and returns any
facet in full on request — `canvas`, `images`, `fonts`, `rendering`, `diagrams`,
`charts`, `layouts`, `checks`, or `all`. The `images` block is never summarised
away, because it is the one to read before planning a photo-led deck:

```json
{ "localPaths": true, "remoteUrls": false, "provider": null,
  "formats": [".png", ".jpg", ".gif", ".webp"] }
```

`remoteUrls: false` and `provider: null` means this installation cannot obtain
a picture at all — only embed one already on disk. Design accordingly rather
than discovering it after composing eight slides around photography.

`provider` names a host-installed image resolver: stock search, an internal
asset library, an image generator. Slide Agent ships none of these on purpose
— see [api.md](api.md#extension-points).

### Seeing what you built

Every tool that can render returns slide previews as image content alongside its
JSON result, so a host with no filesystem access of its own can still look at
the deck. A model that cannot see its output can only revise from its own
assumptions.

What comes back is a choice, and the default is the cheapest correct one:

- **`images`** takes `"all"`, `"changed"`, `"none"`, `"overview"`, or a list of
  slide numbers. `"changed"` returns only the slides the command altered —
  `patch` knows this from its own diff, `revise` from its target. When a command
  cannot tell, it returns everything and says so rather than returning nothing.
  `"overview"` composes every slide into one numbered contact sheet.
- **`imageDetail`** is `"review"` (default, 1024px) or `"full"` (1568px). The review
  tier costs roughly half and is sized to judge composition; text fidelity is
  read from the PDF's text layer, exactly, and never off the image, so the
  smaller preview costs you nothing there.
- **`includeImages`** still works with its old meaning: `true` is `"all"`,
  `false` is `"none"`.

Up to 20 previews and 12 MB are returned; the text block says how many were
withheld, what the call cost, and what the richer option would cost. Where
LibreOffice is not installed the previews are schematic SVGs of the deck's
geometry rather than rendered slides, and the result says so.

### What a call costs

Every result carries a `tokenBudget`:

```json
{ "text": 2840, "images": 787, "imageCount": 1, "total": 3627,
  "sessionTotal": 28104, "basis": "estimate" }
```

The figures are estimates and say so: characters ÷ 4 for text, and
`(width × height) ÷ 750` after the downscale to 1,568px for images. They exist
so an option that saves tokens can be weighed against the one that spends them,
which is not a judgement a model can make against an unpublished price list.

**`slide_agent_run`** is the one that matters. `request.command` is `create`,
`edit`, `render`, `validate`, or `revise`; the rest of the object follows the
schema for that command. This is the only tool that accepts a design you
authored.

**`create_presentation`** takes a prompt and nothing else. It returns a
*structural draft*: your topics, bracketed placeholders where evidence belongs,
and no art direction. `metadata.provenance` reads `template-draft`. Use it to
start a conversation, never to finish one.

**`plan_presentation`** returns the same draft as an outline without building a
file — useful when you want to show the user a structure before committing.

**`revise_presentation`** replaces one slide from the deck's own scene
blueprint, leaving every other slide byte-identical. It needs the `artifacts/`
directory Slide Agent wrote beside the deck. This is almost always better than
regenerating.

**`slide_agent_doctor`** reports what is installed and what it could verify.
Worth calling once if anything behaves unexpectedly.

---

## Resources

In three groups: capabilities, the contract descriptor and guide, and one
resource per schema.

| URI | Type | Contents |
|---|---|---|
| `slide-agent://capabilities` | JSON | The canvas surface first, then grammars, chart kinds, layouts, checks, fonts, rendering, and how images can reach a slide here |
| `slide-agent://capabilities/canvas` | JSON | Every element type, property, and treatment the canvas supports, and what stays editable |
| `slide-agent://contract` | JSON | Contract version, scene schema id, available schemas |
| `slide-agent://contract/guide` | Markdown | The complete authoring guide |
| `slide-agent://contract/guide/<section>` | Markdown | One section |
| `slide-agent://contract/schema/<name>` | JSON Schema | One schema |

Guide sections: `role`, `creative-direction`, `visual-system`, `planning`,
`narrative`, `composition`, `build-script`, `canvas`, `scene`, `diagrams`,
`data`, `imagery`, `accessibility`, `honesty`, `review`, `workflow`.

Schemas: `outline`, `brief`, `slide`, `canvasElement`, `creativeDirection`,
`visualSystem`, `symbol`, `exploration`, `sequencePlanItem`, `claim`,
`hostCapabilities`, `chart`, `table`, `sceneRecord`.

Fetch `outline` when authoring nested slide specs, `sceneRecord` when authoring
the line-oriented NDJSON format, and `canvasElement` when you only need element
geometry and styling.

---

## Prompts

**`author_presentation_scene`** — argument: `brief`. Returns the full authoring
guide plus the brief, ready to send to a model. Its reply is NDJSON you pass
straight to `slide_agent_run` as `sceneNdjson`.

**`revise_presentation_scene`** — arguments: `scene`, `slide`, `instruction`.
Returns replacement records for one slide, preserving the deck's established
design system. Pass the reply to `revise_presentation`.

Use these when your client surfaces MCP prompts as slash commands — they give a
user a one-step path to a designed deck.

---

## Paths

Every path in a request is a path on the machine running the server. Use
absolute paths. There is no upload, no sandbox, and no remote storage: the
server writes the deck where you tell it and returns the location.

Remote images are refused unless you set `allowRemoteAssets: true` on the
request, and private and link-local addresses stay blocked even then. Supply
local files for images.

---

## Reading results

Every tool returns one JSON object as text content.

```jsonc
{
  "status": "success",           // or "warning" or "error"
  "primaryOutput": "/…/deck.pptx",
  "deliverables": ["/…/deck.pptx"],
  "artifacts": ["/…/artifacts/…"],
  "slideCount": 8,
  "warnings": [],
  "packageStatus": "pass",
  "presentationReadiness": "review",
  "validation": {
    "packageStatus": "pass",
    "presentationReadiness": "review",
    "readinessReasons": ["Heuristic floor: variety scored 22, below 25. …"],
    "issues": [],
    "heuristics": { "overall": 84, "band": "strong", "dimensions": [/* … */] },
    "fidelity": { "status": "pass", "method": "pdf-text", "confidence": "high", "slides": [/* … */] },
    "artifacts": { "pptx": { "sha256": "…" }, "previews": [/* … */] },
    "suggestedRepairs": [/* what the engine would change, and changed nothing */]
  },
  "errors": [],
  "metadata": { "contractVersion": "0.10", "provenance": "model-authored", "…": "…" }
}
```

`isError` is set on the tool result when `status` is `error`.

Three things worth checking before reporting success:

- **`packageStatus`** — `fail` means the file itself does not hold together:
  a broken relationship, a missing asset, a failed round-trip.
- **`presentationReadiness`** — `not-ready` means the audience would see a
  defect. `review` means something could not be verified. `readinessReasons`
  lists what decided it, in order.
- **`validation.suggestedRepairs`** — under the default `suggest` mode the
  engine reports what it would change and changes nothing. Read them and decide.

`validation.heuristics` are engine proxies, not a quality judgement. The report
keeps measured facts, heuristics, and reviewer findings apart on purpose.

---

## Common errors

| Code | Meaning |
|---|---|
| `CONTRACT_VALIDATION_FAILED` | Your outline does not match the schema. The message names the exact field path. |
| `REMOTE_ASSETS_DISABLED` | An image URL was used without `allowRemoteAssets`. |
| `REMOTE_ASSET_BLOCKED` | The URL resolves to a private or link-local address. |
| `SCENE_NOT_FOUND` | `revise_presentation` or `patch_presentation` could not find the deck's blueprint. Pass `scene` explicitly. |
| `PATCH_ELEMENT_NOT_FOUND` | A patch named an element the slide does not have. The message lists the ids that exist. |
| `VISUAL_SYSTEM_UNKNOWN_STYLE` | A `styleRef` names a style the deck did not declare. The message lists the declared names. |
| `VISUAL_SYSTEM_VARIABLE_TYPE` | A `{"$var":…}` landed on a property that cannot accept its type. |
| `RENDER_DEPENDENCY_MISSING` | A true render was demanded without LibreOffice and Poppler. By default the server falls back to schematic previews instead. |
| `INPUT_NOT_FOUND` | A path does not exist on the server's machine. |

---

## Verifying the connection

```bash
slide-agent doctor
```

The **MCP server** check reports whether the launcher exists *and* whether any
host configuration references it. A launcher that works but that nothing calls
is the most common misconfiguration, so it is reported separately rather than
shown as a pass.
