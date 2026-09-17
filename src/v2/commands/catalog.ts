import { RECIPES, STARTER_COMPONENTS } from "../compose/recipes.js";
import { iconSetInfo, searchIcons } from "../icons/index.js";
import { TEXTURE_PRIMITIVES, TYPE_ROLES } from "../ir/design.js";
import { COMPOSE_GRAMMAR_ID, INTENT_SCHEMA_ID } from "../ir/intent.js";
import { presetNames } from "../tokens/presets.js";
import { searchFamilies } from "../text/catalog.js";
import { VERSION } from "../../version.js";

/**
 * What a host reads before it designs. Byte-stable for a given version so it
 * caches. The grammar page is the most important page a host reads: it has to
 * make the composition language fluent in under 2,000 tokens.
 */

export const GRAMMAR = `# ${COMPOSE_GRAMMAR_ID}

You direct the design; the engine computes geometry, fits text, verifies contrast, and writes native PowerPoint. Write decisions, never coordinates.

## Intent
{"schema":"${INTENT_SCHEMA_ID}", "brief":{title,audience,goal,format:"16:9"}, "direction":{concept,fit:"ask"}, "design":{"language":{…}}, "components":{…}, "data":{…}, "slides":[…]}

A slide is {id, message, …} plus exactly one of: "compose" (your composition), "recipe"+"content" (a starting point, adaptable with "adjust"), "auto" (draft: the engine picks a recipe — labelled), "canvas" (V1 elements).

## Design language (written once)
color: {palette:{name:"#hex"|"oklch(L C H)"}, roles:{background,surface,text,muted,accent,accentAlt?,rule?}, data:[names]}
type: {display:{family,weight?,tracking?,case?}, body:{…}, mono?:{…}, scale:{base:18,ratio:1.25} | {title:44,body:18,…}, leading?:{role:1.1}}
space: {unit:8, margin:40|"space.5"|"5%", gutter:20}; grid: {columns:12, rows:6}; shape: {radius, stroke, shadow?}
surfaces: {card:{fill:"surface",radius:4,pad:"space.3"}, band:{fill:"accent"}}; texture: [{id,primitive,params,apply?:{slides|roles}}]
charts: {axis,gridlines,labels,highlight,legend}; chrome: {slideNumber,footer}
Any font you name is resolved, measured, and embedded when available; otherwise you get a finding with the closest faces.

## Nodes: one kind key each
Containers: grid, row, column, layer, free. Leaves: text, shape, image, icon, chart, table, diagram, use, texture, rule, space.
{"grid":"12x6","items":[…]}                       children placed by "at":"c1-7 r2-6" (1-based, inclusive)
{"row":{"gap":"space.3","items":[…]}}             children share width by grow (default 1); width:"auto" = content
{"column":{"gap":"space.2","justify":"end","items":[…]}}   children take their height; grow fills
{"layer":{"anchor":"bottom-left","items":[…]}}    overlap in one box, in order
{"free":{"items":[{"box":[x,y,w,h],…}]}}          art-directed placement in grid units
Any node: id, at, box, grow, basis, width, height, align, justify, pad, gap, surface, bleed:["right"], tone, size:"+1", z, rotate, opacity, decorative, order, optional.
Containers also: connect:"line"|"arrow"|"chevron"|"dots", wrap, each+item (repeat).

text: {"text":"**bold** *italic* [link](https://…)","role":"${TYPE_ROLES.join("|")}", size:"+2"|120, weight, tone, font:"display|body|mono|Family", case, tracking, align, valign, lines, balance, fit:{minStep:-2}, list:"bullet"}
shape: {"shape":"roundRect|ellipse|chevron|…","fill":"accent/20","stroke","radius"} or {"shape":{"path":"M0 0L1 1…"}} (unit box)
image: {"image":{"asset":"photo.jpg","alt":"what it shows","fit":"cover","focal":[0.5,0.3],"treatment":"duotone"}}
icon: {"icon":"shield-check"} or {"icon":"?security"}; chart: {"chart":{"data":"revenue"|{categories,series:[{name,values}]},"chart":"line","highlight":"Q4","annotate":["change:Q1..Q4"]}}
table: {"table":{"data":{columns,rows},"highlight":{row:2}}}; diagram: {"diagram":{"grammar":"flow|layered|hierarchy|cycle|swimlane","nodes":[{id,label,emphasis}],"edges":[{from,to}]}}
use: {"use":"gate","n":"01","label":"Pilot","tone":"accent"}; texture: {"texture":"margin-rule"}; rule: {"rule":{}}; space: {"space":"space.4"}

Values: tokens (space.3, accent, muted, card, accent/20 = 20% toward white), relative (40%, 2fr, "+1" type steps), or literals (recorded, allowed).

## Components (defined once, used anywhere)
"components":{"gate":{"params":["n","label","detail"],"root":{"column":{"surface":"card","pad":"space.2","gap":"space.1","items":[{"text":"{n}","role":"label","font":"mono","tone":"muted"},{"text":"{label}","role":"h3"},{"text":"{detail}","role":"small","tone":"muted"}]}}}}

## Worked example: emphasis by proportion
{"id":"route","message":"Waves fail at the pilot","compose":{"grid":"12x6","items":[
 {"at":"c1-9 r1","text":"Every wave clears the same six gates","role":"title"},
 {"at":"c1-12 r3-5","row":{"gap":"space.3","connect":"chevron","items":[
  {"use":"gate","n":"01","label":"Inventory","detail":"what talks to what"},
  {"use":"gate","n":"04","label":"Pilot","detail":"one business unit","grow":2,"tone":"accent","size":"+1"}]}}]}}

## Worked example: a hero number over a bleeding chart band
{"id":"turn","message":"Churn fell 41%","compose":{"grid":"12x6","items":[
 {"at":"c1-7 r1-4","layer":{"anchor":"bottom-left","items":[{"texture":"large-numeral","params":{"text":"41"}},{"text":"−41%","role":"display","size":150,"tone":"accent"}]}},
 {"at":"c1-6 r5-6","column":{"gap":"space.1","items":[{"text":"Churn fell 41% in two quarters","role":"title"},{"text":"after onboarding moved in-product","role":"body","tone":"muted"}]}},
 {"at":"c8-12 r1-6","bleed":["right","top","bottom"],"surface":"band","column":{"pad":"space.5","justify":"center","items":[{"chart":{"data":"churn","chart":"line","highlight":"Mar"}},{"text":"Cohorts Jan–Jun, n = 18,400","role":"caption"}]}}]}}

## What comes back
A verdict: state (broken | needs-attention | ready-unrendered | ready), adjustments the engine made (contrast, type-step — refuse any with a pin), suggestedEdits (choose an option, or shorten to maxChars), rhythm notes (you decide if repetition is deliberate), and a preview sheet to judge the design against the brief. Answer choices with slides_edit; never hunt overflow by eye.
`;

export type CatalogSection = "grammar" | "components" | "recipes" | "fonts" | "icons" | "presets" | "textures" | "schema";

export function catalog(include: CatalogSection[] = ["grammar", "components", "recipes", "presets"], query?: { fonts?: string; icons?: string }): Record<string, unknown> {
  const result: Record<string, unknown> = { version: VERSION, schema: INTENT_SCHEMA_ID, grammar: COMPOSE_GRAMMAR_ID };
  if (include.includes("grammar")) result.grammarPage = GRAMMAR;
  if (include.includes("components")) {
    result.starterComponents = Object.fromEntries(Object.entries(STARTER_COMPONENTS).map(([name, component]) => [`starter/${name}`, `${component.description} (params: ${component.params.join(", ")})`]));
  }
  if (include.includes("recipes")) {
    result.recipes = RECIPES.map((recipe) => `${recipe.id} — ${recipe.summary}; slots: ${Object.entries(recipe.slots).map(([slot, spec]) => typeof spec === "string" ? `${slot}${spec.endsWith("?") ? "?" : ""}` : `${slot}[${spec.min}–${spec.max}]`).join(", ")}`);
    result.recipeNote = "Recipes are starting points for routine slides and drafts. slides_view {what:\"expand\"} opens one as a composition you can rework. Verdicts count recipe and draft slides separately from composed ones.";
  }
  if (include.includes("presets")) {
    result.presets = presetNames();
    result.presetNote = "Presets are generated draft themes, labelled design: preset in every verdict. A directed deck writes its own design language.";
  }
  if (include.includes("textures")) result.texturePrimitives = [...TEXTURE_PRIMITIVES];
  if (include.includes("fonts")) {
    result.fonts = searchFamilies(query?.fonts ?? "", 24).map((family) => `${family.family} — ${family.classes.join("/")}${family.note ? `; ${family.note}` : ""}`);
    result.fontNote = "Any face may be named. Office faces are never embedded; others are embedded when their files are available (slide-agent fonts add <family>).";
  }
  if (include.includes("icons")) {
    const info = iconSetInfo();
    result.icons = { set: `${info.set} ${info.version} (${info.license})`, count: info.count, ...(query?.icons ? { matches: searchIcons(query.icons, 12).map((match) => match.name) } : { usage: "\"icon\":\"name\" or \"?concept\"; slides_catalog {include:[\"icons\"], icons:\"growth\"} searches" }) };
  }
  return result;
}
