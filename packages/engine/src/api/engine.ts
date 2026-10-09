import {
  CANONICAL_CONTRACT_VERSION,
  type CompilerSource,
  RAW_SCHEMA_VERSION,
} from "@omega/contracts";
import { compileRawSpec, migrateRawSpec } from "@omega/spec-frontend";
import { BuildEventEmitter } from "../events/emitter.js";
import type { ExecutionControl } from "../events/events.js";
import {
  CancellationError,
  type CancellationToken,
  CancellationTokenSource,
  throwIfCancellationRequested,
} from "../lifecycle/cancellation.js";
import type {
  EngineAdapters,
  StageAdapter,
  StageContext,
  StageResult,
} from "../lifecycle/stages.js";
import {
  type BuildRequest,
  type BuildResult,
  type CandidateInput,
  type CapabilitiesRequest,
  type CapabilitiesResult,
  type CapabilitySnapshot,
  type CommittedArtifact,
  ENGINE_VERSION,
  type EngineCancelled,
  type EngineDiagnostic,
  type EngineFailure,
  type EngineOperation,
  type EngineSnapshot,
  type EngineStage,
  type EngineSuccess,
  type ExplainRequest,
  type ExplainResult,
  type InspectRequest,
  type InspectResult,
  type MigrateRequest,
  type MigrateResult,
  P02_ACCEPTANCE_POLICY,
  type PlannedInput,
  type PlanRequest,
  type PlanResult,
  type PreflightInput,
  type SemanticInput,
  type StageOutcome,
  type ValidateRequest,
  type ValidateResult,
} from "./types.js";

function freezeOwned<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeOwned(child);
    Object.freeze(value);
  }
  return value;
}

/** Snapshot before freezing, so callers and preceding adapter outputs stay owned. */
function snapshot<T>(value: T): T {
  return freezeOwned(structuredClone(value));
}

function sourceSnapshot(source: CompilerSource): CompilerSource {
  const { module, text } = source;
  return {
    module,
    text: typeof text === "string" ? text : new Uint8Array(text),
  };
}

const EMPTY_CAPABILITIES: CapabilitySnapshot = snapshot({
  intents: [],
  contentKinds: [],
  representations: [],
  profiles: [],
  targets: [],
  renderers: [],
  plugins: [],
  qaRules: [],
  policyVersions: [],
});

/** One attempt owns scheduling, telemetry and terminal state. */
class Attempt<O extends EngineOperation> {
  stage: EngineStage;
  readonly stages: StageOutcome[] = [];
  readonly diagnostics: EngineDiagnostic[] = [];
  readonly events: BuildEventEmitter;
  readonly token: CancellationToken;
  private published: CommittedArtifact | undefined;

  constructor(
    readonly operation: O,
    stage: EngineStage,
    control: ExecutionControl,
  ) {
    this.stage = stage;
    this.events = new BuildEventEmitter(operation, control);
    this.token = Object.freeze({
      signal: (control.cancellationToken ?? new CancellationTokenSource().token)
        .signal,
    });
  }

  get cancellationRequested(): boolean {
    return !this.published && this.token.signal.aborted;
  }

  checkCancellation(): void {
    if (!this.published) throwIfCancellationRequested(this.token);
  }

  addDiagnostics(diagnostics: readonly EngineDiagnostic[]): void {
    for (const diagnostic of diagnostics) {
      this.diagnostics.push(diagnostic);
      this.events.emit({
        name: "diagnostic.emitted",
        stage: this.stage,
        diagnostic,
      });
    }
  }

  async run<I, V>(
    stage: EngineStage,
    adapter: StageAdapter<I, V> | undefined,
    input: I,
  ): Promise<StageResult<V>> {
    this.checkCancellation();
    this.stage = stage;
    let active = true;
    let publishing = false;
    const context: StageContext = Object.freeze<StageContext>({
      ...this.events.correlation,
      stage,
      cancellationToken: this.token,
      emit: (event) => {
        if (!active) return;
        // Even trusted callbacks cannot manufacture lifecycle/terminal events.
        if (!["stage.progress", "cache.hit", "cache.miss"].includes(event.name))
          throw new Error("Unsupported adapter event.");
        this.checkCancellation();
        this.events.emit({ ...event, stage });
      },
      publishCommit: (publication) => {
        if (
          !active ||
          stage !== "commit" ||
          this.operation !== "build" ||
          this.published ||
          publishing
        )
          throw new Error("Invalid commit publication boundary.");
        this.checkCancellation();
        publishing = true;
        try {
          const artifact = publication();
          const owned = snapshot(artifact);
          this.published = owned;
          return owned;
        } finally {
          publishing = false;
        }
      },
    });
    this.events.emit({ name: "stage.started", stage });
    try {
      this.checkCancellation();
      let result: StageResult<V>;
      try {
        result = adapter
          ? snapshot(await adapter(snapshot(input), context))
          : {
              status: "failed",
              failureClass: "unavailable",
              diagnostics: [
                {
                  code: "OMEGA-ENGINE-STAGE-UNAVAILABLE",
                  severity: "ERROR",
                  stage,
                  message:
                    "No implementation is installed for this Engine stage.",
                },
              ],
            };
      } catch (error) {
        if (
          this.published &&
          error instanceof CancellationError &&
          this.token.signal.aborted
        )
          result = { status: "succeeded", value: this.published as V };
        else throw error;
      }
      active = false;
      if (this.published && result.status === "failed")
        throw new Error("Commit adapter contradicted published success.");
      if (
        this.published &&
        result.status === "succeeded" &&
        (result.value as CommittedArtifact).finalArtifactPath !==
          this.published.finalArtifactPath
      )
        throw new Error("Commit adapter contradicted published artifact.");
      this.checkCancellation();
      this.addDiagnostics(result.diagnostics ?? []);
      this.stages.push({ stage, status: result.status });
      this.events.emit({
        name: "stage.completed",
        stage,
        status: result.status,
      });
      if (stage === "package" && result.status === "succeeded")
        this.events.emit({
          name: "artifact.produced",
          stage,
          state: "candidate",
        });
      if (
        stage === "verify" ||
        stage === "quality" ||
        stage === "regression" ||
        stage === "acceptance"
      )
        this.events.emit({
          name: "qa.completed",
          stage,
          status: result.status,
          policy: P02_ACCEPTANCE_POLICY,
        });
      return result;
    } catch (error) {
      active = false;
      const status = this.cancellationRequested ? "cancelled" : "failed";
      this.stages.push({ stage, status });
      this.events.emit({ name: "stage.completed", stage, status });
      if (status === "cancelled") throw new CancellationError();
      throw error;
    } finally {
      active = false;
    }
  }

  failed(failureClass: EngineFailure["failureClass"]): EngineFailure<O> {
    return snapshot({
      operation: this.operation,
      status: "failed",
      failureClass,
      stage: this.stage,
      diagnostics: this.diagnostics,
      stages: this.stages,
      ...(this.published ? { publication: "committed" as const } : {}),
    });
  }

  internalFailure(): EngineFailure<O> {
    this.addDiagnostics([
      {
        code: this.published
          ? "OMEGA-ENGINE-POST-PUBLICATION-INTERNAL"
          : "OMEGA-ENGINE-INTERNAL",
        severity: "ERROR",
        stage: this.stage,
        message: this.published
          ? "An Engine adapter failed after output publication; the publication remains committed."
          : "An unexpected Engine error occurred.",
      },
    ]);
    return this.failed("internal");
  }

  cancelled(): EngineCancelled<O> {
    return snapshot({
      operation: this.operation,
      status: "cancelled",
      stage: this.stage,
      diagnostics: this.diagnostics,
      stages: this.stages,
    });
  }

  succeeded<V>(value: V): EngineSuccess<O, V> {
    this.checkCancellation();
    return snapshot({
      operation: this.operation,
      status: "succeeded",
      value,
      diagnostics: this.diagnostics,
      stages: this.stages,
    });
  }
}

export class OmegaEngine {
  private readonly adapters: EngineAdapters;

  constructor(adapters: EngineAdapters = {}) {
    // Freeze our mapping, never the caller's object or trusted callbacks.
    this.adapters = Object.freeze({ ...adapters });
  }

  private async execute<O extends EngineOperation, V>(
    operation: O,
    action: (
      attempt: Attempt<O>,
    ) => Promise<EngineSuccess<O, V> | EngineFailure<O>>,
    stage: EngineStage = "preflight",
    control: ExecutionControl = {},
  ): Promise<EngineSuccess<O, V> | EngineFailure<O> | EngineCancelled<O>> {
    const attempt = new Attempt(operation, stage, control);
    attempt.events.emit({ name: "build.started" });
    let result: EngineSuccess<O, V> | EngineFailure<O> | EngineCancelled<O>;
    try {
      attempt.checkCancellation();
      result = await action(attempt);
      attempt.checkCancellation();
    } catch {
      // Cancellation has its own terminal; unexplained thrown bugs stay internal.
      // Never expose exception text/stacks or host paths in diagnostics/events.
      result = attempt.cancellationRequested
        ? attempt.cancelled()
        : attempt.internalFailure();
    }
    if (result.status === "succeeded")
      attempt.events.emit({ name: "build.completed", status: result.status });
    else if (result.status === "cancelled")
      attempt.events.emit({
        name: "build.cancelled",
        status: result.status,
        stage: result.stage,
      });
    else
      attempt.events.emit({
        name: "build.failed",
        status: result.status,
        stage: result.stage,
        failureClass: result.failureClass,
        ...(result.publication ? { publication: result.publication } : {}),
      });
    return result;
  }

  private async validated<O extends "validate" | "inspect" | "plan" | "build">(
    attempt: Attempt<O>,
    request: ValidateRequest | InspectRequest | PlanRequest | BuildRequest,
  ): Promise<SemanticInput | EngineFailure<O>> {
    // Copy raw bytes and settings synchronously, before any adapter can await.
    const source = sourceSnapshot(request.source);
    const settings = snapshot(request.settings ?? {});
    let preflightInput!: PreflightInput;
    const preflight = await attempt.run(
      "preflight",
      async (_input, context) => {
        const registry = this.adapters.capabilities
          ? snapshot(await this.adapters.capabilities(context))
          : { status: "succeeded" as const, value: EMPTY_CAPABILITIES };
        attempt.checkCancellation();
        attempt.addDiagnostics(registry.diagnostics ?? []);
        if (registry.status === "failed")
          return { ...registry, diagnostics: [] };
        preflightInput = snapshot({
          versions: {
            rawSchemaVersion: RAW_SCHEMA_VERSION,
            canonicalContractVersion: CANONICAL_CONTRACT_VERSION,
            engineVersion: ENGINE_VERSION,
          },
          settings,
          capabilities: registry.value,
        });
        attempt.checkCancellation();
        return this.adapters.preflight
          ? this.adapters.preflight(preflightInput, context)
          : { status: "succeeded", value: null };
      },
      null,
    );
    if (preflight.status === "failed")
      return attempt.failed(preflight.failureClass);
    const compiled = await attempt.run(
      "compile",
      () => {
        const result = compileRawSpec({
          source,
          engineVersion: ENGINE_VERSION,
        });
        return result.ok
          ? {
              status: "succeeded",
              value: result,
              diagnostics: result.diagnostics,
            }
          : {
              status: "failed",
              failureClass: "validation",
              diagnostics: result.diagnostics,
            };
      },
      null,
    );
    if (compiled.status === "failed")
      return attempt.failed(compiled.failureClass);
    const compiledInput = { ...preflightInput, compiled: compiled.value };
    const semantic = await attempt.run(
      "semantic",
      this.adapters.semantic,
      compiledInput,
    );
    if (semantic.status === "failed")
      return attempt.failed(semantic.failureClass);
    return { ...compiledInput, semantic: semantic.value };
  }

  private async planned<O extends "plan" | "build">(
    attempt: Attempt<O>,
    request: PlanRequest | BuildRequest,
  ): Promise<PlannedInput | EngineFailure<O>> {
    const validated = await this.validated(attempt, request);
    if ("status" in validated) return validated;
    const plan = await attempt.run("plan", this.adapters.plan, validated);
    if (plan.status === "failed") return attempt.failed(plan.failureClass);
    return { ...validated, plan: plan.value };
  }

  private inspection(input: SemanticInput): EngineSnapshot {
    return {
      compiled: input.compiled,
      semantic: input.semantic,
      capabilities: input.capabilities,
    };
  }

  validate(
    request: ValidateRequest,
    control: ExecutionControl = {},
  ): Promise<ValidateResult> {
    return this.execute(
      "validate",
      async (attempt) => {
        const validated = await this.validated(attempt, request);
        return "status" in validated
          ? validated
          : attempt.succeeded(this.inspection(validated));
      },
      "preflight",
      control,
    );
  }

  inspect(
    request: InspectRequest,
    control: ExecutionControl = {},
  ): Promise<InspectResult> {
    return this.execute(
      "inspect",
      async (attempt) => {
        const validated = await this.validated(attempt, request);
        return "status" in validated
          ? validated
          : attempt.succeeded(this.inspection(validated));
      },
      "preflight",
      control,
    );
  }

  plan(
    request: PlanRequest,
    control: ExecutionControl = {},
  ): Promise<PlanResult> {
    return this.execute(
      "plan",
      async (attempt) => {
        const planned = await this.planned(attempt, request);
        return "status" in planned
          ? planned
          : attempt.succeeded({
              ...this.inspection(planned),
              plan: planned.plan,
            });
      },
      "preflight",
      control,
    );
  }

  build(
    request: BuildRequest,
    control: ExecutionControl = {},
  ): Promise<BuildResult> {
    return this.execute(
      "build",
      async (attempt) => {
        const planned = await this.planned(attempt, request);
        if ("status" in planned) return planned;
        const rendered = await attempt.run(
          "render",
          this.adapters.render,
          planned,
        );
        if (rendered.status === "failed")
          return attempt.failed(rendered.failureClass);
        const renderedInput = { ...planned, rendered: rendered.value };
        const packaged = await attempt.run(
          "package",
          this.adapters.package,
          renderedInput,
        );
        if (packaged.status === "failed")
          return attempt.failed(packaged.failureClass);
        const candidateInput: CandidateInput = {
          ...renderedInput,
          candidate: packaged.value,
          acceptancePolicy: P02_ACCEPTANCE_POLICY,
        };
        const verify = await attempt.run(
          "verify",
          this.adapters.verify,
          candidateInput,
        );
        if (verify.status === "failed")
          return attempt.failed(verify.failureClass);
        const verifiedInput = {
          ...candidateInput,
          gates: { verify: verify.value },
        };
        const quality = await attempt.run(
          "quality",
          this.adapters.quality,
          verifiedInput,
        );
        if (quality.status === "failed")
          return attempt.failed(quality.failureClass);
        const qualityCheckedInput = {
          ...candidateInput,
          gates: { ...verifiedInput.gates, quality: quality.value },
        };
        const regression = await attempt.run(
          "regression",
          this.adapters.regression,
          qualityCheckedInput,
        );
        if (regression.status === "failed")
          return attempt.failed(regression.failureClass);
        const regressionCheckedInput = {
          ...candidateInput,
          gates: { ...qualityCheckedInput.gates, regression: regression.value },
        };
        const acceptance = await attempt.run(
          "acceptance",
          this.adapters.acceptance,
          regressionCheckedInput,
        );
        if (acceptance.status === "failed")
          return attempt.failed(acceptance.failureClass);
        const committed = await attempt.run("commit", this.adapters.commit, {
          ...candidateInput,
          gates: {
            verify: verify.value,
            quality: quality.value,
            regression: regression.value,
            acceptance: acceptance.value,
          },
        });
        if (committed.status === "failed")
          return attempt.failed(committed.failureClass);
        return attempt.succeeded({
          ...this.inspection(planned),
          plan: planned.plan,
          finalArtifactPath: committed.value.finalArtifactPath,
        });
      },
      "preflight",
      control,
    );
  }

  explain(
    request: ExplainRequest,
    control: ExecutionControl = {},
  ): Promise<ExplainResult> {
    return this.execute(
      "explain",
      async (attempt) => {
        const result = await attempt.run("explain", this.adapters.explain, {
          plan: request.plan,
        });
        return result.status === "failed"
          ? attempt.failed(result.failureClass)
          : attempt.succeeded(result.value);
      },
      "explain",
      control,
    );
  }

  migrate(
    request: MigrateRequest,
    control: ExecutionControl = {},
  ): Promise<MigrateResult> {
    return this.execute(
      "migrate",
      async (attempt) => {
        const source = sourceSnapshot(request.source);
        const targetVersion = request.targetVersion;
        const result = await attempt.run(
          "migrate",
          () => {
            const migration = migrateRawSpec(source, targetVersion);
            return migration.ok
              ? {
                  status: "succeeded",
                  value: migration,
                  diagnostics: migration.diagnostics,
                }
              : {
                  status: "failed",
                  failureClass: "validation",
                  diagnostics: migration.diagnostics,
                };
          },
          null,
        );
        return result.status === "failed"
          ? attempt.failed(result.failureClass)
          : attempt.succeeded(result.value);
      },
      "migrate",
      control,
    );
  }

  capabilities(
    _request: CapabilitiesRequest,
    control: ExecutionControl = {},
  ): Promise<CapabilitiesResult> {
    return this.execute(
      "capabilities",
      async (attempt) => {
        const result = await attempt.run(
          "capabilities",
          (_input, context) =>
            this.adapters.capabilities?.(context) ?? {
              status: "succeeded",
              value: EMPTY_CAPABILITIES,
            },
          null,
        );
        return result.status === "failed"
          ? attempt.failed(result.failureClass)
          : attempt.succeeded(result.value);
      },
      "capabilities",
      control,
    );
  }
}
