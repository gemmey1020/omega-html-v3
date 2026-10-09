import type { Diagnostic } from "@omega/contracts";
/** Deterministic phase-internal producer DTO; runtime control is a separate argument. */
export interface PrimeProseRenderOutput {
  readonly html: string;
  readonly renderer: "astro-static/1";
  readonly rendererVersion: "omega-prime-prose/1";
  readonly tokenVersion: "omega-prime-tokens/1";
  readonly runtimeDependencies: readonly [];
  readonly assetDependencies: readonly [];
  /** Implemented static treatment, not browser-QA or acceptance evidence. */
  readonly implementedFallbacks: readonly [
    "no-js",
    "reflow",
    "print",
    "forced-colors",
    "reduced-motion",
  ];
}
export type RenderDiagnostic = Omit<Diagnostic, "stage"> & {
  readonly stage: "render";
};
export type PrimeProseRenderResult =
  | { readonly ok: true; readonly output: PrimeProseRenderOutput }
  | { readonly ok: false; readonly diagnostics: readonly RenderDiagnostic[] };
export interface RenderControl {
  readonly signal?: AbortSignal;
  /** Optional trusted runtime boundary check, never serialized or hashed. */
  readonly checkCancellation?: () => void;
}
