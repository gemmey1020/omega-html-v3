import {
  CAPABILITY_SNAPSHOT_VERSION,
  type CapabilitySnapshot,
  NARRATIVE_REPRESENTATION_ID,
  snapshotCapabilities,
} from "@omega/capability-registry";
import type {
  CanonicalContract,
  CanonicalSection,
  Diagnostic,
  DocumentSemantics,
} from "@omega/contracts";
import {
  canonicalizeJson,
  sha256,
  validateCanonicalContract,
} from "@omega/spec-frontend";

export const MINIMAL_PLAN_VERSION = "omega-plan/1.0" as const;
export type PlanDiagnostic = Omit<Diagnostic, "stage"> & {
  readonly stage: Diagnostic["stage"] | "plan";
};

/** Retain P01 structure, IDs, optional intent and already-parsed text verbatim. */
export interface PlannedSection extends Omit<CanonicalSection, "sections"> {
  readonly sections: readonly PlannedSection[];
  /** Empty structural wrappers require no prose representation. */
  readonly representation?: typeof NARRATIVE_REPRESENTATION_ID;
}
export interface MinimalRenderPlanData {
  readonly version: typeof MINIMAL_PLAN_VERSION;
  readonly engineVersion: string;
  readonly canonicalContractVersion: CanonicalContract["contractVersion"];
  readonly normalizedHash: string;
  readonly capabilitySnapshotHash: string;
  readonly profile: "prime";
  readonly profileVersion: "1";
  readonly target: "standalone-html";
  readonly representation: typeof NARRATIVE_REPRESENTATION_ID;
  readonly metadata: CanonicalContract["metadata"];
  readonly document: DocumentSemantics;
  readonly sections: readonly PlannedSection[];
}
export interface MinimalRenderPlan extends MinimalRenderPlanData {
  readonly planHash: string;
}
export interface MinimalPlanRequest {
  readonly canonical: CanonicalContract;
  readonly capabilities: CapabilitySnapshot;
  readonly engineVersion: string;
}
export type MinimalPlanResult =
  | { readonly ok: true; readonly plan: MinimalRenderPlan }
  | { readonly ok: false; readonly diagnostics: readonly PlanDiagnostic[] };

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function diagnostic(
  code: string,
  path: string,
  message: string,
): PlanDiagnostic {
  return { code, path, message, stage: "plan", severity: "ERROR" };
}

/** No source/Markdown parsing, runtime context, environment or renderer binding. */
export function createMinimalPlan(
  request: MinimalPlanRequest,
): MinimalPlanResult {
  const validated = validateCanonicalContract(request.canonical);
  if (!validated.ok)
    return freeze({ ok: false, diagnostics: validated.diagnostics });
  const canonical = validated.value;
  const diagnostics: PlanDiagnostic[] = [];
  if (canonical.spec.presentation.profile !== "prime") {
    diagnostics.push(
      diagnostic(
        "OMEGA-PLAN-PROFILE-UNSUPPORTED",
        "/spec/presentation/profile",
        "P02 planning supports the Prime profile only.",
      ),
    );
  }
  const capabilities = request.capabilities;
  if (capabilities.version !== CAPABILITY_SNAPSHOT_VERSION) {
    diagnostics.push(
      diagnostic(
        "OMEGA-PLAN-SNAPSHOT-VERSION-UNSUPPORTED",
        "/capabilities/version",
        "Capability snapshot contract version is unsupported.",
      ),
    );
  }
  if (
    snapshotCapabilities(capabilities).snapshotHash !==
    capabilities.snapshotHash
  ) {
    diagnostics.push(
      diagnostic(
        "OMEGA-PLAN-SNAPSHOT-STALE",
        "/capabilities/snapshotHash",
        "Capability snapshot identity does not match its declared state.",
      ),
    );
  }
  if (
    !capabilities.intents.includes("narrative") ||
    !capabilities.contentKinds.includes("prose") ||
    !capabilities.profiles.includes("prime") ||
    !capabilities.targets.includes("standalone-html") ||
    !capabilities.representations.includes(NARRATIVE_REPRESENTATION_ID) ||
    !capabilities.representationEntries.some(
      (entry) =>
        entry.id === NARRATIVE_REPRESENTATION_ID && entry.version === "1",
    )
  ) {
    diagnostics.push(
      diagnostic(
        "OMEGA-PLAN-CAPABILITY-UNAVAILABLE",
        "/capabilities",
        "The required Prime narrative/prose capability is unavailable.",
      ),
    );
  }
  function select(
    sections: readonly CanonicalSection[],
    path: string,
  ): readonly PlannedSection[] {
    return sections.map((section, index) => {
      const sectionPath = `${path}/${index}`;
      if (section.intent !== undefined && section.intent !== "narrative") {
        diagnostics.push(
          diagnostic(
            "OMEGA-PLAN-INTENT-UNSUPPORTED",
            `${sectionPath}/intent`,
            "P02 planning supports an explicit narrative intent only.",
          ),
        );
      }
      return {
        ...section,
        sections: select(section.sections, `${sectionPath}/sections`),
        ...(section.content.length > 0
          ? { representation: NARRATIVE_REPRESENTATION_ID }
          : {}),
      };
    });
  }
  const sections = select(canonical.spec.sections, "/spec/sections");
  if (diagnostics.length > 0) return freeze({ ok: false, diagnostics });
  const data: MinimalRenderPlanData = structuredClone({
    version: MINIMAL_PLAN_VERSION,
    engineVersion: request.engineVersion,
    canonicalContractVersion: canonical.contractVersion,
    normalizedHash: sha256(canonicalizeJson(canonical)),
    capabilitySnapshotHash: capabilities.snapshotHash,
    profile: "prime",
    profileVersion: capabilities.profileVersion,
    target: canonical.spec.target,
    representation: NARRATIVE_REPRESENTATION_ID,
    metadata: canonical.metadata,
    document: canonical.spec.document,
    sections,
  });
  return freeze({
    ok: true,
    plan: { ...data, planHash: sha256(canonicalizeJson(data)) },
  });
}
