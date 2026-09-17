/**
 * Recipes: saved compositions with named slots.
 *
 * They serve draft mode and template-fill, where the engine fills them, and
 * routine slides in directed decks, where the model judges one good enough and
 * adapts it with `adjust` — or opens it with `slides_view {what: "expand"}` and
 * edits the composition. They are written in the same language a model writes,
 * using only its tokens: a recipe has no colours, faces, or sizes of its own.
 */

export type SlotSpec = "text" | "text?" | "list" | "list?" | "data" | "data?" | { min: number; max: number; item: Record<string, string> };

export interface Recipe {
  id: string;
  family: string;
  version: string;
  summary: string;
  slots: Record<string, SlotSpec>;
  root: Record<string, unknown>;
  /** Draft-mode ladder: variants to try when content does not fit. */
  autoFit?: string[];
}

const title = { id: "title", text: "{title}", role: "title" };
const kicker = { id: "kicker", text: "{kicker}", role: "label", tone: "accent", case: "upper", tracking: 0.08, optional: true };
const takeaway = { id: "takeaway", text: "{takeaway}", role: "lead", tone: "muted", optional: true };
const heading = (at = "c1-10 r1") => ({ at, column: { gap: "space.1", justify: "end", items: [kicker, title] } });

export const RECIPES: Recipe[] = [
  // ------------------------------------------------------------ title
  {
    id: "title/left-anchored", family: "title", version: "1.0.0", summary: "Large left-aligned title with subtitle and date, low on the page",
    slots: { title: "text", subtitle: "text?", kicker: "text?", date: "text?" },
    root: { grid: "12x6", items: [
      { at: "c1-9 r3-5", column: { gap: "space.2", justify: "end", items: [kicker, { id: "title", text: "{title}", role: "display", size: "-2" }, { id: "subtitle", text: "{subtitle}", role: "subtitle", tone: "muted", optional: true }] } },
      { at: "c1-6 r6", column: { justify: "end", items: [{ id: "date", text: "{date}", role: "caption", tone: "muted", optional: true }] } },
    ] },
    autoFit: ["size:-1", "title/centred"],
  },
  {
    id: "title/centred", family: "title", version: "1.0.0", summary: "Centred title and subtitle",
    slots: { title: "text", subtitle: "text?", kicker: "text?", date: "text?" },
    root: { grid: "12x6", items: [
      { at: "c2-11 r2-5", column: { gap: "space.2", justify: "center", align: "center", items: [{ ...kicker, align: "center" }, { id: "title", text: "{title}", role: "display", size: "-2", align: "center" }, { id: "subtitle", text: "{subtitle}", role: "subtitle", tone: "muted", align: "center", optional: true }, { id: "date", text: "{date}", role: "caption", tone: "muted", align: "center", optional: true }] } },
    ] },
  },
  {
    id: "title/split", family: "title", version: "1.0.0", summary: "Title on the left, image bleeding off the right",
    slots: { title: "text", subtitle: "text?", kicker: "text?", image: "data" },
    root: { grid: "12x6", items: [
      { at: "c1-6 r2-5", column: { gap: "space.2", justify: "center", items: [kicker, { id: "title", text: "{title}", role: "title", size: "+1" }, { id: "subtitle", text: "{subtitle}", role: "subtitle", tone: "muted", optional: true }] } },
      { at: "c8-12 r1-6", bleed: ["right", "top", "bottom"], image: { asset: "{image.asset}", alt: "{image.alt}", fit: "cover" } },
    ] },
  },
  // ------------------------------------------------------------ section
  {
    id: "section/number-led", family: "section", version: "1.0.0", summary: "Section divider led by a large number",
    slots: { title: "text", number: "text?", lead: "text?" },
    root: { grid: "12x6", items: [
      { at: "c1-3 r2-5", column: { justify: "end", items: [{ id: "number", text: "{number}", role: "display", tone: "accent", optional: true }] } },
      { at: "c4-11 r3-5", column: { gap: "space.2", justify: "end", items: [{ id: "title", text: "{title}", role: "title", size: "+1" }, { id: "lead", text: "{lead}", role: "lead", tone: "muted", optional: true }] } },
    ] },
  },
  {
    id: "section/full-colour", family: "section", version: "1.0.0", summary: "Section divider on an accent band",
    slots: { title: "text", lead: "text?" },
    root: { grid: "12x6", items: [
      { at: "c1-12 r1-6", bleed: ["left", "right", "top", "bottom"], surface: "band", column: { pad: "space.6", justify: "end", gap: "space.2", items: [{ id: "title", text: "{title}", role: "title", size: "+1" }, { id: "lead", text: "{lead}", role: "lead", optional: true }] } },
    ] },
  },
  // ------------------------------------------------------------ agenda
  {
    id: "agenda/list", family: "agenda", version: "1.0.0", summary: "Numbered agenda list beside the title",
    slots: { title: "text", items: { min: 2, max: 8, item: { label: "text", detail: "text?" } } },
    root: { grid: "12x6", items: [
      { at: "c1-4 r1-3", column: { justify: "start", items: [title] } },
      { at: "c6-12 r1-6", column: { gap: "space.2", each: "items", item: { row: { gap: "space.3", align: "start", items: [
        { text: "{index}", role: "h3", tone: "accent", width: "space.5" },
        { column: { grow: 1, gap: "space.1", items: [{ text: "{label}", role: "h3" }, { text: "{detail}", role: "small", tone: "muted", optional: true }] } },
      ] } } } },
    ] },
    autoFit: ["size:-1", "agenda/strip"],
  },
  {
    id: "agenda/strip", family: "agenda", version: "1.0.0", summary: "Agenda as a horizontal strip of numbered cards",
    slots: { title: "text", items: { min: 2, max: 6, item: { label: "text", detail: "text?" } } },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r3-5", row: { gap: "space.3", each: "items", item: { column: { surface: "card", pad: "space.3", gap: "space.1", items: [
        { text: "{index}", role: "label", tone: "accent" }, { text: "{label}", role: "h3" }, { text: "{detail}", role: "small", tone: "muted", optional: true },
      ] } } } },
    ] },
  },
  // ------------------------------------------------------------ statement
  {
    id: "statement/big-claim", family: "statement", version: "1.0.0", summary: "One claim, set large, with optional support",
    slots: { statement: "text", support: "text?", kicker: "text?" },
    root: { grid: "12x6", items: [
      { at: "c1-10 r1-5", column: { gap: "space.3", justify: "center", items: [kicker, { id: "statement", text: "{statement}", role: "title", size: "+2" }, { id: "support", text: "{support}", role: "lead", tone: "muted", optional: true }] } },
    ] },
    autoFit: ["size:-1", "size:-2"],
  },
  // ------------------------------------------------------------ bullets
  {
    id: "bullets/one-column", family: "bullets", version: "1.0.0", summary: "Title and a single column of points",
    slots: { title: "text", kicker: "text?", points: "list", takeaway: "text?" },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-9 r2-6", column: { gap: "space.3", items: [
        { column: { gap: "space.2", each: "points", item: { text: "{item}", role: "body", list: "bullet" } } },
        takeaway,
      ] } },
    ] },
    autoFit: ["size:-1", "bullets/two-column"],
  },
  {
    id: "bullets/two-column", family: "bullets", version: "1.0.0", summary: "Title and points flowing into two columns",
    slots: { title: "text", kicker: "text?", points: "list" },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r2-6", row: { wrap: true, gap: "space.4", rowGap: "space.2", each: "points", item: { width: "48%", text: "{item}", role: "body", list: "bullet" } } },
    ] },
  },
  // ------------------------------------------------------------ comparison
  {
    id: "comparison/columns", family: "comparison", version: "1.0.0", summary: "Two to four options compared side by side, with an optional verdict each",
    slots: { title: "text", kicker: "text?", groups: { min: 2, max: 4, item: { name: "text", points: "list", verdict: "text?" } } },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r2-6", row: { gap: "space.4", each: "groups", item: { column: { surface: "card", pad: "space.3", gap: "space.2", items: [
        { text: "{name}", role: "h3" },
        { rule: {} },
        { column: { gap: "space.1", grow: 1, each: "points", item: { text: "{item}", role: "small", list: "bullet" } } },
        { text: "{verdict}", role: "small", tone: "accent", optional: true },
      ] } } } },
    ] },
    autoFit: ["size:-1", "table/compact"],
  },
  {
    id: "comparison/before-after", family: "comparison", version: "1.0.0", summary: "Before and after, the after emphasised",
    slots: { title: "text", before: "text", after: "text", beforeLabel: "text?", afterLabel: "text?" },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-5 r2-6", column: { gap: "space.2", items: [{ text: "{beforeLabel}", role: "label", tone: "muted", optional: true }, { text: "{before}", role: "lead", tone: "muted" }] } },
      { at: "c7-12 r2-6", column: { surface: "card", pad: "space.4", gap: "space.2", items: [{ text: "{afterLabel}", role: "label", tone: "accent", optional: true }, { text: "{after}", role: "lead" }] } },
    ] },
  },
  // ------------------------------------------------------------ metrics
  {
    id: "metrics/row", family: "metrics", version: "1.0.0", summary: "Two to five metrics in a row with labels",
    slots: { title: "text", kicker: "text?", metrics: { min: 2, max: 5, item: { value: "text", label: "text", note: "text?" } }, takeaway: "text?" },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r2-5", row: { gap: "space.4", each: "metrics", item: { column: { gap: "space.1", justify: "center", items: [
        { text: "{value}", role: "display", size: "-2", tone: "accent", fit: { minStep: -2 } },
        { text: "{label}", role: "h3" },
        { text: "{note}", role: "small", tone: "muted", optional: true },
      ] } } } },
      { at: "c1-10 r6", column: { justify: "end", items: [takeaway] } },
    ] },
    autoFit: ["size:-1", "metrics/grid"],
  },
  {
    id: "metrics/grid", family: "metrics", version: "1.0.0", summary: "Up to six metrics on cards in a wrapping grid",
    slots: { title: "text", kicker: "text?", metrics: { min: 2, max: 6, item: { value: "text", label: "text", note: "text?" } } },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r2-6", row: { wrap: true, gap: "space.3", rowGap: "space.3", each: "metrics", item: { width: "31%", column: { surface: "card", pad: "space.3", gap: "space.1", items: [
        { text: "{value}", role: "title", tone: "accent" }, { text: "{label}", role: "body" }, { text: "{note}", role: "caption", tone: "muted", optional: true },
      ] } } } },
    ] },
  },
  {
    id: "metrics/hero", family: "metrics", version: "1.0.0", summary: "One hero number with supporting metrics beside it",
    slots: { title: "text", hero: "data", metrics: { min: 0, max: 3, item: { value: "text", label: "text" } } },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-7 r2-6", column: { justify: "center", gap: "space.1", items: [{ text: "{hero.value}", role: "display", size: "+1", tone: "accent", fit: { minStep: -3 } }, { text: "{hero.label}", role: "lead" }] } },
      { at: "c9-12 r2-6", column: { gap: "space.4", justify: "center", each: "metrics", item: { column: { gap: "space.1", items: [{ text: "{value}", role: "h2" }, { text: "{label}", role: "small", tone: "muted" }] } } } },
    ] },
  },
  // ------------------------------------------------------------ chart
  {
    id: "chart/with-takeaways", family: "chart", version: "1.0.0", summary: "A chart with up to three takeaways beside it",
    slots: { title: "text", kicker: "text?", chart: "data", takeaways: "list?" },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-8 r2-6", chart: "{chart}" },
      { at: "c9-12 r2-6", column: { gap: "space.3", justify: "center", each: "takeaways", item: { text: "{item}", role: "body" } } },
    ] },
  },
  {
    id: "chart/full", family: "chart", version: "1.0.0", summary: "A full-width chart under its title",
    slots: { title: "text", kicker: "text?", chart: "data", source: "text?" },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r2-6", column: { gap: "space.2", items: [{ chart: "{chart}", grow: 1 }, { text: "{source}", role: "caption", tone: "muted", optional: true }] } },
    ] },
  },
  // ------------------------------------------------------------ table
  {
    id: "table/standard", family: "table", version: "1.0.0", summary: "A table under its title",
    slots: { title: "text", kicker: "text?", table: "data", takeaway: "text?" },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r2-6", column: { gap: "space.3", items: [{ table: { data: "{table}" } }, takeaway] } },
    ] },
    autoFit: ["size:-1", "table/compact"],
  },
  {
    id: "table/compact", family: "table", version: "1.0.0", summary: "A denser table using the whole content area",
    slots: { title: "text", table: "data" },
    root: { grid: "12x6", items: [
      { at: "c1-12 r1", column: { justify: "end", items: [title] } },
      { at: "c1-12 r2-6", table: { data: "{table}", size: "-1" } },
    ] },
  },
  // ------------------------------------------------------------ timeline
  {
    id: "timeline/horizontal", family: "timeline", version: "1.0.0", summary: "Dated events along a horizontal rule",
    slots: { title: "text", kicker: "text?", events: { min: 2, max: 7, item: { date: "text", label: "text", detail: "text?" } } },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r3", column: { justify: "center", items: [{ rule: { weight: 1.5 } }] } },
      { at: "c1-12 r2-6", row: { gap: "space.3", each: "events", item: { column: { gap: "space.1", items: [
        { text: "{date}", role: "label", tone: "accent" }, { space: "space.6" }, { text: "{label}", role: "h3" }, { text: "{detail}", role: "small", tone: "muted", optional: true },
      ] } } } },
    ] },
    autoFit: ["size:-1", "timeline/vertical"],
  },
  {
    id: "timeline/vertical", family: "timeline", version: "1.0.0", summary: "Dated events down the page",
    slots: { title: "text", events: { min: 2, max: 10, item: { date: "text", label: "text", detail: "text?" } } },
    root: { grid: "12x6", items: [
      { at: "c1-4 r1-3", column: { items: [title] } },
      { at: "c5-12 r1-6", column: { gap: "space.2", each: "events", item: { row: { gap: "space.3", items: [
        { text: "{date}", role: "label", tone: "accent", width: "20%" }, { column: { grow: 1, items: [{ text: "{label}", role: "body" }, { text: "{detail}", role: "caption", tone: "muted", optional: true }] } },
      ] } } } },
    ] },
  },
  // ------------------------------------------------------------ process
  {
    id: "process/chevrons", family: "process", version: "1.0.0", summary: "Steps in a row of cards joined by chevrons",
    slots: { title: "text", kicker: "text?", steps: { min: 2, max: 7, item: { label: "text", detail: "text?" } } },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r3-5", row: { gap: "space.4", connect: "chevron", each: "steps", item: { column: { surface: "card", pad: "space.3", gap: "space.1", items: [
        { text: "{index}", role: "label", tone: "muted", font: "mono" }, { text: "{label}", role: "h3" }, { text: "{detail}", role: "small", tone: "muted", optional: true },
      ] } } } },
    ] },
    autoFit: ["size:-1", "process/numbered"],
  },
  {
    id: "process/numbered", family: "process", version: "1.0.0", summary: "Numbered steps down the page",
    slots: { title: "text", steps: { min: 2, max: 8, item: { label: "text", detail: "text?" } } },
    root: { grid: "12x6", items: [
      { at: "c1-4 r1-3", column: { items: [title] } },
      { at: "c6-12 r1-6", column: { gap: "space.2", each: "steps", item: { row: { gap: "space.3", items: [
        { text: "{index}", role: "h2", tone: "accent", width: "space.6" }, { column: { grow: 1, items: [{ text: "{label}", role: "body" }, { text: "{detail}", role: "small", tone: "muted", optional: true }] } },
      ] } } } },
    ] },
  },
  {
    id: "process/flow", family: "process", version: "1.0.0", summary: "Connected nodes laid out as a flow graph",
    slots: { title: "text", nodes: "data", edges: "data?" },
    root: { grid: "12x6", items: [heading(), { at: "c1-12 r2-6", diagram: { grammar: "flow", nodes: "{nodes}", edges: "{edges}" } }] },
  },
  // ------------------------------------------------------------ roadmap
  {
    id: "roadmap/now-next-later", family: "roadmap", version: "1.0.0", summary: "Three horizons with items in each",
    slots: { title: "text", groups: { min: 2, max: 4, item: { name: "text", points: "list" } } },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r2-6", row: { gap: "space.3", each: "groups", item: { column: { gap: "space.2", items: [
        { text: "{name}", role: "label", tone: "accent", case: "upper" }, { rule: { weight: 2 } },
        { column: { gap: "space.2", each: "points", item: { text: "{item}", role: "small", surface: "card" } } },
      ] } } } },
    ] },
  },
  // ------------------------------------------------------------ matrix
  {
    id: "matrix/quadrant", family: "matrix", version: "1.0.0", summary: "A 2×2 of four labelled quadrants",
    slots: { title: "text", quadrants: { min: 4, max: 4, item: { name: "text", detail: "text?" } } },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r2-6", row: { wrap: true, gap: "space.2", rowGap: "space.2", each: "quadrants", item: { width: "48%", height: "46%", column: { surface: "card", pad: "space.3", gap: "space.1", items: [{ text: "{name}", role: "h3" }, { text: "{detail}", role: "small", tone: "muted", optional: true }] } } } },
    ] },
  },
  // ------------------------------------------------------------ diagram
  {
    id: "diagram/layered", family: "diagram", version: "1.0.0", summary: "A layered architecture or dependency diagram",
    slots: { title: "text", nodes: "data", edges: "data?" },
    root: { grid: "12x6", items: [heading(), { at: "c1-12 r2-6", diagram: { grammar: "layered", direction: "down", nodes: "{nodes}", edges: "{edges}" } }] },
  },
  // ------------------------------------------------------------ image
  {
    id: "image/half-bleed", family: "image", version: "1.0.0", summary: "Image bleeding off one half, text on the other",
    slots: { title: "text", body: "text?", image: "data" },
    root: { grid: "12x6", items: [
      { at: "c1-6 r1-6", bleed: ["left", "top", "bottom"], image: { asset: "{image.asset}", alt: "{image.alt}", fit: "cover" } },
      { at: "c8-12 r2-5", column: { gap: "space.3", justify: "center", items: [title, { text: "{body}", role: "body", optional: true }] } },
    ] },
  },
  {
    id: "image/full-bleed-caption", family: "image", version: "1.0.0", summary: "Full-bleed image with a caption band",
    slots: { title: "text", image: "data" },
    root: { layer: { items: [
      { bleed: ["left", "right", "top", "bottom"], image: { asset: "{image.asset}", alt: "{image.alt}", fit: "cover" } },
      { at: "c1-8 r5-6", column: { surface: "surface", pad: "space.3", items: [title] } },
    ] } },
  },
  // ------------------------------------------------------------ quote
  {
    id: "quote/pull", family: "quote", version: "1.0.0", summary: "A pull quote with attribution",
    slots: { quote: "text", attribution: "text?" },
    root: { grid: "12x6", items: [
      { at: "c2-11 r1-5", column: { gap: "space.3", justify: "center", items: [{ text: "“{quote}”", role: "quote", size: "+1" }, { text: "— {attribution}", role: "body", tone: "muted", optional: true }] } },
    ] },
  },
  // ------------------------------------------------------------ people
  {
    id: "people/grid", family: "people", version: "1.0.0", summary: "Team members with roles",
    slots: { title: "text", people: { min: 1, max: 8, item: { name: "text", role: "text?" } } },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r2-6", row: { wrap: true, gap: "space.3", rowGap: "space.3", each: "people", item: { width: "23%", column: { gap: "space.1", items: [{ text: "{name}", role: "h3" }, { text: "{role}", role: "small", tone: "muted", optional: true }] } } } },
    ] },
  },
  // ------------------------------------------------------------ case
  {
    id: "case/challenge-solution-result", family: "case", version: "1.0.0", summary: "Challenge, solution, and result in three columns",
    slots: { title: "text", challenge: "text", solution: "text", result: "text" },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r2-6", row: { gap: "space.4", items: [
        { column: { gap: "space.2", items: [{ text: "Challenge", role: "label", tone: "muted", case: "upper" }, { text: "{challenge}", role: "body" }] } },
        { column: { gap: "space.2", items: [{ text: "Solution", role: "label", tone: "muted", case: "upper" }, { text: "{solution}", role: "body" }] } },
        { column: { surface: "card", pad: "space.3", gap: "space.2", items: [{ text: "Result", role: "label", tone: "accent", case: "upper" }, { text: "{result}", role: "lead" }] } },
      ] } },
    ] },
  },
  // ------------------------------------------------------------ tiers
  {
    id: "tiers/columns", family: "tiers", version: "1.0.0", summary: "Two to four tiers with features",
    slots: { title: "text", groups: { min: 2, max: 4, item: { name: "text", points: "list", verdict: "text?" } } },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r2-6", row: { gap: "space.3", each: "groups", item: { column: { surface: "card", pad: "space.3", gap: "space.2", items: [
        { text: "{name}", role: "h3" }, { text: "{verdict}", role: "h2", tone: "accent", optional: true },
        { column: { gap: "space.1", each: "points", item: { text: "{item}", role: "small", list: "bullet" } } },
      ] } } } },
    ] },
  },
  // ------------------------------------------------------------ risks
  {
    id: "risks/table", family: "risks", version: "1.0.0", summary: "Risks with likelihood, impact, and mitigation",
    slots: { title: "text", table: "data" },
    root: { grid: "12x6", items: [heading(), { at: "c1-12 r2-6", table: { data: "{table}" } }] },
  },
  // ------------------------------------------------------------ decision
  {
    id: "decision/recommendation", family: "decision", version: "1.0.0", summary: "Options considered and the recommended one, with the ask",
    slots: { title: "text", groups: { min: 2, max: 3, item: { name: "text", points: "list" } }, statement: "text", ask: "text?" },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-7 r2-6", column: { gap: "space.3", each: "groups", item: { column: { gap: "space.1", items: [{ text: "{name}", role: "h3" }, { column: { each: "points", item: { text: "{item}", role: "small", tone: "muted", list: "bullet" } } }] } } } },
      { at: "c9-12 r2-6", column: { surface: "card", pad: "space.4", gap: "space.2", justify: "center", items: [{ text: "Recommendation", role: "label", tone: "accent", case: "upper" }, { text: "{statement}", role: "lead" }, { text: "{ask}", role: "body", tone: "muted", optional: true }] } },
    ] },
  },
  // ------------------------------------------------------------ qa, sources, closing
  {
    id: "qa/two-column", family: "qa", version: "1.0.0", summary: "Questions and answers",
    slots: { title: "text", pairs: { min: 1, max: 6, item: { q: "text", a: "text" } } },
    root: { grid: "12x6", items: [
      heading(),
      { at: "c1-12 r2-6", row: { wrap: true, gap: "space.4", rowGap: "space.3", each: "pairs", item: { width: "48%", column: { gap: "space.1", items: [{ text: "{q}", role: "h3" }, { text: "{a}", role: "small", tone: "muted" }] } } } },
    ] },
  },
  {
    id: "sources/list", family: "sources", version: "1.0.0", summary: "References",
    slots: { title: "text", sources: "list" },
    root: { grid: "12x6", items: [
      { at: "c1-12 r1", column: { justify: "end", items: [title] } },
      { at: "c1-12 r2-6", column: { gap: "space.1", each: "sources", item: { text: "{item}", role: "caption", list: "number" } } },
    ] },
  },
  {
    id: "closing/call-to-action", family: "closing", version: "1.0.0", summary: "Closing call to action with next steps and contact",
    slots: { title: "text", actions: "list?", contact: "text?" },
    root: { grid: "12x6", items: [
      { at: "c1-7 r2-5", column: { gap: "space.3", justify: "center", items: [{ id: "title", text: "{title}", role: "title", size: "+1" }, { text: "{contact}", role: "body", tone: "muted", optional: true }] } },
      { at: "c9-12 r2-5", column: { gap: "space.2", justify: "center", each: "actions", item: { text: "{item}", role: "body", list: "bullet" } } },
    ] },
  },
];

export const RECIPES_VERSION = "1.0.0";

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((recipe) => recipe.id === id);
}

export function recipeFamilies(): string[] {
  return [...new Set(RECIPES.map((recipe) => recipe.family))];
}

/** Starter components: examples of the language, not a house style. Used as `starter/<name>`. */
export const STARTER_COMPONENTS: Record<string, { params: string[]; defaults?: Record<string, unknown>; root: Record<string, unknown>; description: string }> = {
  stat: { params: ["value", "label", "note"], description: "A number and what it counts", root: { column: { gap: "space.1", items: [{ text: "{value}", role: "display", size: "-2", tone: "accent" }, { text: "{label}", role: "body" }, { text: "{note}", role: "caption", tone: "muted", optional: true }] } } },
  "quote-block": { params: ["quote", "who"], description: "A quotation with attribution", root: { column: { gap: "space.2", items: [{ text: "“{quote}”", role: "quote" }, { text: "— {who}", role: "small", tone: "muted", optional: true }] } } },
  step: { params: ["n", "label", "detail"], description: "A numbered step", root: { column: { gap: "space.1", items: [{ text: "{n}", role: "label", tone: "accent" }, { text: "{label}", role: "h3" }, { text: "{detail}", role: "small", tone: "muted", optional: true }] } } },
  person: { params: ["name", "role"], description: "A name and role", root: { column: { gap: "space.1", items: [{ text: "{name}", role: "h3" }, { text: "{role}", role: "small", tone: "muted", optional: true }] } } },
  "logo-row": { params: ["logos"], description: "A row of logos (images with alt text)", root: { row: { gap: "space.5", align: "center", each: "logos", item: { image: { asset: "{asset}", alt: "{alt}", fit: "contain" } } } } },
};
