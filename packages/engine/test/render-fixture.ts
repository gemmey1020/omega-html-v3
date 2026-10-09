import type { PrimeProseRenderOutput } from "@omega/composer";
/** Complete producer DTO for existing Engine shell tests; not real renderer/QA evidence. */
export function renderFixture(html: string): PrimeProseRenderOutput {
  return {
    html,
    renderer: "astro-static/1",
    rendererVersion: "omega-prime-prose/1",
    tokenVersion: "omega-prime-tokens/1",
    runtimeDependencies: [],
    assetDependencies: [],
    implementedFallbacks: [
      "no-js",
      "reflow",
      "print",
      "forced-colors",
      "reduced-motion",
    ],
  };
}
