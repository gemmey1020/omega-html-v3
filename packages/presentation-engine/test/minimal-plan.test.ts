import { createHash } from "node:crypto";
import {
  createMinimalCapabilityRegistry,
  snapshotCapabilities,
} from "@omega/capability-registry";
import type { CanonicalContract } from "@omega/contracts";
import { canonicalizeJson, compileRawSpec } from "@omega/spec-frontend";
import { expect, test } from "vitest";
import { createMinimalPlan } from "../src/plan/minimal-plan.js";

const raw = `omega: {schema: '3.0'}
kind: artifact
metadata: {id: report}
spec:
  document: {title: Review, language: ar}
  sections:
    - id: story
      intent: narrative
      title: Story
      content:
        - id: copy
          kind: prose
          text: 'مرحبا **world** and \`/exact/path\`.'
`;

function compile(text = raw, module = "fixture.omega.yaml") {
  const result = compileRawSpec({
    source: { module, text },
    engineVersion: "0.0.0",
  });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result;
}
function plan(
  canonical: CanonicalContract = compile().canonical,
  capabilities = createMinimalCapabilityRegistry(),
  engineVersion = "0.0.0",
) {
  const result = createMinimalPlan({ canonical, capabilities, engineVersion });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.plan;
}

test("minimal_plan_is_deterministic_and_renderer_agnostic", () => {
  const compiled = compile();
  const first = plan(compiled.canonical);
  const second = plan(compiled.canonical);
  expect(first).toEqual(second);
  expect(first.planHash).toMatch(/^[a-f0-9]{64}$/);
  expect(first.normalizedHash).toBe(compiled.normalizedHash);
  expect(first.representation).toBe("omega.core.editorial.prose-flow@1");
  expect(first.profile).toBe("prime");
  expect(JSON.stringify(first)).not.toMatch(
    /\.astro|component|rendererBinding/,
  );
});

test("plan_hash_verifies_exact_canonical_plan_payload", () => {
  const { planHash, ...payload } = plan();
  expect(planHash).toBe(
    createHash("sha256").update(canonicalizeJson(payload)).digest("hex"),
  );
});

test("canonical_identity_document_rich_text_and_section_order_are_preserved", () => {
  const canonical = compile().canonical;
  const result = plan(canonical);
  expect(result.metadata).toEqual({ id: "report", idOrigin: "explicit" });
  expect(result.document).toEqual(canonical.spec.document);
  expect(result.sections[0]).toEqual({
    ...canonical.spec.sections[0],
    representation: "omega.core.editorial.prose-flow@1",
  });
  expect(result.sections[0]?.content[0]?.text.blocks).toEqual(
    canonical.spec.sections[0]?.content[0]?.text.blocks,
  );
});

test("omitted_intent_and_empty_structural_wrappers_are_not_invented", () => {
  const canonical = compile(
    `omega: {schema: '3.0'}\nkind: artifact\nspec:\n  document: {title: Structure}\n  sections:\n    - id: wrapper\n      title: Group\n      sections:\n        - id: nested\n          body: Hello\n    - id: empty\n`,
  ).canonical;
  const result = plan(canonical);
  expect(result.sections[0]).not.toHaveProperty("intent");
  expect(result.sections[0]).not.toHaveProperty("representation");
  expect(result.sections[0]?.sections[0]?.intent).toBe(
    canonical.spec.sections[0]?.sections[0]?.intent,
  );
  expect(result.sections[0]?.sections[0]?.representation).toBe(
    "omega.core.editorial.prose-flow@1",
  );
  expect(result.sections[1]).not.toHaveProperty("representation");
  expect(result.sections.map((s) => s.id)).toEqual(["wrapper", "empty"]);
});

test.each(["silver", "gold", "cyan"])(
  "unsupported_explicit_profile_%s_fails_without_plan",
  (profile) => {
    const canonical = compile(
      raw.replace(
        "  document:",
        `  presentation: {profile: ${profile}}\n  document:`,
      ),
    ).canonical;
    const result = createMinimalPlan({
      canonical,
      capabilities: createMinimalCapabilityRegistry(),
      engineVersion: "0.0.0",
    });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "OMEGA-PLAN-PROFILE-UNSUPPORTED",
          stage: "plan",
          path: "/spec/presentation/profile",
        },
      ],
    });
    expect(result).not.toHaveProperty("plan");
  },
);

test("unsupported_explicit_nested_intent_fails_with_canonical_path", () => {
  const canonical = compile(
    `omega: {schema: '3.0'}\nkind: artifact\nspec:\n  document: {title: Structure}\n  sections:\n    - sections:\n        - intent: comparison\n          body: Hello\n`,
  ).canonical;
  const result = createMinimalPlan({
    canonical,
    capabilities: createMinimalCapabilityRegistry(),
    engineVersion: "0.0.0",
  });
  expect(result).toMatchObject({
    ok: false,
    diagnostics: [
      {
        code: "OMEGA-PLAN-INTENT-UNSUPPORTED",
        stage: "plan",
        path: "/spec/sections/0/sections/0/intent",
      },
    ],
  });
  expect(result).not.toHaveProperty("plan");
});

test("malformed_canonical_input_is_rejected_by_the_P01_ABI_validator", () => {
  const canonical = {
    ...compile().canonical,
    contractVersion: "99",
  } as unknown as CanonicalContract;
  const result = createMinimalPlan({
    canonical,
    capabilities: createMinimalCapabilityRegistry(),
    engineVersion: "0.0.0",
  });
  expect(result).toMatchObject({
    ok: false,
    diagnostics: [
      expect.objectContaining({
        stage: "canonical-validation",
        path: "/contractVersion",
      }),
    ],
  });
  expect(result).not.toHaveProperty("plan");
});

test("required_capability_absence_is_a_structured_failure", () => {
  const capabilities = snapshotCapabilities({
    ...createMinimalCapabilityRegistry(),
    representations: [],
  });
  const result = createMinimalPlan({
    canonical: compile().canonical,
    capabilities,
    engineVersion: "0.0.0",
  });
  expect(result).toMatchObject({
    ok: false,
    diagnostics: [
      expect.objectContaining({
        code: "OMEGA-PLAN-CAPABILITY-UNAVAILABLE",
        stage: "plan",
      }),
    ],
  });
  expect(result).not.toHaveProperty("plan");
});

test("changed_content_array_order_and_identity_change_plan_hash", () => {
  const original = plan();
  expect(
    plan(compile(raw.replace("world", "reader")).canonical).planHash,
  ).not.toBe(original.planHash);
  expect(
    plan(compile(raw.replace("id: story", "id: different")).canonical).planHash,
  ).not.toBe(original.planHash);
  const first = compile(
    raw.replace(
      "      content:",
      "      sections: [{id: first, body: One}, {id: second, body: Two}]\n      content:",
    ),
  ).canonical;
  const second = compile(
    raw.replace(
      "      content:",
      "      sections: [{id: second, body: Two}, {id: first, body: One}]\n      content:",
    ),
  ).canonical;
  expect(plan(first).planHash).not.toBe(plan(second).planHash);
});

test("source_format_and_provenance_do_not_enter_plan_identity", () => {
  const original = compile();
  const variant = compile(
    `# comment\n${raw.replace("{title: Review, language: ar}", "{language: ar, title: Review}")}`.replaceAll(
      "\n",
      "\r\n",
    ),
    "different.omega.yaml",
  );
  expect(original.rawSourceHash).not.toBe(variant.rawSourceHash);
  expect(plan(original.canonical)).toEqual(plan(variant.canonical));
});

test("ephemeral_control_and_host_paths_are_not_consumed_by_planner", () => {
  const canonical = compile().canonical;
  const first = createMinimalPlan({
    canonical,
    capabilities: createMinimalCapabilityRegistry(),
    engineVersion: "0.0.0",
    buildId: "one",
    time: 1,
    outputDirectory: "/host/one",
  } as Parameters<typeof createMinimalPlan>[0]);
  const second = createMinimalPlan({
    canonical,
    capabilities: createMinimalCapabilityRegistry(),
    engineVersion: "0.0.0",
    buildId: "two",
    time: 2,
    outputDirectory: "/host/two",
  } as Parameters<typeof createMinimalPlan>[0]);
  expect(first).toEqual(second);
  expect(JSON.stringify(first)).not.toMatch(/buildId|outputDirectory|\/host\//);
});

test("engine_and_capability_policy_versions_invalidate_plan_identity", () => {
  const original = plan();
  expect(
    plan(compile().canonical, createMinimalCapabilityRegistry(), "0.0.1")
      .planHash,
  ).not.toBe(original.planHash);
  const changed = snapshotCapabilities({
    ...createMinimalCapabilityRegistry(),
    policyVersions: ["test-policy/2"],
  });
  expect(plan(compile().canonical, changed).planHash).not.toBe(
    original.planHash,
  );
});

test("plan_and_snapshot_are_deeply_owned_without_freezing_callers", () => {
  const canonical = structuredClone(compile().canonical);
  const capabilities = structuredClone(createMinimalCapabilityRegistry());
  const before = structuredClone(canonical);
  const result = plan(canonical, capabilities);
  expect(canonical).toEqual(before);
  expect(Object.isFrozen(canonical)).toBe(false);
  expect(Object.isFrozen(capabilities)).toBe(false);
  expect(result.sections).not.toBe(canonical.spec.sections);
  expect(Object.isFrozen(result.sections[0]?.content[0]?.text.blocks)).toBe(
    true,
  );
  (canonical.spec.sections as unknown[]).length = 0;
  expect(result.sections).toHaveLength(1);
});

test("tampered_snapshot_hash_is_rejected_instead_of_silently_reused", () => {
  const capabilities = {
    ...createMinimalCapabilityRegistry(),
    snapshotHash: "0".repeat(64),
  };
  const result = createMinimalPlan({
    canonical: compile().canonical,
    capabilities,
    engineVersion: "0.0.0",
  });
  expect(result).toMatchObject({
    ok: false,
    diagnostics: [
      expect.objectContaining({ code: "OMEGA-PLAN-SNAPSHOT-STALE" }),
    ],
  });
});

test("admitted_canonical_omitted_prose_intent_is_preserved_without_inference", () => {
  const original = compile().canonical;
  const { intent: _intent, ...section } =
    original.spec.sections[0] ??
    (() => {
      throw new Error("Expected fixture section");
    })();
  const canonical = {
    ...original,
    spec: { ...original.spec, sections: [section] },
  };
  const result = plan(canonical);
  expect(result.sections[0]).not.toHaveProperty("intent");
  expect(result.sections[0]?.representation).toBe(
    "omega.core.editorial.prose-flow@1",
  );
});

test("unknown_snapshot_contract_version_fails_before_selection", () => {
  const capabilities = snapshotCapabilities({
    ...createMinimalCapabilityRegistry(),
    version: "omega-capabilities/99",
  } as unknown as Parameters<typeof snapshotCapabilities>[0]);
  const result = createMinimalPlan({
    canonical: compile().canonical,
    capabilities,
    engineVersion: "0.0.0",
  });
  expect(result).toMatchObject({
    ok: false,
    diagnostics: [
      expect.objectContaining({
        code: "OMEGA-PLAN-SNAPSHOT-VERSION-UNSUPPORTED",
        stage: "plan",
      }),
    ],
  });
  expect(result).not.toHaveProperty("plan");
});
