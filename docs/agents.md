# Agent integrations

Slide Agent publishes one composition language. Every integration below is a
different way of delivering it to a model — the model still does the designing
in all of them.

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
| CLI / any tool-capable agent | **verified** | `slide-agent catalog` + `slide-agent build` |
| GitHub Copilot CLI | best-effort | `~/.copilot/skills/slide-agent` |
| Gemini / Google Antigravity | **verified** | Global plugin at `~/.gemini/config/plugins/slide-agent-plugin`, with the skill under `skills/slide-agent` |
| VS Code extension | **verified** | Uses the VS Code Language Model API |

We label these honestly rather than claiming universal support. If a level
here is wrong in either direction, please open an issue.

The `gemini` installer target creates the system-wide user plugin layout:

```text
~/.gemini/config/plugins/slide-agent-plugin/
├── plugin.json
└── skills/
    └── slide-agent/
        └── SKILL.md
```

## MCP

```json
{
  "mcpServers": {
    "slide-agent": { "command": "slide-agent-mcp" }
  }
}
```

Seven tools — `slides_catalog`, `slides_build`, `slides_edit`, `slides_view`,
`slides_finalize`, `slides_inspect`, `slides_generate` — with the composition
grammar, the catalog, the intent schema, every recipe, and worked examples as
resources. A client that has never heard of Slide Agent can learn the language
at runtime by reading `slide-agent://grammar`, which is about 1,300 tokens.

Each tool has a response-token budget, so a build verdict cannot flood a
context window: catalog ≤ 3,000, build ≤ 800, edit ≤ 500.

Adding `--compat-v1` (or `SLIDE_AGENT_COMPAT_V1=1`) registers the 0.x surface —
9 tools, 21 resources, 2 prompts — alongside the seven. That is available for
one minor release and goes away in 2.1.

**[Full MCP reference →](mcp.md)** — per-client configuration, the call
sequence that produces good decks, every tool's arguments, the resource URI
scheme, and error codes.

## Any CLI-capable agent

No integration required:

```bash
slide-agent catalog --grammar                              # the language, as a system prompt
slide-agent catalog --include schema                       # JSON Schema for structured output
slide-agent build --intent deck.intent.json --deck out/    # build it
slide-agent view --deck out/ --what sheet                  # look at it
```

This is the fallback that always works, including for self-hosted models.

## Self-hosted models

Fetch the schema, request structured output against it, and build what comes
back. Two things make this practical for a smaller model than you might expect:
the grammar is short, and every finding carries the JSON pointer it applies to —
so a failed build hands back an addressed list of what to change rather than
prose to interpret.

If the model cannot hold the whole grammar, start it on recipes
(`slide-agent catalog --include recipes`) and let it `expand` the ones it wants
to rework. Every verdict reports how much of the deck came from recipes, so the
tradeoff stays visible.

## The one mode that calls a model itself

`slides_generate` / `slide-agent generate` is the exception to everything above:
it runs a director and a critic inside Slide Agent, for callers who have no model
of their own. It needs `ANTHROPIC_API_KEY` and the optional `@anthropic-ai/sdk`
peer dependency. Nothing else in Slide Agent makes a network call to a model.
