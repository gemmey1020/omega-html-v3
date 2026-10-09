import {
  createMinimalCapabilityRegistry,
  snapshotCapabilities,
} from "@omega/capability-registry";
import { expect, test } from "vitest";
import { OmegaEngine } from "../src/api/engine.js";
import type { CapabilitySnapshot, EngineFailure } from "../src/api/types.js";
import type { EngineAdapters, StageResult } from "../src/lifecycle/stages.js";
import { planFixture } from "./plan-fixture.js";
import { renderFixture } from "./render-fixture.js";

const source = {
  module: "fixture.omega.yaml",
  text: "omega: {schema: '3.0'}\nkind: artifact\nspec:\n  document: {title: Review}\n  sections: [{body: Running.}]\n",
};

test("engine_build_result_never_uses_exceptions_for_domain_failure", async () => {
  const invalid = await new OmegaEngine().build({
    operation: "build",
    source: { ...source, text: "omega: [broken" },
  });
  expect(invalid).toMatchObject({
    operation: "build",
    status: "failed",
    stage: "compile",
    failureClass: "validation",
  });
  expect(invalid).not.toHaveProperty("finalArtifactPath");
  expect(invalid.diagnostics[0]?.code).toBe("OMEGA-PARSE-SYNTAX");

  const internal = await new OmegaEngine({
    preflight: () => {
      throw new Error("unexpected bug /private/host/path");
    },
  }).build({ operation: "build", source });
  expect(internal).toMatchObject({
    status: "failed",
    stage: "preflight",
    failureClass: "internal",
  });
  expect(internal).not.toHaveProperty("finalArtifactPath");
  expect(JSON.stringify(internal)).not.toContain("/private/host/path");
});

function succeeded<T>(value: T): StageResult<T> {
  return { status: "succeeded", value };
}

const capabilities: CapabilitySnapshot = structuredClone(
  snapshotCapabilities({
    ...createMinimalCapabilityRegistry(),
    renderers: ["test-only-static"],
    qaRules: ["test-only-gate"],
  }),
);

/** Explicit shell doubles, never production renderer/QA implementations. */
function shellAdapters(calls: string[] = []): EngineAdapters {
  return {
    capabilities: () => succeeded(capabilities),
    preflight: () => {
      calls.push("preflight");
      return succeeded(null);
    },
    semantic: (input) => {
      calls.push("semantic");
      expect(input.compiled.canonical.spec.document.title).toBe("Review");
      return succeeded({ eligible: true });
    },
    plan: (input) => {
      calls.push("plan");
      expect(input.semantic.eligible).toBe(true);
      return succeeded(planFixture(input.compiled.canonical));
    },
    render: (input) => {
      calls.push("render");
      expect(input.plan.representation).toBe(
        "omega.core.editorial.prose-flow@1",
      );
      return succeeded(renderFixture("<article>Test only</article>"));
    },
    package: (input) => {
      calls.push("package");
      expect(input.rendered.html).toBe("<article>Test only</article>");
      return succeeded({ workspacePath: "test-workspace/candidate.html" });
    },
    verify: (input) => {
      calls.push("verify");
      expect(input.candidate.workspacePath).toBe(
        "test-workspace/candidate.html",
      );
      return succeeded({ checked: "verify" });
    },
    quality: (input) => {
      calls.push("quality");
      expect(input).toHaveProperty("gates.verify", { checked: "verify" });
      return succeeded({ checked: "quality" });
    },
    regression: (input) => {
      calls.push("regression");
      expect(input).toHaveProperty("gates.quality", { checked: "quality" });
      return succeeded({ checked: "regression" });
    },
    acceptance: (input) => {
      calls.push("acceptance");
      expect(input.acceptancePolicy).toBe("qa.phase.p02.walking-skeleton.v1");
      expect(input).toHaveProperty("gates", {
        verify: { checked: "verify" },
        quality: { checked: "quality" },
        regression: { checked: "regression" },
      });
      return succeeded({ checked: "acceptance" });
    },
    commit: (input) => {
      calls.push("commit");
      expect(input.gates).toEqual({
        verify: { checked: "verify" },
        quality: { checked: "quality" },
        regression: { checked: "regression" },
        acceptance: { checked: "acceptance" },
      });
      return succeeded({ finalArtifactPath: "test-output/artifact.html" });
    },
    explain: ({ plan }) =>
      succeeded({ representation: plan.representation ?? null }),
  };
}

test("build_runs_complete_order_and_exposes_final_path_only_after_all_gates", async () => {
  const calls: string[] = [];
  const result = await new OmegaEngine(shellAdapters(calls)).build({
    operation: "build",
    source,
    settings: { outputDirectory: "test-output", diagnostics: "full" },
  });
  expect(result.status).toBe("succeeded");
  expect(calls).toEqual([
    "preflight",
    "semantic",
    "plan",
    "render",
    "package",
    "verify",
    "quality",
    "regression",
    "acceptance",
    "commit",
  ]);
  expect(result.stages).toEqual(
    [
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
    ].map((stage) => ({ stage, status: "succeeded" })),
  );
  if (result.status !== "succeeded") throw new Error("Expected shell success");
  expect(result.value.finalArtifactPath).toBe("test-output/artifact.html");
  expect(result.value.compiled.versions).toEqual({
    rawSchemaVersion: "3.0",
    canonicalContractVersion: "1.0",
    engineVersion: "0.0.0",
  });
});

test.each([
  "preflight",
  "semantic",
  "plan",
  "render",
  "package",
  "verify",
  "quality",
  "regression",
  "acceptance",
  "commit",
] as const)(
  "domain_failure_at_%s_stops_dependent_stages_and_has_no_final_path",
  async (stage) => {
    const calls: string[] = [];
    const adapters = shellAdapters(calls);
    const engine = new OmegaEngine({
      ...adapters,
      [stage]: () => ({
        status: "failed",
        failureClass: "execution",
        diagnostics: [
          {
            code: "TEST-GATE-REJECTED",
            severity: "ERROR",
            stage,
            message: "Fixture rejection.",
          },
        ],
      }),
    });
    const result = await engine.build({ operation: "build", source });
    expect(result).toMatchObject({
      status: "failed",
      failureClass: "execution",
      stage,
    });
    expect(result.stages.at(-1)).toEqual({ stage, status: "failed" });
    expect(result.diagnostics.at(-1)?.code).toBe("TEST-GATE-REJECTED");
    const fullOrder = [
      "preflight",
      "semantic",
      "plan",
      "render",
      "package",
      "verify",
      "quality",
      "regression",
      "acceptance",
      "commit",
    ];
    expect(calls).toEqual(fullOrder.slice(0, fullOrder.indexOf(stage)));
    expect(JSON.stringify(result)).not.toContain("finalArtifactPath");
  },
);

test("invalid_compile_never_schedules_semantic_or_later_adapters", async () => {
  const calls: string[] = [];
  const result = await new OmegaEngine(shellAdapters(calls)).build({
    operation: "build",
    source: { ...source, text: "omega: {schema: '9.9'}" },
  });
  expect(result).toMatchObject({
    status: "failed",
    failureClass: "validation",
    stage: "compile",
  });
  expect(calls).toEqual(["preflight"]);
  expect(result.stages).toEqual([
    { stage: "preflight", status: "succeeded" },
    { stage: "compile", status: "failed" },
  ]);
});

test.each([
  "semantic",
  "plan",
  "render",
  "package",
  "verify",
  "quality",
  "regression",
  "acceptance",
  "commit",
] as const)(
  "missing_%s_adapter_fails_explicitly_instead_of_claiming_success",
  async (stage) => {
    const adapters = { ...shellAdapters() };
    delete adapters[stage];
    const result = await new OmegaEngine(adapters).build({
      operation: "build",
      source,
    });
    expect(result).toMatchObject({
      status: "failed",
      failureClass: "unavailable",
      stage,
    });
    expect(result.diagnostics.at(-1)?.code).toBe(
      "OMEGA-ENGINE-STAGE-UNAVAILABLE",
    );
    expect(JSON.stringify(result)).not.toContain("finalArtifactPath");
  },
);

test.each(["validate", "inspect", "plan"] as const)(
  "%s_returns_real_compiler_snapshot_without_render_or_promotion",
  async (operation) => {
    const calls: string[] = [];
    const engine = new OmegaEngine(shellAdapters(calls));
    const result =
      operation === "validate"
        ? await engine.validate({ operation, source })
        : operation === "inspect"
          ? await engine.inspect({ operation, source })
          : await engine.plan({ operation, source });
    expect(result.status).toBe("succeeded");
    expect(calls).toEqual(
      operation === "plan"
        ? ["preflight", "semantic", "plan"]
        : ["preflight", "semantic"],
    );
    if (result.status !== "succeeded")
      throw new Error("Expected validation/plan success");
    expect(result.value.compiled.canonical.spec.sections[0]?.intent).toBe(
      "narrative",
    );
    expect(result.value.compiled.resolutionManifest.entries).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("finalArtifactPath");
  },
);

test("capabilities_reports_empty_registry_truthfully_and_snapshots_installed_registry", async () => {
  const empty = await new OmegaEngine().capabilities({
    operation: "capabilities",
  });
  expect(empty).toMatchObject({
    status: "succeeded",
    value: { representations: [], renderers: [], qaRules: [] },
  });
  const snapshot = await new OmegaEngine(shellAdapters()).capabilities({
    operation: "capabilities",
  });
  expect(snapshot.status).toBe("succeeded");
  if (snapshot.status !== "succeeded")
    throw new Error("Expected capabilities success");
  expect(snapshot.value).toEqual(capabilities);
  expect(snapshot.value).not.toBe(capabilities);
  expect(Object.isFrozen(snapshot.value.representations)).toBe(true);
  expect(Object.isFrozen(capabilities)).toBe(false);
});

test("explain_uses_structured_plan_receipts_and_fails_when_provider_is_missing", async () => {
  const request = {
    operation: "explain" as const,
    plan: planFixture(),
  };
  const result = await new OmegaEngine(shellAdapters()).explain(request);
  expect(result).toMatchObject({
    status: "succeeded",
    value: { representation: "omega.core.editorial.prose-flow@1" },
  });
  expect(Object.isFrozen(request.plan)).toBe(false);
  expect(await new OmegaEngine().explain(request)).toMatchObject({
    status: "failed",
    failureClass: "unavailable",
    stage: "explain",
  });
});

test("migrate_preserves_P01_empty_registry_and_never_rewrites_source", async () => {
  const historical = { ...source, text: source.text.replace("3.0", "2.0") };
  const before = { ...historical };
  const result = await new OmegaEngine().migrate({
    operation: "migrate",
    source: historical,
    targetVersion: "3.0",
  });
  expect(result).toMatchObject({
    status: "failed",
    failureClass: "validation",
    stage: "migrate",
  });
  expect(result.diagnostics[0]?.code).toBe("OMEGA-MIGRATION-UNSUPPORTED-ROUTE");
  expect(historical).toEqual(before);
  expect(Object.isFrozen(historical)).toBe(false);
});

test("byte_input_and_execution_settings_are_snapshotted_before_await_and_never_frozen", async () => {
  const text = new TextEncoder().encode(source.text);
  const settings = { outputDirectory: "original-output" };
  let release: (() => void) | undefined;
  const pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  const engine = new OmegaEngine({
    ...shellAdapters(),
    preflight: async (input) => {
      await pause;
      expect(input.settings.outputDirectory).toBe("original-output");
      return succeeded(null);
    },
  });
  const pending = engine.plan({
    operation: "plan",
    source: { ...source, text },
    settings,
  });
  text.fill(0);
  settings.outputDirectory = "mutated-output";
  release?.();
  const result = await pending;
  expect(result.status).toBe("succeeded");
  if (result.status !== "succeeded")
    throw new Error("Expected owned input snapshot");
  expect(result.value.compiled.canonical.spec.document.title).toBe("Review");
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.value.compiled.canonical.spec.sections)).toBe(
    true,
  );
  expect(Object.isFrozen(settings)).toBe(false);
});

test("capability_and_stage_outputs_are_owned_immutable_snapshots_across_async_stages", async () => {
  const registry = { ...capabilities, profiles: ["prime"] };
  const plan = { ...planFixture() };
  const engine = new OmegaEngine({
    ...shellAdapters(),
    capabilities: () => succeeded(registry),
    semantic: (input) => {
      registry.profiles.push("cyan");
      expect(input.capabilities.profiles).toEqual(["prime"]);
      expect(Object.isFrozen(input.compiled.canonical.spec.document)).toBe(
        true,
      );
      return succeeded({ eligible: true });
    },
    plan: () => succeeded(plan),
  });
  const result = await engine.plan({ operation: "plan", source });
  plan.document = { ...plan.document, title: "changed" };
  expect(result.status).toBe("succeeded");
  if (result.status !== "succeeded") throw new Error("Expected plan success");
  expect(result.value.plan.document.title).toBe("Fixture");
  expect(result.value.capabilities.profiles).toEqual(["prime"]);
  expect(Object.isFrozen(plan)).toBe(false);
  expect(Object.isFrozen(registry.profiles)).toBe(false);
});

test("thrown_domain_lookalike_and_rejected_async_adapter_are_internal_bugs", async () => {
  for (const rejection of [
    new Error("bug"),
    { status: "failed", failureClass: "validation" },
  ]) {
    const result = await new OmegaEngine({
      ...shellAdapters(),
      render: async () => {
        throw rejection;
      },
    }).build({ operation: "build", source });
    expect(result).toMatchObject({
      status: "failed",
      failureClass: "internal",
      stage: "render",
    });
    expect(result.diagnostics.at(-1)?.code).toBe("OMEGA-ENGINE-INTERNAL");
    expect((result as EngineFailure).stages.at(-1)).toEqual({
      stage: "render",
      status: "failed",
    });
  }
});
