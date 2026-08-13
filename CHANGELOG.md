# Changelog

All notable public changes are recorded here, newest first. Versions follow
semantic versioning.

## 0.15.0 — 2026-08-14

Repetition is not information. 0.13 cut what a deck costs a host model by
attacking the two things that were then largest — static surfaces and images —
and both are now genuinely cheap. What it never measured is the one payload that
grows with the deck and with every round of review: the issue list. It was
invisible because the budget fixture was a healthy deck, asserted to stay under
eight findings so a flood would not pollute the measurement. That is backwards
for a cost gate. On a real sixteen-slide deck the list was 357 entries and 66% of
the validation report, and a 40,675-token report sat under a 4,000-token ceiling
with CI green throughout.

Measured on the same deck built twice, once against 0.14 and once against this
release, with the two decks checked for equivalence first — identical slide
count, identical element count, and the same 1,803 words extracted from both
rendered PDFs: **a review round falls from 55,453 tokens to 16,462**, findings
from 357 occurrences to 162, and the cost of being told about one occurrence
from 75.6 tokens to 20.4. Every deck-quality score is unchanged, which is the
point. `docs/0.15.0-results.md` carries the method and the numbers, including
where the release fell short of its own projection.

Contract `0.11`, unchanged. Nothing a host authors is different.

### Added

- **Findings said once.** Reports carry `issueGroups`: one entry per code, with
  `count`, one example message in full, the details that never vary lifted to
  the group, and every occurrence listed with the numbers that distinguish it.
  Grouping is not summarising — every `(code, slide, element)` triple survives,
  which is asserted directly rather than assumed. `--issues flat` writes the old
  array for tools that parse it, and `ungroupIssues` recovers the flat form from
  a grouped report so anything reading a report from disk keeps working.
- **`slide.flow(frame, blocks)`.** The layout primitive the toolkit did not
  have. `columns`, `rows`, `grid`, `split` and `distribute` all answer "divide
  this frame into n"; none answered "place these one after another, each as tall
  as its own text". Two decks written days apart for the same project both wrote
  it by hand under different names, and between them hand-computed 270
  coordinates, most of which were a cursor being advanced. It returns the
  baseline it reached, so a slide composes downward without the caller keeping a
  cursor.
- **`slide.card(id, frame, { accent })`.** A rounded panel with an optional
  accent bar, inset by the panel's own radius. This is the composite that made
  0.14 write `rounded-corner-overhang`, three new `ElementRecord` fields, and an
  OOXML preset-geometry reader: a square-cornered bar laid flush against a
  rounded panel pokes past the curve unless it is inset, and every deck derives
  that inset again by hand. Drawn this way the defect cannot be expressed. Both
  primitives ship mechanics only — no fill, radius, gap, or proportion — because
  the toolkit supplies no taste, and there is a test for that too.
- **`--pretty`, and compact output by default.** Indentation was 27% of
  `report.json` and 34% of the review packet, measured. The MCP server stopped
  paying it in 0.13; the CLI — the path the guide calls the cheapest one — kept
  indenting every artifact it wrote until now.
- **Budget gates that measure a deck in trouble.** A defective fixture joins the
  healthy one, with a ceiling on `report.json` (it never had one) and an
  invariant expressed per distinct code rather than per occurrence: the 500th
  occurrence of a known code must not cost what the 5th code costs.

### Changed

- **`autofit-below-scale` requires that autofit actually shrank something.** Its
  condition was `effectiveFontSize < minimum` — the same test `font-below-scale`
  makes two branches up — so every element merely set below the fallback type
  scale was reported twice, the second time by a sentence claiming autofit
  "shrinks it from 11pt to 11pt". The counts gave it away: 145 and 145, exactly
  equal, because one code was a copy of the other describing an event that had
  not happened. All 145 on the measured deck were no-ops.
- **`font-below-scale` leaves `decorative` and `code` roles alone** on a
  model-authored canvas. A slide number that obeyed the body minimum would be
  the defect, and a code block's size is chosen so a line of YAML fits without
  wrapping. The 9pt legibility floor still applies to both; taste is exempt,
  physics is not.
- **`repeated-silhouette` calibrates against the deck it is judging.** Cosine
  over an all-positive feature vector cannot fall far below 1, so an absolute
  0.93 cut was not a threshold: every reported pair scored 0.98–1.00 and the
  check fired 20 times on a deck that was fine. The absolute gate stays — it
  carries the meaning of "the same design", and a deck of genuinely identical
  slides must still report every pair — and a pair must now also be much closer
  than that deck's own median pair. The ratio is published in the issue.
- **`fidelity.slides` lists only mismatches**, with `checked` carrying the count
  so silence cannot be read as a check that never ran. It previously listed
  every slide, five empty arrays each.

### Fixed

- **A failed build no longer leaves the previous build's verdict on disk.** A
  malformed native chart threw inside the chart writer; the CLI reported it and
  exited 1, which is correct. But `report.json` was still the last successful
  run's, unchanged, still saying `"status": "pass"`, with nothing on it to say
  which build it described. Build, then read the report, is what a model does,
  and it returned a green verdict for a build that never happened next to a
  `.pptx` that no longer matched the script. The report is now replaced with one
  recording the failure and its message. Nothing is written when validation was
  never requested; the exit code was always right, and this is for the reader
  that does not check it.

### Compatibility

- Contract `0.11`, unchanged. Existing scenes, outlines, requests, and build
  scripts build unchanged.
- **`report.json` carries `issueGroups` instead of `issues` by default.** A
  reader that parses `issues` should pass `--issues flat`, or read `issueGroups`,
  which holds the same facts. The in-memory `ValidationReport` still carries
  both, so nothing using the TypeScript API changes.
- `ValidationIssue` gains an optional `exemplar`, set only on issues
  reconstructed from a grouped report, where one message stands in for many.
- `RenderFidelityReport` gains an optional `checked`, and its `slides` no longer
  lists clean slides.
- Decks that reported `autofit-below-scale`, `font-below-scale` on chrome or
  code, or a long tail of `repeated-silhouette` will report fewer findings. No
  defect an author can act on was removed.

## 0.14.0 — 2026-08-11

The deck can now be wrong in a way the manifest can see. 0.13 made looking at a
deck cheap; this release is about the defects that survive being looked at,
because the record the checks read did not contain the property that was wrong.

The case that started it: a card built the way every deck builds one — a rounded
panel with a coloured bar laid flush along its edge. The bar is a plain
rectangle, so its square corner sits outside the panel's curve and pokes past
it. It is obvious in the render and it shipped anyway, because no check could
be written for it: `ElementRecord` recorded geometry and colour but never
recorded that a shape *was* a rounded rectangle, or what radius it was drawn
with. Both were set on the native shape and dropped one line later. Every route
by which the pair could otherwise have been reported already exempts it — a bar
is `role: "decorative"`, and a shape wholly inside an earlier shape counts as
layering rather than collision.

The general lesson is the one worth keeping: a property the writer sets but the
manifest does not record is a property nothing can ever check, including a host's
own `QualityCheck`. Three of those are closed here.

### Added

- **`rounded-corner-overhang`.** A new built-in check reporting anything with a
  hard corner drawn into the notch a rounded card cuts from its own — an accent
  bar, a status stripe, a thumbnail docked into a corner. It names both elements
  and the inset that would fix it. Warning-level and `fixable: false`: the
  correct inset differs for an edge bar and a corner badge, so `--repair safe`
  will not quietly move anything.
- **`style.radius` on canvas shapes.** Corner radius in inches was already
  honoured end to end — through the build script, the emitted scene, and a
  round-trip rebuild — but was absent from `CanvasShapeElement` and from the
  published schema, so TypeScript rejected it and `capabilities().canvas` never
  mentioned it. It is now a declared, documented property rather than one that
  worked only because the schema was loose.
- **`shape`, `radius`, and `maskShape` on `ElementRecord`.** What a shape's
  preset is, the radius it was authored with, and the outline a picture was
  masked into. `shape` is omitted for the default rectangle. `radius` records
  only what the author stated, because absence means "unstated", not "square".

### Changed

- **The inspector recovers preset geometry.** `validate` run against a `.pptx`
  with no manifest beside it reads `prstGeom` and its `adj` back out of the
  OOXML, so a deck that was edited in PowerPoint, or was never built here at
  all, is checked for this defect on the same terms as one we wrote.
- **The authoring guide states the rule.** The `build-script` section, and the
  worked card example every deck copies, now inset the bar by the card's radius.

### Fixed

- **A `roundRect` with no stated radius is no longer treated as square.** OOXML
  emits an empty `avLst` and PowerPoint rounds by 16.667% of the shorter side.
  Reading that as an unrounded corner would have made the new check miss the
  exact defect it was written for, since the idiom that produces it rarely
  states a radius at all. The rendered radius is derived, and pinned to half the
  shorter side the way OOXML pins it — so a bar too narrow to carry the radius
  it asked for is still reported.

### Compatibility

- Contract `0.11`, unchanged. Existing scenes, outlines, and requests build
  unchanged, and `style.radius` was already accepted at runtime.
- `ElementRecord` gains three optional fields. A reader that ignores unknown
  keys is unaffected.
- Decks that already carried this defect will now report a new warning. It does
  not gate `presentationReadiness`.

## 0.13.0 — 2026-08-11

Looking at the deck stops being the expensive part. 0.11 gave the model an
uncaged canvas and 0.12 stopped charging it for composition; both were about the
price of authoring, and neither looked at the price of the conversation the
authoring happens inside.

That price had become the largest cost in the system, and almost none of it
bought information. A build → review → patch → verify cycle on a twelve-slide
deck returned the same twelve renders four times over, at a resolution above the
point where extra pixels buy anything. Discovery could cost 57,000 tokens for one
resource read. The review packet spent 15,930 characters reciting element
geometry the model had written itself, and 20 characters on the words the
renderer actually failed to draw.

A twelve-slide deck now costs **40,819 tokens end to end against 168,205** — and
the cheaper loop contains a phase the expensive one did not: looking closely at
the slides the contact sheet flagged. Nothing was removed. Every default is the
cheapest correct answer, and `images: "all"` with `imageDetail: "full"` returns
exactly what 0.12 returned.

Contract `0.11`, unchanged — nothing a host *authors* is different. The review
packet's own `schemaVersion` moves to `2.0`.

### Added

- **Every slide on one page.** `review_presentation` and `render_presentation`
  take `images: "overview"`, which composes every render into one numbered
  contact sheet: 1,550 tokens for twelve slides against 22,128 sent separately.
  This is the change most likely to improve the deck rather than merely cheapen
  it. The deck-level questions the packet has always asked — does the sequence
  have a shape, does anything get quieter or louder, which two slides came out
  as the same drawing — are comparisons, and a comparison needs the things side
  by side. Twelve images seen one at a time answer the slide questions and none
  of the deck ones. `slide-agent review --contact-sheet sheet.png` writes the
  same image for a human.
- **Previews you chose.** `images` takes `"all"`, `"changed"`, `"none"`,
  `"overview"`, or a list of slide numbers. `patch` resolves `"changed"` from its
  own diff and `revise` from its target, so a one-element patch returns one
  render instead of twelve. A command that cannot tell what changed returns
  everything and says so — silently returning nothing would read as "nothing to
  see", which is a different claim.
- **Two preview resolutions.** `imageDetail` is `"review"` (1024px, the default) or
  `"full"` (1568px). The review tier costs 787 tokens against 1,844 and is sized
  to judge composition; text fidelity is read from the PDF's text layer, exactly,
  and never off the image, so the smaller preview costs nothing in what can
  actually be checked. Renders on disk stay 1600×900 — they are the deliverable.
- **A price on every result.** `tokenBudget` reports what a call cost, split into
  text and images, plus the session running total and what the richer option
  would have cost. Labelled an estimate, with the method published: characters ÷
  4 for text, `(w × h) ÷ 750` after downscale for images. A model cannot
  economise against a price list it cannot see.
- **Capabilities in facets.** `get_capabilities` answers with a 290-token summary
  by default and returns any facet in full on request — `canvas`, `images`,
  `fonts`, `rendering`, `diagrams`, `charts`, `layouts`, `checks`, or `all`. The
  `images` block is never summarised away: a model that plans a photo-led deck
  and only then learns this installation cannot source a picture has wasted the
  design.
- **A defect-first review packet.** By default each slide lists the elements a
  check names and counts the rest under `elementCensus`. `detail: "full"`
  lists every element, and a packet asked for one slide is always full. What the
  default leaves out is the part the author wrote and already knows.
- **Budget gates in CI.** Ceilings for the review packet, every published schema,
  each capability facet, `SKILL.md`, each guide section, and the returned preview
  payload. The 0.12 costs did not arrive in one bad commit — they accumulated,
  one reasonable addition at a time, with nothing watching the total.

### Changed

- **Published schemas name their shared subschemas.** `z.toJSONSchema` inlined
  every reused object, so `canvasElement`'s style block appeared once per element
  type and `sceneRecord` repeated the whole of `canvasElement` per record kind.
  The scene schema goes from 63,734 tokens to 12,294, `outline` from 57,245 to
  10,573, `canvasElement` from 42,883 to 6,281. Subschemas small enough that a
  reference would cost more than the repetition — a bare `{"const":"text"}`
  discriminant — are put back where they were used, so a union stays skimmable;
  and where reference reuse would make a schema *larger*, the inlined form is
  published instead.
- **Nothing routes a model to a mega-schema.** `slide_agent_run` no longer opens
  with "read `slide-agent://contract/schema/outline` first", an instruction that
  was worth 57,245 tokens. The schemas are described as what they are — the input
  to a validator — and capability discovery leads with the `canvas` block, which
  is derived from the same schemas and a quarter of the size.
- **`SKILL.md` is a router, not a second copy of the guide.** It shared 94% of
  its substantive lines with the authoring guide, so a host with both the skill
  and the MCP server registered paid for the same paragraphs twice, before
  knowing whether the deck had a chart in it. The unconditional load drops from
  8,734 tokens to 2,060: the two sections no deck can skip, plus an index saying
  when each other section becomes relevant and what it costs. `references/`
  already held the sections as files; now something points at them.
- **The build-script path is the recommendation, not one of three peers.** A deck
  as a program runs about a third the length of its NDJSON — 11,571 characters
  against 25,925–42,673 — and output tokens cost several times input. 0.12's own
  release notes argued it also composes better, because a loop enforces a rhythm
  hand-placed coordinates do not. Hand-written NDJSON is documented for short
  decks, for hosts that cannot execute a module, and for patches.
- **Results are serialized compactly.** Indentation was 40% of every packet and
  bought nothing a model reads better for.
- **The review packet stops repeating itself.** How the words were read back is
  stated once as `textExtraction` rather than on every slide; an issue that names
  a slide is reported on that slide and not again at the top, with
  `observations.issueCount` carrying the total; `text.intended` and
  `text.observed` appear when the comparison found a disagreement and at full
  detail; the generic per-slide question is asked once for the deck. A ten-slide
  packet goes from 14,140 tokens to 3,554.
- **`validate_presentation` returns no previews by default.** The report is what
  the call is for; `review_presentation` is where you look.

### Fixed

- **Validation issues can be matched to manifest elements.** An issue cites the
  OOXML shape name the writer derives (`002-slide-title`); the packet publishes
  the authored id (`slide-title`). Nothing depended on the two being connected
  while every element was listed regardless — and the moment the packet started
  listing only what a check names, the mismatch meant it listed almost nothing:
  a healthy-looking packet on a deck with eleven flagged elements. The manifest
  records both identities on the same record, so the join is now exact rather
  than a prefix stripped off a string and hoped over.
- **Schematic SVG previews reach the review packet.** Preview discovery matched
  `.png` only, which was harmless while its sole caller was OCR — which cannot
  read an SVG anyway — and stopped being harmless when the packet used the same
  list to decide what to show. On a machine without LibreOffice every slide
  reported no preview at all, so a reviewer was handed nothing to look at rather
  than the schematic the deck did have.

### Compatibility

- `includeImages` keeps its 0.12 meaning: `true` is `images: "all"`, `false` is
  `images: "none"`.
- Existing scenes, outlines, and requests build unchanged. Contract negotiation
  still accepts `0.9`, `0.10`, and `0.11`.
- `previewImagePaths` is unchanged; `PREVIEW_IMAGE_LIMITS` still exports the
  image and byte caps.
- A reader of review packet `1.0` should expect the field moves listed above.

## 0.12.0 — 2026-08-10

Composition stops being expensive. 0.11 gave the model a canvas it could design
anything on and then charged it, per element, in hand-computed coordinates —
and the bill fell on exactly the things that make a deck look finished. A card
with a title, a sub-label and an accent bar costs four hand-written records; a
bare floating label costs one. Nothing in the guidance asked for bare floating
labels. Economising produced them anyway.

Contract `0.11`. Every change is additive: `0.10` scenes, outlines, and requests
build unchanged.

### Added

- **The engine places the diagram, not just the arrows.** `slide.graph(id, spec,
  draw)` ranks the nodes, orders each rank so edges cross as little as possible,
  places them in the frame, and routes the connectors — then calls your `draw`
  with a rectangle per node. What a node looks like stays entirely yours; where
  it sits stops being your arithmetic. Cycles survive ranking, so a feedback
  edge does not collapse a flow into one column, and a rank that cannot fit its
  frame is refused with what it needed and what it was given rather than being
  placed off the slide.
- **Placement as a relationship.** Any element may carry `place`:
  `{"x":{"alignLeft":"title"},"y":{"below":"chart","gap":0.2}}`, with
  `alignLeft/Right/Top/Bottom`, `centerX/Y`, `above`, `below`, `leftOf`,
  `rightOf`, `sameAs`, and `spanFrom`/`spanTo`. Relations may only reference an
  element declared earlier on the slide, which rules out cycles by construction,
  and they are solved into inches before composition — so the scene, the
  manifest, and any later patch carry coordinates, never relationships.
- **Slides that came out as the same drawing are named.** `repeated-silhouette`
  reports the pair by number. The variety score already noticed this in
  aggregate; what it could not say was *which* slides, which is the only part an
  author can act on. Slides sharing a declared `kind` are held to a stricter
  threshold, because two section dividers are a rhythm rather than a repetition.
  The review packet carries the same finding per slide as `twins`.
- **`validate --findings`.** What a reviewer saw, recorded against the deck.
  This is how the loop closes: an authored deck is held at `review` until a
  judgement exists, and a single `note` finding saying the slides are sound is
  that judgement.
- **Author the deck as a program.** `slide-agent build --script deck.mjs` runs a
  JavaScript module that composes the deck with `defineDeck` and exports it. You
  define this deck's own repeated forms as ordinary functions and place them in
  loops; the engine supplies the arithmetic — `columns`, `rows`, `grid`,
  `split`, `distribute`, `inset` return rectangles, and `measureText` says how
  tall a string will actually set before you commit to a frame. Slide Agent
  ships no components and no house style: what your functions draw is yours. The
  emitted `.ndjson` remains canonical, so patch, revise, and the clean-directory
  round-trip work unchanged on decks built this way. The script runs in the
  engine's process with your privileges — the same decision as running it with
  `node` — and nothing discovers or fetches scripts.
- **Connectors that route themselves.** A connector can name the elements it
  joins — `{"type":"connector","from":"cache","to":"db","route":"elbow"}` —
  and the engine resolves the anchors against the real frames, stands the arrow
  off the edge, and routes around whatever is in the way. `route` is `straight`,
  `elbow`, or `curved`; `from`/`to` take a `{ id, side }` when a specific edge
  matters; `clearance`, `stub`, and `mayCross` tune the rest. Elbow routes are
  emitted as one native custom-geometry shape, so a route is still one editable
  object and one manifest record.
- **`slideChrome`.** The kicker, slide number, footer rule, and brand mark
  declared once on the deck record and repeated on every model-authored slide,
  interpolating `{{slideNumber}}`, `{{slideNumberPadded}}`, `{{slideCount}}`,
  `{{slideTitle}}`, `{{deckTitle}}`, and any key a slide supplies in its own
  `chrome`. A slide opts out with `chrome: false`. Slide Agent ships no chrome
  and has no opinion about whether a deck should have any; it repeats what you
  wrote.
- **`typography.scale`.** Declare the point sizes the deck commits to, largest
  first, and the report names every element that stepped off the ladder as
  `type-off-scale`. It stays advice: a deliberate departure is a design
  decision, not a defect.
- **`slide-agent measure`.** Line count, laid-out height, and overflow for a
  string in a frame, using the same metrics validation uses — so the answer you
  get before building matches the one the report gives you after. Available as
  `measureText` from the library, and as `autoHeight` on an authored text box.

### Changed

- **Density is measured as ink, not as reserved boxes.** Coverage used to union
  bounding boxes, so a two-inch text box holding one line of ten-point type
  counted as full and a slide of six such boxes reported as fully covered while
  reading as a blank page with labels on it. Text now contributes the block its
  glyphs occupy, an unfilled outline contributes its stroke rather than its
  interior, and only real masses — pictures, charts, tables, filled shapes —
  contribute a whole frame.
- **Hierarchy measures a ladder, not a headcount.** Counting distinct sizes per
  slide scored a scale and a scatter identically. It now measures how few sizes
  the deck commits to overall and how far the dominant text on a slide outranks
  its body, which is what a reader actually sees.
- **The heuristic floors bind.** They sat at 25, a floor only a catastrophe
  could hit, so a deck could score 57 on variety with the engine's own advice
  reading "nothing gets noticeably quieter or denser" and still report `ready`
  with a single reason saying nothing was wrong. Every floor is now 58 — the
  same threshold at which `scoreDeck` already declines to call a deck workable —
  and the failing dimension's own advice travels into `readinessReasons`.
- **`ready` requires that somebody looked.** A deck this engine built reaches
  `ready` only once a visual review finding is recorded. Rendering a deck is not
  the same as forming an opinion about it, and an empty `visualFindings` after a
  successful render means the question was never asked. Recording that the
  slides are sound is one finding; it just has to be said. Decks arriving from
  elsewhere are unaffected — nobody can know whether their author reviewed them.

### Fixed

- **Routes stay on the slide.** Going around an obstacle could pick a lane past
  the edge of the page, which is worse than the crossing it avoided: an arrow
  that leaves the slide reads as a bug and clips differently in every viewer.
  Routing now scores an escaped path below a crossing one and clamps its
  candidate lanes to the slide.
- **`validate` reports readiness at the top level**, the way `create` always
  has. A caller reading only the result object used to get `undefined`.
- **Connectors are no longer exempt from collision checking.** Every connector
  record was written with `intentionalOverlap: true`, which made one whole class
  of defect unreportable: a route drawn straight through a label, striking the
  words out, invisible in the scene, the manifest, and the package alike. Routed
  connectors keep their real path on the record, so the check now asks whether
  the line crosses text rather than whether two bounding boxes intersect, and
  reports `connector-crosses-text` when it does.
- **A shape wholly inside an earlier shape is layering, not collision.** A
  miniature drawn on a card, a dot on a track, or a bar in a plot frame no
  longer reports an overlap per instance — noise that argued against composing
  anything at all. Elements expanded from the same group or symbol are likewise
  one authored object.

## 0.11.0 — 2026-08-10

Uncaged authoring. The release where the AI's design language is the deck's
design language, and where "it validated" stops being confused with "it is
finished".

Contract `0.10`. Every change is additive — `0.9` scenes, outlines, and requests
build unchanged — but a `0.x` minor is a deliberate adoption step, so hosts opt
in. `MIGRATION-0.10.md` says what is new and what you keep.

### Added

- **Your own design language.** `creativeDirection.visualSystem` holds the
  deck's own `variables`, named `styles` with `basedOn` inheritance, `motifs`,
  and `constraints`. The names are yours — `excavation-note`, `signal-fog`,
  `runway-crop` — and Slide Agent reserves none of them. Elements reference
  styles with `styleRef`; any style value can point at a variable with
  `{"$var":"name"}`. A reference that does not resolve is an error naming the
  styles that do exist; a variable that lands on a property it cannot satisfy is
  an error naming the mismatch. Neither is coerced and neither is ignored.
- **`slide-agent review`** and the `review_presentation` MCP tool return a
  deterministic packet for the exact PPTX: artifact hashes, per-slide renders,
  the words read back off the render compared with the deck's own text, element
  geometry, the author's declared intent and sequence plan, current issues, and
  questions worth asking. No aesthetic verdict, and the questions are questions.
- **`slide-agent patch`** and `patch_presentation` change named elements on
  named slides and rebuild, leaving every other element exactly as it was.
  `--dry-run` reports the semantic diff and writes nothing. Regenerating a deck
  to fix a caption used to discard every decision the author was not currently
  thinking about.
- **Render text fidelity.** The rendered PDF's own text layer — or Tesseract
  where Poppler is absent — is read back and compared with the deck's text.
  Catches clipped endings, strings that vanished into an autofit, words broken
  by a wrap the author never saw, and copy the manifest cannot account for.
  OCR uncertainty produces `review`, never a fabricated pass.
- **A wider canvas.** `group` (children positioned relative to the group origin,
  expanded into individually editable native elements) and `symbol-instance`
  (one placement of a symbol the deck declared itself, with per-instance scale,
  text, colour, and style overrides — Slide Agent ships no icon vocabulary).
  Text gains `lineSpacing`, `lineSpacingMultiple`, `charSpacing`, `indent`,
  `columns`, `bullet`, `noBreak`, and `underline` in the schema rather than
  hidden in `options`. Pictures gain `crop`, `focalPoint`, `maskShape`,
  `duotone`, `grayscale`, `tint`, and `vector` for SVG artwork with honest
  `editable` metadata. Every element gains `layer` and `allowBleed`.
- **`capabilities().canvas`**, derived from the published schemas rather than
  restated, so it cannot drift. Plus installed fonts and render-backend
  limitations, through the CLI, the MCP resource `slide-agent://capabilities/canvas`,
  and the TypeScript API. Available before a model simplifies an idea into boxes.
- **Planning metadata that survives round-trip:** `exploration` (theses
  considered, and which was chosen), `sequencePlan` (each slide's narrative job
  and intended silhouette), `claims` and `sourceLedger` (what is asserted and
  what backs it), and `hostCapabilities` (what the host AI can do — planning
  context, never a grant).
- **A portable, provable package.** Every asset is content-addressed into
  `artifacts/<deck>/assets/`, and the emitted scene references it relative to
  the scene's own directory. `--round-trip` rebuilds that scene in a clean
  temporary directory from the packaged assets alone and compares slide count,
  element ids, and key properties. All six showcase packages pass it.
- **An artifact graph.** Every file a report describes is bound by SHA-256 with
  what it was derived from, so a preview left over from an earlier revision
  cannot pass as evidence.
- **`VisualReviewer`** — a provider-neutral extension hook that consumes the
  same deterministic packet a host AI does. Findings carry severity, slide,
  element ids, observation, rationale, and a suggested target. The core ships
  the interface, never a bundled model.
- **Six showcase decks** under `examples/showcase/`, each authored as its own
  scene from its own brief, with its own thesis, sequence plan, and claim
  ledger. `npm run examples:evaluate` compares every pair by geometry
  signature and includes a palette-only restyle as a control.
- **`docs/human-evaluation.md`** — the blinded protocol, thresholds, and
  recording rules for the questions a metric cannot answer.

### Changed

- **Repairs no longer happen behind your back.** The default mode for a
  model-authored canvas is `suggest`: the engine reports exactly what it would
  change, from what, to what, and whether that replaces a value you set — and
  changes nothing. `--repair safe` applies them, records each one with its
  rollback value, and rolls the whole run back and rebuilds as authored if the
  render's text gets worse. `autoFix: false` still means "change nothing".
- **Two verdicts instead of one.** `packageStatus` answers "does this file hold
  together"; `presentationReadiness` answers "would you put it in front of the
  audience", with `readinessReasons` saying what decided it. Readiness is not a
  weighted average: one critical dimension blocks it however good the rest is.
  `status` stays, documented as package-oriented, for `0.9` readers.
- **`quality` is now `heuristics`** — both keys are emitted, and the rename is
  the point. `density` counts the union of element areas rather than the sum, so
  a full-bleed photograph with a caption over it no longer reports as 130%
  covered. `variety` measures geometry — occupancy, dominant mass, whitespace
  topology, reading path, slide-to-slide rhythm — instead of counting element
  types. `evidence` requires a declared relationship; two diagram nodes are no
  longer evidence. Bands have per-dimension floors.
- **An omitted `geometry` no longer means `sharp`.** It resolves to `authored`
  and contributes nothing, so silence stays silence. `geometry` and `density`
  are deprecated as closed enums in favour of the open prose fields
  `geometryLanguage`, `spatialRhythm`, and `materialLanguage`.
- **The fallback type scale is no longer imposed on a model-authored canvas.**
  A hard 9pt legibility floor still applies to every deck; between that floor
  and the fallback scale, a canvas gets `font-below-scale` as advice rather than
  a defect. A bench manual sets its notes at 11pt on purpose.
- **Contrast is measured through translucency.** A band drawn at 72%
  transparency is mostly the slide behind it, and measuring against the declared
  fill reported perfectly legible type as a defect.
- **One canonical package root.** The scene, manifest, reports, previews, PDF,
  and content-addressed assets all live under `artifacts/<deck name>/` with
  canonical names. The older `intermediate_files/` and `logs/` paths are still
  read when discovering an existing package.
- **The authoring guide** gains `visual-system`, `planning`, and `review`
  sections, and its creative-direction examples are now three structurally
  unlike decks rather than one palette-plus-geometry bundle.

### Fixed

- Text columns, source crops, picture masks, and blip colour effects are applied
  to the emitted package directly. PptxGenJS does not expose them, and answering
  "can I crop this photograph to a circle?" with "no" was false about the medium
  and true only about one library.
- Two decks built into the same directory no longer share one `manifest.json`,
  which silently overwrote the first deck's blueprint.
- `fit: "cover"` now crops instead of stretching. PptxGenJS emits a zeroed
  source rectangle, so a 16:9 photograph in a 2:1 frame came out distorted;
  the crop is derived from the picture's own dimensions and centred on
  `treatment.focalPoint` when one is declared.
- Authored picture crops reached no picture at all: the post-processor looked
  for `a:blipFill` where a `p:pic` carries `p:blipFill`. Post-processing is also
  keyed by slide now — element ids are unique within a slide, not across the
  deck, so two pictures called `plate` swapped each other's crops.
- Render fidelity no longer reports a word as broken because a PDF extractor
  spaced a large heading oddly. A word counts as broken only when its letters
  continue onto the next extracted line.
- Two placements of the same symbol collided in the manifest unless one of them
  happened to declare overrides: child ids were namespaced inside the override
  branch rather than on every instance. Collided ids are also unaddressable by
  a patch, which addresses elements by id.
- Symbol and group images resolve once per deck rather than once per placement.

## 0.10.0 — 2026-08-09

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
- **Image provenance**: `provenance.source`, `credit`, `license`, `generated`,
  and `generator` on any image element. Credits travel into the deck's speaker
  notes under `[Credits]`, because a licence that requires attribution is not
  satisfied by a credit sitting in a JSON file on the author's laptop. The
  manifest now also records the authored path, so a deck built from a URL can
  say where its pictures came from.
- **An `imagery` section in the authoring contract**, saying plainly where
  pictures may come from, which formats survive, and that a generated image is
  a claim like any other.
- **`slide-agent capabilities`**, plus `get_capabilities` and
  `slide-agent://capabilities` over MCP. A model that designs a photo-led deck
  and only then discovers this installation cannot obtain a single image has
  wasted the whole design.

### Fixed

- **Every documented extension point was inert.** `ExtensionRegistry` and its
  seven interfaces were published, exported, and demonstrated in
  `docs/api.md`, but nothing in the pipeline ever instantiated or read a
  registry — a host could follow the documentation exactly and have none of it
  take effect. `SlideAgent` now accepts extensions and threads them through:
  diagram grammars, chart renderers, layouts, quality checks, the preview
  backend, the design tokenizer, and the image resolver. `capabilities()` also
  reports the built-ins rather than only host contributions, which is what
  makes it answerable to "what can this installation do".
- **Local images bypassed every check the download path applies.** Format was
  never verified, so a mislabelled file or an SVG logo produced a package that
  failed silently in PowerPoint instead of an error anyone could act on —
  and local is the route every generated image and every logo takes. WebP now
  warns that it renders only in PowerPoint 2019 and later, and an SVG is
  refused with the reason and the remedy.
- **A canvas diagram could only use a built-in grammar.** `grammar` was an
  enum, so a registered `DiagramGrammar` was unreachable through the contract.
  It is now free-form and checked when the slide is built, against built-ins
  and host grammars together.
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
