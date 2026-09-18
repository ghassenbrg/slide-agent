# Migrating to 1.0

1.0 changes how a deck is authored, not what it can express. You still make
every design decision; you write them in grid units, roles, and named tokens
instead of inches and colour literals, and the engine solves the geometry.

Nothing you already have stops working. V1 scenes, outlines, build scripts, and
canvases still build, and the 0.x MCP tools are one flag away.

---

## The shape of the change

| 0.x | 1.0 |
|---|---|
| `slide-agent.scene/1` NDJSON, or an outline with `kind` slides | `slide-agent.intent/1` JSON: brief, direction, design language, components, and a composition per slide |
| Coordinates in inches, colours and sizes per element | `"at": "c1-7 r2-6"`, roles, and tokens; the design language holds the rest |
| `creativeDirection` prose plus palette and typography | A design language the engine compiles, verifies, and maps onto theme slots |
| Repeated forms as build-script functions | `components`, defined once per deck and instantiated anywhere |
| Review rounds spent finding overflow | Overflow, contrast, and bounds are constructed or reported; the look is spent on design |
| `patch`, `revise`, `edit` | One EditOp model at four levels: intent, design, element, package |
| `validate`, `render`, `review` | `slides_build` (verdict), `slides_view` (previews, rhythm, report, explain), `slides_finalize` (fidelity, round-trip, exports) |
| `.pptx` plus an `artifacts/` folder | A deck directory: `intent.json`, `theme.tokens.json`, `scene.json`, `deck.pptx`, `previews/`, `run.json` |

## What you have to do

**If you use the skill or the MCP server:** upgrade and read the grammar once
(`slides_catalog`, or `slide-agent catalog --grammar`). The tool names changed;
the workflow is shorter. Nothing else is required.

**If your host still calls the 0.x tools:** start the server with
`slide-agent-mcp --compat-v1` (or `SLIDE_AGENT_COMPAT_V1=1`). Both surfaces are
served together for one minor release.

**If you have V1 scenes or outlines:**

```bash
slide-agent migrate --input deck.scene.ndjson --output deck.intent.json
slide-agent build --intent deck.intent.json --deck out/
```

The report says what mapped: `kind` slides become the recipe that does the same
job, `canvas` slides keep their geometry as `canvas` slides, and anything with no
mapping is listed rather than dropped. A migrated deck is a starting point —
recipes can be opened into compositions with
`slides_edit {op: "expand", path: "/slides/N"}` whenever you want to rework one.

**If you have build scripts:** they still run — `slide-agent build --script
deck.mjs --output deck.pptx` is unchanged, and still runs the module in-process
with your privileges. Rewriting one as an intent is usually shorter than the
script it replaces.

**If you relied on `create --prompt`:** the prompt-only "structural draft" path
is gone. Its honest replacements are draft mode (`"auto"` slides plus a preset,
labelled in the verdict) and `slides_generate` (engine-managed direction, which
needs a key).

## Breaking changes

- **MCP tool names.** Seven V2 tools replace the 0.x set by default; the old
  names are behind `--compat-v1`.
- **`SKILL.md` is the V2 router.** The 0.x router moved to
  `references/v1-skill.md`; the guide sections are unchanged in `references/`.
- **Paths are confined.** Every path a tool call names must resolve inside the
  workspace roots (MCP roots, `SLIDE_AGENT_ROOTS`, or the working directory).
- **`allowRemoteAssets` cannot enable fetching.** It can only narrow the
  operator's `SLIDE_AGENT_ALLOW_REMOTE_IMAGES` setting.
- **Scripts do not run from requests.** `script` in a structured request or an
  MCP call is refused unless `SLIDE_AGENT_ALLOW_SCRIPTS=1`.
- **`validation.quality` heuristic scores are not part of the V2 verdict.**
  Readiness is mechanical; design quality is a review, recorded separately.

## What did not change

- Hard constraints: package integrity, bounds, legibility floors, contrast, alt
  text, truthfulness (ADR-0001, still in force).
- No house style. The engine still refuses to normalise your design.
- Reproducible builds with `SOURCE_DATE_EPOCH`.
- The security posture, tightened: archive limits, subprocess timeouts, DNS
  pinning, and workspace confinement.
- The 0.x line gets security fixes for six months.
