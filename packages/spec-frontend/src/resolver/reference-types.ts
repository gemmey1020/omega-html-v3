import type { CanonicalId, Diagnostic, IdOrigin } from "@omega/contracts";
import { isCanonicalId } from "../normalizer/ids.js";

export interface CanonicalIdentityPart {
  readonly id: CanonicalId;
  readonly idOrigin: IdOrigin;
}

/** Already known identities, not Raw authoring locators or lookup requests. */
export type CanonicalIdentity =
  | { readonly kind: "artifact"; readonly target: CanonicalIdentityPart }
  | {
      readonly kind: "section" | "content-block";
      readonly artifact: CanonicalIdentityPart;
      /** Section ancestors; for blocks, includes the owning section. */
      readonly sectionPath: readonly CanonicalIdentityPart[];
      readonly target: CanonicalIdentityPart;
    };

interface ReferenceAddress {
  readonly artifactId: CanonicalId;
  readonly sectionPath: readonly CanonicalId[];
  readonly id: CanonicalId;
}

export interface ArtifactRef extends ReferenceAddress {
  readonly kind: "artifact";
  readonly sectionPath: readonly [];
}
export interface SectionRef extends ReferenceAddress {
  readonly kind: "section";
}
export interface ContentBlockRef extends ReferenceAddress {
  readonly kind: "content-block";
}
export type CanonicalReference = ArtifactRef | SectionRef | ContentBlockRef;
export type CanonicalReferenceResult =
  | {
      readonly ok: true;
      readonly value: CanonicalReference;
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/**
 * Pure policy helper against supplied known identities; performs no lookup,
 * imports or Raw resolution. Caller must supply canonical ancestry/provenance.
 */
export function createCanonicalReference(
  identity: CanonicalIdentity,
  usage: "internal" | "external",
): CanonicalReferenceResult {
  const diagnostics: Diagnostic[] = [];
  const parts: readonly CanonicalIdentityPart[] =
    identity.kind === "artifact"
      ? [identity.target]
      : [identity.artifact, ...identity.sectionPath, identity.target];
  for (const [index, part] of parts.entries()) {
    const path = `/reference/identity/${index}`;
    if (!isCanonicalId(part.id))
      diagnostics.push({
        code: "OMEGA-ID-INVALID",
        severity: "ERROR",
        stage: "ids",
        path: `${path}/id`,
        message: "Reference identity must use the canonical ASCII ID grammar.",
      });
    if (part.idOrigin !== "explicit" && part.idOrigin !== "generated")
      diagnostics.push({
        code: "OMEGA-REF-INVALID-ORIGIN",
        severity: "ERROR",
        stage: "ids",
        path: `${path}/idOrigin`,
        message:
          "Reference identity requires a known explicit or generated origin.",
      });
  }
  if (identity.kind === "content-block" && identity.sectionPath.length === 0)
    diagnostics.push({
      code: "OMEGA-REF-INVALID-SCOPE",
      severity: "ERROR",
      stage: "ids",
      path: "/reference/sectionPath",
      message: "A content-block identity requires its owning section.",
    });
  if (
    usage === "external" &&
    parts.some((part) => part.idOrigin === "generated")
  )
    diagnostics.push({
      code: "OMEGA-REF-GENERATED-AUTHORITY",
      severity: "ERROR",
      stage: "ids",
      path: "/reference",
      message:
        "External references require an explicit artifact, all section ancestors, and target ID.",
    });
  if (diagnostics.length) return { ok: false, diagnostics };
  const value: CanonicalReference =
    identity.kind === "artifact"
      ? {
          kind: "artifact",
          artifactId: identity.target.id,
          sectionPath: [],
          id: identity.target.id,
        }
      : {
          kind: identity.kind,
          artifactId: identity.artifact.id,
          sectionPath: identity.sectionPath.map((part) => part.id),
          id: identity.target.id,
        };
  return { ok: true, value, diagnostics };
}
