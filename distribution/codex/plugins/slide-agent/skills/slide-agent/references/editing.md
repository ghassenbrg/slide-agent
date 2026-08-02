# Existing PowerPoint editing

## Contents

- Safety contract
- Operation schemas
- Preservation model
- Unsupported and partial features
- Verification

## Safety contract

1. Resolve the absolute input and output paths.
2. Keep them different. Slide Agent rejects in-place edits.
3. Inspect and render the source deck.
4. Apply only explicit operations.
5. Preserve all package parts that are not targeted.
6. Render and validate the edited copy.
7. Compare before and after previews.
8. Report unsupported features and manual-verification needs.

Never silently rebuild an existing deck from screenshots, palette samples, or approximate layouts.

## Operation schemas

Replace text:

```json
{ "type": "replace-text", "find": "Old", "replace": "New", "slide": 2, "replaceAll": true }
```

Remove, duplicate, add by cloning, or reorder slides:

```json
{ "type": "remove-slide", "slide": 4 }
{ "type": "duplicate-slide", "slide": 2, "insertAt": 5 }
{ "type": "add-slide", "slide": 3, "insertAt": 4, "replacements": [{ "find": "Old title", "replace": "New title" }] }
{ "type": "reorder-slides", "order": [1, 3, 2, 4] }
```

Apply theme values:

```json
{
  "type": "apply-theme",
  "colors": { "background": "FFFFFF", "ink": "102030", "accent": "C43D31" },
  "headingFont": "Aptos Display",
  "bodyFont": "Aptos"
}
```

Replace an image by selection-pane name or relationship ID:

```json
{ "type": "replace-image", "slide": 3, "name": "Hero image", "imagePath": "/workspace/hero.png" }
```

Update an existing table without changing its grid size:

```json
{
  "type": "update-table",
  "slide": 5,
  "tableIndex": 0,
  "rows": [["Metric", "Value"], ["ARR", "$12M"]]
}
```

Update an existing chart:

```json
{
  "type": "update-chart",
  "slide": 6,
  "chartIndex": 0,
  "labels": ["Q1", "Q2", "Q3"],
  "series": [{ "name": "Revenue", "values": [10, 14, 19] }]
}
```

## Preservation model

Slide Agent edits the ZIP-based OOXML package. It leaves masters, layouts, media, charts, notes, embedded objects, relationships, and extension parts untouched unless an operation targets them. Image replacement creates a new media part and rewires only the selected relationship.

Slide removal deletes the selected slide part and presentation relationship. Slide duplication clones the selected slide, speaker notes, and slide relationships so the inherited master and layout remain intact. Explicit `slide-number` objects created by Slide Agent are renumbered after add, remove, duplicate, or reorder operations; unrelated third-party numbering fields are preserved.

## Unsupported and partial features

- Text split across multiple formatted runs may need multiple replacements.
- New arbitrary slides use a cloned source slide. Cross-deck import is not supported.
- Duplicated slides can share chart parts with the source. Verify chart edits on duplicated slides.
- Theme changes do not override direct per-object formatting.
- Tables cannot grow beyond their existing row/column grid.
- Chart cache, formula row ranges, and the first embedded worksheet are updated. Preserve the chart's existing series count; uncommon multi-sheet formulas and external data links need manual verification.
- SmartArt, macros, animations, OLE objects, 3D models, and uncommon Office extensions are not edited.

Preserve unsupported parts when possible. Stop and report a limitation if a requested mutation would require deleting or flattening them.

## Verification

Open the final file in PowerPoint or LibreOffice after automated checks when the source contains unsupported features. Confirm:

- Master and layout inheritance.
- Font resolution.
- Animation and transition behavior.
- Chart “Edit Data” ranges.
- SmartArt and embedded-object behavior.
- No unexpected repair prompt on open.
