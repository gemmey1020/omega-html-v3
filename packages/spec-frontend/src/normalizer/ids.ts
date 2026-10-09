import type {
  CanonicalContract,
  CanonicalId,
  CanonicalSection,
  Diagnostic,
  DraftCanonicalContract,
  DraftCanonicalSection,
  IdOrigin,
} from "@omega/contracts";

export type IdAssignmentResult =
  | {
      readonly ok: true;
      readonly value: CanonicalContract;
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/** Full-token ASCII grammar. Display titles are not identity authority. */
export function isCanonicalId(value: unknown): value is CanonicalId {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !/[^A-Za-z0-9._-]/u.test(value)
  );
}

function slug(title: string | null, fallback: string): string {
  return (
    (title ?? "")
      .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

/**
 * Consumes T4's successful before-ID draft. Scopes are typed siblings, not
 * global strings or host/module paths. See ADR-0002 for authority/addressing.
 * Accumulates ID failures; never exposes an invalid partial canonical value.
 */
export function assignCanonicalIds(
  draft: DraftCanonicalContract,
): IdAssignmentResult {
  const diagnostics: Diagnostic[] = [];
  type Candidate = {
    readonly id?: CanonicalId;
    readonly idOrigin?: never;
  };
  type Assigned = { readonly id: CanonicalId; readonly idOrigin: IdOrigin };

  function error(code: string, path: string, message: string) {
    diagnostics.push({ code, severity: "ERROR", stage: "ids", path, message });
  }

  function allocate<T extends Candidate>(
    values: readonly T[],
    pathFor: (index: number) => string,
    slugFor: (value: T) => string,
  ): readonly Assigned[] {
    const reserved = new Map<string, string>();
    // Reserve authored IDs even when they appear after an omitted sibling ID.
    for (const [index, value] of values.entries()) {
      const path = pathFor(index);
      if (Object.hasOwn(value, "idOrigin"))
        error(
          "OMEGA-ID-ALREADY-ASSIGNED",
          `${path}/idOrigin`,
          "The ID pass accepts only before-ID drafts, not identified values.",
        );
      if (value.id === undefined) continue;
      if (!isCanonicalId(value.id)) {
        error(
          "OMEGA-ID-INVALID",
          `${path}/id`,
          "IDs must be nonempty and contain only ASCII A-Z a-z 0-9 . _ -.",
        );
        continue;
      }
      const firstPath = reserved.get(value.id);
      if (firstPath !== undefined) {
        diagnostics.push({
          code: "OMEGA-ID-DUPLICATE",
          severity: "ERROR",
          stage: "ids",
          path: `${path}/id`,
          message: "Duplicate explicit ID in the same typed sibling scope.",
          related: [
            { path: firstPath, message: "First explicit ID in this scope." },
          ],
        });
      } else reserved.set(value.id, `${path}/id`);
    }
    const ordinals = new Map<string, number>();
    return values.map((value) => {
      if (value.id !== undefined) return { id: value.id, idOrigin: "explicit" };
      const base = slugFor(value);
      let ordinal = ordinals.get(base) ?? 0;
      let id: string;
      do {
        ordinal += 1;
        id = `${base}-${ordinal}`;
      } while (reserved.has(id));
      ordinals.set(base, ordinal);
      reserved.set(id, "generated");
      return { id, idOrigin: "generated" };
    });
  }

  function sections(
    values: readonly DraftCanonicalSection[],
    parentPath: string,
  ): readonly CanonicalSection[] {
    const assigned = allocate(
      values,
      (index) => `${parentPath}/${index}`,
      (value) => slug(value.title, "section"),
    );
    return values.map((value, index) => {
      const path = `${parentPath}/${index}`;
      const identity = assigned[index];
      if (!identity) throw new Error("Missing ID allocation for section.");
      const blockIds = allocate(
        value.content,
        (blockIndex) => `${path}/content/${blockIndex}`,
        (block) => block.kind,
      );
      return {
        ...value,
        ...identity,
        content: value.content.map((block, blockIndex) => {
          const blockId = blockIds[blockIndex];
          if (!blockId) throw new Error("Missing ID allocation for prose.");
          return { ...block, ...blockId };
        }),
        sections: sections(value.sections, `${path}/sections`),
      };
    });
  }

  const metadata = allocate(
    [draft.metadata],
    () => "/metadata",
    () => slug(draft.spec.document.title, "artifact"),
  )[0];
  if (!metadata) throw new Error("Missing ID allocation for artifact.");
  const value: CanonicalContract = {
    ...draft,
    metadata,
    spec: {
      ...draft.spec,
      sections: sections(draft.spec.sections, "/spec/sections"),
    },
  };
  return diagnostics.length
    ? { ok: false, diagnostics }
    : { ok: true, value, diagnostics };
}
