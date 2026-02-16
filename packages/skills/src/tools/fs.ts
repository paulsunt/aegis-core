import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const FsReadSchema = z.object({
  path: z.string().describe("Path to the file to read"),
});

export const FsWriteSchema = z.object({
  path: z.string().describe("Path to the file to write"),
  content: z.string().describe("Content to write to the file"),
});

export const FsListSchema = z.object({
  path: z.string().describe("Path to the directory to list"),
});

export class FsTool {
  constructor(private readonly workspaceDir: string) {}

  private resolvePath(p: string): string {
    const resolved = path.resolve(this.workspaceDir, p);
    if (!resolved.startsWith(this.workspaceDir)) {
      throw new Error(
        `Access denied: Path ${p} is outside workspace ${this.workspaceDir}`
      );
    }
    return resolved;
  }

  async read(params: z.infer<typeof FsReadSchema>): Promise<string> {
    const p = this.resolvePath(params.path);
    return fs.readFile(p, "utf8");
  }

  async write(params: z.infer<typeof FsWriteSchema>): Promise<string> {
    const p = this.resolvePath(params.path);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, params.content, "utf8");
    return `Wrote ${params.content.length} bytes to ${params.path}`;
  }

  async list(
    params: z.infer<typeof FsListSchema>
  ): Promise<{ name: string; isDirectory: boolean }[]> {
    const p = this.resolvePath(params.path);
    const entries = await fs.readdir(p, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    }));
  }
}
