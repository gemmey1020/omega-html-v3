import type { Stats } from "node:fs";
import { lstat, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  admitDirectory,
  OutputAdmissionError,
} from "../lifecycle/atomic-commit.js";

/** Stable admitted host ancestors; exclusive per-attempt child, no correlation identity. */
export class BuildWorkspace {
  private constructor(
    readonly directory: string,
    private readonly owner: Stats,
  ) {}
  static async create(root: string): Promise<BuildWorkspace> {
    const admitted = await admitDirectory(root);
    const directory = await mkdtemp(join(admitted, ".omega-workspace-"));
    return new BuildWorkspace(directory, await lstat(directory));
  }
  async cleanup(): Promise<void> {
    let stat: Stats;
    try {
      stat = await lstat(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.dev !== this.owner.dev ||
      stat.ino !== this.owner.ino
    )
      throw new OutputAdmissionError("Workspace ownership changed");
    await rm(this.directory, { recursive: true, force: true });
  }
}
