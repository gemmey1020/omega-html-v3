import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { createMinimalCapabilityRegistry } from "@omega/capability-registry";
import {
  cleanupArtifactCandidate,
  packageStandaloneHtml,
  renderPrimeProse,
} from "@omega/composer";
import { createMinimalPlan } from "@omega/presentation-engine";
import type { ExecutionControl } from "../events/events.js";
import type { PreparedPublication } from "../lifecycle/atomic-commit.js";
import {
  admitOutput,
  OutputAdmissionError,
  preparePublication,
} from "../lifecycle/atomic-commit.js";
import { throwIfCancellationRequested } from "../lifecycle/cancellation.js";
import type { EngineAdapters, StageResult } from "../lifecycle/stages.js";
import { evidence, verifyArtifact } from "../qa/artifact-gates.js";
import type { GateEvidence } from "../qa/types.js";
import { createBuildReceipt } from "../receipts/build-receipt.js";
import { OmegaEngine } from "./engine.js";
import type {
  ArtifactCandidate,
  BuildRequest,
  BuildResult,
  EngineStage,
} from "./types.js";

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
    let workspace: string | undefined;
    let candidate: ArtifactCandidate | undefined;
    let publication: PreparedPublication | undefined;
    const clean = async () => {
      if (candidate) {
        await cleanupArtifactCandidate(candidate);
        candidate = undefined;
      }
      if (workspace) {
        await rm(workspace, { recursive: true, force: true });
        workspace = undefined;
      }
    };
    const adapters: EngineAdapters = {
      ...realAdapters(),
      ...this.options.stages,
      disposeUncommitted: async () => {
        await clean();
        await publication?.discard();
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
          workspace = await mkdtemp(join(root, ".omega-workspace-"));
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
        const result = await packageStandaloneHtml(
          { rendered: input.rendered, temporaryRoot: workspace },
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
        const receipt = createBuildReceipt(input);
        publication = await preparePublication(root, input.candidate, receipt);
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
