import { lstat, readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { canonicalizeJson, sha256 } from "@omega/spec-frontend";
import {
  admitDirectory,
  OutputAdmissionError,
} from "../lifecycle/atomic-commit.js";

export interface BuildActionInputs {
  readonly stage: "plan" | "render";
  readonly inputs: Readonly<Record<string, string>>;
  readonly implementation: string;
  readonly toolchain: string;
  readonly policy: string;
  readonly capabilities: string;
  readonly resources: readonly [];
}
export interface BuildAction extends BuildActionInputs {
  readonly version: "omega-build-action/1";
  readonly key: BuildActionKey;
}
export type BuildActionKey = string;
export function createBuildAction(input: BuildActionInputs): BuildAction {
  const data = structuredClone({
    version: "omega-build-action/1" as const,
    ...input,
  });
  if (data.resources.length !== 0)
    throw new Error("P02 resources must be empty");
  Object.freeze(data.inputs);
  Object.freeze(data.resources);
  return Object.freeze({ ...data, key: sha256(canonicalizeJson(data)) });
}
export interface SourceFingerprint {
  readonly digest: string;
  readonly files: readonly { readonly path: string; readonly hash: string }[];
}
/** Portable declared relative identifiers + actual bytes, never Git/evidence metadata. */
export async function fingerprintSources(
  root: string,
  paths: readonly string[],
): Promise<SourceFingerprint> {
  const admitted = await admitDirectory(root);
  const files = [];
  for (const path of [...new Set(paths)].sort()) {
    if (
      isAbsolute(path) ||
      !/^[A-Za-z0-9_./-]+$/.test(path) ||
      path
        .split("/")
        .some((segment) => segment === ".." || segment === "." || !segment)
    )
      throw new OutputAdmissionError("Invalid source identifier");
    const segments = path.split("/");
    await admitDirectory(join(admitted, ...segments.slice(0, -1)));
    const absolute = join(admitted, path);
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new OutputAdmissionError("Source is not a real file");
    files.push({ path, hash: sha256(await readFile(absolute)) });
  }
  return Object.freeze({ files, digest: sha256(canonicalizeJson(files)) });
}
export interface BuildImplementationIdentity {
  readonly version: "omega-source-identity/1";
  readonly sourceContentHash: string;
  readonly toolchainHash: string;
}
const packageNames = [
  "contracts",
  "spec-frontend",
  "capability-registry",
  "presentation-engine",
  "design-system",
  "composer",
  "engine",
  "cli",
];
/** Explicit P02 source inventory: templates/CSS/schema/QA/loader and pinned toolchain inputs. */
export async function currentImplementationIdentity(): Promise<BuildImplementationIdentity> {
  const root = resolve(import.meta.dirname, "../../../..");
  const sources: string[] = [];
  async function collect(directory: string): Promise<void> {
    await admitDirectory(join(root, directory));
    for (const entry of await readdir(join(root, directory), {
      withFileTypes: true,
    })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isSymbolicLink())
        throw new OutputAdmissionError("Symlink source unsupported");
      if (entry.isDirectory()) await collect(path);
      else if (/\.(?:ts|mts|mjs|astro|css|json)$/.test(path))
        sources.push(path);
    }
  }
  for (const name of packageNames) {
    await collect(`packages/${name}/src`);
    sources.push(`packages/${name}/package.json`);
  }
  const toolchain = await fingerprintSources(root, [
    "package.json",
    "pnpm-lock.yaml",
    ".node-version",
    "scripts/activate-toolchain.sh",
  ]);
  const source = await fingerprintSources(root, sources);
  return Object.freeze({
    version: "omega-source-identity/1",
    sourceContentHash: source.digest,
    toolchainHash: sha256(
      canonicalizeJson({
        declared: toolchain.digest,
        node: process.versions.node,
      }),
    ),
  });
}
