# One Sentence — Slide Agent LinkedIn announcement

Working title: **One sentence in. A finished deck out.**
Format: 1080 × 1350 (4:5), 30 fps, ~52 s. Standalone Remotion entry `src/one-sentence/index.ts`.
Creative authority: the October 3 brief. Older announcements (V1–V5, Follow the idea, Ask. See. Shape., Ask for a deck) were inspected only for reusable assets and to understand the "static slides with transitions" criticism. None of their scripts, scene order, layouts, carriers (blue thread, curtain transitions, cursor-on-card workflow) or pacing is reused.

## Concept

The **request sentence is the protagonist and the carried element.** Its words physically turn into the deck:

- In the opening the words *timeline*, *budget* and *risks* lift out of a typed request and land in a real slide, where the components they name assemble around them. AI creation and output quality share the first five seconds.
- The same sentence then travels with the viewer: it becomes the message bubble in the agent conversation, docks above the deck while the camera explores it, and later **re-types its noun** (`launch plan` → `architecture review` → `transformation roadmap` → `data story`) so each change of words visibly produces a different real deck with a different design language.
- At the end the deck folds into the .pptx file, and the file becomes the website card.

New hero evidence: a **new five-slide deck, "Fern — launch plan", is generated in this session by an AI agent (Claude Code) using the Slide Agent skill from the exact request shown on screen.** Its intent, verdicts, PPTX and LibreOffice renders are stored under `one-sentence/evidence/`. Range decks are the published showcase decks (real Slide Agent output); their on-screen requests are labelled as example requests.

Motion explains rather than decorates. Each scene has one motion protagonist, used once:

| Motion protagonist | Scene |
|---|---|
| Words → components assembly | Opening |
| Agent steps streaming, deck dealt out of the reply | Workflow |
| Camera travels a continuous deck strip; close-up ↔ full slide | Depth |
| Signal follows diagram connections node by node | Range · architecture |
| "Today" marker progresses through a 3-year roadmap | Range · roadmap |
| Chart revealed month by month, then the takeaway | Range · data |
| Slides fold into one file; native-object callouts | Deliverable |
| File card → website lockup, held | Close |

Visual language from the product's own icon and website: deep navy stage (#0A1638 → #0F2459), Slide Agent blue #2F5BFF, teal #14B8A6, white. Slides are bright physical objects on that stage. Video type: Avenir Next (installed system face) — Demi/Bold for statements, Medium for captions. Motion tokens: "professional trust" preset, ~21 f entrances, bezier(0.16,1,0.3,1) for travel, spring damping ~20 for landings, no shake, ≤3 camera-level hits (send, deck arrival, final lockup).

## Final script (as recorded; en-US-AvaNeural)

| Time | Voiceover |
|---|---|
| 0.4–6.5 s | Ask your AI agent for a presentation, and get a professionally designed deck. This is Slide Agent. |
| 6.9–11.9 s | Install it once in a supported agent, like Claude Code, Codex, or Gemini. |
| 12.4–19.1 s | Describe what you need. Your agent designs it. Slide Agent builds the deck, checks the layout, and exports it. |
| 20.2–27.9 s | One design system, slide after slide: · the timeline, · the budget, · and the risks. |
| 29.9–41.2 s | Ask for an architecture review, · a strategy roadmap, · or a data story, · and the design changes with it. |
| 41.8–46.2 s | The result is a real PowerPoint file, with editable text and native charts. |
| 46.6–54.2 s | Create professional presentations directly through your AI agent. Explore examples and install it at slide-agent.ghassen.io. |

"·" marks where one continuous read is placed phrase by phrase under its slide. 55.0 s, 1650 frames; cuts and hits on the 122 BPM bar grid.

## Final storyboard

| # | Frames | Picture and motion | Brief requirement |
|---|---|---|---|
| 1 Opening | 0–209 | Frame 0 is designed: the agent composer and an empty dashed canvas. The request types, and the canvas listens: as *launch plan*, *timeline*, *budget* and *risks* are typed, the matching slot of the dashboard draws itself. Send (hit). each keyword lifts out of the sentence and lands on its own slot; the real Fern dashboard assembles from its own components, each revealing its internal order (milestones left to right, bars growing, risks top to bottom). Slide Agent lockup and positioning line land at 5 s. | Request + striking real result together; name in the opening |
| 2 Install | 209–357 | The dashboard pushes back under the composer as the install card is dealt over it (no dissolve): "One command or the VS Code extension"; agents light as they are named; the Slide Agent icon flies up and docks into the composer as an installed badge. | Brief availability |
| 3 Workflow | 357–593 | The composer becomes the user's message in an agent session ("Recreated from a real session · condensed"). Steps tick in sync with the words (concept and palette → `build` 5 slides → `finalize` ready → PowerPoint exported) while five slots fill with the real slides and get checked. | Request → agent → actual result |
| 4 Depth | 593–888 | The strip becomes one continuous deck; the request docks as a chip whose keyword lights for the slide on screen. Timeline slide full → close-up as a week marker advances to launch → budget slide, bars revealed in rank order → close-up across the risk cards → full risks slide. Headlines are masked in close-ups so no word is cut. | Several related slides; close-ups alternate with full views |
| 5 Range | 888–1242 | The chip re-types its request three times; each change deals a different real deck on top of the last one, which pushes back (no dissolves). Architecture (dark): a signal follows the routed connectors node by node. Roadmap (white/teal): a "today" marker moves 2026 → 2028, milestones ring as reached. Data story (cream/orange): acquisition bars, retention line and activation funnel reveal in reading order, then the takeaway band. | Three contrasting types and styles; diagram, roadmap and chart motion |
| 6 Deliver | 1242–1390 | Fern's five slides are dealt out over the receding data deck, then fold one by one into `Fern-launch-plan.pptx`; it opens to the budget slide with selection handles on the title (editable text) and the chart, whose embedded data sheet pops out with the real values. Callouts lead their spoken words by about 0.4 s. | Editable PowerPoint (supporting) |
| 7 Close | 1376–1650 | The open file shrinks back into a wall of every deck shown; the lockup lands (hit) on it; positioning line; slide-agent.ghassen.io for 7.5 s, with a light sweep while it is read out; "Explore the examples" and "Install guide" each land as spoken; a slow push holds the frame alive; 0.5 s held tail. | Name, website, invitation |

## Reused assets (assets only)

Official icon (`images/icon.png`); website colour tokens; showcase slides `architecture` 1, `transformation` 1 and `analytics` 1 (PNG/PDF from `site/public/showcase/presentations`, intents in `promo/showcase/presentations`); approved music track "House Vibez" (Lily J, Mixkit Free License, previously approved for the Ask-for-a-deck revision). Everything else — the Fern deck, script, voice, captions, choreography, Remotion code — is new.

## Honesty rules for this film

- Fern, its dates and figures are fictional demonstration content, labelled "Illustrative demo" in the deck.
- The agent conversation is a condensed recreation of this real session; no generation time is shown or implied.
- Range-deck requests are labelled as examples.
- Motion (assembly, signals, markers, chart reveals) is video animation over real rendered slides; the film never says the PowerPoint is animated.
- Native-object callouts are verified by inspecting the PPTX package.
- No claims of perfect output, zero edits, universal compatibility, or speed.
