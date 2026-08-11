/**
 * A deck composed as a program.
 *
 *   slide-agent build --script examples/scripts/rollout-deck.mjs \
 *     --output rollout.pptx --render --round-trip
 *
 * Everything visual here is authored by this file: the palette, the type
 * ladder, the shape of a stage card, what the chrome carries. Slide Agent
 * supplies no components and no house style — it supplies the arithmetic
 * (`columns`, `grid`, `measureText`) and the production loop.
 *
 * The point of the form is that a repeated object is written once. `stage()`
 * and `metric()` below are this deck's own components; six stages on an even
 * rhythm are a loop over a data table, not thirty-six hand-placed records.
 */
import { defineDeck, columns, grid } from "@slide-agent/core";

const C = {
  night: "0B1020",
  panel: "141C2F",
  rule: "2D3850",
  ink: "F6F7FB",
  muted: "9CA9BF",
  paper: "F4F6FA",
  paperInk: "111827",
  paperMuted: "5A6B78",
  trace: "35D0BA",
  traceInk: "0F6F62",
  warn: "FF9D57",
  warnInk: "9A5B12",
};

const deck = defineDeck({
  brief: {
    title: "Zero-trust rollout",
    audience: "Security and platform leads",
    objective: "Approve a four-wave rollout and the controls that gate it",
    presentationType: "technical",
    tone: "precise, unhurried, evidence-first",
    language: "English",
    keyTopics: ["current exposure", "target state", "wave plan", "decision"],
  },
  narrative: "By the end, the group should approve a phased rollout because each wave is gated on evidence rather than on a date.",
  creativeDirection: {
    name: "Signal trace",
    concept: "A single route runs through the deck: exposure enters, controls gate it, a decision leaves",
    geometryLanguage: "Long horizontal runs and square turns; surfaces only where something is a component",
    spatialRhythm: "Dark system slides alternate with paper slides that hold the numbers",
    palette: { background: C.night, surface: C.panel, ink: C.ink, muted: C.muted, accent: C.trace, accentAlt: C.warn, rule: C.rule },
    typography: {
      display: "Helvetica",
      body: "Helvetica",
      mono: "Menlo",
      // The ladder this deck commits to. Anything off it is reported.
      scale: [46, 32, 20, 15, 11],
    },
    avoid: ["stock photography", "the same card grid twice"],
  },
  // Written once, drawn on every slide but the cover.
  slideChrome: {
    skipSlides: ["cover"],
    // Declared once, then re-coloured for the paper slides. A kicker legible
    // on graphite is invisible on paper, and pacing the deck light against
    // dark should not cost the deck its chrome.
    variants: {
      paper: {
        kicker: { color: C.traceInk },
        number: { color: C.paperMuted },
        brand: { color: C.paperMuted },
      },
    },
    elements: [
      {
        id: "kicker", type: "text", x: 0.72, y: 0.42, w: 7, h: 0.28, role: "eyebrow",
        text: "{{kicker}}",
        style: { fontSize: 11, bold: true, color: C.trace, fontFace: "Menlo", charSpacing: 0.8 },
      },
      {
        id: "number", type: "text", x: 11.9, y: 0.44, w: 0.7, h: 0.26, role: "decorative",
        text: "{{slideNumberPadded}} / {{slideCount}}",
        style: { fontSize: 11, bold: true, color: C.muted, align: "right", fontFace: "Menlo" },
      },
      {
        id: "brand", type: "text", x: 9.6, y: 6.96, w: 3, h: 0.26, role: "footer",
        text: "{{deckTitle}}",
        style: { fontSize: 11, bold: true, color: C.muted, align: "right", fontFace: "Menlo" },
      },
    ],
  },
});

const PAGE = { x: 0.72, y: 1.9, w: 11.9, h: 4.8 };

/** This deck's stage card: a surface, a status bar, a label, a sub-label. */
function stage(slide, id, frame, label, sub, accent) {
  const radius = 0.08;
  slide.shape(`${id}-box`, "roundRect", {
    ...frame,
    style: { fill: C.panel, lineColor: C.rule, lineWidth: 1, radius },
    role: "diagram-node",
  });
  // Inset the bar within the box's straight edge so its square corners never cross the box's rounded ones.
  slide.shape(`${id}-bar`, "rect", {
    x: frame.x, y: frame.y + radius, w: 0.07, h: frame.h - radius * 2,
    style: { fill: accent, lineWidth: 0 },
    role: "decorative",
  });
  slide.text(`${id}-label`, label, {
    x: frame.x + 0.24, y: frame.y + 0.16, w: frame.w - 0.4, h: 0.36,
    style: { fontSize: 20, bold: true, color: C.ink },
    role: "diagram-label",
  });
  slide.text(`${id}-sub`, sub, {
    x: frame.x + 0.24, y: frame.y + 0.58, w: frame.w - 0.4, h: 0.34, autoHeight: true,
    style: { fontSize: 15, color: C.muted },
    role: "caption",
  });
  return `${id}-box`;
}

/** A number and what it means, for the paper slides. */
function metric(slide, id, frame, value, label, note, accent) {
  slide.text(`${id}-value`, value, {
    x: frame.x, y: frame.y, w: frame.w, h: 0.8,
    style: { fontSize: 46, bold: true, color: accent, charSpacing: -1 },
    role: "body",
  });
  slide.text(`${id}-label`, label, {
    x: frame.x, y: frame.y + 0.86, w: frame.w, h: 0.32,
    style: { fontSize: 20, bold: true, color: C.paperInk },
    role: "body",
  });
  slide.text(`${id}-note`, note, {
    x: frame.x, y: frame.y + 1.24, w: frame.w, h: 0.4, autoHeight: true,
    style: { fontSize: 15, color: C.paperMuted, lineSpacingMultiple: 1.25 },
    role: "caption",
  });
}

function title(slide, text, dark = true) {
  slide.text("title", text, {
    x: 0.72, y: 0.86, w: 11, h: 0.9, autoHeight: true,
    style: { fontSize: 32, bold: true, color: dark ? C.ink : C.paperInk, charSpacing: -0.5 },
    role: "title",
  });
}

// 1 — Cover. No chrome: a page number on a cover is furniture nobody asked for.
{
  const s = deck.slide({
    id: "cover",
    title: "Zero-trust rollout",
    background: C.night,
    communication: { audienceQuestion: "What are we being asked to decide?", claim: "A four-wave rollout, gated on evidence." },
  });
  s.text("eyebrow", "DECISION BRIEF", {
    x: 0.72, y: 2.4, w: 6, h: 0.3,
    style: { fontSize: 11, bold: true, color: C.trace, fontFace: "Menlo", charSpacing: 1.2 },
    role: "eyebrow",
  });
  s.text("deck-title", "Zero-trust rollout", {
    x: 0.72, y: 2.9, w: 9, h: 1.1, autoHeight: true,
    style: { fontSize: 46, bold: true, color: C.ink, charSpacing: -1.4 },
    role: "title",
  });
  s.text("deck-sub", "Four waves. Each one gated on evidence, not on a date.", {
    x: 0.72, y: 4.15, w: 8, h: 0.5, autoHeight: true,
    style: { fontSize: 20, color: C.muted },
    role: "subtitle",
  });
  s.line("underline", { x: 0.72, y: 5.1 }, { x: 4.4, y: 5.1 }, {
    style: { color: C.trace, width: 2, arrow: false }, role: "decorative",
  });
}

// 2 — The route. One loop, six cards, five routed edges.
{
  const s = deck.slide({
    id: "route",
    title: "Every wave clears the same four gates",
    background: C.night,
    chrome: { kicker: "How the rollout runs" },
    communication: { audienceQuestion: "How does a wave actually proceed?", claim: "A wave advances only when its gate has evidence behind it." },
  });
  title(s, "Every wave clears the same four gates");

  const stages = [
    ["INVENTORY", "what talks to what", C.trace],
    ["IDENTITY", "one directory", C.trace],
    ["POLICY", "deny by default", C.trace],
    ["PILOT", "one business unit", C.warn],
    ["EXPAND", "wave by wave", C.trace],
    ["ENFORCE", "legacy paths off", C.trace],
  ];
  const cells = columns({ x: PAGE.x, y: 2.5, w: PAGE.w, h: 1.15 }, stages.length, 0.2);
  const ids = stages.map(([label, sub, accent], index) => stage(s, `st${index}`, cells[index], label, sub, accent));
  ids.slice(1).forEach((id, index) => {
    s.connect(`edge${index}`, ids[index], id, { style: { color: stages[index + 1][2], width: 1.6 } });
  });

  // The return path: a gate that fails sends the wave back to policy.
  s.shape("gate", "roundRect", {
    x: 4.2, y: 4.9, w: 5, h: 0.86,
    style: { fill: C.panel, lineColor: C.warn, lineWidth: 1.2 },
    role: "diagram-node",
  });
  s.text("gate-text", "EVIDENCE FAILS → BACK TO POLICY", {
    x: 4.35, y: 5.1, w: 4.7, h: 0.34,
    style: { fontSize: 15, bold: true, color: C.warn, align: "center", fontFace: "Menlo" },
    role: "diagram-label",
  });
  s.connect("gate-in", ids[3], "gate", { style: { color: C.warn, width: 1.4, dashed: true } });
  s.connect("gate-out", "gate", ids[2], { style: { color: C.warn, width: 1.4, dashed: true } });
}

// 3 — The numbers, on paper, so the pacing changes.
{
  const s = deck.slide({
    id: "exposure",
    title: "The exposure we are closing",
    background: C.paper,
    chrome: { kicker: "Why now", variant: "paper" },
    communication: { audienceQuestion: "How bad is it today?", claim: "Most lateral paths are unmonitored, and the oldest are the widest." },
  });
  title(s, "The exposure we are closing", false);

  const numbers = [
    ["2,140", "east-west paths", "Flows between internal services with no policy in front of them.", C.warnInk],
    ["38%", "unmonitored", "Paths with no telemetry at all — we cannot say what uses them.", C.warnInk],
    ["11", "legacy trusts", "Domain trusts predating the current directory. Each is a wave-four dependency.", C.traceInk],
  ];
  const cells = columns({ x: PAGE.x, y: 2.4, w: PAGE.w, h: 2.4 }, numbers.length, 0.6);
  numbers.forEach(([value, label, note, accent], index) => {
    metric(s, `m${index}`, cells[index], value, label, note, accent);
  });

  s.line("rule", { x: PAGE.x, y: 5.3 }, { x: PAGE.x + PAGE.w, y: 5.3 }, {
    style: { color: "D7E0E5", width: 0.75, arrow: false }, role: "decorative",
  });
  s.text("source", "Source: flow telemetry, 90-day window. Paths with fewer than 10 flows are excluded.", {
    x: PAGE.x, y: 5.5, w: 9, h: 0.4, autoHeight: true,
    style: { fontSize: 11, color: C.paperMuted, fontFace: "Menlo" },
    role: "caption",
  });
}

// 4 — The ask. A 2x2 that exists because there are two axes, not to fill space.
{
  const s = deck.slide({
    id: "decision",
    title: "What we are asking for",
    background: C.night,
    chrome: { kicker: "The decision" },
    communication: { audienceQuestion: "What do you need from us?", claim: "Approval for waves one and two, and a named owner for the legacy trusts." },
  });
  title(s, "What we are asking for");

  const asks = [
    ["APPROVE", "waves one and two", "Inventory and identity, finishing in Q3.", C.trace],
    ["FUND", "two platform engineers", "For the policy surface, not for the pilot.", C.trace],
    ["NAME", "an owner for legacy trusts", "Eleven of them, each with its own migration.", C.warn],
    ["DEFER", "waves three and four", "Re-decide when wave two produces evidence.", C.muted],
  ];
  const cells = grid({ x: PAGE.x, y: 2.4, w: PAGE.w, h: 3.6 }, { columns: 2, rows: 2, gap: 0.4, rowGap: 0.4 });
  asks.forEach(([label, what, why, accent], index) => {
    const cell = cells[index];
    const radius = 0.08;
    s.shape(`ask${index}`, "roundRect", { ...cell, style: { fill: C.panel, lineColor: C.rule, lineWidth: 1, radius } });
    // Inset the bar within the box's straight edge so its square corners never cross the box's rounded ones.
    s.shape(`ask${index}-bar`, "rect", { x: cell.x, y: cell.y + radius, w: 0.07, h: cell.h - radius * 2, style: { fill: accent, lineWidth: 0 }, role: "decorative" });
    s.text(`ask${index}-label`, label, {
      x: cell.x + 0.3, y: cell.y + 0.26, w: cell.w - 0.6, h: 0.3,
      style: { fontSize: 11, bold: true, color: accent, fontFace: "Menlo", charSpacing: 0.8 },
      role: "eyebrow",
    });
    s.text(`ask${index}-what`, what, {
      x: cell.x + 0.3, y: cell.y + 0.66, w: cell.w - 0.6, h: 0.4, autoHeight: true,
      style: { fontSize: 20, bold: true, color: C.ink },
      role: "body",
    });
    s.text(`ask${index}-why`, why, {
      x: cell.x + 0.3, y: cell.y + 1.16, w: cell.w - 0.6, h: 0.4, autoHeight: true,
      style: { fontSize: 15, color: C.muted, lineSpacingMultiple: 1.25 },
      role: "caption",
    });
  });
}

export default deck;
