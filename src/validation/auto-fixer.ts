import type { PresentationOutline, SlideAgentConfig, ValidationReport } from "../types/index.js";
import { truncateWords } from "../utils/text.js";

export class AutoFixer {
  public constructor(private readonly config: SlideAgentConfig) {}

  public fix(outline: PresentationOutline, report: ValidationReport): { outline: PresentationOutline; changes: string[] } {
    const clone = structuredClone(outline);
    const changes: string[] = [];
    const affectedSlides = new Set(report.issues.map((item) => item.slide).filter((slide): slide is number => slide !== undefined));
    const seenTitles = new Map<string, number>();

    clone.slides.forEach((slide, index) => {
      const number = index + 1;
      if (!slide.title.trim()) {
        slide.title = `Slide ${number}`;
        changes.push(`Added a title to slide ${number}.`);
      }
      const normalized = slide.title.toLowerCase();
      const count = (seenTitles.get(normalized) ?? 0) + 1;
      seenTitles.set(normalized, count);
      if (count > 1) {
        slide.title = `${slide.title} — ${count}`;
        changes.push(`Made the title on slide ${number} unique.`);
      }
      if (!affectedSlides.has(number)) return;
      if (slide.body) slide.body = truncateWords(slide.body, Math.min(45, this.config.generation.maximumBodyWords));
      if (slide.bullets) {
        slide.bullets = slide.bullets.slice(0, this.config.generation.maximumBulletsPerSlide)
          .map((bullet) => truncateWords(bullet, this.config.generation.maximumWordsPerBullet));
      }
      if (slide.custom) {
        for (const region of slide.custom) {
          region.x = Math.max(0, Math.min(region.x, this.config.dimensions.width - 0.1));
          region.y = Math.max(0, Math.min(region.y, this.config.dimensions.height - 0.1));
          region.w = Math.max(0.1, Math.min(region.w, this.config.dimensions.width - region.x));
          region.h = Math.max(0.1, Math.min(region.h, this.config.dimensions.height - region.y));
          if (region.type === "text") region.fontSize = Math.max(region.fontSize ?? 18, this.config.fonts.minimums.body);
        }
      }
      if (slide.canvas) {
        for (const element of slide.canvas) {
          element.x = Math.max(0, Math.min(element.x, this.config.dimensions.width - 0.05));
          element.y = Math.max(0, Math.min(element.y, this.config.dimensions.height - 0.05));
          if (element.type !== "connector") {
            element.w = Math.max(0.05, Math.min(element.w, this.config.dimensions.width - element.x));
            element.h = Math.max(0.05, Math.min(element.h, this.config.dimensions.height - element.y));
          }
          if (element.type === "chart") {
            const length = element.chart.labels.length;
            element.chart.series = element.chart.series.map((series) => ({
              ...series,
              values: Array.from({ length }, (_, valueIndex) => Number.isFinite(series.values[valueIndex]) ? series.values[valueIndex]! : 0),
            }));
            if (element.chart.kind === "pie") element.chart.series = element.chart.series.slice(0, 1);
          }
        }
      }
      if (slide.chart) {
        const length = slide.chart.labels.length;
        slide.chart.series = slide.chart.series.map((series) => ({
          ...series,
          values: Array.from({ length }, (_, valueIndex) => Number.isFinite(series.values[valueIndex]) ? series.values[valueIndex]! : 0),
        }));
        if (slide.chart.kind === "pie") slide.chart.series = slide.chart.series.slice(0, 1);
      }
      changes.push(`Reduced or normalized content on slide ${number}.`);
    });
    return { outline: clone, changes };
  }
}
