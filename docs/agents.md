# Agent integrations

Slide Agent publishes one authoring contract. Every integration below is a
different way of delivering the same contract to a model.

Run `slide-agent doctor` to see which are live on your machine. It reports
`registered` (Slide Agent wrote the skill where it expects the host to look)
separately from `verified` (a host configuration actually references it),
because only the second is evidence.

## Support levels

| Target | Level | Mechanism |
|---|---|---|
| Codex / Agent Skills | **verified** | `~/.agents/skills/slide-agent` |
| Claude Code | **verified** | `~/.claude/skills/slide-agent` |
| MCP clients (Cursor, Zed, Windsurf, …) | **verified** | `slide-agent-mcp` over stdio |
| CLI / any tool-capable agent | **verified** | `slide-agent contract` + `slide-agent run` |
| GitHub Copilot CLI | best-effort | `~/.copilot/skills/slide-agent` |
| Gemini CLI | experimental | Registered under `~/.gemini/skills`, which is not a documented Gemini discovery path. Use the MCP server or the CLI instead. |
| VS Code extension | **verified** | Uses the VS Code Language Model API |

We label these honestly rather than claiming universal support. If a level
here is wrong in either direction, please open an issue.

## MCP

```json
{
  "mcpServers": {
    "slide-agent": { "command": "slide-agent-mcp" }
  }
}
```

The server publishes the contract as resources, so a client that has never
seen Slide Agent can learn it:

- `slide-agent://contract` — version and available schemas
- `slide-agent://contract/guide` — the full authoring guide
- `slide-agent://contract/guide/<section>` — one section
- `slide-agent://contract/schema/<name>` — JSON Schema

Prompts: `author_presentation_scene`, `revise_presentation_scene`.

Tools: `slide_agent_run`, `get_authoring_contract`, `plan_presentation`,
`create_presentation`, `revise_presentation`, `edit_presentation`,
`render_presentation`, `validate_presentation`, `slide_agent_doctor`.

Use `slide_agent_run` for anything you designed. `create_presentation` takes
only a prompt and returns a labelled draft.

## Any CLI-capable agent

No integration required:

```bash
slide-agent contract --format prompt    # the guide, as a system prompt
slide-agent contract --schema outline   # JSON Schema for structured output
slide-agent run --request request.json  # build it
```

This is the fallback that always works, including for self-hosted models.

## Self-hosted models

Fetch the schema, request structured output against it, and pipe the result to
`slide-agent run`. The contract is versioned independently of the engine —
`CONTRACT_VERSION` appears in every result's metadata — so you can pin what you
generate against.
