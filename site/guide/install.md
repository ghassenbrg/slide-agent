# Install

You need **Node.js 22.12 or newer**. Nothing else is required.

## In VS Code

1. Install **[Slide Agent](https://marketplace.visualstudio.com/items?itemName=ghassenbrg.slide-agent-vscode)**
   from the VS Code Marketplace. A getting-started guide opens by itself.
2. Click **Slide Agent** in the status bar → **Set up Slide Agent**. About a
   minute, no admin rights.
3. Click it again → **Create a presentation**, describe the deck, and pick the
   model that should design it.

Setting up the extension also teaches GitHub Copilot, Claude Code, Codex and
other assistants on your machine to build decks.

## For any AI assistant

One command installs a user-local CLI and MCP server, registers the skill with
the assistants it finds, and checks the installation:

```bash
npx --yes --package @slide-agent/core@latest -- slide-agent install
```

No clone, no `sudo`. Then start a new chat and ask:

> Make me a 10-slide deck on our Q3 results. Clean and modern.

It works with **Claude Code**, **Codex**, **GitHub Copilot CLI**, **Gemini**, and
any **MCP** app such as Cursor or Zed.

### Check it worked

```bash
slide-agent doctor
```

`doctor` lists each assistant integration and whether it is registered and
verified. `slide-agent doctor --deep` also builds a real deck end to end.

## Over MCP

Add the server to your MCP host:

```json
{
  "mcpServers": {
    "slide-agent": { "command": "slide-agent-mcp" }
  }
}
```

See [MCP](/reference/mcp) for the tools and resources it exposes.

## As a library

```bash
npm install @slide-agent/core
```

See the [library API](/reference/api).

## Optional: faithful previews and PDF export

LibreOffice and Poppler let Slide Agent render PDF and PNG previews and run its
render checks. Without them it draws schematic previews of the deck's geometry
instead.

```bash
slide-agent install --with-render-deps
```

## Uninstall

```bash
slide-agent uninstall
```

Next: the [quickstart](/reference/quickstart).
