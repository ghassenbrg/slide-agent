/**
 * A twelve-slide technical introduction, composed as a program.
 *
 *   slide-agent build --script examples/scripts/product-introduction.mjs \
 *     --output introduction.pptx --render --round-trip
 *
 * Worth reading for four things this file does that hand-placed coordinates
 * make expensive: components defined once and placed in loops (`node`, `pill`,
 * `title`), `slide.graph` letting the engine rank and route three different
 * diagrams, `slideChrome` with a light/dark variant, and a deliberately empty
 * slide because a sequence with no trough has no rhythm.
 */
import { defineDeck, columns, grid, inset, split } from "@slide-agent/core";

const C = {
  night: "070B12", panel: "101722", panel2: "162230", rule: "243646",
  ink: "EAF2F7", muted: "91A4B2",
  paper: "F4F7F9", paperInk: "0B1520", paperMuted: "566B78", paperRule: "CED9DF",
  cyan: "1187A6", cyanBright: "41D7FF",
  lime: "7FA80B", limeBright: "B9F227",
  mag: "C4256F", magBright: "FF5DA2",
  orange: "B0700B", orangeBright: "FFB547",
  green: "1F9E6B", greenBright: "56E39F",
};

const deck = defineDeck({
  brief: {
    title: "Slide-Agent",
    audience: "Technical and IT practitioners evaluating AI presentation tooling",
    objective: "Understand where Slide-Agent sits, trust the separation of design from production, and run a first deck",
    presentationType: "technical",
    tone: "precise, system-oriented, unhurried",
    language: "English",
    keyTopics: ["problem", "boundary", "workflow", "architecture", "integration", "pipeline", "install", "use", "outputs", "why"],
  },
  narrative: "By the end, a technical audience should treat a presentation as a build output: authored by a model, produced deterministically, and verified against evidence.",
  creativeDirection: {
    name: "Signal compiler",
    concept: "The deck behaves like an executable system map: intent enters, the engine produces, evidence leaves",
    rationale: "Technical audiences trust a system when its boundaries and intermediate representations are visible",
    geometryLanguage: "Long horizontal routes with square turns; surfaces only where something is a real component",
    spatialRhythm: "Graphite system slides alternate with paper slides that carry the artifacts and numbers",
    materialLanguage: "Night-mode console punctuated by paper inspection pages",
    palette: { background: C.night, surface: C.panel, ink: C.ink, muted: C.muted, accent: C.cyanBright, accentAlt: C.orangeBright, rule: C.rule },
    typography: { display: "Helvetica", heading: "Helvetica", body: "Helvetica", mono: "Menlo", scale: [54, 34, 20, 15, 11] },
    avoid: ["stock photography", "the same card grid twice", "decorative icons"],
  },
  sequencePlan: [
    { slideId: "cover", narrativeJob: "Name the product and its promise", dominantArtifact: "A route compiling into a file", silhouette: "Sparse title field, route entering from the right", energy: "quiet" },
    { slideId: "problem", narrativeJob: "Show why prompt-to-file is not enough", dominantArtifact: "One prompt fracturing into four failures", silhouette: "Narrow input left, noisy fan-out right", energy: "loud" },
    { slideId: "boundary", narrativeJob: "Define the product boundary", dominantArtifact: "Before and after either side of one contract", silhouette: "Two unequal halves bridged by a bright rule", energy: "medium" },
    { slideId: "loop", narrativeJob: "Explain the operating loop", dominantArtifact: "A six-stage flow with a return path", silhouette: "Wide horizontal route with a lower loop", energy: "loud" },
    { slideId: "pause", narrativeJob: "Let the argument land", dominantArtifact: "One sentence", silhouette: "Near-empty page with a single large line", energy: "silent" },
    { slideId: "architecture", narrativeJob: "Show the strata and who owns each", dominantArtifact: "Four labelled bands", silhouette: "Full-width horizontal strata on paper", energy: "medium" },
    { slideId: "hosts", narrativeJob: "Clarify which agents can drive it", dominantArtifact: "A hub with honest support levels", silhouette: "Central hub, asymmetric spokes", energy: "medium" },
    { slideId: "pipeline", narrativeJob: "Open the engine", dominantArtifact: "A vertical track of eight stages", silhouette: "Tall left rail against a quality gate", energy: "medium" },
    { slideId: "install", narrativeJob: "Make setup feel short", dominantArtifact: "One command and what appears", silhouette: "Oversized terminal band above four ports", energy: "quiet" },
    { slideId: "outputs", narrativeJob: "Show the range of forms", dominantArtifact: "A wall of six miniature decks", silhouette: "Gallery grid on paper", energy: "medium" },
    { slideId: "why", narrativeJob: "Summarise the engineering value", dominantArtifact: "Two owners resolving into one artifact", silhouette: "Two columns converging on a centre", energy: "quiet" },
    { slideId: "start", narrativeJob: "End with executable actions", dominantArtifact: "Three numbered commands", silhouette: "Three lines low on a mostly empty page", energy: "quiet" },
  ],
  slideChrome: {
    skipSlides: ["cover"],
    variants: {
      paper: { kicker: { color: "0C6178" }, number: { color: C.paperMuted }, brand: { color: C.paperMuted },
               footnote: { color: C.paperMuted }, rule: { fill: C.paperRule } },
    },
    elements: [
      { id: "kicker", type: "text", x: 0.66, y: 0.38, w: 7, h: 0.26, role: "eyebrow", text: "{{kicker}}",
        style: { fontSize: 11, bold: true, color: C.cyanBright, fontFace: "Menlo", charSpacing: 0.9 } },
      { id: "number", type: "text", x: 11.9, y: 0.38, w: 0.78, h: 0.26, role: "decorative", text: "{{slideNumberPadded}}",
        style: { fontSize: 11, bold: true, color: C.muted, align: "right", fontFace: "Menlo" } },
      { id: "rule", type: "shape", shape: "rect", x: 0.66, y: 6.92, w: 12.0, h: 0.008, role: "decorative",
        style: { fill: C.rule, lineWidth: 0 } },
      { id: "footnote", type: "text", x: 0.66, y: 7.0, w: 8, h: 0.24, role: "footer", text: "{{footnote}}",
        style: { fontSize: 11, color: C.muted, fontFace: "Menlo" } },
      { id: "brand", type: "text", x: 10.2, y: 7.0, w: 2.46, h: 0.24, role: "footer", text: "SLIDE-AGENT",
        style: { fontSize: 11, bold: true, color: C.muted, align: "right", fontFace: "Menlo" } },
    ],
  },
});

const PAGE = { x: 0.66, y: 1.95, w: 12.0, h: 4.7 };

function title(s, text, dark = true) {
  return s.text("title", text, {
    x: 0.66, y: 0.76, w: 11.0, h: 0.9, autoHeight: true,
    style: { fontSize: 34, bold: true, color: dark ? C.ink : C.paperInk, charSpacing: -0.6 },
    role: "title",
  });
}

/** A component card: surface, status bar, label, sub-label. */
function node(s, id, frame, label, sub, accent, dark = true) {
  s.shape(`${id}-box`, "roundRect", {
    ...frame,
    style: { fill: dark ? C.panel : "FFFFFF", lineColor: dark ? C.rule : "D5E0E5", lineWidth: 1 },
    role: "diagram-node",
  });
  s.shape(`${id}-bar`, "rect", { x: frame.x, y: frame.y, w: 0.07, h: frame.h, style: { fill: accent, lineWidth: 0 }, role: "decorative" });
  s.text(`${id}-label`, label, {
    x: frame.x + 0.26, y: frame.y + 0.14, w: frame.w - 0.44, h: 0.34,
    style: { fontSize: 20, bold: true, color: dark ? C.ink : C.paperInk },
    role: "diagram-label",
  });
  if (sub) {
    s.text(`${id}-sub`, sub, {
      x: frame.x + 0.26, y: frame.y + 0.56, w: frame.w - 0.44, h: 0.3, autoHeight: true,
      style: { fontSize: 15, color: dark ? C.muted : C.paperMuted },
      role: "caption",
    });
  }
  return `${id}-box`;
}

function pill(s, id, text, x, y, w, fill) {
  s.shape(`${id}-bg`, "roundRect", { x, y, w, h: 0.36, style: { fill, lineWidth: 0 } });
  s.text(`${id}-t`, text, {
    x: x + 0.1, y: y + 0.05, w: w - 0.2, h: 0.26,
    style: { fontSize: 11, bold: true, color: C.night, align: "center", fontFace: "Menlo" },
    role: "diagram-label",
  });
}

// ── 1 cover ────────────────────────────────────────────────────────────────
{
  const s = deck.slide({ id: "cover", title: "Slide-Agent", background: C.night,
    designIntent: "Make the product feel like infrastructure, not a template library.",
    communication: { audienceQuestion: "What is this?", claim: "Slide-Agent turns model-authored intent into editable, verified PowerPoint." } });

  pill(s, "badge", "AI PRESENTATION RUNTIME", 0.66, 0.66, 2.9, C.cyanBright);
  s.text("wordmark", "Slide-Agent", {
    x: 0.66, y: 2.0, w: 7.2, h: 1.2, autoHeight: true,
    style: { fontSize: 54, bold: true, color: C.ink, charSpacing: -1.6 }, role: "title",
  });
  s.text("sub", "The expressive PowerPoint canvas for AI agents.", {
    x: 0.66, y: 3.4, w: 6.2, h: 0.7, autoHeight: true,
    style: { fontSize: 20, color: C.muted, lineSpacingMultiple: 1.3 }, role: "subtitle",
  });
  s.text("value", "Models design. Slide-Agent builds, checks, renders, and revises.", {
    x: 0.66, y: 4.6, w: 6.0, h: 0.5, autoHeight: true,
    style: { fontSize: 15, color: C.ink }, role: "body",
  });
  s.line("underline", { x: 0.66, y: 5.5 }, { x: 3.8, y: 5.5 }, { style: { color: C.cyanBright, width: 2, arrow: false }, role: "decorative" });

  // The engine ranks and routes this; the port is drawn here.
  const ports = [
    ["BRIEF", C.magBright], ["SCENE", C.cyanBright], ["BUILD", C.limeBright],
    ["REVIEW", C.orangeBright], ["PPTX", C.greenBright],
  ];
  s.graph("route", {
    nodes: ports.map(([id]) => ({ id, w: 0.72, h: 0.72 })),
    edges: ports.slice(1).map(([id], i) => ({ from: ports[i][0], to: id })),
    frame: { x: 7.9, y: 1.5, w: 4.9, h: 4.9 },
    direction: "down",
    rankGap: 0.42,
  }, (n, f) => {
    const accent = ports.find(([id]) => id === n.id)[1];
    s.shape(`port-${n.id}`, "ellipse", { ...f, style: { fill: C.panel, lineColor: accent, lineWidth: 1.5 }, role: "diagram-node" });
    s.shape(`dot-${n.id}`, "ellipse", { x: f.x + 0.24, y: f.y + 0.24, w: 0.24, h: 0.24, style: { fill: accent, lineWidth: 0 }, role: "decorative" });
    s.text(`lbl-${n.id}`, n.id, {
      x: f.x + f.w + 0.26, y: f.y + 0.21, w: 2.0, h: 0.3,
      style: { fontSize: 11, bold: true, color: accent, fontFace: "Menlo", charSpacing: 0.8 }, role: "diagram-label",
    });
    return `port-${n.id}`;
  }, { edgeStyle: { color: C.rule, width: 1.6 } });

  s.text("proof", "EDITABLE · VALIDATED · PORTABLE", {
    x: 0.66, y: 6.98, w: 6, h: 0.26,
    style: { fontSize: 11, bold: true, color: C.muted, fontFace: "Menlo", charSpacing: 1 }, role: "footer",
  });
}

// ── 2 problem ──────────────────────────────────────────────────────────────
{
  const s = deck.slide({ id: "problem", title: "Prompt-to-deck still breaks at the last mile", background: C.night,
    chrome: { kicker: "THE PROBLEM", footnote: "AI CAN AUTHOR INTENT; IT STILL NEEDS A PRESENTATION RUNTIME" },
    communication: { audienceQuestion: "Why is this not solved?", claim: "A prompt produces a file, not a design that survives inspection." } });
  title(s, "Prompt-to-deck still breaks at the last mile");

  const failures = [
    ["Generic hierarchy", "the same slide, six times", C.magBright],
    ["Brittle diagrams", "arrows cross their own labels", C.orangeBright],
    ["Model-specific glue", "prompts become build code", C.magBright],
    ["No visual proof", "the file opens ≠ the deck works", C.orangeBright],
  ];
  s.graph("fracture", {
    nodes: [
      { id: "prompt", w: 2.9, h: 1.1 },
      ...failures.map(([label]) => ({ id: label, w: 3.5, h: 0.84 })),
    ],
    edges: failures.map(([label]) => ({ from: "prompt", to: label })),
    frame: { x: PAGE.x, y: 2.1, w: PAGE.w, h: 3.75 },
    nodeGap: 0.22,
  }, (n, f) => {
    if (n.id === "prompt") return node(s, "prompt", f, "“Make a deck”", "one ambiguous instruction", C.magBright);
    const spec = failures.find(([label]) => label === n.id);
    return node(s, `f-${n.order}`, f, spec[0], spec[1], spec[2]);
  }, { edgeStyle: { color: C.rule, width: 1.3, dashed: true } });

  s.text("close", "The missing layer is not more prose.", {
    x: PAGE.x, y: 5.6, w: 6.4, h: 0.44, autoHeight: true,
    style: { fontSize: 20, bold: true, color: C.ink }, role: "body",
  });
  s.text("close2", "It is a design-aware production loop with an artifact it can inspect.", {
    x: PAGE.x, y: 6.1, w: 9, h: 0.4, autoHeight: true,
    style: { fontSize: 15, color: C.cyanBright }, role: "body",
  });
}

// ── 3 boundary ─────────────────────────────────────────────────────────────
{
  const s = deck.slide({ id: "boundary", title: "One boundary absorbs the presentation machinery", background: C.paper,
    chrome: { kicker: "WHAT CHANGES", footnote: "ONE CONTRACT BETWEEN MODEL INTENT AND POWERPOINT", variant: "paper" },
    communication: { audienceQuestion: "What does the product actually do?", claim: "One versioned contract replaces per-model glue." } });
  title(s, "One boundary absorbs the presentation machinery", false);

  const [left, right] = split({ x: PAGE.x, y: 2.65, w: PAGE.w, h: 3.5 }, 0.46, 0.9);

  s.text("before-k", "BEFORE", { x: left.x, y: left.y - 0.42, w: 3, h: 0.26,
    style: { fontSize: 11, bold: true, color: C.mag, fontFace: "Menlo", charSpacing: 0.9 }, role: "eyebrow" });
  s.shape("before", "roundRect", { ...left, style: { fill: "FFFFFF", lineColor: "D8E0E5", lineWidth: 1 } });
  s.text("before-t", "Every model reinvents the machinery", {
    x: left.x + 0.3, y: left.y + 0.3, w: left.w - 0.6, h: 0.4, autoHeight: true,
    style: { fontSize: 20, bold: true, color: C.paperInk }, role: "body",
  });
  const hacks = ["layout prompt", "diagram prompt", "PPTX code", "repair prompt", "render script"];
  hacks.forEach((hack, i) => {
    const x = left.x + 0.3 + (i % 2) * 2.5;
    const y = left.y + 1.05 + Math.floor(i / 2) * 0.62;
    s.shape(`hack-${i}`, "roundRect", { x, y, w: 2.3, h: 0.48, style: { fill: "EEF3F6", lineColor: "D8E0E5", lineWidth: 1 } });
    s.text(`hack-t-${i}`, hack, { x: x + 0.12, y: y + 0.11, w: 2.06, h: 0.28,
      style: { fontSize: 11, color: C.paperMuted, align: "center", fontFace: "Menlo" }, role: "diagram-label" });
  });

  s.shape("bridge", "rect", { x: left.x + left.w + 0.38, y: left.y - 0.1, w: 0.05, h: left.h + 0.2, style: { fill: C.cyan, lineWidth: 0 }, role: "decorative" });

  s.text("after-k", "AFTER", { x: right.x, y: right.y - 0.42, w: 3, h: 0.26,
    style: { fontSize: 11, bold: true, color: "0C6178", fontFace: "Menlo", charSpacing: 0.9 }, role: "eyebrow" });
  s.shape("after", "roundRect", { ...right, style: { fill: C.paperInk, lineColor: C.paperInk, lineWidth: 1 } });
  const agent = node(s, "agent", { x: right.x + 0.3, y: right.y + 0.34, w: 2.6, h: 0.95 }, "Any AI agent", "authors intent", C.magBright);
  const runtime = node(s, "runtime", { x: right.x + 3.15, y: right.y + 0.34, w: 2.6, h: 0.95 }, "Slide-Agent", "contract + runtime", C.cyanBright);
  s.connect("bridge-edge", agent, runtime, { style: { color: C.cyanBright, width: 1.6 } });
  s.text("artifact-a", "scene.ndjson", { x: right.x + 0.3, y: right.y + 1.7, w: 2.6, h: 0.3,
    style: { fontSize: 15, bold: true, color: C.cyanBright, align: "center", fontFace: "Menlo" }, role: "diagram-label" });
  s.text("artifact-arrow", "→", { x: right.x + 2.95, y: right.y + 1.68, w: 0.4, h: 0.3,
    style: { fontSize: 15, color: C.muted, align: "center" }, role: "decorative" });
  s.text("artifact-b", "editable .pptx", { x: right.x + 3.15, y: right.y + 1.7, w: 2.6, h: 0.3,
    style: { fontSize: 15, bold: true, color: C.limeBright, align: "center", fontFace: "Menlo" }, role: "diagram-label" });
  s.text("after-cap", "One contract. Consistent output. Model freedom preserved.", {
    x: right.x + 0.3, y: right.y + 2.5, w: right.w - 0.6, h: 0.6, autoHeight: true,
    style: { fontSize: 15, color: C.ink, lineSpacingMultiple: 1.3 }, role: "body",
  });
}

// ── 4 loop ─────────────────────────────────────────────────────────────────
{
  const s = deck.slide({ id: "loop", title: "A closed loop turns intent into a deck you can trust", background: C.night,
    chrome: { kicker: "HOW IT WORKS", footnote: "AUTHOR → BUILD → SEE → FIX → PROVE" },
    communication: { audienceQuestion: "What is the operating loop?", claim: "The render is evidence, not an afterthought." } });
  title(s, "A closed loop turns intent into a deck you can trust");

  const stages = [
    ["REQUEST", "brief + constraints", C.magBright],
    ["AGENT", "story + art direction", C.cyanBright],
    ["SCENE", "editable blueprint", C.cyanBright],
    ["BUILD", "compose + OOXML", C.limeBright],
    ["VERIFY", "render + validate", C.orangeBright],
    ["OUTPUT", "PPTX + artifacts", C.greenBright],
  ];
  const cells = columns({ x: PAGE.x, y: 2.35, w: PAGE.w, h: 1.15 }, stages.length, 0.2);
  const ids = stages.map(([label, sub, accent], i) => node(s, `st${i}`, cells[i], label, sub, accent));
  ids.slice(1).forEach((id, i) => s.connect(`e${i}`, ids[i], id, { style: { color: stages[i + 1][2], width: 1.6 } }));

  s.shape("feedback", "roundRect", { x: 4.0, y: 4.55, w: 5.3, h: 0.92, style: { fill: C.panel2, lineColor: C.orangeBright, lineWidth: 1.2 } });
  s.text("feedback-k", "PATCH THE NAMED ELEMENT", { x: 4.2, y: 4.72, w: 4.9, h: 0.28,
    style: { fontSize: 11, bold: true, color: C.orangeBright, align: "center", fontFace: "Menlo", charSpacing: 0.8 }, role: "diagram-label" });
  s.text("feedback-t", "revise one slide without regenerating the deck", { x: 4.2, y: 5.05, w: 4.9, h: 0.3,
    style: { fontSize: 15, color: C.ink, align: "center" }, role: "caption" });
  s.connect("loop-in", ids[4], "feedback", { style: { color: C.orangeBright, width: 1.4, dashed: true } });
  s.connect("loop-out", "feedback", ids[2], { style: { color: C.orangeBright, width: 1.4, dashed: true } });

  s.text("close", "The render is evidence — not an afterthought.", {
    x: PAGE.x, y: 6.1, w: 8, h: 0.4, autoHeight: true,
    style: { fontSize: 20, bold: true, color: C.ink }, role: "body",
  });
}

// ── 4b pause ───────────────────────────────────────────────────────────────
// A trough on purpose. Every slide either side of this one carries a system
// diagram; without somewhere for the eye to rest, the sequence reads as one
// continuous density and the argument stops landing.
{
  const s = deck.slide({ id: "pause", title: "A deck nobody looked at is a draft", kind: "section", background: C.night,
    chrome: { kicker: "THE POINT", footnote: "WHATEVER THE REPORT SAYS" },
    communication: { audienceQuestion: "What is the one thing to remember?", claim: "Evidence, not assertion, is what makes a deck finished." } });
  s.text("statement", "A deck nobody looked at\nis a draft.", {
    x: 0.66, y: 2.6, w: 11.0, h: 2.2,
    style: { fontSize: 54, bold: true, color: C.ink, charSpacing: -1.6, lineSpacingMultiple: 1.12 },
    role: "title",
  });
  s.line("mark", { x: 0.66, y: 5.3 }, { x: 3.2, y: 5.3 }, { style: { color: C.orangeBright, width: 2.5, arrow: false }, role: "decorative" });
}

// ── 5 architecture ─────────────────────────────────────────────────────────
{
  const s = deck.slide({ id: "architecture", title: "The contract is the product surface; the engine is the runtime", background: C.paper,
    chrome: { kicker: "ARCHITECTURE", footnote: "EVERY ELEMENT PASSES THROUGH ELEMENTWRITER AND ENTERS THE MANIFEST", variant: "paper" },
    communication: { audienceQuestion: "How is it structured?", claim: "One versioned contract is delivered through every host." } });
  title(s, "The contract is the product surface; the engine is the runtime", false);

  const strata = [
    ["HOSTS", ["Skill", "MCP", "CLI", "TypeScript", "VS Code"], "FFFFFF", C.paperInk],
    ["CONTRACT", ["schemas", "authoring guide", "capabilities", "scene/1"], C.paperInk, C.ink],
    ["ENGINE", ["validate", "design", "compose", "write", "verify", "repair", "score"], "FFFFFF", C.paperInk],
    ["ARTIFACTS", ["deck.pptx", "scene.ndjson", "manifest", "validation", "previews"], "FFF3E4", C.paperInk],
  ];
  const bands = [];
  strata.forEach(([label, items, fill, ink], row) => {
    const y = 2.15 + row * 1.16;
    s.text(`band-k-${row}`, label, { x: PAGE.x, y: y + 0.32, w: 1.5, h: 0.28,
      style: { fontSize: 11, bold: true, color: C.paperMuted, fontFace: "Menlo", charSpacing: 0.8 }, role: "eyebrow" });
    const band = { x: PAGE.x + 1.65, y, w: PAGE.w - 1.65, h: 0.92 };
    s.shape(`band-${row}`, "roundRect", { ...band, style: { fill, lineColor: row === 1 ? C.paperInk : "C8D5DC", lineWidth: 1 }, role: "diagram-node" });
    bands.push(`band-${row}`);
    const cells = columns(inset(band, { left: 0.2, right: 0.2, top: 0.22, bottom: 0.22 }), items.length, 0.16);
    items.forEach((item, i) => {
      s.text(`band-${row}-i-${i}`, item, { ...cells[i],
        style: { fontSize: 15, bold: row === 1, color: ink, align: "center", fontFace: row === 1 ? "Menlo" : "Helvetica" }, role: "diagram-label" });
    });
  });
  bands.slice(1).forEach((id, i) => s.connect(`strata-${i}`, bands[i], id, { style: { color: i === 2 ? C.orange : C.cyan, width: 1.5 } }));
}

// ── 6 hosts ────────────────────────────────────────────────────────────────
{
  const s = deck.slide({ id: "hosts", title: "Different agents read the same contract", background: C.night,
    chrome: { kicker: "AGENT INTEGRATION", footnote: "INTEGRATION CHANGES; THE AUTHORING CONTRACT DOES NOT" },
    communication: { audienceQuestion: "Which agents can drive it?", claim: "Support levels are labelled honestly." } });
  title(s, "Different agents read the same contract");

  const hosts = [
    ["Codex", "agent skill", C.greenBright], ["Claude Code", "agent skill", C.greenBright],
    ["MCP clients", "Cursor · Zed · …", C.greenBright], ["VS Code", "language model API", C.greenBright],
    ["CLI agents", "any tool-capable model", C.greenBright],
    ["Copilot CLI", "best-effort", C.orangeBright], ["Gemini CLI", "experimental · use MCP", C.magBright],
  ];
  // Ranked as a hub between two columns: four hosts feed in, three read out.
  const inbound = hosts.slice(0, 4).map(([label]) => label);
  s.graph("hosts", {
    nodes: [
      ...hosts.map(([label]) => ({ id: label, w: 3.15, h: 0.86, rank: inbound.includes(label) ? 0 : 2 })),
      { id: "contract", w: 2.6, h: 2.6, rank: 1 },
    ],
    edges: hosts.map(([label]) => inbound.includes(label)
      ? { from: label, to: "contract" }
      : { from: "contract", to: label }),
    frame: { x: PAGE.x, y: 2.0, w: PAGE.w, h: 3.85 },
    nodeGap: 0.2,
  }, (n, f) => {
    if (n.id === "contract") {
      s.shape("hub", "ellipse", { ...f, style: { fill: C.panel2, lineColor: C.cyanBright, lineWidth: 1.5 } });
      s.text("hub-t", "SLIDE-AGENT", { x: f.x, y: f.y + 0.98, w: f.w, h: 0.3,
        style: { fontSize: 15, bold: true, color: C.ink, align: "center", fontFace: "Menlo", charSpacing: 0.8 }, role: "diagram-label" });
      s.text("hub-s", "contract", { x: f.x, y: f.y + 1.3, w: f.w, h: 0.3,
        style: { fontSize: 15, color: C.cyanBright, align: "center" }, role: "diagram-label" });
      return "hub";
    }
    const spec = hosts.find(([label]) => label === n.id);
    return node(s, `h${n.rank}-${n.order}`, f, spec[0], spec[1], spec[2]);
  }, { edgeStyleFor: (edge) => {
    const spec = hosts.find(([label]) => label === edge.to || label === edge.from);
    const provisional = spec[2] !== C.greenBright;
    return { color: spec[2], width: 1.4, dashed: provisional };
  } });

  pill(s, "lg-v", "VERIFIED", PAGE.x, 6.06, 1.5, C.greenBright);
  pill(s, "lg-b", "BEST-EFFORT", PAGE.x + 1.65, 6.06, 1.75, C.orangeBright);
  pill(s, "lg-e", "EXPERIMENTAL", PAGE.x + 3.55, 6.06, 1.9, C.magBright);
  s.text("mcp-fact", "MCP publishes 9 tools · 21 resources · 2 prompts", {
    x: 7.2, y: 6.12, w: 5.46, h: 0.3,
    style: { fontSize: 15, bold: true, color: C.cyanBright, align: "right", fontFace: "Menlo" }, role: "body",
  });
}

// ── 7 pipeline ─────────────────────────────────────────────────────────────
{
  const s = deck.slide({ id: "pipeline", title: "Generation is a sequence of design decisions", background: C.paper,
    chrome: { kicker: "INSIDE THE PIPELINE", footnote: "LOOK AT WHAT YOU BUILT · THEN FIX THE SPECIFIC DEFECT", variant: "paper" },
    communication: { audienceQuestion: "What happens inside?", claim: "Every stage is a decision the author can inspect." } });
  title(s, "Generation is a sequence of design decisions", false);

  const stages = [
    ["Understand", "audience · outcome", "A81757"], ["Structure", "claims · sources", "0C6178"],
    ["Story", "sequence · tension", "0C6178"], ["Art direct", "palette · type · motifs", "4E6A05"],
    ["Compose", "native elements · diagrams", "4E6A05"], ["Build", "PPTX + artifact graph", "116045"],
    ["Verify", "render · text fidelity", "8A5708"], ["Patch", "named element · exact slide", "A81757"],
  ];
  s.shape("track", "rect", { x: PAGE.x + 0.3, y: 2.2, w: 0.045, h: 4.0, style: { fill: "B7C7D0", lineWidth: 0 }, role: "decorative" });
  stages.forEach(([label, sub, accent], i) => {
    const y = 2.15 + i * 0.5;
    s.shape(`dot-${i}`, "ellipse", { x: PAGE.x + 0.14, y, w: 0.38, h: 0.38, style: { fill: accent, lineWidth: 0 }, role: "diagram-node" });
    s.text(`num-${i}`, String(i + 1), { x: PAGE.x + 0.14, y: y + 0.07, w: 0.38, h: 0.26,
      style: { fontSize: 11, bold: true, color: C.paper, align: "center", fontFace: "Menlo" }, role: "diagram-label" });
    s.text(`stg-${i}`, label, { x: PAGE.x + 0.78, y: y + 0.02, w: 2.6, h: 0.32,
      style: { fontSize: 20, bold: true, color: C.paperInk }, role: "body" });
    s.text(`sub-${i}`, sub, { x: PAGE.x + 3.5, y: y + 0.07, w: 3.6, h: 0.28,
      style: { fontSize: 15, color: C.paperMuted }, role: "caption" });
  });

  s.shape("gate", "roundRect", { x: 8.5, y: 2.15, w: 4.16, h: 2.7, style: { fill: C.paperInk, lineWidth: 0 } });
  s.text("gate-k", "QUALITY GATE", { x: 8.8, y: 2.45, w: 3.5, h: 0.28,
    style: { fontSize: 11, bold: true, color: C.orangeBright, fontFace: "Menlo", charSpacing: 0.8 }, role: "eyebrow" });
  s.text("gate-q", "Can the audience see what the model intended?", {
    x: 8.8, y: 2.85, w: 3.56, h: 1.2, autoHeight: true,
    style: { fontSize: 20, bold: true, color: C.ink, lineSpacingMultiple: 1.2 }, role: "body",
  });
  s.text("gate-a", "If not: patch, render, compare.", { x: 8.8, y: 4.35, w: 3.56, h: 0.3,
    style: { fontSize: 15, color: C.muted }, role: "caption" });
  s.text("hash", "review.json is hash-bound to the exact PPTX", {
    x: 8.5, y: 5.15, w: 4.16, h: 0.5, autoHeight: true,
    style: { fontSize: 15, bold: true, color: C.cyan, align: "right", fontFace: "Menlo" }, role: "body",
  });
}

// ── 8 install ──────────────────────────────────────────────────────────────
{
  const s = deck.slide({ id: "install", title: "One command installs the CLI, MCP server, and agent skill", background: C.night,
    chrome: { kicker: "INSTALLATION", footnote: "NO CLONE · NO SUDO · NO ADMIN-OWNED NPM PREFIX" },
    communication: { audienceQuestion: "How do I get it?", claim: "One command, one hard requirement." } });
  title(s, "One command installs the CLI, MCP server, and agent skill");

  s.shape("terminal", "roundRect", { x: PAGE.x, y: 2.2, w: PAGE.w, h: 1.35, style: { fill: "0D141E", lineColor: C.rule, lineWidth: 1 } });
  s.text("dollar", "$", { x: PAGE.x + 0.32, y: 2.55, w: 0.3, h: 0.4,
    style: { fontSize: 20, bold: true, color: C.limeBright, fontFace: "Menlo" }, role: "decorative" });
  s.text("cmd", "npx --yes --package @slide-agent/core@latest -- slide-agent install", {
    x: PAGE.x + 0.7, y: 2.52, w: PAGE.w - 1.0, h: 0.45,
    style: { fontSize: 20, bold: true, color: C.ink, fontFace: "Menlo" }, role: "body",
  });
  s.text("req", "Node.js 22.12+ is the only hard requirement", {
    x: PAGE.x + 0.7, y: 3.02, w: 6, h: 0.3,
    style: { fontSize: 11, color: C.muted, fontFace: "Menlo" }, role: "caption",
  });

  const installed = [
    ["~/.local/bin/slide-agent", "user-local CLI", C.cyanBright],
    ["slide-agent-mcp", "stdio MCP server", C.magBright],
    ["agent skill registration", "supported hosts", C.limeBright],
    ["slide-agent doctor", "verification report", C.orangeBright],
  ];
  const cells = columns({ x: PAGE.x, y: 4.1, w: PAGE.w, h: 1.2 }, installed.length, 0.3);
  installed.forEach(([what, why, accent], i) => {
    const cell = cells[i];
    s.shape(`ins-${i}`, "ellipse", { x: cell.x, y: cell.y, w: 0.44, h: 0.44, style: { fill: accent, lineWidth: 0 }, role: "diagram-node" });
    s.text(`ins-n-${i}`, String(i + 1), { x: cell.x, y: cell.y + 0.09, w: 0.44, h: 0.28,
      style: { fontSize: 11, bold: true, color: C.night, align: "center", fontFace: "Menlo" }, role: "diagram-label" });
    s.text(`ins-t-${i}`, what, { x: cell.x, y: cell.y + 0.62, w: cell.w, h: 0.3,
      style: { fontSize: 15, bold: true, color: C.ink, fontFace: "Menlo" }, role: "body" });
    s.text(`ins-s-${i}`, why, { x: cell.x, y: cell.y + 1.0, w: cell.w, h: 0.28,
      style: { fontSize: 15, color: C.muted }, role: "caption" });
  });

  s.shape("optional-rule", "rect", { x: PAGE.x, y: 5.95, w: PAGE.w, h: 0.008, style: { fill: C.rule, lineWidth: 0 }, role: "decorative" });
  s.text("optional", "Optional render stack", { x: PAGE.x, y: 6.15, w: 2.8, h: 0.3,
    style: { fontSize: 15, bold: true, color: C.ink }, role: "body" });
  s.text("optional-d", "LibreOffice + Poppler → true PDF and PNG previews", { x: PAGE.x + 3.0, y: 6.15, w: 5.4, h: 0.3,
    style: { fontSize: 15, color: C.cyanBright }, role: "body" });
  s.text("optional-f", "Without them: schematic previews", { x: 9.0, y: 6.15, w: 3.66, h: 0.3,
    style: { fontSize: 15, color: C.muted, align: "right" }, role: "caption" });
}

// ── 9 outputs ──────────────────────────────────────────────────────────────
{
  const s = deck.slide({ id: "outputs", title: "The canvas changes with the communication job", background: C.paper,
    chrome: { kicker: "WHAT IT CAN GENERATE", footnote: "16:9 · 4:3 · 9:16 · A4 LANDSCAPE · A4 PORTRAIT", variant: "paper" },
    communication: { audienceQuestion: "What kinds of deck?", claim: "The form follows the communication job, not a template." } });
  title(s, "The canvas changes with the communication job", false);

  const kinds = [
    ["EXECUTIVE", "one decision dominates", C.mag, true],
    ["ARCHITECTURE", "layers + interfaces", C.cyan, false],
    ["PROJECT UPDATE", "status + critical path", C.lime, true],
    ["PRODUCT", "story + proof", C.orange, false],
    ["DATA-HEAVY", "native charts + tables", C.green, true],
    ["DIAGRAM-FIRST", "sequence · swimlane", C.cyan, false],
  ];
  // Accents legible on white; the bright variants are for the dark cards.
  const darkInk = { [C.mag]: "A81757", [C.cyan]: "0C6178", [C.lime]: "5C7A08", [C.orange]: "8A5708", [C.green]: "167750" };
  const cells = grid({ x: PAGE.x, y: 2.1, w: PAGE.w, h: 4.5 }, { columns: 3, rows: 2, gap: 0.34, rowGap: 0.34 });
  kinds.forEach(([kicker, label, accent, dark], i) => {
    const cell = cells[i];
    const bright = { [C.mag]: C.magBright, [C.cyan]: C.cyanBright, [C.lime]: C.limeBright, [C.orange]: C.orangeBright, [C.green]: C.greenBright }[accent];
    s.shape(`k-${i}`, "roundRect", { ...cell, style: { fill: dark ? C.panel : "FFFFFF", lineColor: "CBD6DC", lineWidth: 1 } });
    s.shape(`k-r-${i}`, "rect", { x: cell.x + 0.24, y: cell.y + 0.24, w: 0.62, h: 0.055, style: { fill: dark ? bright : accent, lineWidth: 0 }, role: "decorative" });
    s.text(`k-k-${i}`, kicker, { x: cell.x + 0.24, y: cell.y + 0.44, w: cell.w - 0.48, h: 0.28,
      style: { fontSize: 11, bold: true, color: dark ? bright : darkInk[accent], fontFace: "Menlo", charSpacing: 0.8 }, role: "eyebrow" });
    s.text(`k-t-${i}`, label, { x: cell.x + 0.24, y: cell.y + 0.76, w: cell.w - 0.48, h: 0.36, autoHeight: true,
      style: { fontSize: 20, bold: true, color: dark ? C.ink : C.paperInk }, role: "body" });

    const art = inset({ x: cell.x, y: cell.y + 1.3, w: cell.w, h: cell.h - 1.55 }, { left: 0.24, right: 0.24 });
    if (i === 0) {
      s.text(`v-${i}`, "01", { x: art.x, y: art.y, w: 1.2, h: 0.7,
        style: { fontSize: 34, bold: true, color: bright }, role: "body" });
      s.text(`v2-${i}`, "DECIDE", { x: art.x + 1.3, y: art.y + 0.22, w: 2, h: 0.3,
        style: { fontSize: 15, bold: true, color: C.ink, fontFace: "Menlo" }, role: "body" });
    } else if (i === 2) {
      s.shape(`tr-${i}`, "rect", { x: art.x + 0.1, y: art.y + 0.28, w: art.w - 0.6, h: 0.07, style: { fill: "233747", lineWidth: 0 }, role: "decorative" });
      [0, 1, 2, 3].forEach((j) => s.shape(`md-${i}-${j}`, "ellipse", {
        x: art.x + j * ((art.w - 0.5) / 3), y: art.y + 0.14, w: 0.36, h: 0.36,
        style: { fill: j < 3 ? bright : C.orangeBright, lineWidth: 0 } }));
    } else if (i === 4) {
      [0.34, 0.74, 0.52, 0.95, 0.64].forEach((v, j) => s.shape(`bar-${i}-${j}`, "rect", {
        x: art.x + j * 0.58, y: art.y + art.h - v * art.h, w: 0.36, h: v * art.h,
        style: { fill: bright, lineWidth: 0 }, role: "decorative" }));
    } else {
      const steps = columns({ ...art, h: 0.46 }, 3, 0.26);
      const stepIds = steps.map((step, j) => {
        s.shape(`mn-${i}-${j}`, "roundRect", { ...step,
          style: { fill: dark ? "1B2740" : "E8F6FA", lineColor: dark ? bright : accent, lineWidth: 0.9 }, role: "diagram-node" });
        return `mn-${i}-${j}`;
      });
      stepIds.slice(1).forEach((id, j) => s.connect(`mne-${i}-${j}`, stepIds[j], id, { route: "straight", style: { color: dark ? bright : accent, width: 1.1 } }));
    }
  });
}

// ── 10 why ─────────────────────────────────────────────────────────────────
{
  const s = deck.slide({ id: "why", title: "Creative freedom and deterministic assurance coexist", background: C.night,
    chrome: { kicker: "WHY SLIDE-AGENT", footnote: "THE ENGINE DOES NOT IMPOSE A HOUSE STYLE" },
    communication: { audienceQuestion: "Why this and not a template tool?", claim: "The model owns design; the engine owns production and proof." } });
  title(s, "Creative freedom and deterministic assurance coexist");

  s.text("model-k", "MODEL OWNS", { x: PAGE.x, y: 2.5, w: 3, h: 0.28,
    style: { fontSize: 11, bold: true, color: C.magBright, fontFace: "Menlo", charSpacing: 0.9 }, role: "eyebrow" });
  s.text("model-t", "story\nvisual thesis\ncomposition", { x: PAGE.x, y: 2.9, w: 3.4, h: 1.6,
    style: { fontSize: 20, bold: true, color: C.ink, lineSpacingMultiple: 1.5 }, role: "body" });

  s.text("engine-k", "ENGINE OWNS", { x: 9.26, y: 2.5, w: 3.4, h: 0.28,
    style: { fontSize: 11, bold: true, color: C.cyanBright, align: "right", fontFace: "Menlo", charSpacing: 0.9 }, role: "eyebrow" });
  s.text("engine-t", "schema\npackage\nrender evidence", { x: 9.26, y: 2.9, w: 3.4, h: 1.6,
    style: { fontSize: 20, bold: true, color: C.ink, align: "right", lineSpacingMultiple: 1.5 }, role: "body" });

  s.shape("core", "ellipse", { x: 4.85, y: 2.3, w: 3.6, h: 2.6, style: { fill: C.panel2, lineColor: C.cyanBright, lineWidth: 1.5 } });
  s.text("core-1", "EDITABLE", { x: 4.85, y: 2.95, w: 3.6, h: 0.32,
    style: { fontSize: 15, bold: true, color: C.limeBright, align: "center", fontFace: "Menlo", charSpacing: 1 }, role: "diagram-label" });
  s.text("core-2", "POWERPOINT", { x: 4.85, y: 3.35, w: 3.6, h: 0.5,
    style: { fontSize: 20, bold: true, color: C.ink, align: "center" }, role: "diagram-label" });
  s.text("core-3", "with a proof loop", { x: 4.85, y: 3.9, w: 3.6, h: 0.3,
    style: { fontSize: 15, color: C.muted, align: "center" }, role: "caption" });

  const benefits = ["MODEL-AGNOSTIC", "DESIGN-AWARE", "DIAGRAM-CAPABLE", "REUSABLE", "EXTENSIBLE", "DEVELOPER-FRIENDLY"];
  const colors = [C.magBright, C.cyanBright, C.limeBright, C.greenBright, C.orangeBright, C.cyanBright];
  const widths = [1.9, 1.75, 2.05, 1.5, 1.7, 2.35];
  let x = PAGE.x;
  benefits.forEach((benefit, i) => {
    pill(s, `bn-${i}`, benefit, x, 5.6, widths[i], colors[i]);
    x += widths[i] + 0.16;
  });
}

// ── 11 start ───────────────────────────────────────────────────────────────
{
  const s = deck.slide({ id: "start", title: "Install it, verify it, ask for the first deck", background: C.paper,
    chrome: { kicker: "GET STARTED", footnote: "START A NEW AGENT CHAT AFTER INSTALL SO THE SKILL IS DISCOVERED", variant: "paper" },
    communication: { audienceQuestion: "What do I do next?", claim: "Three commands and a request in plain language.", action: "Install, run doctor, ask." } });
  title(s, "Install it, verify it, ask for the first deck", false);

  const steps = [
    ["INSTALL", "npx --yes --package @slide-agent/core@latest -- slide-agent install", C.cyan, true],
    ["VERIFY", "slide-agent doctor --deep", "5C7A08", true],
    ["ASK", "“Make me a technical deck on…”", C.mag, false],
  ];
  steps.forEach(([kicker, text, accent, mono], i) => {
    const y = 2.3 + i * 1.05;
    s.shape(`sn-${i}`, "ellipse", { x: PAGE.x, y, w: 0.62, h: 0.62, style: { fill: accent, lineWidth: 0 } });
    s.text(`sn-n-${i}`, String(i + 1), { x: PAGE.x, y: y + 0.15, w: 0.62, h: 0.34,
      style: { fontSize: 20, bold: true, color: C.paper, align: "center", fontFace: "Menlo" }, role: "diagram-label" });
    s.text(`sn-k-${i}`, kicker, { x: PAGE.x + 0.95, y: y + 0.02, w: 2, h: 0.28,
      style: { fontSize: 11, bold: true, color: C.paperMuted, fontFace: "Menlo", charSpacing: 0.9 }, role: "eyebrow" });
    s.text(`sn-t-${i}`, text, { x: PAGE.x + 0.95, y: y + 0.34, w: 9.5, h: 0.36, autoHeight: true,
      style: { fontSize: mono ? 15 : 20, bold: true, color: C.paperInk, fontFace: mono ? "Menlo" : "Helvetica" }, role: "body" });
  });

  s.shape("repo", "roundRect", { x: 8.4, y: 5.65, w: 4.26, h: 0.9, style: { fill: C.paperInk, lineWidth: 0 } });
  s.text("repo-u", "github.com/ghassenbrg/slide-agent", { x: 8.6, y: 5.83, w: 3.86, h: 0.3,
    style: { fontSize: 15, bold: true, color: C.cyanBright, align: "center", fontFace: "Menlo" }, role: "body" });
  s.text("repo-m", "MIT · @slide-agent/core", { x: 8.6, y: 6.14, w: 3.86, h: 0.26,
    style: { fontSize: 11, color: C.muted, align: "center", fontFace: "Menlo" }, role: "caption" });
  s.text("close", "Your AI designs.\nSlide-Agent makes it real.", {
    x: PAGE.x, y: 5.7, w: 6.4, h: 0.9,
    style: { fontSize: 20, bold: true, color: C.paperInk, lineSpacingMultiple: 1.35 }, role: "body",
  });
}

export default deck;
