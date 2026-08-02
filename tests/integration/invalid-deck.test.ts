import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/load-config.js";
import { PresentationValidator } from "../../src/validation/validator.js";
import { silentLogger } from "../../src/logging/logger.js";

describe("intentional validation fixture", () => {
  it("fails with structured issues", async () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const fixture = path.join(root, "tests/fixtures/invalid-layout.pptx");
    const report = await new PresentationValidator(await loadConfig(path.join(root, "config")), silentLogger).validate(fixture, {
      manifest: `${fixture}.manifest.json`,
      render: false,
    });
    expect(report.status).toBe("fail");
    expect(report.summary.errors).toBeGreaterThan(0);
  });
});
