# Changelog

All notable public changes are recorded here, newest first. Versions follow
semantic versioning.

## Unreleased — 0.10.0

The release where a model can see what it built, and where measurement stops
being a guess.

### Added

- **Renders come back as images.** Every MCP tool that can render —
  `slide_agent_run`, `create_presentation`, `revise_presentation`,
  `edit_presentation`, `render_presentation`, `validate_presentation` — now
  returns the slide previews as image content beside its JSON. A host with no
  filesystem of its own could previously only receive a file path, so a model
  revised its own deck without ever seeing it. Capped at 20 previews and 12 MB,
  with the withheld count stated; `includeImages: false` opts out.
- **Schematic previews when LibreOffice is absent**, which on a fresh install
  is the normal case — so the one thing that lets a model check its work was
  missing exactly when it was needed. Slide Agent now draws the deck's own
  geometry: every element in its real position, size, and colour, with text
  wrapped where the same measurement says it wraps. It is a schematic and says
  so on every slide; `render.mode` reports which kind you got, and
  `fallback: "none"` restores the old hard failure.
- **`slide-agent template`** reads an organisation's `.potx` or `.pptx` and
  emits the brand kit its theme implies — colour scheme, typefaces, footer
  line. `--brand corporate.potx` skips the intermediate file. The colour scheme
  is read through the slide master's colour map rather than by role name, so a
  dark template does not come back as a white deck. Masters and layouts are
  deliberately not adopted.
- **`import-slide`** copies a slide out of another presentation with its
  images, charts, embedded workbooks, and speaker notes, remapped onto a layout
  in the destination deck. `docs/editing.md` previously said cross-deck import
  was not implemented.
- **`slide-agent draft`** turns a brief into a request skeleton a model can
  finish, which is the honest form of "build me a deck from this brief".
- **`slide-agent fonts`** reports which of a deck's typefaces this machine can
  display. Advisory only, and `doctor` now carries the same check for the
  default faces.
- **Chart kinds**: `scatter`, `doughnut`, `bar-stacked`, `bar-horizontal`, and
  `radar`. All were reachable through `native-chart`, but anything routed that
  way skips validation, palette derivation, and quality scoring.
- **A first-class `link`** on text, shape, and image elements, with a tooltip
  that screen readers announce.
- **Reproducible builds.** `SOURCE_DATE_EPOCH` pins the build timestamp, and
  the same scene then produces byte-identical packages.

### Fixed

- **Text was measured by a single constant** — `fontSize * 0.33` for every
  glyph in every font. It over-measured `Iil.`, under-measured `MWm@`, could
  not tell Arial Black from Arial Narrow, and counted a space-free CJK
  paragraph as one unbreakable word, so Japanese body copy never reported an
  overflow at any box size. Line height was assumed to be 1.0 and then given 8%
  slack on top, which hid real clipping. Measurement is now per character, per
  family, and per script.
- **Layouts sized their own boxes with hand-picked multipliers** between 1.15
  and 1.35 while counting lines in the wrong face, so a layout could build a
  box too short for the text it was built to hold — and the validator,
  measuring properly, would then report the layout's own box as overflowing.
  Both sides now ask the same module.
- **Every deck shipped the stock Office colour scheme in its theme** while its
  slides carried the model's palette, because PptxGenJS exposes only the two
  typefaces. The deck looked right and its theme lied about it: visible the
  moment anyone picked a theme colour in PowerPoint, and enough to make a Slide
  Agent deck useless as a template of itself.
- **Editing a deck and validating the result reported `overlapping-elements`
  as an error**, because `intentionalOverlap` lives in the build manifest and a
  package has no channel to record it. A manifest recovered from OOXML alone
  now reports overlap as a warning; failing a deck for an intent it had no way
  to declare is the validator's blind spot, not the deck's fault.
- **A scatter chart produced a package PowerPoint repaired on open.** The
  current PptxGenJS writes the x value axis with `c:auto` and `c:lblAlgn`,
  which `CT_ValAx` does not allow. The sanitizer strips category-axis children
  from a value axis.
- **`SLIDE_AGENT_SOFFICE` and `SLIDE_AGENT_PDFTOPPM` were hints, not pins.** A
  path that did not resolve was silently ignored and `PATH` searched anyway, so
  a typo ran a different binary than the one you named.
- **A prompt-only deck reported `status: "success"`.** An agent reads the JSON
  and never sees stderr, so the one channel that mattered said the scaffolding
  was finished work. It now reports `warning` and carries the reason.

### Security

- **Hyperlinks are held to a scheme allowlist.** SECURITY.md promised that
  every URL in a request is treated as untrusted; images honoured that and
  links did not, so a canvas derived from a scraped page could ship a `file://`
  or `smb://` link straight through the `options` passthrough to PptxGenJS.
  `http`, `https`, `mailto`, and in-deck slide links are accepted; anything
  else is refused and reported as a build warning rather than dropped in
  silence. The same check applies to links inside an imported slide.
- A link with no text and no alt text is reported as an accessibility defect:
  a screen reader announces it as "link, blank".

## 0.9.0 — 2026-08-05

The release where the headline command works, the authoring contract is
published, and every claim in the documentation is backed by a test.

Still `0.x` deliberately: the contract and the extension points are new enough
that they have not been used in anger by anyone outside this repository, and
`1.0.0` should mean the public interfaces have survived contact with real
integrations. Expect `0.9.x` to fix what that contact turns up.

See [MIGRATION-0.9.md](MIGRATION-0.9.md) for the breaking changes.

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
  *(Removed in 0.9.0 — see the migration guide.)*
- Automatically install the matching core engine on first VS Code activation.
- Make executable discovery, install/uninstall PATH handling, and their tests
  portable across Windows, macOS, and Linux.
- Split the release workflow into verification and publication jobs.

## 0.0.1 — 2026-08-02

- Initial release.
