import {
  CANONICAL_CONTRACT_VERSION,
  type CompilerSource,
  RAW_SCHEMA_VERSION,
} from "@omega/contracts";
import { compileRawSpec, migrateRawSpec } from "@omega/spec-frontend";
import type {
  EngineAdapters,
  StageAdapter,
  StageResult,
} from "../lifecycle/stages.js";
import {
  type BuildRequest,
  type BuildResult,
  type CandidateInput,
  type CapabilitiesRequest,
  type CapabilitiesResult,
  type CapabilitySnapshot,
  ENGINE_VERSION,
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

/** One attempt owns its state. No failed attempt can expose partial output. */
class Attempt<O extends EngineOperation> {
  stage: EngineStage;
  readonly stages: StageOutcome[] = [];
  readonly diagnostics: EngineDiagnostic[] = [];

  constructor(
    readonly operation: O,
    stage: EngineStage = "preflight",
  ) {
    this.stage = stage;
  }

  async run<I, V>(
    stage: EngineStage,
    adapter: StageAdapter<I, V> | undefined,
    input: I,
  ): Promise<StageResult<V>> {
    this.stage = stage;
    const result: StageResult<V> = adapter
      ? snapshot(await adapter(snapshot(input)))
      : {
          status: "failed",
          failureClass: "unavailable",
          diagnostics: [
            {
              code: "OMEGA-ENGINE-STAGE-UNAVAILABLE",
              severity: "ERROR",
              stage,
              message: "No implementation is installed for this Engine stage.",
            },
          ],
        };
    this.diagnostics.push(...(result.diagnostics ?? []));
    this.stages.push({ stage, status: result.status });
    return result;
  }

  failed(failureClass: EngineFailure["failureClass"]): EngineFailure<O> {
    return snapshot({
      operation: this.operation,
      status: "failed",
      failureClass,
      stage: this.stage,
      diagnostics: this.diagnostics,
      stages: this.stages,
    });
  }

  succeeded<V>(value: V): EngineSuccess<O, V> {
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
  ): Promise<EngineSuccess<O, V> | EngineFailure<O>> {
    const attempt = new Attempt(operation, stage);
    try {
      return await action(attempt);
    } catch {
      // Unexpected exceptions are bugs, even if they resemble domain results.
      // Exception text/stacks can contain sensitive host paths and are not public.
      attempt.diagnostics.push({
        code: "OMEGA-ENGINE-INTERNAL",
        severity: "ERROR",
        stage: attempt.stage,
        message: "An unexpected Engine error occurred.",
      });
      if (attempt.stages.at(-1)?.stage !== attempt.stage)
        attempt.stages.push({ stage: attempt.stage, status: "failed" });
      else
        attempt.stages[attempt.stages.length - 1] = {
          stage: attempt.stage,
          status: "failed",
        };
      return attempt.failed("internal");
    }
  }

  private async validated<O extends "validate" | "inspect" | "plan" | "build">(
    attempt: Attempt<O>,
    request: ValidateRequest | InspectRequest | PlanRequest | BuildRequest,
  ): Promise<SemanticInput | EngineFailure<O>> {
    // Copy raw bytes and settings synchronously, before any adapter can await.
    const source = sourceSnapshot(request.source);
    const settings = snapshot(request.settings ?? {});
    const registry = this.adapters.capabilities
      ? snapshot(await this.adapters.capabilities())
      : { status: "succeeded" as const, value: EMPTY_CAPABILITIES };
    attempt.diagnostics.push(...(registry.diagnostics ?? []));
    if (registry.status === "failed") {
      attempt.stages.push({ stage: "preflight", status: "failed" });
      return attempt.failed(registry.failureClass);
    }
    const preflightInput: PreflightInput = {
      versions: {
        rawSchemaVersion: RAW_SCHEMA_VERSION,
        canonicalContractVersion: CANONICAL_CONTRACT_VERSION,
        engineVersion: ENGINE_VERSION,
      },
      settings,
      capabilities: registry.value,
    };
    // Built-in preflight owns source/settings/registry snapshots; an installed
    // adapter may add actual execution/capability checks before compilation.
    const preflight = await attempt.run(
      "preflight",
      this.adapters.preflight ?? (() => ({ status: "succeeded", value: null })),
      preflightInput,
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

  validate(request: ValidateRequest): Promise<ValidateResult> {
    return this.execute("validate", async (attempt) => {
      const validated = await this.validated(attempt, request);
      return "status" in validated
        ? validated
        : attempt.succeeded(this.inspection(validated));
    });
  }

  inspect(request: InspectRequest): Promise<InspectResult> {
    return this.execute("inspect", async (attempt) => {
      const validated = await this.validated(attempt, request);
      return "status" in validated
        ? validated
        : attempt.succeeded(this.inspection(validated));
    });
  }

  plan(request: PlanRequest): Promise<PlanResult> {
    return this.execute("plan", async (attempt) => {
      const planned = await this.planned(attempt, request);
      return "status" in planned
        ? planned
        : attempt.succeeded({
            ...this.inspection(planned),
            plan: planned.plan,
          });
    });
  }

  build(request: BuildRequest): Promise<BuildResult> {
    return this.execute("build", async (attempt) => {
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
    });
  }

  explain(request: ExplainRequest): Promise<ExplainResult> {
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
    );
  }

  migrate(request: MigrateRequest): Promise<MigrateResult> {
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
    );
  }

  capabilities(_request: CapabilitiesRequest): Promise<CapabilitiesResult> {
    return this.execute(
      "capabilities",
      async (attempt) => {
        const result = await attempt.run(
          "capabilities",
          this.adapters.capabilities ??
            (() => ({ status: "succeeded", value: EMPTY_CAPABILITIES })),
          null,
        );
        return result.status === "failed"
          ? attempt.failed(result.failureClass)
          : attempt.succeeded(result.value);
      },
      "capabilities",
    );
  }
}
