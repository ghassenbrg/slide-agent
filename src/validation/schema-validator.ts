import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

import type { ValidationIssue } from "../types/index.js";

// The vendored ECMA-376 5th edition transitional schema set (see
// THIRD_PARTY_NOTICES.md). pml.xsd is the validation root for every
// PresentationML and DrawingML part; its import closure pulls in the
// preloaded schemas, including charts. docProps/app.xml uses the standalone
// extended-properties schema.
const PML_ROOT = "pml.xsd";
const PML_PRELOAD = [
  "dml-main.xsd",
  "dml-chart.xsd",
  "dml-chartDrawing.xsd",
  "dml-diagram.xsd",
  "dml-picture.xsd",
  "dml-lockedCanvas.xsd",
  "shared-relationshipReference.xsd",
  "shared-commonSimpleTypes.xsd",
];
const APP_ROOT = "shared-documentPropertiesExtended.xsd";
const APP_PRELOAD = ["shared-documentPropertiesVariantTypes.xsd", "shared-commonSimpleTypes.xsd"];

// Every PresentationML/DrawingML payload part of a .pptx package. Purely
// binary parts, OPC plumbing (.rels, [Content_Types].xml), and the Dublin
// Core docProps/core.xml are outside this schema set and are covered by
// PackageValidator instead.
const PML_PART_PATTERN = /^ppt\/(presentation|presProps|viewProps|tableStyles)\.xml$|^ppt\/(slides|slideMasters|slideLayouts|notesSlides|notesMasters|handoutMasters|theme|charts)\/[^/]+\.xml$/;

interface SchemaFile {
  fileName: string;
  contents: string;
}

function schemaDirectory(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../assets/ooxml-schemas"),
    path.resolve(moduleDir, "../../assets/ooxml-schemas"),
    path.resolve(moduleDir, "../../../assets/ooxml-schemas"),
  ];
  return candidates.find((candidate) => existsSync(path.join(candidate, PML_ROOT))) ?? candidates[0]!;
}

async function loadSchemas(names: string[]): Promise<SchemaFile[]> {
  const directory = schemaDirectory();
  return Promise.all(names.map(async (name) => ({
    fileName: name,
    contents: await readFile(path.join(directory, name), "utf8"),
  })));
}

// xmllint-wasm worker file names cannot contain path separators.
function workerFileName(partName: string): string {
  return partName.replaceAll("/", "__");
}

function partNameFromWorkerFile(fileName: string): string {
  return fileName.replaceAll("__", "/");
}

/**
 * Validates the XML payload parts of a .pptx package against the official
 * ECMA-376 transitional XML Schemas using a WebAssembly build of libxml2.
 * A deck that passes this check contains no schema-level construct that
 * triggers PowerPoint's repair dialog.
 */
export class SchemaValidator {
  public async validate(inputPath: string): Promise<ValidationIssue[]> {
    let validateXML: typeof import("xmllint-wasm").validateXML;
    try {
      ({ validateXML } = await import("xmllint-wasm"));
    } catch {
      return [{
        code: "schema-validation-unavailable",
        severity: "warning",
        message: "xmllint-wasm is not installed; ECMA-376 schema validation was skipped.",
        fixable: false,
      }];
    }

    const zip = await JSZip.loadAsync(await readFile(inputPath));
    const partNames = Object.keys(zip.files).filter((name) => !zip.files[name]!.dir);

    const issues: ValidationIssue[] = [];
    const runValidation = async (parts: string[], schema: SchemaFile[], preload: SchemaFile[]): Promise<void> => {
      if (parts.length === 0) return;
      const xml = await Promise.all(parts.map(async (partName) => ({
        fileName: workerFileName(partName),
        contents: await zip.file(partName)!.async("string"),
      })));
      const result = await validateXML({
        xml,
        schema,
        preload,
        initialMemoryPages: 256,
        maxMemoryPages: 2048,
      });
      if (result.valid) return;
      for (const error of result.errors) {
        const partName = error.loc ? partNameFromWorkerFile(error.loc.fileName) : "package";
        issues.push({
          code: "schema-violation",
          severity: "error",
          message: `${partName} violates the ECMA-376 schema: ${error.message.trim().split("\n", 1)[0]}`,
          fixable: false,
          details: {
            partName,
            ...(error.loc ? { lineNumber: error.loc.lineNumber } : {}),
            rawMessage: error.rawMessage,
          },
        });
      }
    };

    await runValidation(
      partNames.filter((name) => PML_PART_PATTERN.test(name)),
      await loadSchemas([PML_ROOT]),
      await loadSchemas(PML_PRELOAD),
    );
    await runValidation(
      partNames.filter((name) => name === "docProps/app.xml"),
      await loadSchemas([APP_ROOT]),
      await loadSchemas(APP_PRELOAD),
    );
    return issues;
  }
}
