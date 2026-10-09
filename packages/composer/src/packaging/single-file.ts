import { createHash } from "node:crypto";
import { lstat, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type {
  ArtifactBuildResult,
  ArtifactCandidate,
  PackageDiagnostic,
} from "../artifact/build-artifact.js";
import type { PrimeProseRenderOutput, RenderControl } from "../render/types.js";

export interface SingleFileInput {
  readonly rendered: PrimeProseRenderOutput;
  readonly temporaryRoot: string;
}
// Runtime ownership is separate from the serializable candidate. Never delete caller roots.
const ownedDirectories = new Map<string, string>();
function checkCancellation(control: RenderControl) {
  control.checkCancellation?.();
  if (control.signal?.aborted)
    throw new DOMException("Standalone packaging was cancelled.", "AbortError");
}
function failure(code: string, message: string): ArtifactBuildResult {
  const diagnostic: PackageDiagnostic = Object.freeze({
    code,
    message,
    stage: "package",
    severity: "ERROR",
  });
  return Object.freeze({ ok: false, diagnostics: Object.freeze([diagnostic]) });
}

/** Writes exact admitted Astro output. This is a trusted producer boundary, not an HTML sanitizer. */
export async function packageStandaloneHtml(
  input: SingleFileInput,
  control: RenderControl = {},
): Promise<ArtifactBuildResult> {
  checkCancellation(control);
  const root = input.temporaryRoot;
  // Own declared content and settings before the first await; runtime extras are ignored.
  const rendered = structuredClone({
    html: input.rendered.html,
    renderer: input.rendered.renderer,
    rendererVersion: input.rendered.rendererVersion,
    tokenVersion: input.rendered.tokenVersion,
    runtimeDependencies: input.rendered.runtimeDependencies,
    assetDependencies: input.rendered.assetDependencies,
  });
  if (
    rendered.renderer !== "astro-static/1" ||
    rendered.rendererVersion !== "omega-prime-prose/1" ||
    rendered.tokenVersion !== "omega-prime-tokens/1" ||
    rendered.runtimeDependencies.length ||
    rendered.assetDependencies.length
  ) {
    return failure(
      "OMEGA-PACKAGE-DEPENDENCIES-UNSUPPORTED",
      "P02 packaging requires the static Prime producer with no runtime or asset dependencies.",
    );
  }
  if (!isAbsolute(root))
    return failure(
      "OMEGA-PACKAGE-WORKSPACE-INVALID",
      "A real absolute temporary workspace directory is required.",
    );
  let validRoot = false;
  try {
    validRoot =
      (await lstat(root)).isDirectory() &&
      (await realpath(root)) === resolve(root);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      !["ENOENT", "ENOTDIR", "ELOOP"].includes(String(error.code))
    )
      throw error;
  }
  checkCancellation(control);
  if (!validRoot)
    return failure(
      "OMEGA-PACKAGE-WORKSPACE-INVALID",
      "Temporary workspace must be an existing directory without symlink ancestors.",
    );
  let directory: string | undefined;
  try {
    directory = await mkdtemp(join(root, "omega-candidate-"));
    checkCancellation(control);
    const path = join(directory, "artifact.html");
    const bytes = Buffer.from(rendered.html, "utf8");
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    checkCancellation(control);
    const candidate: ArtifactCandidate = Object.freeze({
      kind: "standalone-html-candidate",
      workspaceDirectory: directory,
      workspacePath: path,
      artifactHash: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.length,
      renderer: rendered.renderer,
      rendererVersion: rendered.rendererVersion,
      tokenVersion: rendered.tokenVersion,
      runtimeDependencies: Object.freeze([] as const),
      resourceDependencies: Object.freeze([] as const),
    });
    checkCancellation(control);
    ownedDirectories.set(directory, path);
    return Object.freeze({ ok: true, candidate });
  } catch (error) {
    if (directory) await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

/** Same-process owned candidates only; unknown/forged paths cannot trigger deletion. */
export async function cleanupArtifactCandidate(
  candidate: ArtifactCandidate,
): Promise<void> {
  if (
    ownedDirectories.get(candidate.workspaceDirectory) !==
    candidate.workspacePath
  )
    return;
  await rm(candidate.workspaceDirectory, { recursive: true, force: true });
  ownedDirectories.delete(candidate.workspaceDirectory);
}
