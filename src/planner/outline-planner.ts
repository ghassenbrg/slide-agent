import type { PresentationBrief, PresentationOutline, SlideKind } from "../types/index.js";
import { ContentGenerator } from "../generators/content-generator.js";

const DEFAULT_SEQUENCE: SlideKind[] = [
  "comparison",
  "process",
  "timeline",
  "architecture",
  "kpi",
  "roadmap",
  "text-image",
];

function kindForTopic(topic: string, index: number): SlideKind {
  const lower = topic.toLowerCase();
  if (/compare|versus|option|before|after/.test(lower)) return "comparison";
  if (/timeline|history|milestone|when/.test(lower)) return "timeline";
  if (/process|workflow|how|method/.test(lower)) return "process";
  if (/architecture|system|platform|technical|stack/.test(lower)) return "architecture";
  if (/metric|kpi|result|performance|number/.test(lower)) return "kpi";
  if (/roadmap|plan|phase|next/.test(lower)) return "roadmap";
  return DEFAULT_SEQUENCE[index % DEFAULT_SEQUENCE.length]!;
}

export class OutlinePlanner {
  public constructor(private readonly content = new ContentGenerator()) {}

  public plan(brief: PresentationBrief): PresentationOutline {
    const contentSlideCount = Math.max(1, brief.slideCount - 3);
    const topics = brief.keyTopics.length > 0 ? brief.keyTopics : [brief.title];
    const slides = [this.content.titleSlide(brief), this.content.summarySlide(brief)];

    for (let index = 0; index < contentSlideCount; index += 1) {
      const topic = topics[index % topics.length] ?? brief.title;
      slides.push(this.content.topicSlide(brief, topic, index, kindForTopic(topic, index)));
    }

    if (brief.slideCount > 4) {
      slides.splice(slides.length, 0, {
        id: "recommendation",
        kind: "quote",
        title: "The recommendation",
        quote: {
          text: `Prioritize the smallest credible move that advances ${brief.objective.toLowerCase()}.`,
          attribution: "Decision principle",
        },
        speakerNotes: ["State the recommendation plainly. Do not introduce new evidence here."],
      });
    }

    slides.push(this.content.closingSlide(brief));
    const exactSlides = slides.slice(0, Math.max(brief.slideCount - 1, 1));
    exactSlides.push(this.content.closingSlide(brief));

    return {
      brief,
      narrative: `By the end, ${brief.audience} should ${brief.objective.toLowerCase()} because the deck moves from context to evidence to action.`,
      slides: exactSlides.slice(0, brief.slideCount),
    };
  }
}
