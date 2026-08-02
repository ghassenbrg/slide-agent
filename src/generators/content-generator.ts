import type { PresentationBrief, SlideKind, SlideSpec } from "../types/index.js";
import { truncateWords } from "../utils/text.js";

const DEFAULT_INSIGHTS = [
  "Focus the story on the decision the audience needs to make.",
  "Separate the core message from supporting detail.",
  "Make ownership and next actions explicit.",
];

function topicTitle(topic: string): string {
  return topic.replace(/^[-*\d.\s]+/, "").replace(/[.:]+$/, "").trim();
}

function claimFor(topic: string, objective: string): string {
  const cleaned = topicTitle(topic);
  return truncateWords(`${cleaned} is the practical lever for ${objective.toLowerCase()}`, 12);
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
    const topics = brief.keyTopics.slice(0, 3);
    return {
      id: "executive-summary",
      kind: "executive-summary",
      title: "The decision rests on three clear ideas",
      body: truncateWords(brief.objective, 20),
      bullets: topics.length > 0 ? topics.map((topic) => claimFor(topic, brief.objective)) : DEFAULT_INSIGHTS,
      speakerNotes: ["Lead with the conclusion, then use the remaining slides as evidence."],
    };
  }

  public topicSlide(brief: PresentationBrief, topic: string, index: number, kind: SlideKind): SlideSpec {
    const clean = topicTitle(topic);
    const common = {
      id: `topic-${index + 1}`,
      kind,
      title: claimFor(clean, brief.objective),
      body: truncateWords(`What ${brief.audience} should understand about ${clean}, why it matters, and what changes next.`, 28),
      speakerNotes: [`Connect ${clean} directly to the audience outcome: ${brief.objective}`],
    } satisfies SlideSpec;

    switch (kind) {
      case "comparison":
        return {
          ...common,
          comparison: [
            { heading: "Current pattern", points: ["Fragmented signals", "Reactive decisions", "Unclear ownership"] },
            { heading: "Better pattern", points: ["Shared evidence", "Deliberate choices", "Named owners"], emphasis: true },
          ],
        };
      case "timeline":
        return {
          ...common,
          timeline: [
            { label: "NOW", title: "Align", detail: "Confirm the outcome and constraints" },
            { label: "NEXT", title: "Prove", detail: "Test the highest-risk assumption" },
            { label: "THEN", title: "Scale", detail: "Standardize the winning approach" },
          ],
        };
      case "process":
        return {
          ...common,
          process: [
            { title: "Frame", detail: "Define the decision" },
            { title: "Build", detail: "Create the evidence" },
            { title: "Validate", detail: "Inspect the result" },
            { title: "Act", detail: "Assign the next move" },
          ],
        };
      case "architecture":
        return {
          ...common,
          architecture: {
            direction: "horizontal",
            nodes: [
              { id: "inputs", label: "Inputs" },
              { id: "engine", label: clean || "Core engine", emphasis: true },
              { id: "outputs", label: "Audience outcome" },
            ],
            edges: [
              { from: "inputs", to: "engine" },
              { from: "engine", to: "outputs" },
            ],
          },
        };
      case "kpi":
        return {
          ...common,
          kpis: [
            { label: "Clarity", value: "1 message", detail: "One primary claim per slide", trend: "up" },
            { label: "Focus", value: "3 signals", detail: "Only decision-relevant evidence", trend: "up" },
            { label: "Action", value: "1 owner", detail: "A named next step", trend: "flat" },
          ],
        };
      case "roadmap":
        return {
          ...common,
          roadmap: [
            { label: "Phase 1", items: ["Align", "Baseline"] },
            { label: "Phase 2", items: ["Pilot", "Measure"] },
            { label: "Phase 3", items: ["Scale", "Govern"] },
          ],
        };
      default:
        return {
          ...common,
          kind: "text-image",
          bullets: [
            `Clarify what ${clean.toLowerCase()} changes for the audience.`,
            "Use evidence that supports the slide title.",
            "End with an explicit implication or next step.",
          ],
          visual: { alt: `Abstract visual representing ${clean}`, position: "right" },
        };
    }
  }

  public closingSlide(brief: PresentationBrief): SlideSpec {
    return {
      id: "closing",
      kind: "closing",
      title: "Turn the shared view into a deliberate next move",
      subtitle: brief.objective,
      bullets: ["Confirm the decision", "Name the owner", "Set the first checkpoint"],
      speakerNotes: ["Resolve the opening objective and ask for the concrete next action."],
    };
  }
}
