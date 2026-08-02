import type { SlideAgentConfig } from "../types/index.js";

export function relativeLuminance(hex: string): number {
  const normalized = hex.replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) return 1;
  const values = [0, 2, 4]
    .map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]!;
}

export function colorContrast(foreground: string, background: string): number {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

export function emphasisField(config: SlideAgentConfig): string {
  return relativeLuminance(config.colors.background) < 0.28 ? config.colors.surface : config.colors.ink;
}

export function foregroundOn(background: string, config: SlideAgentConfig): string {
  const candidates = [config.colors.ink, config.colors.surface, config.colors.background, "FFFFFF", "000000"];
  return candidates.reduce((best, candidate) => colorContrast(candidate, background) > colorContrast(best, background) ? candidate : best);
}

export function secondaryForegroundOn(background: string, config: SlideAgentConfig): string {
  return colorContrast(config.colors.muted, background) >= 3 ? config.colors.muted : foregroundOn(background, config);
}

export function accentForegroundOn(background: string, config: SlideAgentConfig): string {
  const candidates = [
    config.colors.accent,
    config.colors.accentAlt,
    config.colors.positive,
    config.colors.warning,
    foregroundOn(background, config),
  ];
  return candidates.reduce((best, candidate) => colorContrast(candidate, background) > colorContrast(best, background) ? candidate : best);
}
