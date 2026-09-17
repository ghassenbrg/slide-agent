/**
 * The inline markup a composition's `text` accepts. Deliberately small:
 * `**bold**`, `*italic*` or `_italic_`, `` `mono` ``, `[label](https://…)`,
 * new lines for paragraphs, and `- ` or `1. ` at a line start for list items.
 */

export interface RichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  link?: string;
}

export interface RichParagraph {
  runs: RichRun[];
  bullet?: "bullet" | "number";
  level: number;
}

const LIST_MARKER = /^(\s*)([-•*]|\d{1,2}[.)])\s+/;

export function parseRichText(source: string, options: { list?: "bullet" | "number" | "none" } = {}): RichParagraph[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  return lines.map((line) => {
    let text = line;
    let bullet: RichParagraph["bullet"];
    let level = 0;
    const marker = LIST_MARKER.exec(line);
    if (marker && options.list !== "none") {
      bullet = /\d/.test(marker[2]!) ? "number" : "bullet";
      level = Math.min(4, Math.floor(marker[1]!.replace(/\t/g, "  ").length / 2));
      text = line.slice(marker[0].length);
    } else if (options.list === "bullet" || options.list === "number") {
      bullet = options.list;
    }
    return { runs: parseInline(text), level, ...(bullet ? { bullet } : {}) };
  });
}

export function parseInline(text: string): RichRun[] {
  const runs: RichRun[] = [];
  const pattern = /\*\*(.+?)\*\*|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)|(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)|`([^`]+)`|\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) runs.push({ text: text.slice(last, index) });
    if (match[1] !== undefined) runs.push(...parseInline(match[1]).map((run) => ({ ...run, bold: true })));
    else if (match[2] !== undefined) runs.push(...parseInline(match[2]).map((run) => ({ ...run, italic: true })));
    else if (match[3] !== undefined) runs.push(...parseInline(match[3]).map((run) => ({ ...run, italic: true })));
    else if (match[4] !== undefined) runs.push({ text: match[4], mono: true });
    else if (match[5] !== undefined) runs.push({ text: match[5], link: match[6]! });
    last = index + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  if (runs.length === 0) runs.push({ text: "" });
  return mergeRuns(runs);
}

function mergeRuns(runs: RichRun[]): RichRun[] {
  const merged: RichRun[] = [];
  for (const run of runs) {
    const previous = merged.at(-1);
    if (previous && previous.bold === run.bold && previous.italic === run.italic && previous.mono === run.mono && previous.link === run.link) {
      previous.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

export function plainText(paragraphs: RichParagraph[]): string {
  return paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join("")).join("\n");
}

export function applyCase(text: string, textCase: string | undefined): string {
  if (textCase === "upper" || textCase === "small-caps") return text.toUpperCase();
  if (textCase === "lower") return text.toLowerCase();
  if (textCase === "title") return text.replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
  return text;
}
