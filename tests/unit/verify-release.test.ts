import { describe, expect, it } from "vitest";

type VerifyReleaseHelpers = {
  hasWorkflowFragment(content: string, fragment: string): boolean;
  normalizeWorkflowText(text: string): string;
};

const loadHelpers = async (): Promise<VerifyReleaseHelpers> => {
  // @ts-ignore - NodeNext resolves the ESM script at runtime without a dedicated declaration artifact.
  return (await import("../../scripts/verify-release.mjs")) as VerifyReleaseHelpers;
};

describe("workflow fragment verification", () => {
  it("normalizes Windows line endings before matching fragments", async () => {
    const { hasWorkflowFragment, normalizeWorkflowText } = await loadHelpers();
    const content = "on:\r\n  push:\r\n    branches:\r\n      - main\r\n";
    expect(normalizeWorkflowText(content)).toBe("on:\n  push:\n    branches:\n      - main\n");
    expect(hasWorkflowFragment(content, "push:\n    branches:\n      - main")).toBe(true);
  });

  it("returns false for fragments that are not present", async () => {
    const { hasWorkflowFragment } = await loadHelpers();
    expect(hasWorkflowFragment("name: Slide Agent CI", "pull_request:")).toBe(false);
  });
});
