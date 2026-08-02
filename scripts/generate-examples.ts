import { rm } from "node:fs/promises";
import path from "node:path";

import { SlideAgent } from "../src/pipeline.js";
import { silentLogger } from "../src/logging/logger.js";
import type { PresentationBrief, PresentationOutline, SlideSpec } from "../src/types/index.js";

const root = path.resolve(import.meta.dirname, "..");

function brief(title: string, objective: string, audience: string, type: PresentationBrief["presentationType"], slideCount: number): PresentationBrief {
  return {
    title,
    audience,
    objective,
    presentationType: type,
    tone: type === "technical" ? "precise and pragmatic" : "confident and concise",
    visualDirection: "Invented for this deck; see outline.creativeDirection.",
    slideCount,
    language: "English",
    outputRequirements: ["editable PowerPoint", "speaker notes", "rendered previews", "validation report"],
    keyTopics: [],
    sourcePrompt: `Generate ${title}`,
  };
}

const productSlides: SlideSpec[] = [
  {
    id: "title",
    kind: "launch-manifesto",
    title: "Atlas launches around one customer promise",
    background: "F2EDFF",
    designIntent: "Create launch energy through scale, cropped geometry, and a hard ninety-day horizon.",
    composition: "Monumental left-aligned promise collides with bright geometric launch markers on the right.",
    speakerNotes: ["Frame the meeting as a decision on focus, not a review of every launch task."],
    canvas: [
      { id: "launch-orbit", type: "shape", shape: "ellipse", x: 9.72, y: 0.42, w: 2.82, h: 2.82, zIndex: -2, role: "decorative", intentionalOverlap: true, style: { fill: "FF4B3E", lineWidth: 0 } },
      { id: "launch-vector", type: "shape", shape: "parallelogram", x: 9.0, y: 3.72, w: 3.55, h: 2.05, zIndex: -1, role: "decorative", intentionalOverlap: true, style: { fill: "2457FF", lineWidth: 0, rotate: -7 } },
      { id: "deck-label", type: "text", x: 0.72, y: 0.52, w: 3.8, h: 0.32, role: "eyebrow", text: "ATLAS / LAUNCH DECISION", style: { fontFace: "Aptos Mono", fontSize: 12, color: "2457FF", bold: true } },
      { id: "deck-title", type: "text", x: 0.7, y: 1.3, w: 8.35, h: 2.25, role: "title", text: "Atlas launches around one customer promise", style: { fontFace: "Arial Black", fontSize: 54, color: "151126", bold: true, valign: "middle" } },
      { id: "deck-subtitle", type: "text", x: 0.74, y: 4.15, w: 6.75, h: 0.95, role: "subtitle", text: "Turn fragmented operating data into a decision-ready workspace", style: { fontSize: 22, color: "5C546B" } },
      { id: "launch-rule", type: "shape", shape: "rect", x: 0.72, y: 6.1, w: 7.35, h: 0.12, role: "decorative", style: { fill: "FF4B3E", lineWidth: 0 } },
      { id: "launch-horizon", type: "text", x: 9.12, y: 5.65, w: 3.2, h: 0.58, role: "subheading", text: "90 DAYS", style: { fontFace: "Aptos Mono", fontSize: 28, color: "151126", bold: true, align: "right" } },
    ],
  },
  { id: "summary", kind: "executive-summary", title: "A narrow promise creates the fastest path to adoption", body: "Launch Atlas as the shared operating view for teams that currently reconcile metrics by hand.", bullets: ["Lead with one weekly decision ritual", "Prove value with three lighthouse customers", "Scale only after activation and retention clear the gates"] },
  { id: "comparison", kind: "comparison", title: "The winning position replaces reconciliation, not every analytics tool", comparison: [
    { heading: "Generic analytics", points: ["Broad feature story", "Long setup path", "Dashboard as destination"] },
    { heading: "Atlas position", points: ["One operating decision", "Guided first-week setup", "Action as destination"], emphasis: true },
  ] },
  {
    id: "timeline",
    kind: "launch-trajectory",
    title: "Three launch moments move from proof to repeatability",
    background: "F2EDFF",
    designIntent: "Replace a generic horizontal timeline with an accelerating launch trajectory.",
    composition: "A rising diagonal route carries three increasingly large proof moments toward scale.",
    canvas: [
      { id: "slide-title", type: "text", x: 0.68, y: 0.45, w: 10.9, h: 0.72, role: "title", text: "Three launch moments move from proof to repeatability", style: { fontFace: "Arial Black", fontSize: 32, color: "151126", bold: true } },
      { id: "trajectory", type: "connector", x: 1.25, y: 5.85, w: 10.15, h: -3.65, zIndex: -10, role: "connector", style: { color: "2457FF", width: 4, arrow: true } },
      { id: "prove-node", type: "shape", shape: "ellipse", x: 1.55, y: 4.85, w: 0.48, h: 0.48, role: "diagram-node", style: { fill: "FF4B3E", lineWidth: 0 } },
      { id: "prove-index", type: "text", x: 0.82, y: 3.55, w: 1.0, h: 0.7, role: "decorative", text: "01", style: { fontFace: "Arial Black", fontSize: 38, color: "FFD6D1", bold: true } },
      { id: "prove-label", type: "text", x: 1.55, y: 5.43, w: 2.45, h: 0.8, role: "diagram-label", text: "PROVE\n3 lighthouse workflows", style: { fontSize: 17, color: "151126", bold: true } },
      { id: "package-node", type: "shape", shape: "ellipse", x: 5.65, y: 3.43, w: 0.62, h: 0.62, role: "diagram-node", style: { fill: "FF4B3E", lineWidth: 0 } },
      { id: "package-index", type: "text", x: 4.92, y: 2.18, w: 1.2, h: 0.7, role: "decorative", text: "02", style: { fontFace: "Arial Black", fontSize: 42, color: "FFD6D1", bold: true } },
      { id: "package-label", type: "text", x: 5.55, y: 4.18, w: 2.65, h: 0.85, role: "diagram-label", text: "PACKAGE\nRepeatable launch motion", style: { fontSize: 17, color: "151126", bold: true } },
      { id: "expand-node", type: "shape", shape: "ellipse", x: 9.82, y: 1.78, w: 0.78, h: 0.78, role: "diagram-node", style: { fill: "FF4B3E", lineWidth: 0 } },
      { id: "expand-index", type: "text", x: 9.12, y: 0.92, w: 1.2, h: 0.7, role: "decorative", text: "03", style: { fontFace: "Arial Black", fontSize: 48, color: "FFD6D1", bold: true } },
      { id: "expand-label", type: "text", x: 9.75, y: 2.82, w: 2.65, h: 0.85, role: "diagram-label", text: "EXPAND\nOnly after gates clear", style: { fontSize: 17, color: "151126", bold: true } },
      { id: "horizon-note", type: "text", x: 0.72, y: 6.75, w: 3.0, h: 0.26, role: "caption", text: "WEEK 1                                      WEEK 12", style: { fontFace: "Aptos Mono", fontSize: 11, color: "5C546B" } },
    ],
  },
  {
    id: "chart",
    kind: "activation-signal",
    title: "Activation—not sign-up volume—is the launch control metric",
    background: "F2EDFF",
    designIntent: "Let the native chart establish evidence while the launch gate becomes a monumental decision object.",
    composition: "Compact ascending bars occupy the left; a giant sixty-three percent and gate annotation dominate the right.",
    canvas: [
      { id: "slide-title", type: "text", x: 0.68, y: 0.45, w: 11.2, h: 0.72, role: "title", text: "Activation—not sign-up volume—is the launch control metric", style: { fontFace: "Arial Black", fontSize: 32, color: "151126", bold: true } },
      { id: "activation-chart", type: "chart", x: 0.65, y: 1.58, w: 7.65, h: 4.9, role: "chart", chart: { kind: "bar", labels: ["W1", "W4", "W8", "W12"], series: [{ name: "Activation", values: [22, 38, 51, 63] }], unit: "%", showValues: true }, style: { colors: ["2457FF"], options: { showLegend: false, showCatName: false, showValue: true, valGridLine: { color: "CBC4DD", width: 1 } } } },
      { id: "gate-field", type: "shape", shape: "parallelogram", x: 8.75, y: 1.82, w: 3.75, h: 3.95, zIndex: -2, role: "decorative", intentionalOverlap: true, style: { fill: "B52B25", lineWidth: 0, rotate: -3 } },
      { id: "gate-value", type: "text", x: 9.0, y: 2.2, w: 3.15, h: 1.35, role: "kpi-value", text: "63%", intentionalOverlap: true, style: { fontFace: "Arial Black", fontSize: 68, color: "FFFFFF", fill: "B52B25", bold: true, align: "center", valign: "middle" } },
      { id: "gate-label", type: "text", x: 9.15, y: 3.72, w: 2.9, h: 0.95, role: "diagram-label", text: "WEEKLY RITUAL\nCOMPLETED", intentionalOverlap: true, style: { fontFace: "Aptos Mono", fontSize: 17, color: "FFFFFF", fill: "B52B25", bold: true, align: "center" } },
      { id: "gate-note", type: "text", x: 8.9, y: 5.95, w: 3.4, h: 0.48, role: "body", text: "The plan earns expansion only when the gate clears.", style: { fontSize: 16, color: "151126", bold: true, align: "center" } },
    ],
  },
  { id: "process", kind: "process", title: "One operating loop keeps launch learning close to the customer", body: "Run the loop weekly; change the message only when the evidence changes.", process: [
    { title: "Observe", detail: "Review sessions and drop-off" },
    { title: "Explain", detail: "Name the strongest friction" },
    { title: "Change", detail: "Ship one focused improvement" },
    { title: "Measure", detail: "Recheck activation and retention" },
  ] },
  { id: "kpis", kind: "kpi", title: "Four gates define whether Atlas is ready to scale", kpis: [
    { label: "Activation", value: "60%", detail: "Complete the core ritual", trend: "up" },
    { label: "Week-4 use", value: "45%", detail: "Return without prompting", trend: "up" },
    { label: "Time to value", value: "≤2d", detail: "First decision-ready view", trend: "down" },
    { label: "Expansion", value: "2×", detail: "Second team invited", trend: "up" },
  ] },
  { id: "roadmap", kind: "roadmap", title: "The 90-day roadmap protects focus while keeping owners explicit", roadmap: [
    { label: "Product", items: ["Guided setup", "Decision ritual", "Expansion cues"] },
    { label: "Go-to-market", items: ["Lighthouse proof", "Launch kit", "Channel scale"] },
    { label: "Operations", items: ["Instrumentation", "Weekly review", "Gate decision"] },
  ] },
  { id: "closing", kind: "closing", title: "Approve the focused launch and review the gates in three weeks", subtitle: "The next decision is whether the lighthouse motion is strong enough to package.", bullets: ["Confirm the positioning", "Name three lighthouse accounts", "Book the week-three gate review"] },
];

const cloudSlides: SlideSpec[] = [
  {
    id: "title",
    kind: "control-plane-cover",
    title: "Northstar moves safely by separating control from migration speed",
    background: "071319",
    designIntent: "Make the control boundary feel stable while luminous routes imply measured migration.",
    composition: "Technical signal paths cross a dark field and converge on one outlined control-plane node.",
    canvas: [
      { id: "route-one", type: "connector", x: 0.55, y: 6.55, w: 9.9, h: -4.1, zIndex: -10, role: "decorative", style: { color: "183945", width: 1, arrow: false } },
      { id: "route-two", type: "connector", x: 2.6, y: 7.1, w: 8.4, h: -3.0, zIndex: -10, role: "decorative", style: { color: "183945", width: 1, arrow: false, dashed: true } },
      { id: "active-route", type: "connector", x: 6.15, y: 5.9, w: 3.75, h: -2.8, zIndex: -5, role: "connector", style: { color: "2BE4FF", width: 2.4, arrow: true } },
      { id: "control-ring", type: "shape", shape: "hexagon", x: 9.55, y: 1.38, w: 2.75, h: 2.75, role: "diagram-node", style: { fill: "071319", lineColor: "B7FF45", lineWidth: 2.4, rotate: 8 } },
      { id: "control-label", type: "text", x: 9.85, y: 2.32, w: 2.15, h: 0.7, role: "diagram-label", text: "CONTROL\nPLANE", style: { fontFace: "Aptos Mono", fontSize: 17, color: "B7FF45", bold: true, align: "center", valign: "middle" } },
      { id: "deck-label", type: "text", x: 0.7, y: 0.58, w: 4.5, h: 0.3, role: "eyebrow", text: "NORTHSTAR / ARCHITECTURE DECISION", style: { fontFace: "Aptos Mono", fontSize: 11, color: "2BE4FF", bold: true } },
      { id: "deck-title", type: "text", x: 0.68, y: 1.25, w: 8.25, h: 2.65, role: "title", text: "Northstar moves safely by separating control from migration speed", style: { fontFace: "Aptos Display", fontSize: 50, color: "E6FEFF", bold: true, valign: "middle" } },
      { id: "deck-subtitle", type: "text", x: 0.72, y: 4.72, w: 6.75, h: 0.72, role: "subtitle", text: "A phased cloud architecture for auditable change", style: { fontFace: "Aptos Mono", fontSize: 18, color: "9CB7BE" } },
      { id: "status", type: "text", x: 10.0, y: 6.55, w: 2.25, h: 0.28, role: "caption", text: "BOUNDARY / READY", style: { fontFace: "Aptos Mono", fontSize: 11, color: "B7FF45", align: "right" } },
    ],
  },
  { id: "section", kind: "section", title: "Design the boundary before moving the workload", subtitle: "The control plane stays stable while service teams migrate in measured waves.", sectionLabel: "01 / TARGET STATE" },
  {
    id: "architecture",
    kind: "control-plane-map",
    title: "A shared control plane lets product services migrate independently",
    background: "071319",
    designIntent: "Make governance a stable illuminated boundary rather than one box in a chain.",
    composition: "Identity and policy form a vertical control spine; workload and data nodes orbit it across trust zones.",
    canvas: [
      { id: "slide-title", type: "text", x: 0.68, y: 0.42, w: 11.5, h: 0.72, role: "title", text: "A shared control plane lets product services migrate independently", style: { fontFace: "Aptos Display", fontSize: 32, color: "E6FEFF", bold: true } },
      { id: "architecture-lead", type: "text", x: 0.72, y: 1.23, w: 8.4, h: 0.42, role: "body", text: "Identity, policy, and observability remain centralized; workloads move behind consistent guardrails.", style: { fontSize: 16, color: "9CB7BE" } },
      { id: "external-zone", type: "shape", shape: "roundRect", x: 0.72, y: 2.0, w: 2.25, h: 3.85, zIndex: -20, role: "decorative", style: { fill: "0E222A", lineColor: "28505A", lineWidth: 1 } },
      { id: "control-zone", type: "shape", shape: "hexagon", x: 4.65, y: 1.72, w: 3.35, h: 4.35, zIndex: -20, role: "diagram-node", style: { fill: "143A40", lineColor: "B7FF45", lineWidth: 2.2 } },
      { id: "workload-zone", type: "shape", shape: "roundRect", x: 9.25, y: 2.0, w: 3.35, h: 3.85, zIndex: -20, role: "decorative", style: { fill: "0E222A", lineColor: "28505A", lineWidth: 1 } },
      { id: "route-users", type: "connector", x: 2.65, y: 3.05, w: 2.55, h: 0.2, zIndex: -10, style: { color: "2BE4FF", width: 2, arrow: true } },
      { id: "route-clients", type: "connector", x: 2.65, y: 4.78, w: 2.55, h: -0.55, zIndex: -10, style: { color: "2BE4FF", width: 2, arrow: true, dashed: true } },
      { id: "route-services", type: "connector", x: 7.45, y: 3.15, w: 2.25, h: -0.05, zIndex: -10, style: { color: "B7FF45", width: 2, arrow: true } },
      { id: "route-data", type: "connector", x: 7.45, y: 4.48, w: 2.25, h: 0.2, zIndex: -10, style: { color: "B7FF45", width: 2, arrow: true } },
      { id: "users", type: "text", x: 1.02, y: 2.55, w: 1.65, h: 0.65, role: "diagram-label", text: "USERS", style: { fontFace: "Aptos Mono", fontSize: 17, color: "E6FEFF", bold: true, align: "center", valign: "middle" } },
      { id: "clients", type: "text", x: 1.02, y: 4.25, w: 1.65, h: 0.65, role: "diagram-label", text: "CLIENTS", style: { fontFace: "Aptos Mono", fontSize: 17, color: "E6FEFF", bold: true, align: "center", valign: "middle" } },
      { id: "control-label", type: "text", x: 5.25, y: 2.45, w: 2.15, h: 0.85, role: "subheading", text: "CONTROL\nPLANE", style: { fontFace: "Aptos Mono", fontSize: 22, color: "B7FF45", bold: true, align: "center" } },
      { id: "control-stack", type: "text", x: 5.15, y: 3.62, w: 2.35, h: 1.55, role: "diagram-label", text: "IDENTITY\nPOLICY\nOBSERVABILITY", style: { fontFace: "Aptos Mono", fontSize: 16, color: "E6FEFF", bold: true, align: "center", valign: "middle" } },
      { id: "services", type: "text", x: 9.72, y: 2.55, w: 2.35, h: 0.8, role: "diagram-label", text: "MIGRATED\nSERVICES", style: { fontFace: "Aptos Mono", fontSize: 17, color: "E6FEFF", bold: true, align: "center" } },
      { id: "data", type: "text", x: 9.72, y: 4.25, w: 2.35, h: 0.8, role: "diagram-label", text: "MANAGED\nDATA", style: { fontFace: "Aptos Mono", fontSize: 17, color: "E6FEFF", bold: true, align: "center" } },
      { id: "zone-label-left", type: "text", x: 0.92, y: 5.48, w: 1.9, h: 0.24, role: "caption", text: "EXTERNAL ACTORS", style: { fontFace: "Aptos Mono", fontSize: 11, color: "9CB7BE", align: "center" } },
      { id: "zone-label-right", type: "text", x: 9.62, y: 5.48, w: 2.6, h: 0.24, role: "caption", text: "MIGRATION WAVES", style: { fontFace: "Aptos Mono", fontSize: 11, color: "9CB7BE", align: "center" } },
    ],
  },
  {
    id: "process",
    kind: "evidence-gates",
    title: "Every migration wave passes the same four evidence gates",
    background: "071319",
    designIntent: "Make risk control feel like a measured signal trace with explicit proof gates.",
    composition: "A luminous route steps upward through four checkpoints; each gate owns a concise evidence requirement.",
    canvas: [
      { id: "slide-title", type: "text", x: 0.68, y: 0.42, w: 11.5, h: 0.72, role: "title", text: "Every migration wave passes the same four evidence gates", style: { fontFace: "Aptos Display", fontSize: 32, color: "E6FEFF", bold: true } },
      { id: "gate-route-a", type: "connector", x: 1.15, y: 5.55, w: 3.15, h: -0.75, zIndex: -10, style: { color: "2BE4FF", width: 3, arrow: false } },
      { id: "gate-route-b", type: "connector", x: 4.3, y: 4.8, w: 3.15, h: -1.05, zIndex: -10, style: { color: "2BE4FF", width: 3, arrow: false } },
      { id: "gate-route-c", type: "connector", x: 7.45, y: 3.75, w: 3.3, h: -1.35, zIndex: -10, style: { color: "B7FF45", width: 3, arrow: true } },
      { id: "gate-one", type: "shape", shape: "ellipse", x: 0.88, y: 5.28, w: 0.55, h: 0.55, role: "diagram-node", style: { fill: "071319", lineColor: "2BE4FF", lineWidth: 2.5 } },
      { id: "gate-two", type: "shape", shape: "ellipse", x: 4.02, y: 4.52, w: 0.55, h: 0.55, role: "diagram-node", style: { fill: "071319", lineColor: "2BE4FF", lineWidth: 2.5 } },
      { id: "gate-three", type: "shape", shape: "ellipse", x: 7.17, y: 3.47, w: 0.55, h: 0.55, role: "diagram-node", style: { fill: "071319", lineColor: "2BE4FF", lineWidth: 2.5 } },
      { id: "gate-four", type: "shape", shape: "hexagon", x: 10.35, y: 1.88, w: 0.85, h: 0.85, role: "diagram-node", style: { fill: "143A40", lineColor: "B7FF45", lineWidth: 2.5 } },
      { id: "gate-one-label", type: "text", x: 0.72, y: 3.52, w: 2.35, h: 1.15, role: "diagram-label", text: "01  INVENTORY\nMap dependencies\nand owners", style: { fontFace: "Aptos Mono", fontSize: 16, color: "E6FEFF", bold: true } },
      { id: "gate-two-label", type: "text", x: 3.7, y: 2.8, w: 2.55, h: 1.15, role: "diagram-label", text: "02  PREPARE\nAdd controls and\nobservability", style: { fontFace: "Aptos Mono", fontSize: 16, color: "E6FEFF", bold: true } },
      { id: "gate-three-label", type: "text", x: 6.82, y: 1.85, w: 2.55, h: 1.15, role: "diagram-label", text: "03  MIGRATE\nShift traffic with\nrollback", style: { fontFace: "Aptos Mono", fontSize: 16, color: "E6FEFF", bold: true } },
      { id: "gate-four-label", type: "text", x: 10.0, y: 3.0, w: 2.4, h: 1.15, role: "diagram-label", text: "04  PROVE\nHold the reliability\nwindow", style: { fontFace: "Aptos Mono", fontSize: 16, color: "B7FF45", bold: true, align: "center" } },
      { id: "rollback-note", type: "text", x: 0.75, y: 6.55, w: 4.6, h: 0.3, role: "caption", text: "NO GATE CLEARS WITHOUT A TESTED ROLLBACK", style: { fontFace: "Aptos Mono", fontSize: 11, color: "9CB7BE" } },
    ],
  },
  { id: "table", kind: "table", title: "Wave selection balances business value with recoverability", body: "Start with bounded services that exercise the platform without concentrating risk.", table: {
    headers: ["Service", "Value", "Dependency", "Rollback", "Wave"],
    rows: [["Notifications", "Medium", "Low", "Minutes", "1"], ["Reporting", "High", "Medium", "Hours", "1"], ["Checkout", "High", "High", "Minutes", "3"], ["Identity", "Critical", "High", "Complex", "Control plane"]],
    highlightRows: [0, 1],
  } },
  { id: "chart", kind: "chart", title: "Reliability improves as the control plane becomes the default path", body: "The migration only accelerates after rollback time and error budget both improve.", chart: { kind: "line", labels: ["Baseline", "Wave 1", "Wave 2", "Wave 3"], series: [{ name: "Availability", values: [99.72, 99.82, 99.91, 99.95] }, { name: "Change success", values: [91, 94, 97, 98] }], unit: "%", showLegend: true } },
  { id: "roadmap", kind: "roadmap", title: "The roadmap scales migration only after the platform proves itself", roadmap: [
    { label: "Foundation", items: ["Identity", "Policy", "Telemetry"] },
    { label: "Wave 1", items: ["Notifications", "Reporting"] },
    { label: "Wave 2–3", items: ["Customer APIs", "Checkout"] },
  ] },
  { id: "closing", kind: "closing", title: "Approve the control-plane boundary and fund the first migration wave", subtitle: "The next gate is a live rollback exercise before customer traffic moves.", bullets: ["Confirm platform owners", "Select Wave 1 services", "Schedule the rollback proof"] },
];

const reviewSlides: SlideSpec[] = [
  {
    id: "title",
    kind: "quarterly-ledger-cover",
    title: "Q2 growth held; the next margin gain comes from focus",
    background: "F7F1E3",
    designIntent: "Balance financial credibility with a decisive editorial cut toward two priorities.",
    composition: "A serif conclusion owns the left; an oversized quarter mark and three quiet proof points form a right-hand ledger.",
    canvas: [
      { id: "quarter-mark", type: "text", x: 8.7, y: 0.3, w: 3.6, h: 1.75, zIndex: -1, role: "decorative", text: "Q2", style: { fontFace: "Georgia", fontSize: 96, color: "E8D0D8", bold: true, align: "right" } },
      { id: "ledger-rule", type: "shape", shape: "rect", x: 8.55, y: 2.15, w: 0.08, h: 4.15, role: "decorative", style: { fill: "8F2349", lineWidth: 0 } },
      { id: "deck-label", type: "text", x: 0.72, y: 0.58, w: 4.0, h: 0.3, role: "eyebrow", text: "OPERATING REVIEW / Q3 AGENDA", style: { fontFace: "Aptos", fontSize: 11, color: "1E6B4E", bold: true } },
      { id: "deck-title", type: "text", x: 0.72, y: 1.25, w: 7.15, h: 2.55, role: "title", text: "Q2 growth held; the next margin gain comes from focus", style: { fontFace: "Georgia", fontSize: 52, color: "241B20", bold: true, valign: "middle" } },
      { id: "deck-subtitle", type: "text", x: 0.76, y: 4.35, w: 6.35, h: 0.62, role: "subtitle", text: "Operating review and Q3 decision agenda", style: { fontSize: 20, color: "695B61" } },
      { id: "proof-arr", type: "text", x: 9.02, y: 2.55, w: 2.85, h: 0.62, role: "kpi-value", runs: [{ text: "+18%", options: { bold: true, color: "8F2349" } }, { text: "  ARR", options: { color: "695B61" } }], style: { fontFace: "Aptos", fontSize: 24 } },
      { id: "proof-nrr", type: "text", x: 9.02, y: 3.7, w: 2.85, h: 0.62, role: "kpi-value", runs: [{ text: "112%", options: { bold: true, color: "1E6B4E" } }, { text: "  NRR", options: { color: "695B61" } }], style: { fontFace: "Aptos", fontSize: 24 } },
      { id: "proof-margin", type: "text", x: 9.02, y: 4.85, w: 2.85, h: 0.62, role: "kpi-value", runs: [{ text: "74%", options: { bold: true, color: "241B20" } }, { text: "  GM", options: { color: "695B61" } }], style: { fontFace: "Aptos", fontSize: 24 } },
    ],
  },
  { id: "summary", kind: "executive-summary", title: "Protect enterprise momentum and remove low-yield acquisition spend", body: "Revenue quality improved even as top-line growth moderated.", bullets: ["Enterprise expansion offsets softer self-serve acquisition", "Activation gains are strongest in guided onboarding", "Two low-yield channels consume most discretionary spend"] },
  {
    id: "kpi",
    kind: "quarter-ledger",
    title: "The quarter finished with durable growth and visible efficiency gaps",
    background: "F7F1E3",
    designIntent: "Replace a KPI card row with an editorial ledger where scale and rules establish hierarchy.",
    composition: "ARR occupies the dominant left field; three secondary measures align as ruled evidence on the right.",
    canvas: [
      { id: "slide-title", type: "text", x: 0.68, y: 0.45, w: 11.4, h: 0.72, role: "title", text: "The quarter finished with durable growth and visible efficiency gaps", style: { fontFace: "Georgia", fontSize: 32, color: "241B20", bold: true } },
      { id: "arr-field", type: "shape", shape: "rect", x: 0.72, y: 1.55, w: 5.15, h: 4.95, zIndex: -5, role: "decorative", style: { fill: "E8D0D8", lineWidth: 0 } },
      { id: "arr-label", type: "text", x: 1.05, y: 1.95, w: 2.2, h: 0.3, role: "eyebrow", text: "ANNUAL RECURRING REVENUE", style: { fontSize: 11, color: "8F2349", bold: true } },
      { id: "arr-value", type: "text", x: 1.0, y: 2.55, w: 4.45, h: 1.25, role: "kpi-value", text: "$48.2M", style: { fontFace: "Georgia", fontSize: 60, color: "241B20", bold: true } },
      { id: "arr-detail", type: "text", x: 1.05, y: 4.35, w: 3.9, h: 0.55, role: "body", text: "+18%  YEAR OVER YEAR", style: { fontSize: 18, color: "8F2349", bold: true } },
      { id: "ledger-top", type: "shape", shape: "rect", x: 6.45, y: 1.55, w: 5.9, h: 0.07, role: "decorative", style: { fill: "241B20", lineWidth: 0 } },
      { id: "nrr-label", type: "text", x: 6.48, y: 1.92, w: 2.1, h: 0.28, role: "eyebrow", text: "NET RETENTION", style: { fontSize: 11, color: "695B61", bold: true } },
      { id: "nrr-value", type: "text", x: 9.62, y: 1.75, w: 2.65, h: 0.72, role: "kpi-value", text: "112%", style: { fontFace: "Georgia", fontSize: 36, color: "1E6B4E", bold: true, align: "right" } },
      { id: "ledger-rule-one", type: "shape", shape: "rect", x: 6.45, y: 2.75, w: 5.9, h: 0.03, role: "decorative", style: { fill: "D8CDBD", lineWidth: 0 } },
      { id: "margin-label", type: "text", x: 6.48, y: 3.12, w: 2.1, h: 0.28, role: "eyebrow", text: "GROSS MARGIN", style: { fontSize: 11, color: "695B61", bold: true } },
      { id: "margin-value", type: "text", x: 9.62, y: 2.95, w: 2.65, h: 0.72, role: "kpi-value", text: "74%", style: { fontFace: "Georgia", fontSize: 36, color: "241B20", bold: true, align: "right" } },
      { id: "ledger-rule-two", type: "shape", shape: "rect", x: 6.45, y: 3.95, w: 5.9, h: 0.03, role: "decorative", style: { fill: "D8CDBD", lineWidth: 0 } },
      { id: "cac-label", type: "text", x: 6.48, y: 4.32, w: 2.3, h: 0.28, role: "eyebrow", text: "CAC PAYBACK", style: { fontSize: 11, color: "695B61", bold: true } },
      { id: "cac-value", type: "text", x: 9.32, y: 4.12, w: 2.95, h: 0.72, role: "kpi-value", text: "19 mo", style: { fontFace: "Georgia", fontSize: 36, color: "8F2349", bold: true, align: "right" } },
      { id: "cac-detail", type: "text", x: 6.48, y: 5.32, w: 5.8, h: 0.52, role: "body", text: "The only deteriorating signal: payback lengthened by two months.", style: { fontSize: 16, color: "695B61" } },
    ],
  },
  { id: "mix", kind: "chart", title: "Enterprise expansion now carries more of the growth load", body: "The mix shift improves retention but raises the cost of slow implementation.", chart: { kind: "bar", labels: ["Q3", "Q4", "Q1", "Q2"], series: [{ name: "Enterprise", values: [18, 21, 25, 30] }, { name: "Mid-market", values: [14, 15, 16, 17] }, { name: "Self-serve", values: [10, 11, 10, 9] }], showLegend: true, showValues: false } },
  { id: "adoption", kind: "chart", title: "Guided onboarding lifts durable adoption, not just first-week activity", body: "The cohort gap persists through week eight, supporting a focused implementation investment.", chart: { kind: "area", labels: ["W1", "W2", "W4", "W6", "W8"], series: [{ name: "Guided", values: [82, 73, 66, 61, 58] }, { name: "Self-serve", values: [68, 51, 43, 38, 35] }], showLegend: true } },
  { id: "bridge", kind: "chart", title: "A focused spend reset funds implementation without slowing growth", body: "Channel reductions more than cover the implementation capacity needed for enterprise expansion.", chart: { kind: "waterfall", labels: ["Base", "Channel cuts", "Cloud savings", "Implementation", "Net"], series: [{ name: "Margin bridge", values: [12, 4, 2, -3, 15] }], unit: " pts", showValues: true } },
  { id: "health", kind: "chart", title: "Customer risk is concentrated in a small, recoverable segment", body: "Most ARR is healthy; the at-risk segment maps directly to delayed implementation milestones.", chart: { kind: "pie", labels: ["Healthy", "Watch", "At risk"], series: [{ name: "ARR", values: [72, 19, 9] }], unit: "%", showValues: true } },
  { id: "table", kind: "table", title: "Two priorities dominate the Q3 operating agenda", table: { headers: ["Priority", "Owner", "Leading signal", "Q3 gate"], rows: [["Enterprise implementation", "COO", "Time to first value", "<14 days"], ["Acquisition efficiency", "CMO", "Qualified pipeline / spend", "+20%"], ["Self-serve activation", "CPO", "Core workflow completed", "+8 points"]], highlightRows: [0, 1] } },
  {
    id: "roadmap",
    kind: "decision-calendar",
    title: "The Q3 roadmap sequences proof before broad investment",
    background: "F7F1E3",
    designIntent: "Turn the roadmap into a decision calendar with a visible proof threshold instead of repeating a card matrix.",
    composition: "Three month columns sit behind one vertical proof gate; work moves from reset through proof to allocation.",
    canvas: [
      { id: "slide-title", type: "text", x: 0.68, y: 0.45, w: 11.4, h: 0.72, role: "title", text: "The Q3 roadmap sequences proof before broad investment", style: { fontFace: "Georgia", fontSize: 32, color: "241B20", bold: true } },
      { id: "month-july", type: "text", x: 0.75, y: 1.55, w: 3.55, h: 0.62, role: "subheading", text: "JULY", style: { fontFace: "Georgia", fontSize: 25, color: "8F2349", bold: true } },
      { id: "month-august", type: "text", x: 4.75, y: 1.55, w: 3.55, h: 0.62, role: "subheading", text: "AUGUST", style: { fontFace: "Georgia", fontSize: 25, color: "8F2349", bold: true } },
      { id: "month-september", type: "text", x: 8.75, y: 1.55, w: 3.55, h: 0.62, role: "subheading", text: "SEPTEMBER", style: { fontFace: "Georgia", fontSize: 25, color: "8F2349", bold: true } },
      { id: "calendar-rule", type: "shape", shape: "rect", x: 0.75, y: 2.2, w: 11.5, h: 0.05, role: "decorative", style: { fill: "241B20", lineWidth: 0 } },
      { id: "july-track", type: "shape", shape: "rect", x: 0.75, y: 3.0, w: 3.35, h: 0.85, zIndex: -5, role: "decorative", style: { fill: "E8D0D8", lineWidth: 0 } },
      { id: "july-label", type: "text", x: 1.02, y: 3.2, w: 2.8, h: 0.42, role: "diagram-label", text: "RESET CHANNELS", style: { fontSize: 16, color: "241B20", bold: true } },
      { id: "july-track-two", type: "shape", shape: "rect", x: 1.75, y: 4.25, w: 2.85, h: 0.85, zIndex: -5, role: "decorative", style: { fill: "D7E5DC", lineWidth: 0 } },
      { id: "july-label-two", type: "text", x: 2.02, y: 4.45, w: 2.35, h: 0.42, role: "diagram-label", text: "STAFF IMPLEMENTATION", style: { fontSize: 16, color: "241B20", bold: true } },
      { id: "proof-gate", type: "shape", shape: "rect", x: 6.35, y: 2.25, w: 0.08, h: 3.85, role: "decorative", style: { fill: "8F2349", lineWidth: 0 } },
      { id: "proof-gate-label", type: "text", x: 5.82, y: 6.2, w: 1.15, h: 0.3, role: "caption", text: "PROOF GATE", style: { fontSize: 11, color: "8F2349", bold: true, align: "center" } },
      { id: "august-track", type: "shape", shape: "rect", x: 4.85, y: 3.0, w: 3.25, h: 0.85, zIndex: -5, role: "decorative", style: { fill: "8F2349", lineWidth: 0 } },
      { id: "august-label", type: "text", x: 5.1, y: 3.2, w: 2.75, h: 0.42, role: "diagram-label", text: "PROVE TIME-TO-VALUE", style: { fontSize: 16, color: "FFFFFF", fill: "8F2349", bold: true } },
      { id: "august-track-two", type: "shape", shape: "rect", x: 6.75, y: 4.25, w: 2.85, h: 0.85, zIndex: -5, role: "decorative", style: { fill: "D7E5DC", lineWidth: 0 } },
      { id: "august-label-two", type: "text", x: 7.02, y: 4.45, w: 2.3, h: 0.42, role: "diagram-label", text: "EXPAND PLAYBOOK", style: { fontSize: 16, color: "241B20", bold: true } },
      { id: "september-track", type: "shape", shape: "rect", x: 8.75, y: 3.0, w: 3.45, h: 0.85, zIndex: -5, role: "decorative", style: { fill: "1E6B4E", lineWidth: 0 } },
      { id: "september-label", type: "text", x: 9.02, y: 3.2, w: 2.9, h: 0.42, role: "diagram-label", text: "REALLOCATE BUDGET", style: { fontSize: 16, color: "FFFFFF", fill: "1E6B4E", bold: true } },
      { id: "september-track-two", type: "shape", shape: "rect", x: 9.7, y: 4.25, w: 2.5, h: 0.85, zIndex: -5, role: "decorative", style: { fill: "241B20", lineWidth: 0 } },
      { id: "september-label-two", type: "text", x: 9.95, y: 4.45, w: 2.0, h: 0.42, role: "diagram-label", text: "SET Q4 CAPACITY", style: { fontSize: 16, color: "FFFFFF", fill: "241B20", bold: true } },
    ],
  },
  { id: "closing", kind: "closing", title: "Approve the two priorities and hold the first gate in 30 days", subtitle: "Q3 succeeds when enterprise value arrives faster and acquisition earns its spend.", bullets: ["Fund implementation capacity", "Stop two low-yield channels", "Review leading signals in 30 days"] },
];

const examples: Array<{ slug: string; outline: PresentationOutline }> = [
  { slug: "product-launch", outline: { brief: brief("Atlas product launch", "Approve a focused 90-day launch plan", "Product, sales, and customer-success leaders", "proposal", productSlides.length), narrative: "Position, prove, scale, decide.", creativeDirection: {
    name: "Launch collision",
    concept: "Operational fragments collide into one vivid customer promise and a hard ninety-day vector.",
    mood: ["bold", "kinetic", "decisive"],
    palette: { background: "F2EDFF", surface: "FFFFFF", ink: "151126", muted: "5C546B", accent: "B52B25", accentAlt: "2457FF", accentSoft: "FFD6D1", rule: "CBC4DD", positive: "158A60", negative: "D12D3E", warning: "D58900", custom: { launchRed: "FF4B3E", horizon: "FFCC45" } },
    typography: { display: "Arial Black", heading: "Arial Black", body: "Aptos", mono: "Aptos Mono" },
    compositionPrinciples: ["Hard scale jumps", "Cropped geometry implies forward motion", "Do not repeat a centered card grid"],
    diagramLanguage: "Chunky directional markers with one dominant route",
    chartLanguage: "Bright single-signal bars against pale space; annotate the gate directly",
  }, slides: productSlides } },
  { slug: "cloud-migration", outline: { brief: brief("Northstar cloud migration", "Align on a low-risk target architecture and phased plan", "Engineering leaders, security reviewers, and platform owners", "technical", cloudSlides.length), narrative: "Boundary, evidence gates, migration waves, decision.", creativeDirection: {
    name: "Controlled nocturne",
    concept: "Luminous signal paths move through a stable dark control field.",
    mood: ["precise", "nocturnal", "auditable"],
    palette: { background: "071319", surface: "0E222A", ink: "E6FEFF", muted: "9CB7BE", accent: "2BE4FF", accentAlt: "B7FF45", accentSoft: "143A40", rule: "28505A", positive: "65E6A5", negative: "FF6B6B", warning: "FFC857" },
    typography: { display: "Aptos Display", heading: "Aptos Display", body: "Aptos", mono: "Aptos Mono" },
    compositionPrinciples: ["Routes appear before containers", "Control boundaries remain stable across the sequence", "Use sparse technical annotation"],
    diagramLanguage: "Signal paths, outlined checkpoints, and bright control-plane nodes",
    chartLanguage: "Cyan and acid signals on a near-black field with minimal grids",
  }, slides: cloudSlides } },
  { slug: "quarterly-review", outline: { brief: brief("Q2 operating review", "Agree on two priorities that protect growth and improve efficiency", "Executive leadership team", "report", reviewSlides.length), narrative: "Conclusion, evidence, resource shift, Q3 gates.", creativeDirection: {
    name: "Decisive ledger",
    concept: "A restrained financial ledger interrupted by editorial conclusions in wine and evergreen.",
    mood: ["credible", "measured", "decisive"],
    palette: { background: "F7F1E3", surface: "FFFCF4", ink: "241B20", muted: "695B61", accent: "8F2349", accentAlt: "1E6B4E", accentSoft: "E8D0D8", rule: "D8CDBD", positive: "1E6B4E", negative: "B33A46", warning: "B87718" },
    typography: { display: "Georgia", heading: "Georgia", body: "Aptos", mono: "Aptos Mono", numeric: "Georgia" },
    compositionPrinciples: ["Editorial conclusions lead the data", "Ledger rules organize proof without dashboard cards", "Alternate warm paper and dark emphasis fields"],
    diagramLanguage: "Measured ruled structures with sparse highlighted decisions",
    chartLanguage: "Wine focal series, evergreen confirmation, warm neutral context",
  }, slides: reviewSlides } },
];

const agent = new SlideAgent(silentLogger);
const renderExamples = process.env.SLIDE_AGENT_EXAMPLE_RENDER === "1";
for (const example of examples) {
  const directory = path.join(root, "examples", "output", example.slug);
  await rm(directory, { recursive: true, force: true });
  const output = path.join(directory, `${example.slug}.pptx`);
  const result = await agent.create({
    command: "create",
    outline: example.outline,
    output,
    configDir: path.join(root, "config"),
    render: renderExamples,
    validate: true,
    autoFix: true,
    maxRetries: 2,
  });
  process.stdout.write(`${example.slug}: ${result.status} (${result.slideCount} slides)\n`);
  if (result.status === "error") {
    process.stderr.write(`${JSON.stringify(result.errors, null, 2)}\n`);
    process.exitCode = 1;
  }
}
