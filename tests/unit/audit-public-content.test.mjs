import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { auditPublicContent } from "../../scripts/audit-public-content.mjs";

let workspace;
beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-public-audit-"));
});
afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

async function fixture(relative, content) {
  const file = path.join(workspace, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

describe("public showcase audit", () => {
  it("permits the published showcase files", async () => {
    await fixture("site/public/showcase/presentations/analytics/analytics.pptx", "public demo");
    await fixture("promo/announce/demo/blue/exports/deck.pdf", "public demo");
    await expect(auditPublicContent(workspace)).resolves.toEqual({ filesScanned: 2 });
  });

  it("rejects unapproved documents even inside a showcase directory", async () => {
    await fixture("site/public/showcase/presentations/analytics/private.pptx", "private deck");
    await expect(auditPublicContent(workspace)).rejects.toThrow(/artifact is not approved/);
  });

  it("still scans approved artifacts for credentials", async () => {
    await fixture("site/public/showcase/presentations/analytics/analytics.pptx", "ghp_" + "A".repeat(36));
    await expect(auditPublicContent(workspace)).rejects.toThrow(/possible credential/);
  });

  it("still rejects local paths in demo metadata", async () => {
    await fixture("promo/announce/demo/blue/run.json", JSON.stringify({ deck: "/Users/" + "ghassenbrg/deck" }));
    await expect(auditPublicContent(workspace)).rejects.toThrow(/local absolute path/);
  });
});
