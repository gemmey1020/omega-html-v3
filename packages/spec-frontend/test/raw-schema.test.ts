import type { JsonValue } from "@omega/contracts";
import { parseOmegaYaml, validateRawSpec } from "@omega/spec-frontend";
import { expect, test } from "vitest";

test("unknown_field_has_stable_diagnostic_and_suggestion", () => {
  const parsed = parseOmegaYaml(
    'omega: {schema: "3.0"}\nkind: artifact\nspec:\n  document: {title: Review}\n  presentaton: {profile: prime}\n  sections: []\n',
    "review.omega.yaml",
  );
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error("Expected valid syntax");
  const result = validateRawSpec(parsed.value, parsed.sourceMap);
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toEqual([
    expect.objectContaining({
      code: "OMEGA-SCHEMA-UNKNOWN-FIELD",
      severity: "ERROR",
      stage: "raw-validation",
      path: "/spec/presentaton",
      location: expect.objectContaining({
        module: "review.omega.yaml",
        line: 5,
        column: 16,
      }),
      suggestions: ['Did you mean "presentation"?'],
    }),
  ]);
});

const minimal = {
  omega: { schema: "3.0" },
  kind: "artifact",
  spec: { document: { title: "Review" }, sections: [] },
};

function validate(value: JsonValue) {
  return validateRawSpec(value, { entries: [] });
}

function validateYaml(source: string | Uint8Array) {
  const parsed = parseOmegaYaml(source, "review.omega.yaml");
  if (!parsed.ok) throw new Error("Expected valid YAML fixture");
  return validateRawSpec(parsed.value, parsed.sourceMap);
}

test("accepts_ordered_prose_and_nested_sections_without_mutating_or_defaulting", () => {
  const input = {
    ...minimal,
    metadata: { id: "Review.ID_1" },
    spec: {
      document: { title: "الحالة", language: "ar" },
      presentation: { profile: "cyan" },
      target: "standalone-html",
      sections: [
        {
          id: "state",
          intent: "verdict",
          title: null,
          body: "first",
          content: [
            { kind: "prose", text: "second" },
            { id: "last", kind: "prose", text: "third" },
          ],
          sections: [{ title: "nested", body: "child" }],
        },
      ],
    },
  };
  const before = structuredClone(input);
  const result = validate(input);
  expect(result.ok).toBe(true);
  expect(result.diagnostics).toEqual([]);
  if (!result.ok) throw new Error("Expected valid raw artifact");
  expect(result.value).toBe(input);
  expect(input).toEqual(before);
  const omitted = validate(minimal);
  expect(omitted.ok).toBe(true);
  if (!omitted.ok) throw new Error("Expected minimal artifact");
  expect(omitted.value).toEqual(minimal);
  expect(omitted.value.spec.document).not.toHaveProperty("language");
  expect(omitted.value.spec).not.toHaveProperty("presentation");
  expect(omitted.value.spec).not.toHaveProperty("target");
});

test.each(["prime", "silver", "gold", "cyan"])(
  "accepts_author_profile_%s",
  (profile) => {
    expect(
      validate({
        ...minimal,
        spec: { ...minimal.spec, presentation: { profile } },
      }).ok,
    ).toBe(true);
  },
);

test.each([
  { ...minimal, imports: [] },
  { ...minimal, defs: {} },
  { ...minimal, spec: { ...minimal.spec, evidence: {} } },
  {
    ...minimal,
    spec: { ...minimal.spec, presentation: { profile: "prime", prefer: {} } },
  },
  {
    ...minimal,
    spec: {
      ...minimal.spec,
      sections: [{ content: [{ kind: "prose", text: "x", class: "card" }] }],
    },
  },
  {
    ...minimal,
    spec: {
      ...minimal.spec,
      document: { title: "x", subtitle: "unpreservable" },
    },
  },
])("rejects_unimplemented_or_renderer_fields_%j", (input) => {
  const result = validate(input);
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty("value");
  expect(result.diagnostics.map((d) => d.code)).toContain(
    "OMEGA-SCHEMA-UNKNOWN-FIELD",
  );
});

test.each([
  ["id", "bad/id"],
  ["id", "اسم"],
  ["id", ""],
  ["id", null],
  ["body", null],
  ["body", 123],
  ["content", null],
  ["sections", null],
  ["intent", null],
  ["intent", "bad/intent"],
  ["title", 5],
])("rejects_invalid_section_%s_%j", (field, value) => {
  expect(
    validate({
      ...minimal,
      spec: { ...minimal.spec, sections: [{ [field]: value }] },
    }).ok,
  ).toBe(false);
});

test.each(
  [
    { ...minimal, spec: { ...minimal.spec, document: { title: 10 } } },
    { ...minimal, spec: { ...minimal.spec, document: { title: null } } },
    {
      ...minimal,
      spec: { ...minimal.spec, document: { title: "x", language: null } },
    },
    { ...minimal, spec: { ...minimal.spec, presentation: null } },
    { ...minimal, spec: { ...minimal.spec, presentation: { profile: null } } },
    { ...minimal, spec: { ...minimal.spec, target: null } },
    { ...minimal, spec: { ...minimal.spec, target: "site" } },
    { ...minimal, metadata: { id: null } },
    {
      ...minimal,
      spec: {
        ...minimal.spec,
        sections: [{ content: [{ kind: "prose", text: null }] }],
      },
    },
    {
      ...minimal,
      spec: {
        ...minimal.spec,
        sections: [{ content: [{ kind: "graph", text: "x" }] }],
      },
    },
    { ...minimal, kind: "site" },
    null,
    [],
    1,
    "artifact",
  ].map((input) => [input]),
)("does_not_coerce_scalars_or_treat_explicit_null_as_missing_%j", (input) => {
  const before = structuredClone(input);
  const result = validate(input);
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty("value");
  expect(input).toEqual(before);
});

test("missing_field_diagnostic_points_to_missing_path_and_parent_location", () => {
  const result = validateYaml(
    'omega: {schema: "3.0"}\nkind: artifact\nspec:\n  document: {}\n  sections: []\n',
  );
  expect(result.diagnostics).toEqual([
    expect.objectContaining({
      code: "OMEGA-SCHEMA-REQUIRED",
      path: "/spec/document/title",
      location: {
        module: "review.omega.yaml",
        line: 4,
        column: 13,
        span: { endLine: 4, endColumn: 15 },
      },
    }),
  ]);
});

test.each(["2.0", "3.1", "4.0", ""])(
  "rejects_unknown_raw_version_with_stable_gate_%s",
  (version) => {
    const result = validate({ ...minimal, omega: { schema: version } });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "UNSUPPORTED_RAW_SCHEMA",
        path: "/omega/schema",
      }),
    ]);
  },
);

test("missing_or_wrong_type_schema_is_a_structure_error", () => {
  for (const omega of [{}, { schema: null }, { schema: 3 }]) {
    const result = validate({ ...minimal, omega });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).not.toBe("UNSUPPORTED_RAW_SCHEMA");
  }
});

test("escaped_unknown_keys_keep_utf16_locations_and_key_order_does_not_change_diagnostics", () => {
  const result = validateYaml(
    new TextEncoder().encode(
      'omega: {schema: "3.0"}\nkind: artifact\nspec: {document: {title: "😀", "a/b~c": 1}, sections: []}\n',
    ),
  );
  expect(result.diagnostics).toEqual([
    expect.objectContaining({
      code: "OMEGA-SCHEMA-UNKNOWN-FIELD",
      path: "/spec/document/a~1b~0c",
      location: {
        module: "review.omega.yaml",
        line: 3,
        column: 41,
        span: { endLine: 3, endColumn: 42 },
      },
    }),
  ]);
  const a = validate({ ...minimal, zzz: true, aaa: true });
  const b = validate({ aaa: true, zzz: true, ...minimal });
  expect(a.diagnostics).toEqual(b.diagnostics);
  expect(a.diagnostics.map((d) => d.path)).toEqual(["/aaa", "/zzz"]);
});

test("suggestions_are_local_deterministic_and_do_not_suggest_unimplemented_branches", () => {
  const result = validate({
    ...minimal,
    spec: {
      ...minimal.spec,
      document: { title: "x", languge: "ar" },
      presentaton: { profile: "prime" },
      evidence: {},
    },
  });
  expect(result.diagnostics).toEqual([
    expect.objectContaining({
      path: "/spec/document/languge",
      suggestions: ['Did you mean "language"?'],
    }),
    expect.objectContaining({ path: "/spec/evidence" }),
    expect.objectContaining({
      path: "/spec/presentaton",
      suggestions: ['Did you mean "presentation"?'],
    }),
  ]);
  expect(result.diagnostics[1]).not.toHaveProperty("suggestions");
  const special = validate({
    ...minimal,
    ["__proto__"]: { polluted: true },
    constructor: "x",
  });
  expect(special.ok).toBe(false);
  expect(special.diagnostics.map((d) => d.path)).toEqual([
    "/__proto__",
    "/constructor",
  ]);
});
