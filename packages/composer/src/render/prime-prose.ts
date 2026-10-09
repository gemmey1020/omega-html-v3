import type { MinimalRenderPlan } from "@omega/presentation-engine";
import { renderPlanToHtml } from "../astro/runtime.mjs";
import { checkRenderPlan } from "./check-plan.js";
import type { PrimeProseRenderResult, RenderControl } from "./types.js";

function checkCancellation(control: RenderControl) {
  control.checkCancellation?.();
  if (control.signal?.aborted)
    throw new DOMException("Static rendering was cancelled.", "AbortError");
}

/** Actual pinned Astro compiler/runtime; no parallel string HTML renderer, no child process. */
export async function renderPrimeProse(
  plan: MinimalRenderPlan,
  control: RenderControl = {},
): Promise<PrimeProseRenderResult> {
  checkCancellation(control);
  // Own the exact producer payload before any await; ignore runtime/control extras.
  const owned = structuredClone({
    version: plan.version,
    engineVersion: plan.engineVersion,
    canonicalContractVersion: plan.canonicalContractVersion,
    normalizedHash: plan.normalizedHash,
    capabilitySnapshotHash: plan.capabilitySnapshotHash,
    profile: plan.profile,
    profileVersion: plan.profileVersion,
    target: plan.target,
    representation: plan.representation,
    metadata: plan.metadata,
    document: plan.document,
    sections: plan.sections,
    planHash: plan.planHash,
  });
  const diagnostics = checkRenderPlan(owned);
  if (diagnostics.length) return Object.freeze({ ok: false, diagnostics });
  const html = await renderPlanToHtml(owned, () => checkCancellation(control));
  checkCancellation(control);
  return Object.freeze({
    ok: true,
    output: Object.freeze({
      html,
      renderer: "astro-static/1",
      rendererVersion: "omega-prime-prose/1",
      tokenVersion: "omega-prime-tokens/1",
      runtimeDependencies: Object.freeze([] as const),
      assetDependencies: Object.freeze([] as const),
      implementedFallbacks: Object.freeze([
        "no-js",
        "reflow",
        "print",
        "forced-colors",
        "reduced-motion",
      ] as const),
    }),
  });
}
