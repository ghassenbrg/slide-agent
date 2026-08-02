# Third-party notices

Slide Agent's own source code, documentation, examples, and project icon are released under the repository's MIT license and are maintained as original project assets.

The npm package declares the following direct runtime dependencies. They are installed by npm and retain their own copyright notices and license files; Slide Agent does not claim ownership of them.

| Package | Declared license |
| --- | --- |
| `@modelcontextprotocol/server` | MIT |
| `@xmldom/xmldom` | MIT |
| `commander` | MIT |
| `jszip` | MIT OR GPL-3.0-or-later |
| `pptxgenjs` | MIT |
| `xmllint-wasm` | MIT |
| `zod` | MIT |

The `assets/ooxml-schemas/` directory redistributes an unmodified subset of the Office Open XML Transitional XML Schemas published by Ecma International as part of ECMA-376 5th edition (Part 4, `OfficeOpenXML-XMLSchema-Transitional.zip`, December 2016). They are used to validate generated `.pptx` packages against the official standard and remain © Ecma International. The complete standard is available from <https://ecma-international.org/publications-and-standards/standards/ecma-376/>.

LibreOffice and Poppler are optional external programs used only when PDF or PNG rendering is requested. They are not bundled, copied, or redistributed by Slide Agent.

PowerPoint is a trademark of Microsoft Corporation. Slide Agent is an independent project and is not affiliated with or endorsed by Microsoft.
