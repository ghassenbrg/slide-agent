import type { PresentationBrief, SlideKind, SlideSpec } from "../types/index.js";
import { truncateWords } from "../utils/text.js";

/**
 * Builds a structural draft when no model authored the deck.
 *
 * This deliberately produces scaffolding, not content. The previous version
 * invented evidence — named comparison points, KPI figures, process steps, a
 * "recommendation" — that was identical across every deck and read as though
 * someone had researched it. A draft that fabricates is worse than one that is
 * visibly incomplete, because only the first can be mistaken for finished work.
 */

/** Marks a slot the author still has to fill. Rendered verbatim, on purpose. */
function placeholder(what: string): string {
  return `[${what}]`;
}

function topicTitle(topic: string): string {
  return topic.replace(/^[-*\d.\s]+/, "").replace(/[.:]+$/, "").trim();
}

export class ContentGenerator {
  public titleSlide(brief: PresentationBrief): SlideSpec {
    return {
      id: "title",
      kind: "title",
      title: brief.title,
      subtitle: brief.subtitle ?? brief.objective,
      sectionLabel: brief.presentationType.toUpperCase(),
      speakerNotes: [`Audience: ${brief.audience}`, `Purpose: ${brief.objective}`],
    };
  }

  public summarySlide(brief: PresentationBrief): SlideSpec {
    const topics = brief.keyTopics.slice(0, 3).map(topicTitle);
    return {
      id: "executive-summary",
      kind: "executive-summary",
      title: placeholder("State the single most important takeaway"),
      body: truncateWords(brief.objective, 20),
      bullets: topics.length > 0
        ? topics.map((topic) => `${topic} — ${placeholder("what the audience must conclude")}`)
        : [placeholder("Supporting claim 1"), placeholder("Supporting claim 2"), placeholder("Supporting claim 3")],
      speakerNotes: ["Lead with the conclusion, then use the remaining slides as evidence."],
    };
  }

  /**
   * One slide per topic, carrying the author's own words plus an explicit gap
   * where evidence belongs. `kind` stays generic: choosing a comparison or a
   * timeline is an editorial judgement a template cannot make honestly.
   */
  public topicSlide(brief: PresentationBrief, topic: string, index: number, kind: SlideKind = "text-image"): SlideSpec {
    const clean = topicTitle(topic);
    return {
      id: `topic-${index + 1}`,
      kind,
      title: clean,
      body: placeholder(`What ${brief.audience} need to understand about ${clean.toLowerCase()}`),
      bullets: [
        placeholder("Evidence: something you can show, not assert"),
        placeholder("Implication: what it means for the audience"),
      ],
      visual: { alt: `Visual support for ${clean}`, position: "right" },
      speakerNotes: [
        `Connect ${clean} to the outcome: ${brief.objective}`,
        "Replace the bracketed placeholders before presenting.",
      ],
    };
  }

  public closingSlide(brief: PresentationBrief): SlideSpec {
    return {
      id: "closing",
      kind: "closing",
      title: placeholder("The decision or action you are asking for"),
      subtitle: brief.objective,
      bullets: [
        placeholder("The decision"),
        placeholder("The owner"),
        placeholder("The first checkpoint"),
      ],
      speakerNotes: ["Resolve the opening objective and ask for the concrete next action."],
    };
  }
}
