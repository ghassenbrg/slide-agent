import type { PresentationBrief, PresentationType, SlideAgentConfig } from "../types/index.js";
import { sentenceCase } from "../utils/text.js";

function field(prompt: string, labels: string[]): string | undefined {
  const expression = new RegExp(`^(?:${labels.join("|")})\\s*:\\s*(.+)$`, "im");
  return prompt.match(expression)?.[1]?.trim();
}

function inferType(prompt: string): PresentationType {
  const lower = prompt.toLowerCase();
  if (/sales|pitch|buyer|customer/.test(lower)) return "sales";
  if (/architecture|engineering|technical|system|api/.test(lower)) return "technical";
  if (/teach|training|course|lesson|educat/.test(lower)) return "educational";
  if (/quarter|report|results|performance|review/.test(lower)) return "report";
  if (/proposal|recommend|approve|decision/.test(lower)) return "proposal";
  if (/workshop|facilitat|exercise/.test(lower)) return "workshop";
  if (/business|strategy|market|launch/.test(lower)) return "business";
  return "general";
}

function inferTitle(prompt: string): string {
  const explicit = field(prompt, ["title", "presentation title", "deck title"]);
  if (explicit) return explicit;
  const heading = prompt.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  const first = prompt
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*#\d.\s]+/, "").trim())
    .find((line) => line.length > 4);
  return sentenceCase(first?.slice(0, 90) || "Untitled presentation");
}

function inferTopics(prompt: string, title: string): string[] {
  const headings = [...prompt.matchAll(/^#{2,3}\s+(.+)$/gm)].map((match) => match[1]!.trim());
  const topicsLine = field(prompt, ["topics", "sections", "cover", "include"]);
  const listed = topicsLine?.split(/[,;|]/).map((item) => item.trim()).filter(Boolean) ?? [];
  const bullets = [...prompt.matchAll(/^\s*[-*]\s+(.+)$/gm)]
    .map((match) => match[1]!.trim())
    .filter((item) => item.length >= 3 && item.length <= 80);
  // The deck title is not a topic. Including it produced a content slide that
  // restated the cover, in every generated deck.
  const normalizedTitle = title.trim().toLowerCase();
  const candidates = [...headings, ...listed, ...bullets]
    .map((item) => item.replace(/[:.]+$/, "").trim())
    .filter((item) => item && item.toLowerCase() !== normalizedTitle);
  const unique = [...new Set(candidates)].slice(0, 12);
  return unique.length > 0 ? unique : [title];
}

export class RequestAnalyzer {
  public constructor(private readonly config: SlideAgentConfig) {}

  public analyze(prompt: string, overrides: Partial<PresentationBrief> = {}): PresentationBrief {
    const normalized = prompt.trim();
    if (!normalized && !overrides.title) throw new Error("A prompt or brief title is required.");

    const title = overrides.title ?? inferTitle(normalized);
    const requestedSlides = Number(field(normalized, ["slides", "slide count", "length"]));
    const slideCount = Math.max(
      this.config.generation.minimumSlideCount,
      Math.min(
        this.config.generation.maximumSlideCount,
        overrides.slideCount ?? (Number.isFinite(requestedSlides) && requestedSlides > 0
          ? Math.round(requestedSlides)
          : this.config.generation.defaultSlideCount),
      ),
    );

    const audience = overrides.audience ?? field(normalized, ["audience", "for"]) ?? "informed decision-makers";
    const objective = overrides.objective ?? field(normalized, ["objective", "goal", "outcome"]) ??
      `Build a clear shared understanding of ${title}`;
    const presentationType = overrides.presentationType ?? inferType(normalized);
    const tone = overrides.tone ?? field(normalized, ["tone", "voice"]) ??
      (presentationType === "technical" ? "precise and pragmatic" : "confident and concise");
    const visualDirection = overrides.visualDirection ?? field(normalized, ["visual", "visual direction", "style"]) ??
      "Invent an original art direction from the subject, audience, and story; avoid a reusable house style.";
    const language = overrides.language ?? field(normalized, ["language", "locale"]) ?? "English";

    return {
      title,
      ...(overrides.subtitle ? { subtitle: overrides.subtitle } : {}),
      audience,
      objective,
      presentationType,
      tone,
      visualDirection,
      slideCount,
      language,
      outputRequirements: overrides.outputRequirements ?? ["editable PowerPoint", "speaker notes", "validation report"],
      keyTopics: overrides.keyTopics ?? inferTopics(normalized, title),
      sourcePrompt: overrides.sourcePrompt ?? normalized,
    };
  }
}
