# Validation and repair

## Contents

- Validation layers
- Issue categories
- Severity policy
- Repair loop
- Manual review

## Validation layers

1. Validate the generation manifest for semantic content and exact authoring geometry.
2. Validate the PPTX ZIP package and required parts.
3. Inspect OOXML when no generation manifest exists.
4. Optionally render every slide to PNG when `render: true`.
5. When rendering, confirm preview count and non-empty files.
6. When previews exist, inspect them visually.

## Issue categories

The JSON report can include:

- `object-outside-slide`
- `overlapping-elements`
- `text-overflow`
- `excessive-text-density`
- `font-too-small`
- `poor-contrast`
- `missing-image`
- `broken-image-path`
- `unsupported-font`
- `inconsistent-margin`
- `misaligned-elements`
- `invalid-chart-data`
- `empty-slide`
- `duplicate-slide-title`
- `missing-presentation-title`
- `corrupt-pptx`
- `render-failed`

## Severity policy

- Treat corrupt files, invalid chart data, missing assets, overflow, clipping, and unintended overlap as errors. Treat render failures as errors only for an explicitly requested render operation.
- Treat density, contrast, unsupported fonts, duplicate titles, and inconsistent margins as warnings unless the configured policy escalates them.
- Treat preserved unsupported source features as informational when they do not block the requested edit.

Validation protects production quality; it is not an aesthetic template. Model-authored canvas slides skip registry-alignment and shared-title-margin heuristics so asymmetry, controlled collision, and migrating title placement remain available. Bounds, clipping, data integrity, contrast guidance, and unintended-overlap checks still apply.

## Repair loop

For a new deck:

1. Build and export.
2. Validate structure and geometry; render as an optional additional check.
3. Apply fixable content changes: shorten text, reduce bullets, normalize chart data, clamp custom or canvas geometry, or make titles unique.
4. Rebuild from the corrected outline.
5. Repeat up to `maximumRetries`.
6. Return an error if validation still fails.

Do not retry non-fixable environment failures without changing the environment.

## Manual review

Automated geometry is necessary but not sufficient. Review each final PNG at full size for hierarchy, natural wrapping, data-label meaning, color consistency, crop quality, and narrative flow. Fix visual defects even when the JSON report passes.
