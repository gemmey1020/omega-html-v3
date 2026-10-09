import type {
  CanonicalContract,
  DraftCanonicalContract,
  JsonValue,
} from "@omega/contracts";
import { normalizeRawSpec, validateRawSpec } from "@omega/spec-frontend";
import { expect, expectTypeOf, test } from "vitest";
import { assignCanonicalIds } from "../src/normalizer/ids.js";
import {
  type CanonicalIdentity,
  type CanonicalReference,
  createCanonicalReference,
} from "../src/resolver/reference-types.js";

function draft(sections: JsonValue[] = [], metadata?: JsonValue) {
  const raw = validateRawSpec(
    {
      omega: { schema: "3.0" },
      kind: "artifact",
      ...(metadata !== undefined ? { metadata } : {}),
      spec: { document: { title: "Project Review" }, sections },
    },
    { entries: [] },
  );
  if (!raw.ok) throw new Error(JSON.stringify(raw.diagnostics));
  const normalized = normalizeRawSpec(raw.value);
  if (!normalized.ok) throw new Error(JSON.stringify(normalized.diagnostics));
  return normalized.value;
}

function canonical(input: DraftCanonicalContract) {
  const result = assignCanonicalIds(input);
  expect(result.ok).toBe(true);
  expect(result.diagnostics).toEqual([]);
  if (!result.ok) throw new Error("Expected assigned canonical IDs");
  return result.value;
}

const explicit = (id: string) => ({ id, idOrigin: "explicit" as const });
const generated = (id: string) => ({ id, idOrigin: "generated" as const });

test("generated_ids_are_deterministic_but_not_reference_authority", () => {
  const input = draft([{ title: "Current State", body: "Running." }]);
  const first = canonical(input);
  expect(first).toEqual(canonical(input));
  expect(first.metadata).toEqual(generated("project-review-1"));
  const section = first.spec.sections[0];
  if (!section) throw new Error("Expected section");
  expect(section).toMatchObject(generated("current-state-1"));
  expect(section.content[0]).toMatchObject(generated("prose-1"));
  const ref = createCanonicalReference(
    {
      kind: "section",
      artifact: first.metadata,
      sectionPath: [],
      target: section,
    },
    "external",
  );
  expect(ref).toMatchObject({
    ok: false,
    diagnostics: [
      {
        code: "OMEGA-REF-GENERATED-AUTHORITY",
        severity: "ERROR",
        stage: "ids",
      },
    ],
  });
  expect(ref).not.toHaveProperty("value");
});

test("explicit_ASCII_IDs_preserve_case_and_origin_in_all_scopes", () => {
  const result = canonical(
    draft(
      [
        {
          id: "Status.A_01-z",
          title: "State",
          content: [{ id: "Prose.X_9-z", kind: "prose", text: "Exact." }],
        },
        { id: "status.a_01-z", body: "Case differs." },
      ],
      { id: "Review.A_01-z" },
    ),
  );
  expect(result.metadata).toEqual(explicit("Review.A_01-z"));
  expect(result.spec.sections[0]).toMatchObject(explicit("Status.A_01-z"));
  expect(result.spec.sections[0]?.content[0]).toMatchObject(
    explicit("Prose.X_9-z"),
  );
  expect(result.spec.sections[1]).toMatchObject(explicit("status.a_01-z"));
});

test("explicit_sibling_reservations_precede_generation_and_ordinals_skip_collisions", () => {
  const result = canonical(
    draft([
      { title: "State" },
      { id: "state-1" },
      { title: "State" },
      { id: "state-3" },
      { title: "State" },
    ]),
  );
  expect(
    result.spec.sections.map(({ id, idOrigin }) => ({ id, idOrigin })),
  ).toEqual([
    generated("state-2"),
    explicit("state-1"),
    generated("state-4"),
    explicit("state-3"),
    generated("state-5"),
  ]);
  const blocks = canonical(
    draft([
      {
        content: [
          { kind: "prose", text: "one" },
          { id: "prose-1", kind: "prose", text: "two" },
          { kind: "prose", text: "three" },
        ],
      },
    ]),
  ).spec.sections[0]?.content;
  expect(blocks?.map(({ id }) => id)).toEqual([
    "prose-2",
    "prose-1",
    "prose-3",
  ]);
});

test("slug_fallbacks_and_counters_depend_on_title_and_typed_parent_scope_only", () => {
  const result = canonical(
    draft([
      { title: " Current...STATE__ " },
      { title: "current state" },
      { title: "مرحبا" },
      { title: null },
      {},
      { title: "Other" },
      { title: "Current State" },
      {
        id: "parent",
        content: [{ id: "same", kind: "prose", text: "exact" }],
        sections: [{ id: "same" }, { title: "State" }],
      },
      { id: "other-parent", sections: [{ id: "same" }, { title: "State" }] },
    ]),
  );
  expect(result.spec.sections.map(({ id }) => id)).toEqual([
    "current-state-1",
    "current-state-2",
    "section-1",
    "section-2",
    "section-3",
    "other-1",
    "current-state-3",
    "parent",
    "other-parent",
  ]);
  expect(result.spec.sections[7]?.sections.map(({ id }) => id)).toEqual([
    "same",
    "state-1",
  ]);
  expect(result.spec.sections[8]?.sections.map(({ id }) => id)).toEqual([
    "same",
    "state-1",
  ]);
  expect(result.spec.sections[7]?.content[0]?.id).toBe("same");
  expect(
    canonical({
      ...draft(),
      spec: {
        ...draft().spec,
        document: { title: "مرحبا", language: "ar", direction: "rtl" },
      },
    }).metadata,
  ).toEqual(generated("artifact-1"));
});

test.each([
  [
    "sections",
    [{ id: "same" }, { id: "same" }],
    "/spec/sections/1/id",
    "/spec/sections/0/id",
  ],
  [
    "blocks",
    [
      {
        content: [
          { id: "same", kind: "prose", text: "first" },
          { id: "same", kind: "prose", text: "second" },
        ],
      },
    ],
    "/spec/sections/0/content/1/id",
    "/spec/sections/0/content/0/id",
  ],
  [
    "nested",
    [{ sections: [{ id: "same" }, { id: "same" }] }],
    "/spec/sections/0/sections/1/id",
    "/spec/sections/0/sections/0/id",
  ],
] as const)(
  "duplicate_explicit_%s_IDs_are_fatal_with_related_first_target",
  (_name, sections, path, firstPath) => {
    const result = assignCanonicalIds(draft([...sections]));
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        { code: "OMEGA-ID-DUPLICATE", path, related: [{ path: firstPath }] },
      ],
    });
    expect(result).not.toHaveProperty("value");
  },
);

test.each(["", "bad/id", "أ", "a b", "é", "a\n", "a\r", "a\t", "a😀", "a\\b"])(
  "invalid_explicit_ID_%j_is_fatal_at_every_ID_slot",
  (id) => {
    const input = draft([{ content: [{ kind: "prose", text: "text" }] }]);
    const parent = input.spec.sections[0];
    const block = parent?.content[0];
    if (!parent || !block) throw new Error("Expected fixture");
    const result = assignCanonicalIds({
      ...input,
      metadata: { id },
      spec: {
        ...input.spec,
        sections: [{ ...parent, id, content: [{ ...block, id }] }],
      },
    });
    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.map(({ code, path }) => ({ code, path })),
    ).toEqual([
      { code: "OMEGA-ID-INVALID", path: "/metadata/id" },
      { code: "OMEGA-ID-INVALID", path: "/spec/sections/0/id" },
      { code: "OMEGA-ID-INVALID", path: "/spec/sections/0/content/0/id" },
    ]);
    expect(result).not.toHaveProperty("value");
  },
);

test("unrelated_map_key_order_is_irrelevant_while_content_array_order_is_preserved", () => {
  const a = draft([
    {
      title: "State",
      content: [
        { text: "first", kind: "prose" },
        { kind: "prose", text: "second" },
      ],
    },
  ]);
  const b = draft([
    {
      content: [
        { kind: "prose", text: "first" },
        { text: "second", kind: "prose" },
      ],
      title: "State",
    },
  ]);
  expect(canonical(a)).toEqual(canonical(b));
  const section = a.spec.sections[0];
  if (!section) throw new Error("Expected section");
  const reordered = canonical({
    ...a,
    spec: {
      ...a.spec,
      sections: [{ ...section, content: [...section.content].reverse() }],
    },
  });
  expect(
    reordered.spec.sections[0]?.content.map(({ id, text }) => [
      id,
      text.blocks,
    ]),
  ).toEqual([
    [
      "prose-1",
      [{ kind: "paragraph", children: [{ kind: "text", value: "second" }] }],
    ],
    [
      "prose-2",
      [{ kind: "paragraph", children: [{ kind: "text", value: "first" }] }],
    ],
  ]);
  expect(reordered).not.toEqual(canonical(a));
});

test("ID_assignment_does_not_mutate_deeply_frozen_input_or_invent_meaning", () => {
  const input = draft([
    { title: "الحالة", intent: "verdict", body: "`A\u030A  ID`" },
  ]);
  const before = JSON.stringify(input);
  function freeze(value: unknown) {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  }
  freeze(input);
  const result = canonical(input);
  expect(JSON.stringify(input)).toBe(before);
  expect(result.spec.document).toEqual(input.spec.document);
  expect(result.spec.sections[0]?.content[0]?.text).toEqual(
    input.spec.sections[0]?.content[0]?.text,
  );
  expect(result.spec.sections[0]).toMatchObject({
    title: "الحالة",
    intent: "verdict",
  });
});

test("reapplying_to_identified_contract_is_fatal_and_never_relabels_generated_origins", () => {
  const assigned = canonical(draft([{ body: "Text" }]));
  // Runtime boundary misuse must also fail even when callers bypass TS.
  const result = assignCanonicalIds(
    assigned as unknown as DraftCanonicalContract,
  );
  expect(result.ok).toBe(false);
  expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([
    { code: "OMEGA-ID-ALREADY-ASSIGNED", path: "/metadata/idOrigin" },
    { code: "OMEGA-ID-ALREADY-ASSIGNED", path: "/spec/sections/0/idOrigin" },
    {
      code: "OMEGA-ID-ALREADY-ASSIGNED",
      path: "/spec/sections/0/content/0/idOrigin",
    },
  ]);
  expect(result).not.toHaveProperty("value");
  expect(assigned.metadata.idOrigin).toBe("generated");
});

test.each([
  [
    { kind: "artifact", target: explicit("Artifact.A") },
    {
      kind: "artifact",
      artifactId: "Artifact.A",
      sectionPath: [],
      id: "Artifact.A",
    },
  ],
  [
    {
      kind: "section",
      artifact: explicit("Artifact.A"),
      sectionPath: [explicit("Parent.B")],
      target: explicit("Child.C"),
    },
    {
      kind: "section",
      artifactId: "Artifact.A",
      sectionPath: ["Parent.B"],
      id: "Child.C",
    },
  ],
  [
    {
      kind: "content-block",
      artifact: explicit("Artifact.A"),
      sectionPath: [explicit("Parent.B"), explicit("Child.C")],
      target: explicit("Prose.D"),
    },
    {
      kind: "content-block",
      artifactId: "Artifact.A",
      sectionPath: ["Parent.B", "Child.C"],
      id: "Prose.D",
    },
  ],
] satisfies readonly (readonly [CanonicalIdentity, CanonicalReference])[])(
  "typed_known_%j_identity_becomes_explicit_resolved_reference",
  (identity, expected) => {
    expect(createCanonicalReference(identity, "external")).toEqual({
      ok: true,
      value: expected,
      diagnostics: [],
    });
  },
);

test.each(["artifact", "ancestor", "target"] as const)(
  "external_reference_rejects_generated_%s_authority",
  (slot) => {
    const result = createCanonicalReference(
      {
        kind: "section",
        artifact: slot === "artifact" ? generated("root-1") : explicit("root"),
        sectionPath: [
          slot === "ancestor" ? generated("parent-1") : explicit("parent"),
        ],
        target: slot === "target" ? generated("child-1") : explicit("child"),
      },
      "external",
    );
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "OMEGA-REF-GENERATED-AUTHORITY" }],
    });
    expect(result).not.toHaveProperty("value");
  },
);

test("internal_reference_can_name_generated_known_IDs_without_granting_external_authority", () => {
  const identity: CanonicalIdentity = {
    kind: "section",
    artifact: generated("root-1"),
    sectionPath: [generated("parent-1")],
    target: generated("child-1"),
  };
  expect(createCanonicalReference(identity, "internal")).toEqual({
    ok: true,
    value: {
      kind: "section",
      artifactId: "root-1",
      sectionPath: ["parent-1"],
      id: "child-1",
    },
    diagnostics: [],
  });
  expect(createCanonicalReference(identity, "external").ok).toBe(false);
});

test("reference_policy_validates_all_known_IDs_and_requires_an_owning_section_for_blocks", () => {
  const invalid = createCanonicalReference(
    {
      kind: "section",
      artifact: explicit("bad/root"),
      sectionPath: [explicit("أ")],
      target: explicit("bad\n"),
    },
    "internal",
  );
  expect(invalid.ok).toBe(false);
  expect(invalid.diagnostics.map(({ code }) => code)).toEqual([
    "OMEGA-ID-INVALID",
    "OMEGA-ID-INVALID",
    "OMEGA-ID-INVALID",
  ]);
  expect(invalid).not.toHaveProperty("value");
  expect(
    createCanonicalReference(
      {
        kind: "content-block",
        artifact: explicit("root"),
        sectionPath: [],
        target: explicit("block"),
      },
      "internal",
    ),
  ).toMatchObject({
    ok: false,
    diagnostics: [{ code: "OMEGA-REF-INVALID-SCOPE" }],
  });
});

test.each([undefined, "authored"])(
  "reference_policy_never_invents_missing_or_unknown_origin_%j",
  (idOrigin) => {
    const identity = {
      kind: "artifact",
      target: { id: "root", idOrigin },
    } as unknown as CanonicalIdentity;
    const result = createCanonicalReference(identity, "external");
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "OMEGA-REF-INVALID-ORIGIN",
          path: "/reference/identity/0/idOrigin",
        },
      ],
    });
    expect(result).not.toHaveProperty("value");
  },
);

test("Raw_schema_still_rejects_reference_authoring_fields", () => {
  const raw = validateRawSpec(
    {
      omega: { schema: "3.0" },
      kind: "artifact",
      spec: {
        document: { title: "Review" },
        sections: [{ ref: "other/section" }],
      },
    },
    { entries: [] },
  );
  expect(raw).toMatchObject({
    ok: false,
    diagnostics: [
      { code: "OMEGA-SCHEMA-UNKNOWN-FIELD", path: "/spec/sections/0/ref" },
    ],
  });
});

test("final_public_IDs_have_required_origins_and_references_have_distinct_target_kinds", () => {
  expectTypeOf<CanonicalContract["metadata"]["idOrigin"]>().toEqualTypeOf<
    "explicit" | "generated"
  >();
  expectTypeOf<CanonicalReference["kind"]>().toEqualTypeOf<
    "artifact" | "section" | "content-block"
  >();
  expectTypeOf<CanonicalContract>().not.toExtend<DraftCanonicalContract>();
  expectTypeOf<Extract<CanonicalReference, { kind: "section" }>>().not.toExtend<
    Extract<CanonicalReference, { kind: "content-block" }>
  >();
});
