## Verify the installation

**Slide Agent: Check Installation** runs `slide-agent doctor` and reports:

- Node.js version compatibility
- CLI and MCP server registration
- skill links for each supported agent
- optional preview tools (LibreOffice, Poppler)

Missing preview tools only produce warnings — PowerPoint creation, editing, and validation work with Node.js alone.

Generated decks are validated against the official ECMA-376 schemas before they are handed back, so they open in Microsoft PowerPoint without repair prompts.
