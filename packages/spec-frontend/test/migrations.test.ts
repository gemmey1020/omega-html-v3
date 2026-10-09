import type { CompilerSource, JsonValue } from "@omega/contracts";
import {
  compileRawSpec,
  createMigrationRegistry,
  DEFAULT_MIGRATION_REGISTRY,
  migrateRawSpec,
  parseOmegaYaml,
  type RawMigrationAdapter,
  validateRawSpec,
} from "@omega/spec-frontend";
import { expect, test, vi } from "vitest";

const predecessor = `# SYNTHETIC TEST-ONLY predecessor; not a historical Raw 2.0 schema.
omega: {schema: "2.0"}
syntheticDocument:
  title: "Review é / Exact.ID"
  paragraphs: ["first", "second"]
`;
const source: CompilerSource = {
  module: "synthetic.omega.yaml",
  text: predecessor,
};
const target = {
  omega: { schema: "3.0" },
  kind: "artifact",
  spec: {
    document: { title: "Review é / Exact.ID" },
    sections: [{ body: "first" }, { body: "second" }],
  },
};

// SYNTHETIC TEST-ONLY shape and adapter: no production compatibility assertion.
const syntheticAdapter: RawMigrationAdapter = {
  id: "synthetic-test-only-predecessor-v1",
  fromVersion: "2.0",
  toVersion: "3.0",
  migrate(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new Error("Expected synthetic envelope");
    const document = (value as { readonly [key: string]: JsonValue })
      .syntheticDocument;
    if (!document || typeof document !== "object" || Array.isArray(document))
      throw new Error("Expected synthetic document");
    const fields = document as { readonly [key: string]: JsonValue };
    if (typeof fields.title !== "string" || !Array.isArray(fields.paragraphs))
      throw new Error("Expected synthetic title and paragraphs");
    return {
      omega: { schema: "3.0" },
      kind: "artifact",
      spec: {
        document: { title: fields.title },
        sections: fields.paragraphs.map((body) => ({ body })),
      },
    };
  },
};
const registry = createMigrationRegistry([syntheticAdapter]);

function using(migrate: RawMigrationAdapter["migrate"]) {
  return createMigrationRegistry([{ ...syntheticAdapter, migrate }]);
}
function failure(result: ReturnType<typeof migrateRawSpec>, code: string) {
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty("source");
  expect(result.steps).toEqual([]);
  expect(result.diagnostics.map((d) => d.code)).toContain(code);
  expect(Object.isFrozen(result)).toBe(true);
}

test.each(["text", "bytes"])(
  "major_migration_is_explicit_and_non_destructive_%s",
  (format) => {
    const input: CompilerSource = {
      ...source,
      text:
        format === "text" ? predecessor : new TextEncoder().encode(predecessor),
    };
    const before =
      typeof input.text === "string" ? input.text : Array.from(input.text);
    const ordinary = compileRawSpec({
      source: input,
      engineVersion: "test-only",
    });
    expect(ordinary.ok).toBe(false);
    expect(ordinary.diagnostics.map((d) => d.code)).toEqual([
      "UNSUPPORTED_RAW_SCHEMA",
    ]);
    const result = migrateRawSpec(input, "3.0", registry);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected explicit migration success");
    expect(result.source).not.toBe(input);
    expect(result.source.module).toBe(`${input.module}.migrated`);
    expect(typeof result.source.text).toBe("string");
    expect(result.sourceVersion).toBe("2.0");
    expect(result.targetVersion).toBe("3.0");
    expect(result.steps).toEqual([
      {
        adapterId: syntheticAdapter.id,
        fromVersion: "2.0",
        toVersion: "3.0",
      },
    ]);
    expect(result.diagnostics).toEqual([]);
    const parsed = parseOmegaYaml(result.source.text, result.source.module);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("Expected valid generated YAML");
    expect(parsed.value).toEqual(target);
    expect(validateRawSpec(parsed.value, parsed.sourceMap).ok).toBe(true);
    expect(
      compileRawSpec({
        source: result.source,
        engineVersion: "independent-engine",
      }).ok,
    ).toBe(true);
    expect(
      typeof input.text === "string" ? input.text : Array.from(input.text),
    ).toEqual(before);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(result.source)).toBe(true);
    expect(Object.isFrozen(result.steps[0])).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
    expect(
      compileRawSpec({ source: input, engineVersion: "test-only" }).ok,
    ).toBe(false);
  },
);

test("default_registry_is_empty_and_never_assumes_historical_compatibility", () => {
  expect(DEFAULT_MIGRATION_REGISTRY.adapters).toEqual([]);
  expect(Object.isFrozen(DEFAULT_MIGRATION_REGISTRY)).toBe(true);
  failure(migrateRawSpec(source, "3.0"), "OMEGA-MIGRATION-UNSUPPORTED-ROUTE");
  failure(
    migrateRawSpec({ ...source, text: JSON.stringify(target) }, "3.0"),
    "OMEGA-MIGRATION-UNSUPPORTED-ROUTE",
  );
});

test("registry_snapshots_routes_and_rejects_duplicate_direct_routes", () => {
  const adapter = { ...syntheticAdapter };
  const adapters = [adapter];
  const copy = createMigrationRegistry(adapters);
  adapter.id = "changed";
  adapter.migrate = () => null;
  adapters.length = 0;
  expect(copy.adapters[0]?.id).toBe(syntheticAdapter.id);
  expect(Object.isFrozen(copy.adapters)).toBe(true);
  expect(Object.isFrozen(copy.adapters[0])).toBe(true);
  expect(migrateRawSpec(source, "3.0", copy).ok).toBe(true);
  expect(() =>
    createMigrationRegistry([
      syntheticAdapter,
      { ...syntheticAdapter, id: "other" },
    ]),
  ).toThrow(/duplicate/i);
});

test("registry_order_does_not_change_route_selection_or_output", () => {
  const irrelevant = { ...syntheticAdapter, id: "other", fromVersion: "1.0" };
  expect(
    migrateRawSpec(
      source,
      "3.0",
      createMigrationRegistry([irrelevant, syntheticAdapter]),
    ),
  ).toEqual(
    migrateRawSpec(
      source,
      "3.0",
      createMigrationRegistry([syntheticAdapter, irrelevant]),
    ),
  );
});

test.each(["", "3", "v3", "3.0\n"])(
  "registry_rejects_invalid_version_%j",
  (version) => {
    expect(() =>
      createMigrationRegistry([{ ...syntheticAdapter, fromVersion: version }]),
    ).toThrow(TypeError);
    expect(() =>
      createMigrationRegistry([{ ...syntheticAdapter, toVersion: version }]),
    ).toThrow(TypeError);
  },
);

test("registry_rejects_invalid_adapter_identity_or_callback", () => {
  expect(() =>
    createMigrationRegistry([{ ...syntheticAdapter, id: "" }]),
  ).toThrow(TypeError);
  expect(() =>
    createMigrationRegistry([
      { ...syntheticAdapter, migrate: null } as unknown as RawMigrationAdapter,
    ]),
  ).toThrow(TypeError);
});

test("adapter_receives_recursively_frozen_parsed_model_and_cannot_mutate_it", () => {
  const callback = vi.fn((value: JsonValue) => {
    expect(Object.isFrozen(value)).toBe(true);
    const root = value as { readonly [key: string]: JsonValue };
    expect(Object.isFrozen(root.omega)).toBe(true);
    expect(Object.isFrozen(root.syntheticDocument)).toBe(true);
    expect(() =>
      Object.assign(root.omega as object, { schema: "3.0" }),
    ).toThrow(TypeError);
    return syntheticAdapter.migrate(value);
  });
  expect(migrateRawSpec(source, "3.0", using(callback)).ok).toBe(true);
  expect(callback).toHaveBeenCalledOnce();
  expect(source.text).toBe(predecessor);
});

test.each([
  ['omega: {schema: "2.0", schema: "2.0"}', "OMEGA-PARSE-DUPLICATE-KEY"],
  ['omega: {schema: "2.0"}\na: &x [1]\nb: *x', "OMEGA-PARSE-YAML-PROFILE"],
  ["omega: [", "OMEGA-PARSE-SYNTAX"],
  [new Uint8Array([0xff]), "OMEGA-PARSE-UTF8"],
])("invalid_source_does_not_invoke_adapter_%j", (text, code) => {
  const callback = vi.fn(() => target);
  failure(migrateRawSpec({ ...source, text }, "3.0", using(callback)), code);
  expect(callback).not.toHaveBeenCalled();
});

test.each([
  null,
  [],
  {},
  { omega: {} },
  { omega: { schema: null } },
  { omega: { schema: 2 } },
  { omega: { schema: "" } },
])("missing_or_invalid_source_version_is_not_inferred_%j", (value) => {
  const callback = vi.fn(() => target);
  const result = migrateRawSpec(
    { ...source, text: JSON.stringify(value) },
    "3.0",
    using(callback),
  );
  failure(result, "OMEGA-MIGRATION-SOURCE-VERSION");
  expect(result.sourceVersion).toBeNull();
  expect(callback).not.toHaveBeenCalled();
});

test.each(["2.0", "3.1", "4.0", ""])(
  "unsupported_target_stops_before_adapter_%j",
  (version) => {
    const callback = vi.fn(() => target);
    const result = migrateRawSpec(source, version, using(callback));
    failure(result, "OMEGA-MIGRATION-UNSUPPORTED-TARGET");
    expect(result.sourceVersion).toBe("2.0");
    expect(result.targetVersion).toBe(version);
    expect(callback).not.toHaveBeenCalled();
  },
);

test("missing_direct_route_does_not_chain_or_invoke_other_adapters", () => {
  const callback = vi.fn(() => target);
  const only = createMigrationRegistry([
    { ...syntheticAdapter, fromVersion: "1.0", migrate: callback },
  ]);
  failure(
    migrateRawSpec(source, "3.0", only),
    "OMEGA-MIGRATION-UNSUPPORTED-ROUTE",
  );
  expect(callback).not.toHaveBeenCalled();
});

test("callback_exception_returns_failure_without_partial_output_or_leaking_exception", () => {
  const result = migrateRawSpec(
    source,
    "3.0",
    using(() => {
      throw new Error("private adapter details");
    }),
  );
  failure(result, "OMEGA-MIGRATION-ADAPTER-FAILED");
  expect(JSON.stringify(result)).not.toContain("private adapter details");
  expect(result.diagnostics[0]?.context).toEqual({
    adapterId: syntheticAdapter.id,
  });
});

test.each([
  undefined,
  NaN,
  Infinity,
  1n,
  () => target,
  new Date(0),
  new Map(),
  Promise.resolve(target),
  new Array(2),
])("non_json_callback_output_is_rejected_%#", (output) => {
  failure(
    migrateRawSpec(
      source,
      "3.0",
      using(() => output),
    ),
    "OMEGA-MIGRATION-JSON-MODEL",
  );
});

test("cyclic_output_is_rejected_without_freezing_caller_output", () => {
  const output: { self?: unknown } = {};
  output.self = output;
  failure(
    migrateRawSpec(
      source,
      "3.0",
      using(() => output),
    ),
    "OMEGA-MIGRATION-JSON-MODEL",
  );
  expect(Object.isFrozen(output)).toBe(false);
});

test("getters_and_toJSON_are_never_invoked_during_output_serialization", () => {
  const getter = vi.fn(() => target);
  const toJSON = vi.fn(() => target);
  failure(
    migrateRawSpec(
      source,
      "3.0",
      using(() =>
        Object.defineProperty({}, "omega", { enumerable: true, get: getter }),
      ),
    ),
    "OMEGA-MIGRATION-JSON-MODEL",
  );
  failure(
    migrateRawSpec(
      source,
      "3.0",
      using(() => ({ toJSON })),
    ),
    "OMEGA-MIGRATION-JSON-MODEL",
  );
  expect(getter).not.toHaveBeenCalled();
  expect(toJSON).not.toHaveBeenCalled();
});

test.each([
  {},
  { ...target, omega: { schema: "2.0" } },
  { ...target, omega: { schema: "3.1" } },
  { ...target, omega: { schema: 3 } },
  { ...target, spec: { ...target.spec, document: { title: null } } },
  { ...target, hidden: true },
  null,
])("adapter_success_alone_cannot_bypass_target_revalidation_%j", (output) => {
  const result = migrateRawSpec(
    source,
    "3.0",
    using(() => output),
  );
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty("source");
  expect(result.steps).toEqual([]);
  expect(result.diagnostics.length).toBeGreaterThan(0);
  for (const diagnostic of result.diagnostics) {
    expect(diagnostic.context).toMatchObject({
      sourceDocument: "generated-migration-output",
    });
    if (diagnostic.location) {
      expect(diagnostic.location.line).toBe(1);
      expect(diagnostic.location.module).toBe(`${source.module}.migrated`);
    }
  }
});

test("output_snapshot_is_deterministic_without_normalization_or_freezing_adapter_aliases", () => {
  const output = structuredClone(target);
  const before = structuredClone(output);
  const actual = migrateRawSpec(
    source,
    "3.0",
    using(() => output),
  );
  expect(actual).toEqual(
    migrateRawSpec(
      source,
      "3.0",
      using(() => output),
    ),
  );
  expect(actual.ok).toBe(true);
  if (!actual.ok) throw new Error("Expected migration success");
  expect(actual.source.text).toContain("é");
  expect(actual.source.text).not.toContain("é");
  expect(output).toEqual(before);
  expect(Object.isFrozen(output)).toBe(false);
  output.spec.document.title = "later change";
  expect(actual.source.text).not.toContain("later change");
});

test("authored_formatting_and_key_order_do_not_change_explicit_migration_output", () => {
  const variants = [
    predecessor,
    predecessor.replaceAll("\n", "\r\n"),
    predecessor.replaceAll("\n", "\r"),
    'syntheticDocument: {paragraphs: [first, second], title: "Review é / Exact.ID"}\nomega: {schema: "2.0"}\n',
  ];
  const expected = migrateRawSpec(source, "3.0", registry);
  for (const text of variants) {
    expect(migrateRawSpec({ ...source, text }, "3.0", registry)).toEqual(
      expected,
    );
  }
});

test("unrepresentable_generated_raw_numbers_fail_at_authoritative_parse_gate", () => {
  const output = {
    ...target,
    spec: { ...target.spec, sections: [{ body: 1e30 }] },
  };
  failure(
    migrateRawSpec(
      source,
      "3.0",
      using(() => output),
    ),
    "OMEGA-PARSE-NUMBER",
  );
});

test("invalid_logical_source_module_stops_before_adapter", () => {
  const callback = vi.fn(() => target);
  failure(
    migrateRawSpec({ ...source, module: "../escape" }, "3.0", using(callback)),
    "OMEGA-PARSE-MODULE",
  );
  expect(callback).not.toHaveBeenCalled();
});
