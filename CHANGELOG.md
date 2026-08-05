# Changelog

All notable public changes are recorded here, newest first. Versions follow
semantic versioning.

## 1.0.0 — 2026-08-04

The first release where the headline command works, the authoring contract is
published, and every claim in the documentation is backed by a test.

See [MIGRATION-1.0.md](MIGRATION-1.0.md) for the breaking changes.

### Fixed

- **`slide-agent create --prompt` returned `status: "error"` on ordinary
  briefs.** The validator reported `text-overflow` and `poor-contrast` as
  `fixable: true`, but the repair loop had no fixer for either, so it rebuilt
  an identical deck for every retry and then failed. The loop now repairs what
  it reports, converges as soon as a pass changes nothing, and downgrades an
  unrepairable error to a warning carrying its remedy.
- **The built-in title band held exactly one line** at the legibility minimum,
  so any longer title reported an overflow nothing could repair and collided
  with the rule beneath it. It now sizes itself to the title.
- **`create --prompt <file>.json` silently discarded** `render`, `maxRetries`,
  and all four path overrides, because every field from the file was
  overwritten with an undefined CLI option.
- **An unregistered slide `kind` threw `Unknown layout`** and failed the whole
  build, despite the documentation telling models that `kind` is free-form.
- **Model-chosen fonts were reported as unsupported**, penalising exactly the
  behaviour the project asks for.
- **Preview rendering squashed every non-16:9 deck** into a landscape frame by
  forcing both scale axes.
- **`PptxInspector` never read `cNvPr/@descr`**, so alt text was invisible when
  validating an existing deck.

### Security

- **Remote image fetching is off by default.** Any `http(s)` URL in a
  model-authored canvas was previously fetched with no timeout, size cap,
  redirect limit, or address filtering, into a predictable world-readable
  cache. Enable it with `allowRemoteAssets` or
  `SLIDE_AGENT_ALLOW_REMOTE_IMAGES=1`; loopback, RFC1918, link-local, and
  IPv4-mapped addresses stay blocked either way and are re-checked on every
  redirect. Bodies are capped while streaming and identified by magic bytes
  rather than a `Content-Type` header. The cache is per-user, `0700`, and
  content-addressed.
- **No lifecycle scripts.** Installing the library previously wrote symlinks
  into four home directories, each pointing inside that project's
  `node_modules`. Registration now happens only via `slide-agent install`.
- `install.sh` no longer `sudo`-installs Node.js.
- CI runs on open pull requests. It previously ran only after merge, so nothing
  gated the default branch — and SECURITY.md claimed otherwise.

### Added

- **The authoring contract** (`src/contract`, `@slide-agent/core/contract`):
  Zod schemas and generated JSON Schema for everything a model authors, the
  authoring guide as structured data, and `CONTRACT_VERSION` versioned
  independently of the engine. `slide-agent contract` publishes it as JSON, a
  system prompt, or Markdown. SKILL.md and `references/` are generated from it.
- **MCP resources and prompts.** `slide_agent_run` previously advertised an
  opaque `{type: "object"}` and the server exposed no resources, so an MCP-only
  host could reach only the weakest path. It now publishes 21 resources, two
  prompts, and a described schema, plus `plan_presentation`,
  `get_authoring_contract`, and `revise_presentation`.
- **`slide-agent revise --slide N`** replaces one slide through the deck's own
  scene, leaving every other slide byte-identical.
- **`slide-agent diff`** compares two decks semantically.
- **Design tokens and a real grid.** Type scale, spacing, stroke weights,
  radii, density, and geometry are derived from `creativeDirection` — including
  `avoid`, which is honoured literally. All fifteen layouts and three diagram
  builders now ask the grid for regions.
- **Slide formats**: 16:9, 4:3, 9:16, A4 landscape and portrait, with layouts
  that stack rather than overflow on narrow stages.
- **Diagram grammars**: `layered`, `swimlane`, `sequence`, `hierarchy`, and
  `quadrant`.
- **Accessibility validation**: alt text, column-aware reading order, WCAG AA
  and AAA contrast, and text-free slides.
- **Quality scoring**: hierarchy, contrast, density, variety, evidence, and
  accessibility, each reporting what it measured and the most useful change.
- **Brand kits** (`--brand`) that lock only what an organisation cannot bend on.
- **Bilingual rendering** (`--bilingual`), promoting `secondaryLanguage` from
  stored-and-ignored metadata to real editable text, with RTL support.
- **Data connectors** (`slide-agent data`) for CSV, TSV, and JSON, carrying
  provenance.
- **Extension points**: `DiagramGrammar`, `ChartRenderer`, `QualityCheck`,
  `RenderBackend`, `AssetResolver`, and `DesignTokenizer`.
- **`doctor` reports what it can verify**, separating *registered* from
  *verified*, labelling each integration's real support level, checking the MCP
  server, and offering `--deep` to build a deck end to end.

### Changed

- **Prompt-only generation no longer invents content.** It produced identical
  named comparison points, KPI figures, and process steps for every deck, which
  read as researched material. It now emits the author's own topics with
  bracketed placeholders, and labels itself `template-draft` in
  `metadata.provenance`.
- Documentation restructured: a README under 100 lines plus `docs/`.
- Test suite grown from 57 to 230+, with coverage floors enforced in CI and the
  render path actually exercised.

## 0.1.0 — 2026-08-02

- Repair three ECMA-376 schema violations that could trigger PowerPoint repair
  prompts: paragraph properties re-emitted between continued runs, the missing
  mandatory `c:grouping` in line charts, and misordered chart-series elements.
- Validate every generated part against the bundled official ECMA-376 schemas
  using a WebAssembly libxml2, offline.
- Record the exported package's SHA-256 in the manifest so standalone
  validation can trust authoring metadata.
- Fix `slide-agent-mcp` exiting silently when launched through a bin symlink.
- Make `--report` optional for `validate`.
- Fix Windows argument quoting in the VS Code extension and the LibreOffice
  user-profile URL.
- Add a VS Code walkthrough; shrink the project icon.

## 0.0.3 — 2026-08-02

- Correct the managed CLI path resolution used by the VS Code extension.
- Add TypeScript declarations for the release verifier.

## 0.0.2 — 2026-08-02

- Register bundled skills automatically after an npm install, with a CI opt-out.
  *(Removed in 1.0.0 — see the migration guide.)*
- Automatically install the matching core engine on first VS Code activation.
- Make executable discovery, install/uninstall PATH handling, and their tests
  portable across Windows, macOS, and Linux.
- Split the release workflow into verification and publication jobs.

## 0.0.1 — 2026-08-02

- Initial release.
