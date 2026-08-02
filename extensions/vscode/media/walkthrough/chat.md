## Use Slide Agent from AI chats

Installation registers the `slide-agent` skill for every supported agent, so your AI chats can create and edit PowerPoints directly:

- **GitHub Copilot** — mention `$slide-agent` in chat, or just ask for a PowerPoint
- **Claude Code** — the skill activates whenever a `.pptx` deliverable is requested
- **Codex** and **Gemini CLI** — the same skill is linked into each agent's personal skill directory

The agent reads the skill's creative-direction guidance, authors a complete scene, and calls the `slide-agent` CLI or MCP server to build, validate, and repair the deck.

If a chat that was already open does not show the skill, start a new chat or reload the window.
