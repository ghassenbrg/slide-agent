import { describe, expect, it } from "vitest";

import { parseEditPrompt } from "../../src/editing/parse-edit-prompt.js";

describe("parseEditPrompt", () => {
  it("parses explicit natural-language operations", () => {
    expect(parseEditPrompt('Replace "Atlas" with "Atlas Pro" on slide 1. Remove slide 3. Duplicate slide 2 at 4.')).toEqual([
      { type: "replace-text", find: "Atlas", replace: "Atlas Pro", slide: 1, replaceAll: true },
      { type: "remove-slide", slide: 3 },
      { type: "duplicate-slide", slide: 2, insertAt: 4 },
    ]);
  });

  it("accepts structured JSON", () => {
    const operations = parseEditPrompt(JSON.stringify({ operations: [{ type: "remove-slide", slide: 2 }] }));
    expect(operations).toEqual([{ type: "remove-slide", slide: 2 }]);
  });
});
