import { z } from "zod";

import { designRequest } from "./design.js";

export const INTENT_SCHEMA_ID = "slide-agent.intent/1";
export const COMPOSE_GRAMMAR_ID = "slide-agent.compose/1";

export const SLIDE_FORMATS_V2 = {
  "16:9": { width: 13.333333, height: 7.5 },
  "4:3": { width: 10, height: 7.5 },
  "9:16": { width: 7.5, height: 13.333333 },
  "a4-landscape": { width: 11.69, height: 8.27 },
  "a4-portrait": { width: 8.27, height: 11.69 },
} as const;
export type SlideFormatV2 = keyof typeof SLIDE_FORMATS_V2;

const slideId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, "Slide ids are lowercase letters, digits, and hyphens, up to 41 characters.");

/** A raw composition node; `compose/normalize` validates it with JSON-pointer findings. */
const rawNode = z.record(z.string(), z.unknown()).describe("A composition node: an object with one kind key (grid, row, column, layer, free, text, shape, image, icon, chart, table, diagram, use, texture, rule, space). See slide-agent://grammar.");

export const pin = z.union([
  z.string().describe("A JSON pointer (relative to the slide) of a property to keep as authored, e.g. /compose/items/0/size"),
  z.object({ path: z.string(), refuse: z.enum(["contrast", "type-step", "snap", "font-substitute", "clamp-bounds"]).optional(), value: z.unknown().optional() }).strict(),
]);
export type Pin = z.infer<typeof pin>;

export const componentDef = z.object({
  params: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/)).max(20),
  defaults: z.record(z.string(), z.unknown()).optional(),
  root: rawNode,
  description: z.string().max(200).optional(),
}).strict();
export type ComponentDef = z.infer<typeof componentDef>;

export const recipeAdjust = z.object({
  node: z.string().describe("A slot or node id in the recipe, e.g. steps[3] or title"),
  set: z.record(z.string(), z.unknown()),
}).strict();

export const typedContent = z.object({
  title: z.string().max(200).optional(),
  subtitle: z.string().max(300).optional(),
  kicker: z.string().max(80).optional(),
  points: z.array(z.union([z.string(), z.object({ text: z.string(), sub: z.array(z.string()).optional() })])).max(12).optional(),
  metrics: z.array(z.object({ value: z.string(), label: z.string(), note: z.string().optional() })).max(8).optional(),
  events: z.array(z.object({ date: z.string(), label: z.string(), detail: z.string().optional() })).max(16).optional(),
  steps: z.array(z.object({ label: z.string(), detail: z.string().optional() })).max(10).optional(),
  groups: z.array(z.object({ name: z.string(), points: z.array(z.string()), verdict: z.string().optional() })).max(6).optional(),
  chart: z.record(z.string(), z.unknown()).optional(),
  table: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))) }).optional(),
  nodes: z.array(z.object({ id: z.string(), label: z.string() }).passthrough()).optional(),
  edges: z.array(z.object({ from: z.string(), to: z.string() }).passthrough()).optional(),
  quote: z.string().max(600).optional(),
  attribution: z.string().max(120).optional(),
  image: z.object({ asset: z.string(), alt: z.string() }).optional(),
  statement: z.string().max(300).optional(),
  people: z.array(z.object({ name: z.string(), role: z.string().optional(), image: z.string().optional() })).max(12).optional(),
  pairs: z.array(z.object({ q: z.string(), a: z.string() })).max(8).optional(),
  sources: z.array(z.string()).max(20).optional(),
  actions: z.array(z.string()).max(6).optional(),
  contact: z.string().optional(),
}).passthrough();
export type TypedContent = z.infer<typeof typedContent>;

const slideBase = {
  id: slideId,
  message: z.string().max(200).describe("What the audience should take away from this slide"),
  notes: z.string().max(3000).optional(),
  sources: z.array(z.string()).optional(),
  pins: z.array(pin).optional(),
  tags: z.array(z.string().max(30)).max(8).optional().describe("Free labels such as evidence or section-open; texture rules can target them"),
  background: z.string().optional().describe("A colour role or palette name for this slide's ground"),
  layout: z.string().optional().describe("Customer layout name to generate into (brand decks)"),
  hidden: z.boolean().optional(),
};

export const composedSlide = z.object({ ...slideBase, compose: rawNode }).strict();
export const recipeSlide = z.object({ ...slideBase, recipe: z.string().regex(/^[a-z-]+\/[a-z0-9-]+$/), content: z.record(z.string(), z.unknown()), adjust: z.array(recipeAdjust).optional() }).strict();
export const autoSlide = z.object({ ...slideBase, auto: typedContent }).strict();
export const canvasSlide = z.object({ ...slideBase, canvas: z.array(z.record(z.string(), z.unknown())) }).strict();

export const slide = z.union([composedSlide, recipeSlide, autoSlide, canvasSlide]);
export type Slide = z.infer<typeof slide>;
export type ComposedSlide = z.infer<typeof composedSlide>;
export type RecipeSlide = z.infer<typeof recipeSlide>;
export type AutoSlide = z.infer<typeof autoSlide>;
export type CanvasSlide = z.infer<typeof canvasSlide>;

export function slideMode(value: Slide): "compose" | "recipe" | "auto" | "canvas" {
  if ("compose" in value) return "compose";
  if ("recipe" in value) return "recipe";
  if ("auto" in value) return "auto";
  return "canvas";
}

export const source = z.object({
  id: z.string(),
  title: z.string().max(200),
  url: z.string().optional(),
  note: z.string().max(300).optional(),
}).strict();

export const claim = z.object({
  id: z.string(),
  text: z.string().max(300),
  sources: z.array(z.string()),
  slides: z.array(z.string()).optional(),
}).strict();

export const deckIntent = z.object({
  schema: z.literal(INTENT_SCHEMA_ID),
  brief: z.object({
    title: z.string().min(1).max(120),
    audience: z.string().max(160).default(""),
    goal: z.string().max(240).default(""),
    tone: z.string().max(60).optional(),
    language: z.string().default("en"),
    format: z.enum(["16:9", "4:3", "9:16", "a4-landscape", "a4-portrait"]).default("16:9"),
    archetype: z.enum(["board", "pitch", "report", "training", "technical", "sales", "keynote", "general"]).optional(),
    author: z.string().max(120).optional(),
  }).strict(),
  direction: z.object({
    concept: z.string().max(600).default("").describe("The visual idea in plain words: what the deck should feel like, and why that suits this audience and goal"),
    fit: z.enum(["ask", "auto"]).default("ask").describe("ask: design-changing fit moves come back as choices; auto: the engine may apply them"),
  }).strict().default({ concept: "", fit: "ask" }),
  design: designRequest,
  components: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,31}$/), componentDef).optional(),
  data: z.record(z.string(), z.unknown()).optional().describe("Named datasets that charts and tables reference by name"),
  slides: z.array(slide).min(1).max(300),
  sources: z.array(source).optional(),
  claims: z.array(claim).optional(),
  pins: z.array(pin).optional().describe("Deck-wide pins, e.g. {path: \"/design/language/color/palette/stone\", refuse: \"contrast\"}"),
  options: z.object({
    chrome: z.object({ slideNumbers: z.boolean().optional(), footer: z.string().max(80).optional(), logo: z.string().optional() }).strict().optional(),
    speakerNotes: z.enum(["none", "authored", "generate"]).optional(),
    fonts: z.enum(["embed", "office-safe"]).optional(),
    seed: z.number().int().optional(),
  }).strict().optional(),
  reviewed: z.object({
    by: z.string(),
    at: z.string(),
    notes: z.array(z.object({ slide: z.string().optional(), note: z.string() })).max(40).optional(),
  }).optional().describe("A design review recorded by the host after looking at the preview"),
}).strict();

export type DeckIntent = z.infer<typeof deckIntent>;
export type DeckIntentInput = z.input<typeof deckIntent>;
