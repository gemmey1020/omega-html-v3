import type {
  AcceptedInput,
  ArtifactCandidate,
  CandidateInput,
  CapabilitySnapshot,
  CommittedArtifact,
  CompiledInput,
  DecisionExplanation,
  DomainFailureClass,
  EngineDiagnostic,
  GateEvidence,
  PlannedInput,
  PreflightInput,
  QualityCheckedInput,
  RegressionCheckedInput,
  RenderedInput,
  RenderOutput,
  RenderPlan,
  SemanticAnalysis,
  SemanticInput,
  VerifiedInput,
} from "../api/types.js";

export const LIFECYCLE_STAGES = Object.freeze([
  "preflight",
  "compile",
  "semantic",
  "plan",
  "render",
  "package",
  "verify",
  "quality",
  "regression",
  "acceptance",
  "commit",
] as const);
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];
export type StageResult<T> =
  | {
      readonly status: "succeeded";
      readonly value: T;
      readonly diagnostics?: readonly EngineDiagnostic[];
    }
  | {
      readonly status: "failed";
      readonly failureClass: DomainFailureClass;
      readonly diagnostics: readonly EngineDiagnostic[];
    };
export type StageAdapter<I, O> = (
  input: I,
) => StageResult<O> | Promise<StageResult<O>>;

/** Optional installation; absent production stages fail instead of faking QA. */
export interface EngineAdapters {
  readonly capabilities?: () =>
    | StageResult<CapabilitySnapshot>
    | Promise<StageResult<CapabilitySnapshot>>;
  readonly preflight?: StageAdapter<PreflightInput, null>;
  readonly semantic?: StageAdapter<CompiledInput, SemanticAnalysis>;
  readonly plan?: StageAdapter<SemanticInput, RenderPlan>;
  readonly render?: StageAdapter<PlannedInput, RenderOutput>;
  readonly package?: StageAdapter<RenderedInput, ArtifactCandidate>;
  readonly verify?: StageAdapter<CandidateInput, GateEvidence>;
  readonly quality?: StageAdapter<VerifiedInput, GateEvidence>;
  readonly regression?: StageAdapter<QualityCheckedInput, GateEvidence>;
  readonly acceptance?: StageAdapter<RegressionCheckedInput, GateEvidence>;
  readonly commit?: StageAdapter<AcceptedInput, CommittedArtifact>;
  readonly explain?: StageAdapter<
    { readonly plan: RenderPlan },
    DecisionExplanation
  >;
}
