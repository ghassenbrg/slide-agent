# Slide Agent — launch film

60 s · 1920×1080 · 30 fps · composition `Launch` in `promo/src/launch`

## What the product actually is (the facts the film is built on)

- You **describe a presentation in plain language** — in VS Code (status-bar
  button → *Create a presentation*), or by asking the AI assistant you already
  use (Claude Code, Codex, GitHub Copilot, Gemini, any MCP app). You can hand it
  your own notes and data (`--sources notes.md,data.csv`, *Create from Current
  Brief*).
- **The model directs**: storyline (a job for every slide), a visual concept,
  palette, typefaces, composition, emphasis. There is no house style — six
  showcase decks look like six different documents.
- **The engine computes**: a 12×6 grid, text measured from the real font files
  and fitted, contrast verified, native charts with their data, diagrams with
  routed connectors, 1,848 icons as shapes.
- **It looks at what it built** — a contact-sheet preview, a verdict with exact
  character budgets — and revises.
- **It delivers a real, editable PowerPoint**: real text boxes, real charts with
  data, schema-validated so it opens without a repair prompt.
- Install: VS Code extension, or `npx --yes --package @slide-agent/core@latest -- slide-agent install`.
  Open source, MIT.

What it does *not* do, so the film never shows it: it does not browse the web
for research, it has no hosted web app, it does not generate stock photos.

## Concepts considered

| Concept | For | Against |
|---|---|---|
| Idea → Presentation | Simple, instant | Every AI deck tool tells this story; nothing about *why this one* |
| Chaos → Clarity | Strong visual | Overclaims "research" — Slide Agent uses sources you give it, it doesn't go find them |
| AI teammate | Warm | Abstract; hard to *show* in 60 s |
| Old way vs new way | Instantly relatable | Spends too long on the negative |

**Chosen: "Click to add title."** A bookend built on the single most
recognisable object in office work — the empty title placeholder. It borrows the
relatability of *old vs new* (the hours that placeholder costs) and the payoff of
*idea → presentation*, but the middle is the real pipeline — plan, design, build,
check, deliver — so the film explains *why the result is better than text from a
chatbot*. The film ends where it started: the same placeholder, now holding the
product's name.

## Visual language

- **Lighting arc**: the problem lives in the dark (cold, cluttered, a clock
  racing); the product turns the lights on — a bright, calm paper-white studio
  where slides float as physical cards. Dark → light *is* the story.
- **Motif: the grid.** The engine works on a 12×6 grid; the film's motion snaps
  to grids, measures, lands. Precise, never bouncy.
- **Palette** (from the icon): ink navy `#0A1433`, signal blue `#2F5BFF`, teal
  `#14B8A6`, paper `#F5F6FA`. The *demo deck* — an engineering review of an AI platform — has its
  own look (white cards, tinted icon badges, indigo accents, Plus Jakarta Sans and JetBrains Mono) — proof
  the deck's design is not the tool's brand.
- **Type**: Inter Tight (display), Instrument Serif italic for the emotional word
  in each line, JetBrains Mono for stage labels (PLAN · DESIGN · BUILD · CHECK ·
  DELIVER).
- **Camera**: one continuous space — push into a slide, pull back to the contact
  sheet, never a hard slideshow cut.
- **Real material**: the demo deck is authored as a real intent
  (`launch/demo/intent.json`) and built by Slide Agent. The build scene places
  elements at the frames the engine computed (`scene.json`); the contact sheet
  and the range wall are the engine's own renders.

## Sound

Original score synthesised in code (`scripts/make-launch-audio.mjs`), 120 BPM so
cuts land on beats. Ticking clock and a tightening riser under the problem; a
hard stop to silence; one key-click; a warm chord when the lights come on; a
light four-on-the-floor pulse under the pipeline; tiny ticks on every element
landing; a final resolve under the CTA.

## Storyboard

| Time | Scene | Picture | On-screen words |
|---|---|---|---|
| 0:00–0:05 | **Hook** | Darkness. One empty slide, dashed placeholder, cursor blinking. Slow push-in. | *Click to add title* → "Every presentation starts *here.*" |
| 0:05–0:14 | **The work** | The placeholder spawns the work around it, one fragment per beat: tabs, an outline, sticky notes, text overflowing its box, alignment guides, a pasted chart, three fonts. A clock races 9:00 → 23:47. | RESEARCH · OUTLINE · STRUCTURE · WRITE · LAYOUT · VISUALS · CHARTS · POLISH → "Hours of it. Before anyone hears your *idea.*" |
| 0:14–0:19 | **Turn** | Everything collapses into a single text line. Silence. One keystroke. Light floods in. Icon + wordmark. | "Slide Agent" — "Describe a presentation. Get a real *PowerPoint.*" |
| 0:19–0:24 | **Describe** | An assistant chat panel. The brief is typed; notes.md and survey.csv attach. | The prompt itself. |
| 0:24–0:30 | **Plan + Design** | Eight storyline cards deal out, each with its job. A concept sentence, a palette, a type pair. | PLAN "Every slide gets a job." · DESIGN "A look made for this deck. Not a template." |
| 0:30–0:40 | **Build** | Into the canvas: a 12×6 grid draws, elements land at engine-computed frames; text measured and fitted; chart bars rise from data; a flow diagram routes itself; contrast chip. Three slides. | BUILD "Grid, type, contrast, charts — computed, not guessed." |
| 0:40–0:45 | **Check** | Pull back to the contact sheet. A scan passes; one headline flagged with a character budget; it shortens and fits. | CHECK "It looks at what it built. Then fixes it." |
| 0:45–0:50 | **Deliver** | `deck.pptx` lands in a slide editor. Click the headline → a live cursor. Click the chart → its data. | DELIVER "Real PowerPoint. Every word, chart and shape editable." |
| 0:50–0:55 | **Range** | Six real showcase decks sweep past — finance, science, travel, fashion, architecture, heritage. | "Every deck designed for its subject. No house *style.*" |
| 0:55–1:00 | **CTA** | Back to the empty placeholder — now light. The title types itself: Slide Agent. | "Describe it. Get the deck." · works with … · install line · open source |

## Voice-over script (optional, for a human read; timed to the cut)

> (0:01) Every presentation starts here.
> (0:06) And then come the hours. Research, outline, layout, charts, polish…
> (0:15) What if it started with one sentence?
> (0:17) This is Slide Agent.
> (0:20) Describe the deck you need — and hand it your notes.
> (0:25) It plans the story, slide by slide, and designs a look for *this* deck.
> (0:31) Then the engine does the precision work: the grid, the type, the contrast, the charts.
> (0:41) It checks what it built, and fixes what doesn't fit.
> (0:46) And you get a real PowerPoint. Every word, every chart, editable.
> (0:51) No templates. No house style.
> (0:56) Describe it. Get the deck. Slide Agent.

## Producing it

```bash
cd promo
sh launch/demo/build-film-deck.sh         # build → verdict → EditOp → finalize → copy into the film
node scripts/make-launch-audio.mjs        # score + SFX → public/launch/audio
npx remotion studio                       # composition "Launch"; each scene is also under Launch-Scenes
npx remotion render src/index.ts Launch out/slide-agent-launch.mp4 --crf=16
```

Output: 1920×1080, 30 fps, 60.0 s, h264/AAC, mixed to −14 LUFS integrated, true peak −3 dBTP.

### Where every claim on screen comes from

The sample deck is an unbranded engineering review of a team's AI platform,
written by `launch/demo/make-intent.py` from `platform-notes.md` and
`metrics.csv`. Everything in it is native — text, icon badges, cards, two
charts, a flow diagram, a timeline, a roadmap — so it is fully editable and
round-trips clean.

| On screen | Source |
|---|---|
| The brief, `platform-notes.md`, `metrics.csv` | `launch/demo/` — the actual inputs |
| Storyline cards | each slide's `message` in `launch/demo/intent.json` |
| Concept, palette, typefaces | the intent's `direction` and `design.language` |
| Slides assembling, measurement chips | `src/launch/data/scene.json` — the engine's computed frames, sizes, line counts |
| Build log (type steps, contrast ratios) | adjustments in `launch/demo/out/run.json`; ratios computed from the palette |
| The flagged icon, "1.87:1 … graphics need 3:1" | `launch/demo/film/verdict-before.json` — the real build of `intent-draft.json` |
| The fix | `launch/demo/film/edit-results.json`, applied with `slide-agent edit` |
| Contact sheet, before/after | the engine's previews of that deck |
| "ready", schema-valid, rebuilt clean from intent | `slide-agent finalize` → `state: ready`, round trip included |
| The range wall | `examples/showcase` decks plus this deck |

The LinkedIn cut (`src/linkedin`, 1080×1350, 50 s) uses the same deck and
data. Its post copy is in `linkedin/POST.md`.

`DeckCheck` (folder Launch-Checks) draws all eight slides from `scene.json` beside nothing else, for comparing against `public/launch/deck/*.png` if the deck is rebuilt.
