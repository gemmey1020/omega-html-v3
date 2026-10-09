import type { GateEvidence } from "../src/api/types.js";
/** Complete shell-only evidence; never generated Artifact QA. */
export function gateFixture(stage: GateEvidence["stage"]): GateEvidence {
  return {
    stage,
    artifactHash: "test-only-hash",
    policy: "qa.phase.p02.walking-skeleton.v1",
    checks: [{ rule: "test-only", outcome: "PASS" }],
  };
}
