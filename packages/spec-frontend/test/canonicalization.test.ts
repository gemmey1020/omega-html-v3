import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type {
  CompileRequest,
  CompileResult,
  CompileSuccess,
  JsonValue,
  SourceMap,
} from "@omega/contracts";
import { expect, test } from "vitest";
import * as frontend from "../src/index.js";

function compile(request: CompileRequest): CompileSuccess {
  const result = frontend.compileRawSpec(request);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) throw new Error("Expected successful compilation");
  return result;
}

function fixture(name: string): string {
  return readFileSync(
    new URL(`../../../qa/conformance/canonical/${name}`, import.meta.url),
    "utf8",
  );
}

function request(text: CompileRequest["source"]["text"]): CompileRequest {
  return {
    source: { module: "review.omega.yaml", text },
    engineVersion: "3.0.0",
  };
}

const walkingSource = fixture("walking-skeleton.omega.yaml");
const walkingCanonical: JsonValue = JSON.parse(
  fixture("walking-skeleton.canonical.json"),
);

const source = `omega:
  schema: "3.0"
kind: artifact
spec:
  document:
    title: Review
  sections:
    - title: First
      body: Alpha
    - title: Second
      body: Beta
`;

test("formatting_changes_do_not_change_normalized_hash", () => {
  const variants = [
    source,
    source.replaceAll("\n", "\r\n"),
    source.replaceAll("\n", "\r"),
    `# reordered maps and altered indentation
kind: artifact
omega: { schema: "3.0" }
spec:
    sections:
        - body: Alpha
          title: First
        - body: Beta
          title: Second
    document: { title: Review }
`,
  ].map((text) =>
    compile({
      source: { module: "review.omega.yaml", text },
      engineVersion: "3.0.0",
    }),
  );
  expect(variants.every((value) => value.ok)).toBe(true);
  expect(new Set(variants.map((value) => value.rawSourceHash)).size).toBe(4);
  expect(new Set(variants.map((value) => value.normalizedHash)).size).toBe(1);
  const reordered = compile({
    source: {
      module: "review.omega.yaml",
      text: source.replace(
        "- title: First\n      body: Alpha\n    - title: Second\n      body: Beta",
        "- title: Second\n      body: Beta\n    - title: First\n      body: Alpha",
      ),
    },
    engineVersion: "3.0.0",
  });
  expect(reordered.ok).toBe(true);
  expect(reordered.normalizedHash).not.toBe(variants[0]?.normalizedHash);
});

test("walking_skeleton_matches_exact_canonical_string_utf8_bytes_and_sha256_fixtures", () => {
  const result = compile(request(walkingSource));
  const hashes = JSON.parse(fixture("walking-skeleton.hashes.json"));
  expect(result.canonical).toEqual(walkingCanonical);
  expect(result.canonicalString).toBe(
    fixture("walking-skeleton.canonical.txt"),
  );
  expect(Buffer.from(result.canonicalBytes).toString("hex")).toBe(
    fixture("walking-skeleton.utf8.hex").trimEnd(),
  );
  expect(result.rawSourceHash).toBe(hashes.rawSourceHash);
  expect(result.normalizedHash).toBe(hashes.normalizedHash);
  expect(result.versions).toEqual({
    rawSchemaVersion: "3.0",
    canonicalContractVersion: "1.0",
    engineVersion: "3.0.0",
  });
  expect(result.resolutionManifest).toEqual({
    visibility: "internal",
    entries: [],
  });
  expect(result.diagnostics).toEqual([]);
});

test("module_engine_version_and_source_sidecars_do_not_enter_semantic_bytes", () => {
  const first = compile(request(walkingSource));
  const second = compile({
    source: {
      module: "logical/elsewhere.omega.yaml",
      text: `# source shift\n${walkingSource}`,
    },
    engineVersion: "3.8.1",
  });
  expect(first.canonicalString).toBe(second.canonicalString);
  expect(first.canonicalBytes).toEqual(second.canonicalBytes);
  expect(first.normalizedHash).toBe(second.normalizedHash);
  expect(first.rawSourceHash).not.toBe(second.rawSourceHash);
  expect(second.versions.engineVersion).toBe("3.8.1");
  expect(
    second.sourceMap.entries.every(
      (entry) => entry.location.module === "logical/elsewhere.omega.yaml",
    ),
  ).toBe(true);
  for (const field of [
    "engineVersion",
    "sourceMap",
    "resolutionManifest",
    "module",
    "line",
    "column",
    "rawSourceHash",
    "normalizedHash",
    "body",
    "omega",
  ])
    expect(first.canonicalString).not.toContain(`"${field}":`);
});

test("Arabic_human_NFC_and_protected_code_link_values_remain_distinct", () => {
  const decomposed = compile(request(walkingSource));
  const humanComposed = compile(
    request(
      walkingSource
        .replace("title: مراجعة أ", "title: مراجعة أ")
        .replace("        أ **", "        أ **"),
    ),
  );
  expect(humanComposed.normalizedHash).toBe(decomposed.normalizedHash);
  const protectedComposed = compile(
    request(walkingSource.replace("`أ  v3`", "`أ  v3`")),
  );
  expect(protectedComposed.normalizedHash).not.toBe(decomposed.normalizedHash);
  const linkTitleComposed = compile(
    request(walkingSource.replace('#A "أ"', '#A "أ"')),
  );
  expect(linkTitleComposed.normalizedHash).not.toBe(decomposed.normalizedHash);
  const destinationCase = compile(
    request(walkingSource.replace("(#A ", "(#a ")),
  );
  expect(destinationCase.normalizedHash).not.toBe(decomposed.normalizedHash);
});

test("explicit_id_origin_and_null_vs_omission_follow_authoritative_normalization", () => {
  const generated = compile(request(source));
  const explicit = compile(
    request(
      source
        .replace("title: Review", "title: Review\n  target: standalone-html")
        .replace(
          "kind: artifact",
          "kind: artifact\nmetadata: { id: review-1 }",
        ),
    ),
  );
  expect(generated.canonical.metadata).toEqual({
    id: "review-1",
    idOrigin: "generated",
  });
  expect(explicit.canonical.metadata).toEqual({
    id: "review-1",
    idOrigin: "explicit",
  });
  expect(explicit.normalizedHash).not.toBe(generated.normalizedHash);
  const omitted = compile(
    request(
      walkingSource.replace(
        "        - title: null\n          body: Nested.",
        "        - body: Nested.",
      ),
    ),
  );
  expect(omitted.normalizedHash).toBe(
    compile(request(walkingSource)).normalizedHash,
  );
  const nullLanguage = frontend.compileRawSpec(
    request(
      source.replace("title: Review", "title: Review\n    language: null"),
    ),
  );
  expectFailure(nullLanguage, "raw-validation");
  expect(frontend.canonicalizeJson({ value: null })).not.toBe(
    frontend.canonicalizeJson({}),
  );
});

test("source_map_remaps_body_authored_content_nested_sections_and_synthesized_defaults", () => {
  const result = compile(request(walkingSource));
  const parsed = frontend.parseOmegaYaml(walkingSource, "review.omega.yaml");
  if (!parsed.ok) throw new Error("Invalid source fixture");
  const canonicalLocation = (path: string) =>
    result.sourceMap.entries.find((entry) => entry.path === path)?.location;
  const rawLocation = (path: string) =>
    parsed.sourceMap.entries.find((entry) => entry.path === path)?.location;
  for (const [canonicalPath, rawPath] of [
    ["/contractVersion", "/omega/schema"],
    ["/metadata/idOrigin", "/metadata/id"],
    ["/spec/document/direction", "/spec/document/language"],
    ["/spec/target", "/spec"],
    ["/spec/sections/0/content/0", "/spec/sections/0/body"],
    [
      "/spec/sections/0/content/0/text/blocks/0/children/3/value",
      "/spec/sections/0/body",
    ],
    ["/spec/sections/0/content/1/id", "/spec/sections/0/content/0/id"],
    ["/spec/sections/0/content/1/idOrigin", "/spec/sections/0/content/0/id"],
    [
      "/spec/sections/0/content/1/text/blocks/0/children/0/value",
      "/spec/sections/0/content/0/text",
    ],
    [
      "/spec/sections/0/sections/0/content/0/text",
      "/spec/sections/0/sections/0/body",
    ],
    ["/spec/sections/0/sections/0/id", "/spec/sections/0/sections/0"],
    ["/spec/sections/1/content", "/spec/sections/1"],
  ]) {
    expect(canonicalPath).toBeDefined();
    expect(rawPath).toBeDefined();
    if (!canonicalPath || !rawPath)
      throw new Error("Invalid source-map expectation");
    expect(canonicalLocation(canonicalPath), canonicalPath).toEqual(
      rawLocation(rawPath),
    );
    expect(canonicalLocation(canonicalPath)).toBeDefined();
  }
  expect(
    result.sourceMap.entries.some((entry) => entry.path.endsWith("/body")),
  ).toBe(false);
  expect(
    result.sourceMap.entries.some((entry) => entry.path === "/omega"),
  ).toBe(false);
  const canonicalPaths: string[] = [];
  function walk(value: unknown, path: string) {
    canonicalPaths.push(path);
    if (value !== null && typeof value === "object")
      for (const [key, child] of Object.entries(value))
        walk(child, `${path}/${key}`);
  }
  walk(result.canonical, "");
  expect(result.sourceMap.entries.map((entry) => entry.path)).toEqual(
    canonicalPaths.sort(),
  );
});

test("diagnostic_ID_paths_and_related_origins_account_for_body_shift_at_nested_depth", () => {
  const duplicate = `omega: { schema: "3.0" }
kind: artifact
spec:
  document: { title: Review }
  sections:
    - body: parent
      sections:
        - body: nested
          content:
            - id: repeated
              kind: prose
              text: first
            - id: repeated
              kind: prose
              text: second
`;
  const result = frontend.compileRawSpec(request(duplicate));
  expectFailure(result, "ids");
  const diagnostic = result.diagnostics.find(
    (entry) => entry.code === "OMEGA-ID-DUPLICATE",
  );
  expect(diagnostic).toMatchObject({
    path: "/spec/sections/0/sections/0/content/1/id",
    location: { module: "review.omega.yaml", line: 13, column: 19 },
    related: [
      {
        path: "/spec/sections/0/sections/0/content/0/id",
        location: { module: "review.omega.yaml", line: 10, column: 19 },
      },
    ],
  });
});

function expectFailure(result: CompileResult, stage: string) {
  expect(result.ok).toBe(false);
  expect(Object.keys(result).sort()).toEqual(["diagnostics", "ok"]);
  expect(result.diagnostics.length).toBeGreaterThan(0);
  expect(
    result.diagnostics.every(
      (entry) => entry.stage === stage && entry.severity === "ERROR",
    ),
    JSON.stringify(result.diagnostics),
  ).toBe(true);
}

test.each([
  [
    "duplicate YAML key",
    source.replace("kind: artifact", "kind: artifact\nkind: artifact"),
    "parse",
  ],
  ["syntax", "[unclosed", "parse"],
  [
    "unsafe authoring integer",
    source.replace("title: Review", "title: 9007199254740992"),
    "parse",
  ],
  [
    "schema version",
    source.replace('schema: "3.0"', 'schema: "9.0"'),
    "raw-validation",
  ],
  [
    "unknown field",
    source.replace("title: Review", "title: Review\n    unknown: null"),
    "raw-validation",
  ],
  [
    "null required title",
    source.replace("title: Review", "title: null"),
    "raw-validation",
  ],
  [
    "unsupported Markdown",
    source.replace("body: Alpha", 'body: "# Heading"'),
    "normalize",
  ],
  [
    "unsafe link",
    source.replace("body: Alpha", 'body: "[x](javascript:danger)"'),
    "normalize",
  ],
  [
    "duplicate IDs",
    source
      .replace("- title: First", "- id: shared\n      title: First")
      .replace("- title: Second", "- id: shared\n      title: Second"),
    "ids",
  ],
  [
    "noncanonical intent",
    source.replace("title: First", 'title: First\n      intent: "verdict\\n"'),
    "raw-validation",
  ],
])(
  "fatal_%s_exposes_diagnostics_only_and_stops_dependent_stages",
  (_name, text, stage) => {
    if (!text || !stage) throw new Error("Invalid failure fixture");
    expectFailure(frontend.compileRawSpec(request(text)), stage);
  },
);

test("logical_modules_and_invalid_UTF8_are_fatal_without_partial_hashes", () => {
  for (const module of [
    "/home/author/review.omega.yaml",
    "../escape.yaml",
    "C:\\host\\file.yaml",
  ])
    expectFailure(
      frontend.compileRawSpec({
        ...request(source),
        source: { module, text: source },
      }),
      "parse",
    );
  expectFailure(
    frontend.compileRawSpec(request(Uint8Array.of(0xc0, 0xaf))),
    "parse",
  );
});

test("binary_source_identity_and_frozen_output_are_coherent_without_freezing_callers", () => {
  const bytes = new TextEncoder().encode(walkingSource);
  const input = request(bytes);
  const before = bytes.slice();
  const result = compile(input);
  expect(bytes).toEqual(before);
  expect(Object.isFrozen(input)).toBe(false);
  expect(Object.isFrozen(input.source)).toBe(false);
  bytes[0] = 0;
  expect(result.rawSourceHash).toBe(
    createHash("sha256").update(before).digest("hex"),
  );
  const object: unknown = result;
  function checkFrozen(value: unknown) {
    if (value !== null && typeof value === "object") {
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) checkFrozen(child);
    }
  }
  checkFrozen(object);
  expect(() =>
    Reflect.set(result.canonical.spec.document, "title", "changed"),
  ).not.toThrow();
  expect(Reflect.set(result.canonical.spec.document, "title", "changed")).toBe(
    false,
  );
  expect(Reflect.set(result.canonicalBytes, "0", 0)).toBe(false);
  expect(result.canonicalString).toBe(
    frontend.canonicalizeJson(result.canonical),
  );
  expect(result.normalizedHash).toBe(
    createHash("sha256")
      .update(Buffer.from(result.canonicalBytes))
      .digest("hex"),
  );
  expect(new TextDecoder().decode(Uint8Array.from(result.canonicalBytes))).toBe(
    result.canonicalString,
  );
});

test("stage_outputs_and_source_maps_are_not_mutated_or_frozen_by_later_stages", () => {
  const parsed = frontend.parseOmegaYaml(walkingSource, "review.omega.yaml");
  if (!parsed.ok) throw new Error("Invalid source fixture");
  const validated = frontend.validateRawSpec(parsed.value, parsed.sourceMap);
  if (!validated.ok) throw new Error("Invalid validated fixture");
  const draft = frontend.normalizeRawSpec(validated.value);
  if (!draft.ok) throw new Error("Invalid draft fixture");
  const draftBefore = structuredClone(draft.value);
  const identified = frontend.assignCanonicalIds(draft.value);
  if (!identified.ok) throw new Error("Invalid identified fixture");
  const identifiedBefore = structuredClone(identified.value);
  const mutableMap: SourceMap = structuredClone(parsed.sourceMap);
  const mapBefore = structuredClone(mutableMap);
  const map = frontend.buildSourceMap(
    validated.value,
    identified.value,
    mutableMap,
  );
  expect(frontend.validateCanonicalContract(identified.value, map).ok).toBe(
    true,
  );
  frontend.canonicalizeJson(identified.value);
  expect(draft.value).toEqual(draftBefore);
  expect(identified.value).toEqual(identifiedBefore);
  expect(mutableMap).toEqual(mapBefore);
  expect(Object.isFrozen(draft.value)).toBe(false);
  expect(Object.isFrozen(identified.value)).toBe(false);
  expect(Object.isFrozen(draft.value.spec.sections[0]?.content[0]?.text)).toBe(
    false,
  );
  expect(Object.isFrozen(mutableMap.entries[0]?.location)).toBe(false);
});

test.each([
  ["", { sourceMap: {} }],
  ["/metadata", { idOriginExtra: "explicit" }],
  ["/spec", { engineVersion: "3.0.0" }],
  ["/spec/presentation", { selectedRepresentation: "card" }],
  ["/spec/document", { subtitle: "unsupported" }],
  ["/spec/sections/0", { body: "authoring shorthand" }],
  ["/spec/sections/0/content/0", { sourceLocation: {} }],
  ["/spec/sections/0/content/0/text", { rawMarkdown: "hidden" }],
  ["/spec/sections/0/content/0/text/blocks/0", { html: "hidden" }],
  ["/spec/sections/0/content/0/text/blocks/0/children/0", { toJSON: null }],
])(
  "strict_canonical_revalidation_rejects_unknown_fields_at_%s",
  (path, extra) => {
    const candidate = structuredClone(walkingCanonical);
    let target: unknown = candidate;
    for (const key of path.split("/").slice(1))
      target = (target as Record<string, unknown>)[key];
    Object.assign(target as object, extra);
    const before = structuredClone(candidate);
    const result = frontend.validateCanonicalContract(candidate);
    expect(result.ok).toBe(false);
    expect(Object.keys(result).sort()).toEqual(["diagnostics", "ok"]);
    expect(
      result.diagnostics.some(
        (entry) =>
          entry.code === "OMEGA-CANONICAL-UNKNOWN-FIELD" &&
          entry.path?.startsWith(path),
      ),
    ).toBe(true);
    expect(candidate).toEqual(before);
  },
);

test.each([
  ["/contractVersion", "3.0"],
  ["/metadata/idOrigin", null],
  ["/metadata/id", "bad\n"],
  ["/spec/document/direction", "auto"],
  ["/spec/presentation/profile", "sand"],
  ["/spec/sections/0/title", 4],
  ["/spec/sections/0/content/0/text/dialectVersion", "future"],
  ["/spec/sections/0/content/0/text/blocks/0/kind", "heading"],
])(
  "strict_canonical_revalidation_rejects_invalid_ABI_value_%s",
  (path, invalid) => {
    const candidate = structuredClone(walkingCanonical);
    const keys = path.split("/").slice(1);
    const final = keys.pop();
    let target: unknown = candidate;
    for (const key of keys) target = (target as Record<string, unknown>)[key];
    if (!final) throw new Error("Missing property in fixture");
    (target as Record<string, unknown>)[final] = invalid;
    expect(frontend.validateCanonicalContract(candidate).ok).toBe(false);
  },
);

test("strict_canonical_revalidation_requires_idOrigin_and_keeps_nearest_source_location", () => {
  const candidate = structuredClone(walkingCanonical) as {
    metadata: Record<string, unknown>;
  };
  delete candidate.metadata.idOrigin;
  const map: SourceMap = {
    entries: [
      {
        path: "/metadata",
        location: { module: "logical.yaml", line: 4, column: 2 },
      },
    ],
  };
  const result = frontend.validateCanonicalContract(candidate, map);
  expect(result).toMatchObject({
    ok: false,
    diagnostics: [
      {
        path: "/metadata/idOrigin",
        stage: "canonical-validation",
        location: { module: "logical.yaml", line: 4, column: 2 },
      },
    ],
  });
});

test.each(
  [
    undefined,
    Number.NaN,
    Infinity,
    -Infinity,
    1n,
    Symbol("value"),
    () => 1,
    new Date(0),
    new Map(),
    /pattern/,
    Object("boxed"),
    "\ud800",
    "\udfff",
    { "\ud800": 1 },
    { value: undefined },
    [undefined],
  ].map((value, index) => ({ value, index })),
)("JCS_rejects_nonJSON_or_invalid_Unicode_$index", ({ value }) => {
  expect(() => frontend.canonicalizeJson(value)).toThrow(
    frontend.CanonicalizationError,
  );
});

test("JCS_never_invokes_toJSON_getters_or_coercion_and_rejects_sparse_cycles_symbols", () => {
  let invoked = false;
  const values: unknown[] = [
    {
      toJSON() {
        invoked = true;
        return {};
      },
    },
    Object.defineProperty({}, "getter", {
      enumerable: true,
      get() {
        invoked = true;
        return "value";
      },
    }),
    Object.defineProperty({}, "hidden", { value: 1 }),
    { [Symbol("hidden")]: 1 },
    Array(1),
    Object.assign([], { property: 1 }),
    Object.assign([], { "4294967295": 1 }),
  ];
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  values.push(cycle);
  for (const value of values) {
    expect(() => frontend.canonicalizeJson(value)).toThrow(
      frontend.CanonicalizationError,
    );
    expect(frontend.validateCanonicalContract(value).ok).toBe(false);
  }
  expect(invoked).toBe(false);
  const shared = { value: 1 };
  expect(frontend.canonicalizeJson([shared, shared])).toBe(
    '[{"value":1},{"value":1}]',
  );
  const nullPrototype: object = Object.assign(
    Object.create(null),
    JSON.parse('{"__proto__":1,"value":"exact"}'),
  );
  expect(frontend.canonicalizeJson(nullPrototype)).toBe(
    '{"__proto__":1,"value":"exact"}',
  );
});

test.each([
  "\ufdd0",
  "\ufdef",
  "\ufffe",
  "\uffff",
  "\u{1fffe}",
  "\u{1ffff}",
  "\u{10fffe}",
  "\u{10ffff}",
])(
  "IJSON_noncharacters_are_rejected_in_values_and_property_names_%s",
  (character) => {
    expect(() => frontend.canonicalizeJson(character)).toThrow(
      frontend.CanonicalizationError,
    );
    expect(() => frontend.canonicalizeJson({ [character]: "value" })).toThrow(
      frontend.CanonicalizationError,
    );
  },
);

test.each([
  [
    "paragraph",
    "Human *emphasis* **strong** `exact` [link](#target)\nsoft  \nhard",
  ],
  ["blockquote", "> quoted"],
  ["bullet-list", "- one\n- two"],
  ["ordered-list", "0. first\n1. second"],
  ["code-block", "```ts\nconst value = 1;\n```"],
  ["thematic-break", "---"],
])(
  "all_supported_RichText_%s_shapes_pass_the_strict_canonical_schema",
  (kind, body) => {
    const text = JSON.stringify({
      omega: { schema: "3.0" },
      kind: "artifact",
      spec: { document: { title: "Shapes" }, sections: [{ body }] },
    });
    const result = compile(request(text));
    expect(
      result.canonical.spec.sections[0]?.content[0]?.text.blocks[0]?.kind,
    ).toBe(kind);
    expect(frontend.validateCanonicalContract(result.canonical).ok).toBe(true);
  },
);
