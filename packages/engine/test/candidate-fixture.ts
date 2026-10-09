import type { ArtifactCandidate } from "@omega/composer";
/** Complete producer DTO for existing Engine shell tests; never real packaging/QA evidence. */
export function candidateFixture(
  workspacePath = "test-only/candidate.html",
): ArtifactCandidate {
  return {
    kind: "standalone-html-candidate",
    workspaceDirectory: "test-workspace",
    workspacePath,
    artifactHash: "test-only-hash",
    byteLength: 0,
    renderer: "astro-static/1",
    rendererVersion: "omega-prime-prose/1",
    tokenVersion: "omega-prime-tokens/1",
    runtimeDependencies: [],
    resourceDependencies: [],
  };
}
