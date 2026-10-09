import { renameSync, type Stats } from "node:fs";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CanonicalizationError,
  canonicalizeJson,
  sha256,
} from "@omega/spec-frontend";
import {
  admitDirectory,
  OutputAdmissionError,
} from "../lifecycle/atomic-commit.js";
import type { BuildAction } from "./action.js";

/** Private single-file entries publish atomically; checksums are integrity, not signatures. */
export class StageCacheStore {
  private constructor(
    readonly directory: string,
    private readonly owner: Stats,
  ) {}
  static async open(directory: string): Promise<StageCacheStore> {
    if (
      directory
        .split(/[\\/]/)
        .some(
          (segment) =>
            segment === ".omega-generations" ||
            segment === ".omega-diagnostics" ||
            segment.startsWith(".omega-workspace-"),
        )
    )
      throw new OutputAdmissionError(
        "Cache cannot use managed output/workspace namespaces",
      );
    const root = await admitDirectory(directory, true);
    return new StageCacheStore(root, await lstat(root));
  }
  private async checkOwner(): Promise<void> {
    await admitDirectory(this.directory);
    const current = await lstat(this.directory);
    if (current.dev !== this.owner.dev || current.ino !== this.owner.ino)
      throw new OutputAdmissionError("Cache root ownership changed");
  }
  private path(action: BuildAction): string {
    if (!/^[a-f0-9]{64}$/.test(action.key))
      throw new OutputAdmissionError("Invalid action key");
    return join(this.directory, `${action.key}.json`);
  }
  async read<T>(
    action: BuildAction,
    validate: (value: unknown) => value is T,
  ): Promise<T | undefined> {
    await this.checkOwner();
    try {
      const path = this.path(action);
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
      const entry: unknown = JSON.parse(await readFile(path, "utf8"));
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        return undefined;
      const data = entry as Record<string, unknown>;
      if (
        Object.keys(data).sort().join(",") !==
          "action,outputHash,value,version" ||
        data.version !== "omega-stage-cache/1" ||
        canonicalizeJson(data.action) !== canonicalizeJson(action) ||
        typeof data.outputHash !== "string" ||
        data.outputHash !== sha256(canonicalizeJson(data.value)) ||
        !validate(data.value)
      )
        return undefined;
      return data.value;
    } catch (error) {
      if (
        error instanceof SyntaxError ||
        error instanceof CanonicalizationError ||
        (error as NodeJS.ErrnoException).code === "ENOENT"
      )
        return undefined;
      throw error;
    }
  }
  async write<T>(
    action: BuildAction,
    value: T,
    validate: (value: unknown) => value is T,
    beforePublication: () => void,
  ): Promise<void> {
    await this.checkOwner();
    if (!validate(value)) throw new Error("Invalid stage output");
    const owned = structuredClone(value);
    // The storage envelope must not consume the producer's depth128 JSON budget.
    const bytes = JSON.stringify({
      version: "omega-stage-cache/1",
      action,
      outputHash: sha256(canonicalizeJson(owned)),
      value: owned,
    });
    const temporary = await mkdtemp(
      join(this.directory, ".omega-cache-write-"),
    );
    try {
      const file = join(temporary, "entry.json");
      await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
      await this.checkOwner();
      // No await between this check and the single same-filesystem publication.
      beforePublication();
      renameSync(file, this.path(action));
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}
