/**
 * Faces the engine knows about without scanning a disk.
 *
 * Two lists. Office faces are present wherever the deck will be opened, so they
 * are never embedded; several have metric-compatible open substitutes that make
 * measurement exact on machines without Office. The open library is ~80 OFL or
 * Apache families a model can choose from freely — on demand they are fetched
 * (operator policy permitting), measured from their own files, and embedded.
 *
 * Classification is metadata for search and for suggesting the closest
 * available face when a requested one cannot be resolved. It is not a menu:
 * a model may name any face.
 */

export type FontClassification = "serif" | "sans" | "grotesque" | "humanist" | "geometric" | "slab" | "mono" | "display" | "script" | "condensed";

export interface CatalogFamily {
  family: string;
  classes: FontClassification[];
  weights: number[];
  italic: boolean;
  license: "OFL" | "Apache" | "UFL" | "Office";
  scripts?: string[];
  note?: string;
}

export const OFFICE_FAMILIES: Record<string, { substitute?: string; classes: FontClassification[] }> = {
  "Aptos": { classes: ["sans", "humanist"] },
  "Aptos Display": { classes: ["sans", "display"] },
  "Calibri": { substitute: "Carlito", classes: ["sans", "humanist"] },
  "Calibri Light": { substitute: "Carlito", classes: ["sans", "humanist"] },
  "Cambria": { substitute: "Caladea", classes: ["serif"] },
  "Arial": { substitute: "Arimo", classes: ["sans", "grotesque"] },
  "Arial Narrow": { classes: ["sans", "condensed"] },
  "Arial Black": { classes: ["sans", "display"] },
  "Helvetica": { substitute: "Arimo", classes: ["sans", "grotesque"] },
  "Times New Roman": { substitute: "Tinos", classes: ["serif"] },
  "Courier New": { substitute: "Cousine", classes: ["mono"] },
  "Georgia": { substitute: "Gelasio", classes: ["serif"] },
  "Verdana": { classes: ["sans", "humanist"] },
  "Tahoma": { classes: ["sans", "humanist"] },
  "Trebuchet MS": { classes: ["sans", "humanist"] },
  "Segoe UI": { substitute: "Selawik", classes: ["sans", "humanist"] },
  "Consolas": { classes: ["mono"] },
  "Candara": { classes: ["sans", "humanist"] },
  "Corbel": { classes: ["sans", "humanist"] },
  "Constantia": { classes: ["serif"] },
  "Century Gothic": { classes: ["sans", "geometric"] },
  "Franklin Gothic Medium": { classes: ["sans", "grotesque"] },
  "Gill Sans MT": { classes: ["sans", "humanist"] },
  "Garamond": { classes: ["serif"] },
  "Book Antiqua": { classes: ["serif"] },
  "Rockwell": { classes: ["slab"] },
  "Impact": { classes: ["sans", "display", "condensed"] },
  "Palatino Linotype": { classes: ["serif"] },
  "Lucida Console": { classes: ["mono"] },
  "Bahnschrift": { classes: ["sans", "grotesque", "condensed"] },
};

const w = (...weights: number[]) => weights;

export const OPEN_FAMILIES: CatalogFamily[] = [
  // Serif
  { family: "Source Serif 4", classes: ["serif"], weights: w(300, 400, 600, 700, 900), italic: true, license: "OFL" },
  { family: "Newsreader", classes: ["serif"], weights: w(300, 400, 500, 600, 700), italic: true, license: "OFL" },
  { family: "Fraunces", classes: ["serif", "display"], weights: w(300, 400, 600, 700, 900), italic: true, license: "OFL", note: "soft, wonky display serif" },
  { family: "Playfair Display", classes: ["serif", "display"], weights: w(400, 600, 700, 900), italic: true, license: "OFL" },
  { family: "Libre Baskerville", classes: ["serif"], weights: w(400, 700), italic: true, license: "OFL" },
  { family: "Libre Caslon Text", classes: ["serif"], weights: w(400, 700), italic: true, license: "OFL" },
  { family: "EB Garamond", classes: ["serif"], weights: w(400, 500, 600, 700, 800), italic: true, license: "OFL" },
  { family: "Cormorant Garamond", classes: ["serif", "display"], weights: w(300, 400, 500, 600, 700), italic: true, license: "OFL" },
  { family: "Crimson Pro", classes: ["serif"], weights: w(300, 400, 600, 700, 900), italic: true, license: "OFL" },
  { family: "Lora", classes: ["serif"], weights: w(400, 500, 600, 700), italic: true, license: "OFL" },
  { family: "Merriweather", classes: ["serif"], weights: w(300, 400, 700, 900), italic: true, license: "OFL" },
  { family: "Spectral", classes: ["serif"], weights: w(300, 400, 500, 600, 700), italic: true, license: "OFL" },
  { family: "DM Serif Display", classes: ["serif", "display"], weights: w(400), italic: true, license: "OFL" },
  { family: "Instrument Serif", classes: ["serif", "display"], weights: w(400), italic: true, license: "OFL" },
  { family: "Young Serif", classes: ["serif", "display"], weights: w(400), italic: false, license: "OFL" },
  { family: "Bodoni Moda", classes: ["serif", "display"], weights: w(400, 500, 600, 700, 900), italic: true, license: "OFL" },
  { family: "Gelasio", classes: ["serif"], weights: w(400, 500, 600, 700), italic: true, license: "OFL", note: "metric-compatible with Georgia" },
  { family: "Tinos", classes: ["serif"], weights: w(400, 700), italic: true, license: "Apache", note: "metric-compatible with Times New Roman" },
  { family: "Caladea", classes: ["serif"], weights: w(400, 700), italic: true, license: "OFL", note: "metric-compatible with Cambria" },
  { family: "Noto Serif", classes: ["serif"], weights: w(400, 700), italic: true, license: "OFL", scripts: ["latin", "greek", "cyrillic"] },
  { family: "IBM Plex Serif", classes: ["serif"], weights: w(300, 400, 500, 600, 700), italic: true, license: "OFL" },
  // Slab
  { family: "Roboto Slab", classes: ["slab"], weights: w(300, 400, 500, 700, 900), italic: false, license: "Apache" },
  { family: "Zilla Slab", classes: ["slab"], weights: w(300, 400, 500, 600, 700), italic: true, license: "OFL" },
  { family: "Arvo", classes: ["slab"], weights: w(400, 700), italic: true, license: "OFL" },
  { family: "Bitter", classes: ["slab"], weights: w(300, 400, 500, 600, 700, 800), italic: true, license: "OFL" },
  // Sans: grotesque, neo-grotesque
  { family: "Inter", classes: ["sans", "grotesque"], weights: w(300, 400, 500, 600, 700, 800), italic: true, license: "OFL" },
  { family: "Inter Tight", classes: ["sans", "grotesque"], weights: w(300, 400, 500, 600, 700, 800), italic: true, license: "OFL" },
  { family: "Archivo", classes: ["sans", "grotesque"], weights: w(300, 400, 500, 600, 700, 800, 900), italic: true, license: "OFL" },
  { family: "Archivo Narrow", classes: ["sans", "grotesque", "condensed"], weights: w(400, 500, 600, 700), italic: true, license: "OFL" },
  { family: "Schibsted Grotesk", classes: ["sans", "grotesque"], weights: w(400, 500, 600, 700, 800, 900), italic: true, license: "OFL" },
  { family: "Hanken Grotesk", classes: ["sans", "grotesque"], weights: w(300, 400, 500, 600, 700, 800), italic: true, license: "OFL" },
  { family: "Space Grotesk", classes: ["sans", "grotesque"], weights: w(300, 400, 500, 600, 700), italic: false, license: "OFL" },
  { family: "Bricolage Grotesque", classes: ["sans", "grotesque", "display"], weights: w(300, 400, 500, 600, 700, 800), italic: false, license: "OFL" },
  { family: "Familjen Grotesk", classes: ["sans", "grotesque"], weights: w(400, 500, 600, 700), italic: true, license: "OFL" },
  { family: "Instrument Sans", classes: ["sans", "grotesque"], weights: w(400, 500, 600, 700), italic: true, license: "OFL" },
  { family: "Arimo", classes: ["sans", "grotesque"], weights: w(400, 500, 600, 700), italic: true, license: "Apache", note: "metric-compatible with Arial and Helvetica" },
  { family: "Roboto", classes: ["sans", "grotesque"], weights: w(300, 400, 500, 700, 900), italic: true, license: "Apache" },
  { family: "Roboto Condensed", classes: ["sans", "condensed"], weights: w(300, 400, 500, 700), italic: true, license: "Apache" },
  { family: "IBM Plex Sans", classes: ["sans", "grotesque"], weights: w(300, 400, 500, 600, 700), italic: true, license: "OFL" },
  { family: "IBM Plex Sans Condensed", classes: ["sans", "condensed"], weights: w(300, 400, 500, 600, 700), italic: true, license: "OFL" },
  { family: "Public Sans", classes: ["sans", "grotesque"], weights: w(300, 400, 500, 600, 700, 800), italic: true, license: "OFL" },
  { family: "Barlow", classes: ["sans", "grotesque"], weights: w(300, 400, 500, 600, 700, 800), italic: true, license: "OFL" },
  { family: "Barlow Condensed", classes: ["sans", "condensed"], weights: w(300, 400, 500, 600, 700, 800), italic: true, license: "OFL" },
  { family: "Oswald", classes: ["sans", "condensed", "display"], weights: w(300, 400, 500, 600, 700), italic: false, license: "OFL" },
  { family: "Anton", classes: ["sans", "condensed", "display"], weights: w(400), italic: false, license: "OFL" },
  { family: "Bebas Neue", classes: ["sans", "condensed", "display"], weights: w(400), italic: false, license: "OFL" },
  // Sans: humanist
  { family: "Source Sans 3", classes: ["sans", "humanist"], weights: w(300, 400, 600, 700, 900), italic: true, license: "OFL" },
  { family: "Open Sans", classes: ["sans", "humanist"], weights: w(300, 400, 600, 700, 800), italic: true, license: "OFL" },
  { family: "Noto Sans", classes: ["sans", "humanist"], weights: w(300, 400, 500, 600, 700), italic: true, license: "OFL", scripts: ["latin", "greek", "cyrillic"] },
  { family: "Fira Sans", classes: ["sans", "humanist"], weights: w(300, 400, 500, 600, 700, 800), italic: true, license: "OFL" },
  { family: "Lato", classes: ["sans", "humanist"], weights: w(300, 400, 700, 900), italic: true, license: "OFL" },
  { family: "Mulish", classes: ["sans", "humanist"], weights: w(300, 400, 600, 700, 800), italic: true, license: "OFL" },
  { family: "Nunito Sans", classes: ["sans", "humanist"], weights: w(300, 400, 600, 700, 800), italic: true, license: "OFL" },
  { family: "Atkinson Hyperlegible", classes: ["sans", "humanist"], weights: w(400, 700), italic: true, license: "OFL", note: "designed for low-vision legibility" },
  { family: "Carlito", classes: ["sans", "humanist"], weights: w(400, 700), italic: true, license: "OFL", note: "metric-compatible with Calibri" },
  { family: "Selawik", classes: ["sans", "humanist"], weights: w(300, 400, 600, 700), italic: false, license: "OFL", note: "metric-compatible with Segoe UI" },
  { family: "Red Hat Text", classes: ["sans", "humanist"], weights: w(300, 400, 500, 600, 700), italic: true, license: "OFL" },
  { family: "Figtree", classes: ["sans", "geometric"], weights: w(300, 400, 500, 600, 700, 800), italic: true, license: "OFL" },
  // Sans: geometric
  { family: "Manrope", classes: ["sans", "geometric"], weights: w(300, 400, 500, 600, 700, 800), italic: false, license: "OFL" },
  { family: "DM Sans", classes: ["sans", "geometric"], weights: w(300, 400, 500, 600, 700), italic: true, license: "OFL" },
  { family: "Outfit", classes: ["sans", "geometric"], weights: w(300, 400, 500, 600, 700, 800), italic: false, license: "OFL" },
  { family: "Poppins", classes: ["sans", "geometric"], weights: w(300, 400, 500, 600, 700, 800), italic: true, license: "OFL" },
  { family: "Montserrat", classes: ["sans", "geometric"], weights: w(300, 400, 500, 600, 700, 800, 900), italic: true, license: "OFL" },
  { family: "Plus Jakarta Sans", classes: ["sans", "geometric"], weights: w(300, 400, 500, 600, 700, 800), italic: true, license: "OFL" },
  { family: "Sora", classes: ["sans", "geometric"], weights: w(300, 400, 500, 600, 700, 800), italic: false, license: "OFL" },
  { family: "Urbanist", classes: ["sans", "geometric"], weights: w(300, 400, 500, 600, 700, 800), italic: true, license: "OFL" },
  { family: "Syne", classes: ["sans", "display"], weights: w(400, 500, 600, 700, 800), italic: false, license: "OFL" },
  { family: "Unbounded", classes: ["sans", "display"], weights: w(300, 400, 500, 600, 700, 800), italic: false, license: "OFL" },
  { family: "Lexend", classes: ["sans", "geometric"], weights: w(300, 400, 500, 600, 700), italic: false, license: "OFL" },
  { family: "Jost", classes: ["sans", "geometric"], weights: w(300, 400, 500, 600, 700), italic: true, license: "OFL" },
  // Mono
  { family: "JetBrains Mono", classes: ["mono"], weights: w(300, 400, 500, 700, 800), italic: true, license: "OFL" },
  { family: "IBM Plex Mono", classes: ["mono"], weights: w(300, 400, 500, 600, 700), italic: true, license: "OFL" },
  { family: "Source Code Pro", classes: ["mono"], weights: w(300, 400, 500, 600, 700), italic: true, license: "OFL" },
  { family: "Space Mono", classes: ["mono"], weights: w(400, 700), italic: true, license: "OFL" },
  { family: "DM Mono", classes: ["mono"], weights: w(300, 400, 500), italic: true, license: "OFL" },
  { family: "Fira Code", classes: ["mono"], weights: w(300, 400, 500, 600, 700), italic: false, license: "OFL" },
  { family: "Martian Mono", classes: ["mono"], weights: w(300, 400, 500, 600, 700, 800), italic: false, license: "OFL" },
  { family: "Cousine", classes: ["mono"], weights: w(400, 700), italic: true, license: "Apache", note: "metric-compatible with Courier New" },
  // Display and script
  { family: "Abril Fatface", classes: ["serif", "display"], weights: w(400), italic: false, license: "OFL" },
  { family: "Alfa Slab One", classes: ["slab", "display"], weights: w(400), italic: false, license: "OFL" },
  { family: "Righteous", classes: ["display"], weights: w(400), italic: false, license: "OFL" },
  { family: "Caveat", classes: ["script"], weights: w(400, 500, 600, 700), italic: false, license: "OFL" },
  { family: "Kalam", classes: ["script"], weights: w(300, 400, 700), italic: false, license: "OFL" },
  // Script packs
  { family: "Noto Sans JP", classes: ["sans"], weights: w(300, 400, 500, 700), italic: false, license: "OFL", scripts: ["japanese"] },
  { family: "Noto Sans SC", classes: ["sans"], weights: w(300, 400, 500, 700), italic: false, license: "OFL", scripts: ["simplified-chinese"] },
  { family: "Noto Sans KR", classes: ["sans"], weights: w(300, 400, 500, 700), italic: false, license: "OFL", scripts: ["korean"] },
  { family: "Noto Sans Arabic", classes: ["sans"], weights: w(300, 400, 500, 700), italic: false, license: "OFL", scripts: ["arabic"] },
  { family: "Noto Sans Devanagari", classes: ["sans"], weights: w(300, 400, 500, 700), italic: false, license: "OFL", scripts: ["devanagari"] },
  { family: "IBM Plex Sans Arabic", classes: ["sans"], weights: w(300, 400, 500, 600, 700), italic: false, license: "OFL", scripts: ["arabic"] },
];

export function isOfficeFamily(family: string): boolean {
  return Object.keys(OFFICE_FAMILIES).some((name) => name.toLowerCase() === family.toLowerCase());
}

export function officeSubstitute(family: string): string | undefined {
  const entry = Object.entries(OFFICE_FAMILIES).find(([name]) => name.toLowerCase() === family.toLowerCase());
  return entry?.[1].substitute;
}

export function catalogEntry(family: string): CatalogFamily | undefined {
  return OPEN_FAMILIES.find((entry) => entry.family.toLowerCase() === family.toLowerCase());
}

/** Guess a classification from a family name, for faces nobody catalogued. */
export function classifyByName(family: string): FontClassification[] {
  const name = family.toLowerCase();
  if (/mono|code|consol|courier/.test(name)) return ["mono"];
  if (/slab|rockwell|arvo|bitter/.test(name)) return ["slab"];
  if (/serif|garamond|caslon|baskerville|bodoni|times|georgia|cambria|antiqua|palatino|didot|playfair|lora|merriweather|spectral|newsreader|fraunces/.test(name) && !/sans/.test(name)) return ["serif"];
  if (/condensed|narrow|compressed|bebas|oswald|anton/.test(name)) return ["sans", "condensed"];
  if (/script|hand|caveat|kalam|brush/.test(name)) return ["script"];
  return ["sans"];
}

export function searchFamilies(query: string, limit = 12): Array<CatalogFamily & { office?: boolean }> {
  const terms = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const all: Array<CatalogFamily & { office?: boolean }> = [
    ...OPEN_FAMILIES,
    ...Object.entries(OFFICE_FAMILIES).map(([family, entry]) => ({ family, classes: entry.classes, weights: [400, 700], italic: true, license: "Office" as const, office: true, ...(entry.substitute ? { note: `measured with ${entry.substitute}` } : {}) })),
  ];
  if (terms.length === 0) return all.slice(0, limit);
  return all
    .map((entry) => {
      const haystack = `${entry.family} ${entry.classes.join(" ")} ${entry.note ?? ""} ${(entry.scripts ?? []).join(" ")}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? (entry.family.toLowerCase().includes(term) ? 3 : 1) : 0), 0);
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.entry.family.localeCompare(right.entry.family))
    .slice(0, limit)
    .map(({ entry }) => entry);
}
