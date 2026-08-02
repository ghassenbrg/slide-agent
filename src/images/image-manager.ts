import { writeFile } from "node:fs/promises";
import path from "node:path";

import { ensureDir, exists } from "../utils/files.js";
import { SlideAgentError } from "../utils/errors.js";

export interface ImageResolver {
  resolve(source: string): Promise<string>;
}

export class ImageManager implements ImageResolver {
  public constructor(private readonly cacheDir: string) {}

  public async resolve(source: string): Promise<string> {
    if (/^https?:\/\//i.test(source)) return this.download(source);
    const resolved = path.resolve(source);
    if (!(await exists(resolved))) {
      throw new SlideAgentError("IMAGE_NOT_FOUND", `Image does not exist: ${resolved}`, { source });
    }
    return resolved;
  }

  private async download(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new SlideAgentError("IMAGE_DOWNLOAD_FAILED", `Image request failed with HTTP ${response.status}`, { url });
    }
    const contentType = response.headers.get("content-type") ?? "image/png";
    const extension = contentType.includes("jpeg") ? ".jpg" : contentType.includes("svg") ? ".svg" : ".png";
    const name = Buffer.from(url).toString("base64url").slice(0, 48) + extension;
    await ensureDir(this.cacheDir);
    const output = path.join(this.cacheDir, name);
    await writeFile(output, Buffer.from(await response.arrayBuffer()));
    return output;
  }
}
