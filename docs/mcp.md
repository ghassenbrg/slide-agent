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
      "args": ["--yes", "-p", "@slide-agent/core@1.0.0", "slide-agent-mcp"]
    }
  }
}
```

If your client cannot resolve `slide-agent-mcp` from PATH, use the absolute
path — `slide-agent doctor` prints it, and also tells you whether any host
configuration currently references the server.

---

## The flow that produces good decks

Three calls, in this order. Skipping the first is the single most common reason
output looks generic.

**1. Read the contract.** Fetch `slide-agent://contract/guide` as a resource,
or call `get_authoring_contract` if your client cannot read resources. This is
the design guidance: invent an art direction, plan the narrative, compose from
first principles.

**2. Design the deck yourself.** Fetch
`slide-agent://contract/schema/outline` (or `.../sceneRecord` for the
line-oriented format) and author against it. Palette, typography, composition,
diagrams, and every element's coordinates are your decisions.

**3. Build it** with `slide_agent_run`.

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
        "geometry": "sharp",
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
              "role": "title", "text": "One boundary absorbs the complexity",
              "style": { "fontSize": 48, "color": "F5F2E9", "bold": true } }
          ]
        }
      ]
    }
  }
}
```

Then read `validation` in the result before telling the user it worked.

---

## Tools

| Tool | Required | Optional |
|---|---|---|
| `slide_agent_run` | `request` | — |
| `get_authoring_contract` | — | `section`, `schema` |
| `plan_presentation` | `prompt` | `slideCount` |
| `create_presentation` | `prompt`, `output` | `render`, `validate`, `autoFix`, `maxRetries` |
| `revise_presentation` | `input`, `output`, `slide`, `sceneNdjson` | `scene`, `validate`, `render` |
| `edit_presentation` | `input`, `output`, `operations` | `render`, `validate` |
| `render_presentation` | `input`, `output` | `width`, `height` |
| `validate_presentation` | `input` | `report`, `manifest`, `previewsDir`, `render` |
| `slide_agent_doctor` | — | — |

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

Twenty-one, in three groups.

| URI | Type | Contents |
|---|---|---|
| `slide-agent://contract` | JSON | Contract version, scene schema id, available schemas |
| `slide-agent://contract/guide` | Markdown | The complete authoring guide |
| `slide-agent://contract/guide/<section>` | Markdown | One section |
| `slide-agent://contract/schema/<name>` | JSON Schema | One schema |

Guide sections: `role`, `creative-direction`, `narrative`, `composition`,
`canvas`, `scene`, `diagrams`, `data`, `accessibility`, `honesty`, `workflow`.

Schemas: `outline`, `brief`, `slide`, `canvasElement`, `creativeDirection`,
`chart`, `table`, `sceneRecord`.

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
  "validation": {
    "status": "pass",
    "issues": [],
    "quality": { "overall": 84, "band": "strong", "dimensions": [/* … */] }
  },
  "errors": [],
  "metadata": { "contractVersion": "1.0", "provenance": "model-authored", "…": "…" }
}
```

`isError` is set on the tool result when `status` is `error`.

Two things worth checking before reporting success:

- **`validation.status`** — `fail` means unresolved defects. Issues carry
  `unfixedReason` when the repair loop could not fix them.
- **`validation.quality.band`** — `weak` means the deck is not worth showing
  even if the file is valid. Each dimension below 70 carries `advice` naming
  the most useful change.

---

## Common errors

| Code | Meaning |
|---|---|
| `CONTRACT_VALIDATION_FAILED` | Your outline does not match the schema. The message names the exact field path. |
| `REMOTE_ASSETS_DISABLED` | An image URL was used without `allowRemoteAssets`. |
| `REMOTE_ASSET_BLOCKED` | The URL resolves to a private or link-local address. |
| `SCENE_NOT_FOUND` | `revise_presentation` could not find the deck's blueprint. Pass `scene` explicitly. |
| `RENDER_DEPENDENCY_MISSING` | Previews need LibreOffice and Poppler; everything else works without them. |
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
