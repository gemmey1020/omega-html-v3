import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalizeJson } from "@omega/spec-frontend";
import type { RenderedInput } from "../api/types.js";
import type { BuildImplementationIdentity } from "../cache/action.js";
import { admitDirectory } from "../lifecycle/atomic-commit.js";

/** Generated inspection state only; exact Canonical/protected lexemes are serialized verbatim. */
export async function writeIntermediates(
  workspace: string,
  input: RenderedInput,
  identity: BuildImplementationIdentity,
): Promise<string> {
  const directory = await admitDirectory(
    join(workspace, "intermediates"),
    true,
  );
  const files = {
    "canonical.json": input.compiled.canonical,
    "source-map.json": input.compiled.sourceMap,
    "semantic.json": input.semantic,
    "plan.json": input.plan,
    "render-output.json": input.rendered,
    "input-identities.json": {
      rawSourceHash: input.compiled.rawSourceHash,
      normalizedHash: input.compiled.normalizedHash,
      capabilitySnapshotHash: input.capabilities.snapshotHash,
      implementation: identity,
      resources: [],
    },
  };
  for (const [name, value] of Object.entries(files))
    await writeFile(join(directory, name), `${canonicalizeJson(value)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  return directory;
}
/** Retained full diagnostics have a separate admitted per-attempt managed location. */
export async function retainIntermediates(
  directory: string,
  diagnosticRoot: string,
): Promise<string> {
  await admitDirectory(directory);
  await admitDirectory(diagnosticRoot);
  const target = await mkdtemp(join(diagnosticRoot, "omega-diagnostic-"));
  try {
    await rename(directory, target);
    return target;
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}
