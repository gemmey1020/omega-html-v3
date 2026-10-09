import type { MinimalRenderPlan } from "@omega/presentation-engine";
/** Narrow boundary over pinned Astro/Vite APIs, executed by the real renderer tests. */
export function renderPlanToHtml(
  plan: MinimalRenderPlan,
  checkCancellation: () => void,
): Promise<string>;
