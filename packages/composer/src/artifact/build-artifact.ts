import type { MinimalRenderPlan } from "@omega/presentation-engine";
import { packageStandaloneHtml } from "../packaging/single-file.js";
import { renderPrimeProse } from "../render/prime-prose.js";
import type {
  PrimeProseRenderOutput,
  RenderControl,
  RenderDiagnostic,
} from "../render/types.js";
export interface ArtifactCandidate {
  readonly kind: "standalone-html-candidate";
  readonly workspaceDirectory: string;
  readonly workspacePath: string;
  readonly artifactHash: string;
  readonly byteLength: number;
  readonly renderer: PrimeProseRenderOutput["renderer"];
  readonly rendererVersion: PrimeProseRenderOutput["rendererVersion"];
  readonly tokenVersion: PrimeProseRenderOutput["tokenVersion"];
  readonly runtimeDependencies: readonly [];
  readonly resourceDependencies: readonly [];
}
export type PackageDiagnostic = Omit<RenderDiagnostic, "stage"> & {
  readonly stage: "package";
};
export type ArtifactBuildResult =
  | { readonly ok: true; readonly candidate: ArtifactCandidate }
  | {
      readonly ok: false;
      readonly diagnostics: readonly (RenderDiagnostic | PackageDiagnostic)[];
    };
export interface StandaloneBuildInput {
  readonly plan: MinimalRenderPlan;
  readonly temporaryRoot: string;
}
/** Convenience builder; Engine's real package stage should reuse its rendered output. */
export async function buildStandaloneHtml(
  input: StandaloneBuildInput,
  control: RenderControl = {},
): Promise<ArtifactBuildResult> {
  const temporaryRoot = input.temporaryRoot;
  const rendered = await renderPrimeProse(input.plan, control);
  if (!rendered.ok) return rendered;
  return packageStandaloneHtml(
    { rendered: rendered.output, temporaryRoot },
    control,
  );
}
