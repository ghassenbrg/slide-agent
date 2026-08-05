export { SlideAgent } from "./pipeline.js";
export { DeckBuilder, type BuiltDeck } from "./export/deck-builder.js";
export { PptxExporter } from "./export/pptx-exporter.js";
export { PptxSanitizer } from "./export/pptx-sanitizer.js";
export { formatDoctor, formatDoctorReport, runDeepCheck, runDoctor, runDoctorReport, type AgentIntegrationCheck, type DoctorCheck, type DoctorReport } from "./doctor.js";
export { installManaged, PACKAGE_NAME, PACKAGE_VERSION, type ManagedInstallOptions, type ManagedInstallResult } from "./installer.js";
export { VERSION } from "./version.js";
export { findExecutable, runProcess, type ProcessResult } from "./utils/process.js";
export { outputLayout } from "./output/output-layout.js";
export { PptxEditor, type PptxEditResult } from "./editing/pptx-editor.js";
export { PptxInspector } from "./editing/pptx-inspector.js";
export { parseEditPrompt } from "./editing/parse-edit-prompt.js";
export { LayoutRegistry, type LayoutRenderer } from "./layouts/layout-registry.js";
export { FreeformComposer } from "./layouts/freeform-composer.js";
export { CreativeDirector, type ResolvedDeckDesign } from "./themes/creative-director.js";
export { PresentationRenderer } from "./rendering/renderer.js";
export { PresentationValidator } from "./validation/validator.js";
export { loadConfig, configSchemas } from "./config/load-config.js";
export { JsonLogger, silentLogger, type Logger } from "./logging/logger.js";
export { parseStructuredRequest, structuredRequestSchema } from "./types/schemas.js";
export { parseSceneNdjson, readSceneNdjson, serializeSceneNdjson, writeSceneNdjson } from "./serialization/scene-ndjson.js";
export * from "./types/index.js";
export * from "./contract/index.js";
export * from "./extensions.js";
export { applyBrandKit, brandKitSchema, footerAppliesTo, loadBrandKit, logoAppliesTo, type BrandKit } from "./design/brand.js";
export { AccessibilityValidator, type AccessibilityOptions } from "./validation/accessibility.js";
export { scoreDeck } from "./validation/quality.js";
export { ManifestValidator } from "./validation/manifest-validator.js";
export { PackageValidator } from "./validation/package-validator.js";
export { SchemaValidator } from "./validation/schema-validator.js";
export { AutoFixer } from "./validation/auto-fixer.js";
export { ChartBuilder } from "./charts/chart-builder.js";
export { DiagramBuilder } from "./diagrams/diagram-builder.js";
export { ImageManager, remoteAssetPolicy, type ImageResolver, type RemoteAssetPolicy } from "./images/image-manager.js";
export { ThemeManager } from "./themes/theme-manager.js";
export { ElementWriter, type Frame } from "./components/element-writer.js";
export { planOutline } from "./planner/index.js";
export { reviseScene, type ReviseSceneResult } from "./serialization/revise-scene.js";
export { Grid, SLIDE_FORMATS, slideFormat, type Rect, type SlideFormat } from "./design/grid.js";
export { densityBudget, resolveTokens, type DeckTokens, type Density, type Geometry } from "./design/tokens.js";

import { SlideAgent } from "./pipeline.js";
import type { AgentResult, StructuredAgentRequest } from "./types/index.js";
import type { Logger } from "./logging/logger.js";

export async function executeAgentRequest(request: StructuredAgentRequest, options: { logger?: Logger } = {}): Promise<AgentResult> {
  return new SlideAgent(options.logger).execute(request);
}
