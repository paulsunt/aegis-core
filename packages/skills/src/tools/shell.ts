import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { z } from "zod";

const execAsync = promisify(exec);

export const ShellExecSchema = z.object({
  command: z.string().describe("Shell command to execute"),
  cwd: z.string().optional().describe("Current working directory"),
});

export class ShellTool {
  constructor(private readonly workspaceDir: string) {}

  async exec(params: z.infer<typeof ShellExecSchema>) {
    const cwd = params.cwd
      ? path.resolve(this.workspaceDir, params.cwd)
      : this.workspaceDir;

    try {
      const { stdout, stderr } = await execAsync(params.command, { cwd });
      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };
      return {
        stdout: err.stdout?.trim() ?? "",
        stderr: err.stderr?.trim() ?? "",
        exitCode: err.code ?? 1,
        error: err.message,
      };
    }
  }
}
