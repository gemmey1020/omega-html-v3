import { canonicalizeJson, sha256 } from "@omega/spec-frontend";
import type { AcceptedInput } from "../api/types.js";
import { P02_ACCEPTANCE_POLICY } from "../api/types.js";
export interface BuildReceipt {
  readonly version: "omega-build-receipt/1";
  readonly receiptId: string;
  readonly engineVersion: string;
  readonly rawSchemaVersion: string;
  readonly canonicalContractVersion: string;
  readonly rawSourceHash: string;
  readonly normalizedHash: string;
  readonly planHash: string;
  readonly capabilitySnapshotHash: string;
  readonly buildFingerprint: string;
  readonly artifactHash: string;
  readonly byteLength: number;
  readonly acceptancePolicy: typeof P02_ACCEPTANCE_POLICY;
  readonly acceptanceScope: "P02 minimal Prime prose walking skeleton";
  readonly gates: AcceptedInput["gates"];
  readonly renderer: string;
  readonly rendererVersion: string;
  readonly tokenVersion: string;
  readonly runtimeDependencies: readonly [];
  readonly resourceDependencies: readonly [];
}
export interface CommittedArtifact {
  readonly finalArtifactPath: string;
  readonly finalReceiptPath: string;
  readonly receipt: BuildReceipt;
}
export function createBuildReceipt(input: AcceptedInput): BuildReceipt {
  const data = {
    version: "omega-build-receipt/1" as const,
    ...input.versions,
    rawSourceHash: input.compiled.rawSourceHash,
    normalizedHash: input.compiled.normalizedHash,
    planHash: input.plan.planHash,
    capabilitySnapshotHash: input.capabilities.snapshotHash,
    buildFingerprint: sha256(
      canonicalizeJson({
        planHash: input.plan.planHash,
        rendererVersion: input.candidate.rendererVersion,
        tokenVersion: input.candidate.tokenVersion,
        policy: P02_ACCEPTANCE_POLICY,
      }),
    ),
    artifactHash: input.candidate.artifactHash,
    byteLength: input.candidate.byteLength,
    acceptancePolicy: P02_ACCEPTANCE_POLICY as typeof P02_ACCEPTANCE_POLICY,
    acceptanceScope: "P02 minimal Prime prose walking skeleton" as const,
    gates: input.gates,
    renderer: input.candidate.renderer,
    rendererVersion: input.candidate.rendererVersion,
    tokenVersion: input.candidate.tokenVersion,
    runtimeDependencies: [] as const,
    resourceDependencies: [] as const,
  };
  return Object.freeze({ ...data, receiptId: sha256(canonicalizeJson(data)) });
}

/** Check phase receipt identity and artifact-bound gates before admitting a pointer target. */
export function isMatchingBuildReceipt(
  value: unknown,
  bytes: Uint8Array,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    record.version !== "omega-build-receipt/1" ||
    record.acceptancePolicy !== P02_ACCEPTANCE_POLICY ||
    record.acceptanceScope !== "P02 minimal Prime prose walking skeleton" ||
    record.artifactHash !== sha256(bytes) ||
    record.byteLength !== bytes.length
  )
    return false;
  for (const key of [
    "receiptId",
    "rawSourceHash",
    "normalizedHash",
    "planHash",
    "capabilitySnapshotHash",
    "buildFingerprint",
    "artifactHash",
  ])
    if (typeof record[key] !== "string" || !/^[a-f0-9]{64}$/.test(record[key]))
      return false;
  if (
    !record.gates ||
    typeof record.gates !== "object" ||
    Array.isArray(record.gates)
  )
    return false;
  for (const stage of ["verify", "quality", "regression", "acceptance"]) {
    const gate = (record.gates as Record<string, unknown>)[stage];
    if (!gate || typeof gate !== "object" || Array.isArray(gate)) return false;
    const data = gate as Record<string, unknown>;
    if (
      data.stage !== stage ||
      data.artifactHash !== record.artifactHash ||
      data.policy !== P02_ACCEPTANCE_POLICY ||
      !Array.isArray(data.checks) ||
      data.checks.length === 0
    )
      return false;
    if (
      !data.checks.every(
        (check: unknown) =>
          check &&
          typeof check === "object" &&
          typeof (check as Record<string, unknown>).rule === "string" &&
          ["PASS", "NOT_APPLICABLE"].includes(
            String((check as Record<string, unknown>).outcome),
          ),
      )
    )
      return false;
    if (stage === "acceptance" && data.acceptance !== "ACCEPTED") return false;
  }
  const { receiptId, ...body } = record;
  return receiptId === sha256(canonicalizeJson(body));
}
