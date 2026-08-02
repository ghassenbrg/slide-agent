import { describe, expect, it } from "vitest";

import { hasWorkflowFragment, normalizeWorkflowText } from "../../scripts/verify-release.mjs";

describe("workflow fragment verification", () => {
  it("normalizes Windows line endings before matching fragments", () => {
    const content = "on:\r\n  push:\r\n    branches:\r\n      - main\r\n";
    expect(normalizeWorkflowText(content)).toBe("on:\n  push:\n    branches:\n      - main\n");
    expect(hasWorkflowFragment(content, "push:\n    branches:\n      - main")).toBe(true);
  });

  it("returns false for fragments that are not present", () => {
    expect(hasWorkflowFragment("name: Slide Agent CI", "pull_request:")).toBe(false);
  });
});
