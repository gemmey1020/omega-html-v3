import { rm } from "node:fs/promises";
import { join } from "node:path";
import { createMinimalCapabilityRegistry } from "@omega/capability-registry";
import {
  cleanupArtifactCandidate,
  packageStandaloneHtml,
  renderPrimeProse,
} from "@omega/composer";
import { createMinimalPlan } from "@omega/presentation-engine";
import { canonicalizeJson } from "@omega/spec-frontend";
import {
  type BuildImplementationIdentity,
  createBuildAction,
  currentImplementationIdentity,
} from "../cache/action.js";
import { StageCacheStore } from "../cache/store.js";
import {
  retainIntermediates,
  writeIntermediates,
} from "../diagnostics/intermediates.js";
import type { ExecutionControl } from "../events/events.js";
import type { PreparedPublication } from "../lifecycle/atomic-commit.js";
import {
  admitDirectory,
  admitOutput,
  OutputAdmissionError,
  preparePublication,
} from "../lifecycle/atomic-commit.js";
import { throwIfCancellationRequested } from "../lifecycle/cancellation.js";
import type {
  EngineAdapters,
  StageContext,
  StageResult,
} from "../lifecycle/stages.js";
import { evidence, verifyArtifact } from "../qa/artifact-gates.js";
import type { GateEvidence } from "../qa/types.js";
import { createBuildReceipt } from "../receipts/build-receipt.js";
import { BuildWorkspace } from "../workspace/build-workspace.js";
import { OmegaEngine } from "./engine.js";
import type {
  ArtifactCandidate,
  BuildRequest,
  BuildResult,
  EngineStage,
  ExecutionSettings,
  RenderOutput,
} from "./types.js";
import { P02_ACCEPTANCE_POLICY } from "./types.js";

function success<T>(value: T): StageResult<T> {
  return { status: "succeeded", value };
}
function failure(
  stage: EngineStage,
  code: string,
  message: string,
): StageResult<never> {
  return {
    status: "failed",
    failureClass: "execution",
    diagnostics: [{ stage, code, message, severity: "ERROR" }],
  };
}
function gateResult(value: GateEvidence): StageResult<GateEvidence> {
  return value.checks.some(
    (check) => check.outcome === "FAIL" || check.outcome === "NEEDS_REVIEW",
  )
    ? failure(
        value.stage,
        "OMEGA-QA-REJECTED",
        "Candidate did not satisfy the scoped P02 policy.",
      )
    : success(value);
}
function isRenderOutput(value: unknown): value is RenderOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join(",") ===
      "assetDependencies,html,implementedFallbacks,renderer,rendererVersion,runtimeDependencies,tokenVersion" &&
    typeof data.html === "string" &&
    data.renderer === "astro-static/1" &&
    data.rendererVersion === "omega-prime-prose/1" &&
    data.tokenVersion === "omega-prime-tokens/1" &&
    Array.isArray(data.runtimeDependencies) &&
    data.runtimeDependencies.length === 0 &&
    Array.isArray(data.assetDependencies) &&
    data.assetDependencies.length === 0 &&
    canonicalizeJson(data.implementedFallbacks) ===
      '["no-js","reflow","print","forced-colors","reduced-motion"]'
  );
}
function realAdapters(): EngineAdapters {
  return {
    capabilities: () => success(createMinimalCapabilityRegistry()),
    semantic: (input) => {
      // Minimal semantic admission consumes Canonical only, including capability preflight.
      const planned = createMinimalPlan({
        canonical: input.compiled.canonical,
        capabilities: input.capabilities,
        engineVersion: input.versions.engineVersion,
      });
      return planned.ok
        ? success({ eligible: true, contentKinds: ["prose"] })
        : {
            status: "failed",
            failureClass: "validation",
            diagnostics: planned.diagnostics,
          };
    },
    plan: (input) => {
      const result = createMinimalPlan({
        canonical: input.compiled.canonical,
        capabilities: input.capabilities,
        engineVersion: input.versions.engineVersion,
      });
      return result.ok
        ? success(result.plan)
        : {
            status: "failed",
            failureClass: "validation",
            diagnostics: result.diagnostics,
          };
    },
    render: async (input, context) => {
      const result = await renderPrimeProse(input.plan, {
        signal: context.cancellationToken.signal,
        checkCancellation: () =>
          throwIfCancellationRequested(context.cancellationToken),
      });
      return result.ok
        ? success(result.output)
        : {
            status: "failed",
            failureClass: "execution",
            diagnostics: result.diagnostics,
          };
    },
    verify: async (input, context) =>
      gateResult(await verifyArtifact(input, context)),
    quality: (input) =>
      gateResult(
        evidence("quality", input.candidate.artifactHash, [
          {
            rule: "candidate-specific-static-fallbacks",
            outcome: input.gates.verify.checks.every(
              (check) => check.outcome === "PASS",
            )
              ? "PASS"
              : "FAIL",
          },
        ]),
      ),
    regression: (input) =>
      success(
        evidence("regression", input.candidate.artifactHash, [
          {
            rule: "historical-artifact-baseline-not-declared",
            outcome: "NOT_APPLICABLE",
          },
        ]),
      ),
    acceptance: (input) => {
      const gates = [
        input.gates.verify,
        input.gates.quality,
        input.gates.regression,
      ];
      const accepted = gates.every(
        (gate) =>
          gate.artifactHash === input.candidate.artifactHash &&
          gate.policy === input.acceptancePolicy &&
          gate.checks.length > 0 &&
          gate.checks.every(
            (check) =>
              check.outcome === "PASS" || check.outcome === "NOT_APPLICABLE",
          ),
      );
      return gateResult(
        evidence(
          "acceptance",
          input.candidate.artifactHash,
          [
            {
              rule: "immutable-evidence-and-phase-policy",
              outcome: accepted ? "PASS" : "FAIL",
            },
          ],
          accepted ? "ACCEPTED" : "REJECTED",
        ),
      );
    },
    explain: ({ plan }) =>
      success({
        planHash: plan.planHash,
        representation: plan.representation,
        reason:
          "The registered Prime narrative/prose capability matches the minimal Canonical document.",
      }),
  };
}
/** Trusted stage injection is for faults/tests only; CLI always uses real defaults. */
export interface ProductionEngineOptions {
  readonly stages?: Partial<
    Pick<EngineAdapters, "verify" | "quality" | "regression" | "acceptance">
  >;
}
class ProductionEngine extends OmegaEngine {
  constructor(private readonly options: ProductionEngineOptions) {
    super(realAdapters());
  }
  override async build(
    request: BuildRequest,
    control: ExecutionControl = {},
  ): Promise<BuildResult> {
    let root: string | undefined;
    let workspace: BuildWorkspace | undefined;
    let cache: StageCacheStore | undefined;
    let identity: BuildImplementationIdentity | undefined;
    let diagnosticRoot: string | undefined;
    let intermediates: string | undefined;
    let retainedDiagnostics: string | undefined;
    let settings: ExecutionSettings = {};
    const defaults = realAdapters();
    const cached = async <T>(
      stage: "plan" | "render",
      inputs: Readonly<Record<string, string>>,
      capabilities: string,
      context: StageContext,
      produce: () => Promise<StageResult<T>> | StageResult<T>,
      validate: (value: unknown) => value is T,
    ): Promise<StageResult<T>> => {
      if (!identity) throw new Error("Implementation identity missing");
      if (settings.cache === "off") return produce();
      if (!cache) throw new Error("Stage cache missing");
      const action = createBuildAction({
        stage,
        inputs,
        implementation: identity.sourceContentHash,
        toolchain: identity.toolchainHash,
        policy: P02_ACCEPTANCE_POLICY,
        capabilities,
        resources: [],
      });
      if (settings.cache !== "refresh") {
        const hit = await cache.read(action, validate);
        if (hit !== undefined) {
          context.emit({ name: "cache.hit", actionKey: action.key });
          return success(hit);
        }
      }
      context.emit({ name: "cache.miss", actionKey: action.key });
      const result = await produce();
      if (result.status === "succeeded")
        await cache.write(action, result.value, validate, () => {
          context.emit({
            name: "stage.progress",
            completed: 1,
            total: 1,
            message: "Cache entry prepared.",
          });
          throwIfCancellationRequested(context.cancellationToken);
        });
      return result;
    };
    let candidate: ArtifactCandidate | undefined;
    let publication: PreparedPublication | undefined;
    const clean = async () => {
      if (candidate) {
        await cleanupArtifactCandidate(candidate);
        candidate = undefined;
      }
      if (workspace) {
        await workspace.cleanup();
        workspace = undefined;
      }
    };
    const adapters: EngineAdapters = {
      ...defaults,
      ...this.options.stages,
      plan: async (input, context) => {
        // Recompute cheap planning admission to validate the complete persisted DTO.
        const current = await defaults.plan?.(input, context);
        if (!current) throw new Error("Plan adapter missing");
        if (current.status === "failed") return current;
        return cached(
          "plan",
          {
            normalizedHash: input.compiled.normalizedHash,
            engineVersion: input.versions.engineVersion,
            canonicalContractVersion: input.versions.canonicalContractVersion,
          },
          input.capabilities.snapshotHash,
          context,
          () => current,
          (value: unknown): value is typeof current.value =>
            canonicalizeJson(value) === canonicalizeJson(current.value),
        );
      },
      render: (input, context) =>
        cached(
          "render",
          { planHash: input.plan.planHash },
          input.capabilities.snapshotHash,
          context,
          async () => {
            const result = await defaults.render?.(input, context);
            if (!result) throw new Error("Render adapter missing");
            return result;
          },
          isRenderOutput,
        ),
      disposeUncommitted: async () => {
        await clean();
        await publication?.discard();
        if (retainedDiagnostics) {
          await rm(retainedDiagnostics, { recursive: true, force: true });
          retainedDiagnostics = undefined;
        }
      },
      preflight: async (input) => {
        if (!input.settings.outputDirectory)
          return failure(
            "preflight",
            "OMEGA-OUTPUT-REQUIRED",
            "A confined output directory is required.",
          );
        try {
          root = await admitOutput(input.settings.outputDirectory);
          settings = input.settings;
          identity = await currentImplementationIdentity();
          if (settings.cache !== "off")
            cache = await StageCacheStore.open(
              settings.cacheDirectory ?? join(root, ".omega-cache"),
            );
          if (settings.diagnostics === "full")
            diagnosticRoot = await admitDirectory(
              join(root, ".omega-diagnostics"),
              true,
            );
          workspace = await BuildWorkspace.create(root);
          return success(null);
        } catch (error) {
          if (error instanceof OutputAdmissionError)
            return failure(
              "preflight",
              "OMEGA-OUTPUT-INVALID",
              "The output directory is not admitted.",
            );
          throw error;
        }
      },
      package: async (input, context) => {
        if (!workspace) throw new Error("Workspace missing");
        if (diagnosticRoot) {
          if (!identity) throw new Error("Implementation identity missing");
          intermediates = await writeIntermediates(
            workspace.directory,
            input,
            identity,
          );
          throwIfCancellationRequested(context.cancellationToken);
        }
        const result = await packageStandaloneHtml(
          { rendered: input.rendered, temporaryRoot: workspace.directory },
          {
            signal: context.cancellationToken.signal,
            checkCancellation: () =>
              throwIfCancellationRequested(context.cancellationToken),
          },
        );
        if (!result.ok)
          return {
            status: "failed",
            failureClass: "execution",
            diagnostics: result.diagnostics,
          };
        candidate = result.candidate;
        return success(candidate);
      },
      commit: async (input, context) => {
        if (!root) throw new Error("Output missing");
        if (!identity) throw new Error("Implementation identity missing");
        const receipt = createBuildReceipt(input, identity);
        publication = await preparePublication(root, input.candidate, receipt);
        if (intermediates && diagnosticRoot)
          retainedDiagnostics = await retainIntermediates(
            intermediates,
            diagnosticRoot,
          );
        await clean();
        // All asynchronous/fallible preparation precedes this final synchronous boundary.
        const prepared = publication;
        const result = success(prepared.artifact);
        context.emit({
          name: "stage.progress",
          completed: 1,
          total: 1,
          message: "Publication prepared.",
        });
        context.publishCommit(() => prepared.publish());
        return result;
      },
    };
    const engine = new OmegaEngine(adapters);
    const result = await engine.build(request, control);
    return result;
  }
}
export function createProductionEngine(
  options: ProductionEngineOptions = {},
): OmegaEngine {
  return new ProductionEngine(options);
}
