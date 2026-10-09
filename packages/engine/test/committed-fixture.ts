import type { CommittedArtifact } from "../src/api/types.js";
import { gateFixture } from "./gate-fixture.js";
/** Explicit complete shell double, not publication or acceptance evidence. */
export function committedFixture(finalArtifactPath: string): CommittedArtifact {
  return {
    finalArtifactPath,
    finalReceiptPath: "test-only-receipt.json",
    receipt: {
      version: "omega-build-receipt/1",
      receiptId: "test-only",
      engineVersion: "0.0.0",
      rawSchemaVersion: "3.0",
      canonicalContractVersion: "3.0",
      rawSourceHash: "test-only",
      normalizedHash: "test-only",
      planHash: "test-only",
      capabilitySnapshotHash: "test-only",
      buildFingerprint: "test-only",
      artifactHash: "test-only",
      byteLength: 0,
      acceptancePolicy: "qa.phase.p02.walking-skeleton.v1",
      acceptanceScope: "P02 minimal Prime prose walking skeleton",
      gates: {
        verify: gateFixture("verify"),
        quality: gateFixture("quality"),
        regression: gateFixture("regression"),
        acceptance: gateFixture("acceptance"),
      },
      renderer: "test-only",
      rendererVersion: "test-only",
      tokenVersion: "test-only",
      runtimeDependencies: [],
      resourceDependencies: [],
    },
  };
}
