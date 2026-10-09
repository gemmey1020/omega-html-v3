import { createMinimalCapabilityRegistry } from "@omega/capability-registry";
import type { CanonicalContract } from "@omega/contracts";
import { createMinimalPlan } from "@omega/presentation-engine";
import { compileRawSpec } from "@omega/spec-frontend";

/** Real typed plan fixture; shell renderer/QA doubles remain test-only. */
export function planFixture(canonical?: CanonicalContract) {
  if (!canonical) {
    const compiled = compileRawSpec({
      source: {
        module: "plan-fixture.omega.yaml",
        text: "omega: {schema: '3.0'}\nkind: artifact\nspec:\n  document: {title: Fixture}\n  sections: [{body: Running.}]\n",
      },
      engineVersion: "0.0.0",
    });
    if (!compiled.ok) throw new Error("Expected fixture compilation");
    canonical = compiled.canonical;
  }
  const result = createMinimalPlan({
    canonical,
    capabilities: createMinimalCapabilityRegistry(),
    engineVersion: "0.0.0",
  });
  if (!result.ok) throw new Error("Expected fixture plan");
  return structuredClone(result.plan);
}
