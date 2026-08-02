# Slide Agent for VS Code

Create and edit distinctive native PowerPoint presentations with the language model you choose inside VS Code.

Run **Slide Agent: Install or Update** once; it installs the shared engine without cloning a repository. Then use **Create Presentation** or **Create from Current Brief**. The extension asks which available VS Code language model should direct the deck. That model owns the visual thesis, palette, typography, diagrams, charts, pacing, and every editable object's geometry through the open `slide-agent.scene/1` format. Slide Agent builds and validates the result without forcing it into a theme catalog.

**Edit Existing Presentation** asks the selected model to translate natural language into source-preserving edit operations. **Check Installation** diagnoses the core CLI and agent links, and reports optional preview-tool availability separately.

Creation, editing, and structural validation require only Node.js. Optional PDF/PNG preview generation uses LibreOffice and Poppler and can be added later with `slide-agent install --with-render-deps`.
