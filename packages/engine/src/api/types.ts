import type { CapabilitySnapshot } from "@omega/capability-registry";
import type {
  PrimeProseRenderOutput,
  ArtifactCandidate as StandaloneArtifactCandidate,
} from "@omega/composer";
import type { MinimalRenderPlan } from "@omega/presentation-engine";

export type { CapabilitySnapshot } from "@omega/capability-registry";

import type {
  CompilerSource,
  CompilerStage,
  CompilerVersions,
  CompileSuccess,
  Diagnostic,
  JsonValue,
} from "@omega/contracts";
import type { MigrationResult } from "@omega/spec-frontend";
import type { LifecycleStage } from "../lifecycle/stages.js";

export const ENGINE_VERSION = "0.0.0";
export const P02_ACCEPTANCE_POLICY = "qa.phase.p02.walking-skeleton.v1";

export type EngineOperation =
  | "validate"
  | "plan"
  | "build"
  | "inspect"
  | "explain"
  | "migrate"
  | "capabilities";
export type EngineStage =
  | LifecycleStage
  | "explain"
  | "migrate"
  | "capabilities";
export type DomainFailureClass = "validation" | "execution" | "unavailable";
export type FailureClass = DomainFailureClass | "internal";
export type EngineDiagnostic = Omit<Diagnostic, "stage"> & {
  readonly stage: CompilerStage | EngineStage;
};

/** Phase-internal DTO shells; their producers complete these before CLI/OEP. */
export interface JsonPayload {
  readonly [key: string]: JsonValue;
}
export type SemanticAnalysis = JsonPayload;
export type RenderPlan = MinimalRenderPlan;
export type RenderOutput = PrimeProseRenderOutput;
export type ArtifactCandidate = StandaloneArtifactCandidate;
export type GateEvidence = JsonPayload;
export type DecisionExplanation = JsonPayload;
export interface CommittedArtifact {
  readonly finalArtifactPath: string;
}

/** Execution settings never enter canonical semantics or semantic hashes. */
export interface ExecutionSettings {
  readonly quality?: "fast" | "release";
  readonly diagnostics?: "normal" | "full";
  readonly cache?: "use" | "refresh" | "off";
  readonly outputDirectory?: string;
}

interface SourceRequest<O extends EngineOperation> {
  readonly operation: O;
  readonly source: CompilerSource;
  readonly settings?: ExecutionSettings;
}
export type ValidateRequest = SourceRequest<"validate">;
export type PlanRequest = SourceRequest<"plan">;
export type BuildRequest = SourceRequest<"build">;
export type InspectRequest = SourceRequest<"inspect">;
export interface ExplainRequest {
  readonly operation: "explain";
  readonly plan: RenderPlan;
}
export interface MigrateRequest {
  readonly operation: "migrate";
  readonly source: CompilerSource;
  readonly targetVersion: string;
}
export interface CapabilitiesRequest {
  readonly operation: "capabilities";
}
export type EngineRequest =
  | ValidateRequest
  | PlanRequest
  | BuildRequest
  | InspectRequest
  | ExplainRequest
  | MigrateRequest
  | CapabilitiesRequest;

export interface StageOutcome {
  readonly stage: EngineStage;
  readonly status: "succeeded" | "failed" | "cancelled";
}
interface ResultBase<O extends EngineOperation> {
  readonly operation: O;
  readonly diagnostics: readonly EngineDiagnostic[];
  readonly stages: readonly StageOutcome[];
}
export interface EngineFailure<O extends EngineOperation = EngineOperation>
  extends ResultBase<O> {
  readonly status: "failed";
  readonly failureClass: FailureClass;
  readonly stage: EngineStage;
  /** A trusted adapter failed after publication; output was not rolled back. */
  readonly publication?: "committed";
}
export interface EngineCancelled<O extends EngineOperation = EngineOperation>
  extends ResultBase<O> {
  readonly status: "cancelled";
  readonly stage: EngineStage;
}
export interface EngineSnapshot {
  readonly compiled: CompileSuccess;
  readonly semantic: SemanticAnalysis;
  readonly capabilities: CapabilitySnapshot;
}
export interface EngineSuccess<O extends EngineOperation, V>
  extends ResultBase<O> {
  readonly status: "succeeded";
  readonly value: V;
}
export type ValidateResult =
  | EngineSuccess<"validate", EngineSnapshot>
  | EngineFailure<"validate">
  | EngineCancelled<"validate">;
export type InspectResult =
  | EngineSuccess<"inspect", EngineSnapshot>
  | EngineFailure<"inspect">
  | EngineCancelled<"inspect">;
export interface PlannedSnapshot extends EngineSnapshot {
  readonly plan: RenderPlan;
}
export type PlanResult =
  | EngineSuccess<"plan", PlannedSnapshot>
  | EngineFailure<"plan">
  | EngineCancelled<"plan">;
export type BuildResult =
  | EngineSuccess<"build", PlannedSnapshot & CommittedArtifact>
  | EngineFailure<"build">
  | EngineCancelled<"build">;
export type ExplainResult =
  | EngineSuccess<"explain", DecisionExplanation>
  | EngineFailure<"explain">
  | EngineCancelled<"explain">;
export type MigrateResult =
  | EngineSuccess<"migrate", Extract<MigrationResult, { ok: true }>>
  | EngineFailure<"migrate">
  | EngineCancelled<"migrate">;
export type CapabilitiesResult =
  | EngineSuccess<"capabilities", CapabilitySnapshot>
  | EngineFailure<"capabilities">
  | EngineCancelled<"capabilities">;
export type EngineResult =
  | ValidateResult
  | PlanResult
  | BuildResult
  | InspectResult
  | ExplainResult
  | MigrateResult
  | CapabilitiesResult;

export interface PreflightInput {
  readonly versions: CompilerVersions;
  readonly settings: ExecutionSettings;
  readonly capabilities: CapabilitySnapshot;
}
export interface CompiledInput extends PreflightInput {
  readonly compiled: CompileSuccess;
}
export interface SemanticInput extends CompiledInput {
  readonly semantic: SemanticAnalysis;
}
export interface PlannedInput extends SemanticInput {
  readonly plan: RenderPlan;
}
export interface RenderedInput extends PlannedInput {
  readonly rendered: RenderOutput;
}
export interface CandidateInput extends RenderedInput {
  readonly candidate: ArtifactCandidate;
  readonly acceptancePolicy: typeof P02_ACCEPTANCE_POLICY;
}
export interface VerifiedInput extends CandidateInput {
  readonly gates: { readonly verify: GateEvidence };
}
export interface QualityCheckedInput extends VerifiedInput {
  readonly gates: VerifiedInput["gates"] & { readonly quality: GateEvidence };
}
export interface RegressionCheckedInput extends QualityCheckedInput {
  readonly gates: QualityCheckedInput["gates"] & {
    readonly regression: GateEvidence;
  };
}
export interface AcceptedInput extends RegressionCheckedInput {
  readonly gates: {
    readonly verify: GateEvidence;
    readonly quality: GateEvidence;
    readonly regression: GateEvidence;
    readonly acceptance: GateEvidence;
  };
}
