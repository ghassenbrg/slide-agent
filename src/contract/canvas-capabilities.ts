import { publishedCanvasElementSchema } from "./json-schema.js";

/**
 * What the canvas can actually express, in a form a model can read before it
 * designs rather than after it has simplified an idea into boxes.
 *
 * The element and property lists are *derived from the published schemas*, not
 * restated. A hand-written capability list drifts the first time a property is
 * added, and a model that trusts a stale list designs against a canvas that
 * does not exist. Everything that cannot be derived — whether a feature
 * survives as a native PowerPoint object, what the render backend cannot show,
 * which fonts this machine has — is stated explicitly and honestly, because
 * those are exactly the questions a capability document exists to answer.
 */

export type EditabilityClass =
  | "native"
  | "grouped-native"
  | "embedded-vector"
  | "embedded-raster"
  | "generated-native";

export interface CanvasElementCapability {
  type: string;
  description: string;
  /** What survives as an editable PowerPoint object. */
  editability: EditabilityClass;
  /** Top-level properties the schema accepts, derived from the contract. */
  properties: string[];
  /** Style/native-option properties, derived from the contract. */
  styleProperties: string[];
  /** `core` ships with the engine; `extension` needs a host contribution. */
  origin: "core" | "extension";
  notes?: string[];
}

export interface CanvasCapabilities {
  /** The one syntax for pointing a style value at a deck variable. */
  variableSyntax: string;
  /** How named styles are referenced from an element. */
  styleReference: string;
  elements: CanvasElementCapability[];
  text: {
    runs: boolean;
    /** Paragraph properties exposed in the schema, not only in `options`. */
    paragraph: string[];
    autofit: string[];
    /** Escape hatch for anything PptxGenJS supports that the schema does not name. */
    nativeOptions: boolean;
  };
  geometry: {
    unit: "in";
    rotation: boolean;
    negativeExtents: boolean;
    zOrder: boolean;
    namedLayers: boolean;
    grouping: "logical-expanded" | "native";
    groupingNote: string;
  };
  fill: {
    solid: boolean;
    transparency: boolean;
    line: boolean;
    dash: boolean;
    arrowheads: boolean;
    /** Gradient and pattern fills reach the slide through `style.options`. */
    viaNativeOptions: string[];
  };
  images: {
    formats: string[];
    fit: string[];
    crop: boolean;
    focalPoint: boolean;
    maskShape: boolean;
    duotone: boolean;
    grayscale: boolean;
    tint: string;
    vector: string;
    rotation: boolean;
    transparency: boolean;
  };
  links: {
    schemes: string[];
    internalSlideLinks: boolean;
    tooltips: boolean;
  };
  notes: {
    speakerNotes: boolean;
    sourcesBlock: boolean;
    creditsBlock: boolean;
  };
  /** Everything a host can replace or extend. */
  extensibility: string[];
}

type JsonSchemaNode = {
  properties?: Record<string, JsonSchemaNode>;
  const?: string;
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  allOf?: JsonSchemaNode[];
  $ref?: string;
  items?: JsonSchemaNode;
  $defs?: Record<string, JsonSchemaNode>;
};

/**
 * A reader for the published canvas-element schema.
 *
 * The schema names its shared subschemas rather than repeating them, which is
 * what keeps it small enough to read. Capability extraction wants the opposite
 * — the whole shape of one element type in one place — so this follows `$ref`
 * as it walks, with the definition table captured once instead of threaded
 * through every step.
 */
function schemaReader() {
  // The published form, not a separately generated one: capabilities that
  // described a schema hosts are not served would be a second contract nobody
  // agreed to.
  const root = publishedCanvasElementSchema() as JsonSchemaNode;
  const definitions = root.$defs ?? {};

  /**
   * Follows a `$ref` to the node it names.
   *
   * `seen` breaks the recursion a group's children introduce: a definition
   * already open on this path resolves to an empty node, which is right here
   * because the property names it would contribute were collected higher up.
   */
  const deref = (node: JsonSchemaNode | undefined, seen: ReadonlySet<string> = new Set()): JsonSchemaNode => {
    if (!node) return {};
    const name = node.$ref?.split("/").pop();
    if (!name) return node;
    if (seen.has(name) || !definitions[name]) return {};
    return deref(definitions[name], new Set([...seen, name]));
  };

  /** The object behind a node, past any `$ref` and any `literal | {$var}` union. */
  const objectAt = (node: JsonSchemaNode | undefined): JsonSchemaNode => {
    const resolved = deref(node);
    if (resolved.properties) return resolved;
    const branches = (resolved.anyOf ?? resolved.oneOf ?? resolved.allOf ?? []).map((branch) => deref(branch));
    return branches.find((branch) => branch.properties) ?? resolved;
  };

  return {
    variants: (deref(root).anyOf ?? deref(root).oneOf ?? []).map((variant) => deref(variant)),
    propertyNames: (node: JsonSchemaNode | undefined): string[] => Object.keys(objectAt(node).properties ?? {}),
  };
}

const ELEMENT_NOTES: Record<string, { description: string; editability: EditabilityClass; origin?: "core" | "extension"; notes?: string[] }> = {
  text: {
    description: "An editable PowerPoint text box. Every visible word on a slide is one of these; nothing renders implicitly.",
    editability: "native",
  },
  shape: {
    description: "Any PptxGenJS preset shape by name. Not a whitelist — an unrecognised name reaches PowerPoint unchanged.",
    editability: "native",
  },
  connector: {
    description: "A straight line between two points, with optional arrowheads and dashes. x/y is the start; w/h is the delta and may be negative.",
    editability: "native",
  },
  image: {
    description: "An embedded picture. Supports crop, focal point, mask shape, duotone, grayscale, tint, rotation, and transparency.",
    editability: "embedded-raster",
    notes: [
      "Pixels stay pixels: PowerPoint can move, crop, and mask the picture but cannot edit what is inside it.",
      "Attach vector artwork with `vector` to declare scalable artwork and its honest editability.",
    ],
  },
  table: {
    description: "A native PowerPoint table with editable cells.",
    editability: "native",
  },
  chart: {
    description: "A native, editable chart with its data embedded in the package.",
    editability: "native",
  },
  "native-chart": {
    description: "Escape hatch for any chart type or data shape PptxGenJS supports, passed through unchanged.",
    editability: "native",
  },
  diagram: {
    description: "A relationship expressed as a named grammar; Slide Agent places the geometry and emits editable primitives.",
    editability: "generated-native",
    notes: ["Built-in grammars are listed under `diagrams`. A host can register more."],
  },
  group: {
    description: "A logical group. Children are positioned relative to the group origin and expand into ordinary native elements.",
    editability: "grouped-native",
    notes: [
      "Not a native OOXML group: grouping survives Office but degrades unevenly elsewhere, so every child ships individually selectable.",
      "The relative transform and the group id survive scene round-trip and remain addressable by a patch.",
    ],
  },
  "symbol-instance": {
    description: "One placement of a symbol the deck itself declared, with per-instance scale, text, colour, and style overrides.",
    editability: "grouped-native",
    notes: ["Symbols are author-defined. Slide Agent ships no icon vocabulary."],
  },
};

export function canvasCapabilities(): CanvasCapabilities {
  const { variants, propertyNames } = schemaReader();
  const elements: CanvasElementCapability[] = variants.map((variant) => {
    const properties = variant.properties ?? {};
    const type = properties.type?.const ?? "unknown";
    const meta = ELEMENT_NOTES[type] ?? {
      description: "",
      editability: "native" as const,
      origin: "core" as const,
    };
    const styleSource = properties.style ?? properties.options;
    return {
      type,
      description: meta.description,
      editability: meta.editability,
      properties: Object.keys(properties).filter((name) => name !== "type"),
      styleProperties: propertyNames(styleSource),
      origin: meta.origin ?? "core",
      ...(meta.notes ? { notes: meta.notes } : {}),
    };
  });

  const textVariant = variants.find((variant) => variant.properties?.type?.const === "text");
  const textStyle = propertyNames(textVariant?.properties?.style);

  return {
    variableSyntax: '{"$var":"name"} — points a style value at creativeDirection.visualSystem.variables.',
    styleReference: 'styleRef: "name" | ["name", …] — named styles applied in order; the element\'s own `style` is the final override.',
    elements,
    text: {
      runs: true,
      paragraph: textStyle.filter((name) => [
        "lineSpacing", "lineSpacingMultiple", "charSpacing", "indent", "columns", "noBreak", "bullet", "align", "valign", "margin",
      ].includes(name)),
      autofit: ["none", "shrink", "resize"],
      nativeOptions: true,
    },
    geometry: {
      unit: "in",
      rotation: true,
      negativeExtents: true,
      zOrder: true,
      namedLayers: true,
      grouping: "logical-expanded",
      groupingNote: "A group expands to individually editable native elements and records its group id on each one. Slide Agent does not emit a native OOXML group, because that claim only holds in desktop Office.",
    },
    fill: {
      solid: true,
      transparency: true,
      line: true,
      dash: true,
      arrowheads: true,
      viaNativeOptions: ["gradient fills", "pattern fills", "shadows", "glow", "soft edges", "3-D effects"],
    },
    images: {
      formats: [".png", ".jpg", ".gif", ".webp"],
      fit: ["cover", "contain", "stretch"],
      crop: true,
      focalPoint: true,
      maskShape: true,
      duotone: true,
      grayscale: true,
      tint: "Drawn as a real, editable overlay shape rather than baked into the pixels, so it can be changed or removed in PowerPoint.",
      vector: "SVG rides alongside the raster as an OOXML blip enhancement. The raster `path` is still required — it is what older viewers draw — and `vector.editable` states honestly what a person can change.",
      rotation: true,
      transparency: true,
    },
    links: {
      schemes: ["http", "https", "mailto"],
      internalSlideLinks: true,
      tooltips: true,
    },
    notes: {
      speakerNotes: true,
      sourcesBlock: true,
      creditsBlock: true,
    },
    extensibility: [
      "layouts — replace or add a fallback layout",
      "diagrams — register a diagram grammar, or replace a built-in of the same id",
      "charts — replace the renderer for one or more chart kinds",
      "checks — contribute a validation rule",
      "assets — supply an image resolver: stock search, an asset library, a generator",
      "render — supply a preview backend that does not need LibreOffice",
      "tokenizer — replace how creativeDirection becomes the fallback design system",
      "reviewers — supply a visual reviewer that consumes the deterministic review packet",
    ],
  };
}
