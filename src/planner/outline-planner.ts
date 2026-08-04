import type { PresentationBrief, PresentationOutline } from "../types/index.js";
import { ContentGenerator } from "../generators/content-generator.js";

/**
 * Assembles a structural draft: an opening, a stated takeaway, one slide per
 * topic the brief names, and a close that asks for something.
 *
 * It no longer guesses a slide kind from the topic wording. Reading "phases"
 * and emitting a roadmap meant inventing three phases the author never
 * mentioned; the same went for comparisons, timelines, and KPI figures. Slide
 * kind is an editorial judgement, so the draft leaves it to the author.
 */
export class OutlinePlanner {
  public constructor(private readonly content = new ContentGenerator()) {}

  public plan(brief: PresentationBrief): PresentationOutline {
    const topics = brief.keyTopics.length > 0 ? brief.keyTopics : [brief.title];
    const slides = [this.content.titleSlide(brief), this.content.summarySlide(brief)];

    // Two fixed slides open the deck and one closes it. The previous version
    // built a slide, appended a closing, sliced the array shorter than the
    // slides it had built, and then appended a second closing — silently
    // discarding the slide it had just created.
    const topicSlots = Math.max(1, brief.slideCount - 3);
    for (let index = 0; index < topicSlots; index += 1) {
      const topic = topics[index % topics.length] ?? brief.title;
      slides.push(this.content.topicSlide(brief, topic, index));
    }
    slides.push(this.content.closingSlide(brief));

    return {
      brief,
      narrative: `By the end, ${brief.audience} should ${brief.objective.toLowerCase()} because the deck moves from context to evidence to action.`,
      slides,
    };
  }
}
