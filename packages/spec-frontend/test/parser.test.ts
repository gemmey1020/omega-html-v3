import { readFileSync } from "node:fs";
import type { CompileRequest } from "@omega/contracts";
import { parseOmegaYaml, type RawAstResult } from "@omega/spec-frontend";
import { expect, expectTypeOf, test } from "vitest";

function fixture(name: string): string {
  return readFileSync(
    new URL(
      `../../../qa/fixtures/raw/yaml-profile/${name}.omega.yaml`,
      import.meta.url,
    ),
    "utf8",
  );
}

test("rejects_duplicate_keys_and_aliases", () => {
  for (const [name, code] of [
    ["duplicate", "OMEGA-PARSE-DUPLICATE-KEY"],
    ["aliases", "OMEGA-PARSE-YAML-PROFILE"],
  ]) {
    const result = parseOmegaYaml(fixture(name as string), "review.omega.yaml");
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      code,
    );
    expect(result).not.toHaveProperty("value");
    expect(result).not.toHaveProperty("sourceMap");
  }
});

test("preserves_valid_arabic_multiline_text", () => {
  const result = parseOmegaYaml(fixture("arabic"), "review.omega.yaml");
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected valid Arabic fixture");
  expect(result.value).toEqual({
    body: "المشروع يعمل، لكن ما زالت هناك نقاط مفتوحة.\nالإصدار ID.v3 يبقى كما هو.\n",
    exact: "A\u030A  ID.v3",
  });
  expect(result.diagnostics).toEqual([]);
});

test.each([
  ["custom-tag", "OMEGA-PARSE-YAML-PROFILE"],
  ["legacy-tag", "OMEGA-PARSE-YAML-PROFILE"],
  ["merge", "OMEGA-PARSE-YAML-PROFILE"],
  ["non-string-key", "OMEGA-PARSE-YAML-PROFILE"],
  ["complex-key", "OMEGA-PARSE-YAML-PROFILE"],
  ["directive", "OMEGA-PARSE-YAML-PROFILE"],
  ["multiple-documents", "OMEGA-PARSE-YAML-PROFILE"],
  ["syntax", "OMEGA-PARSE-SYNTAX"],
])("rejects_profile_fixture_%s", (name, code) => {
  const result = parseOmegaYaml(fixture(name), "profile.omega.yaml");
  expect(result.ok).toBe(false);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
    code,
  );
  expect(result).not.toHaveProperty("value");
  for (const diagnostic of result.diagnostics) {
    expect(diagnostic.stage).toBe("parse");
    expect(diagnostic.severity).toBe("ERROR");
    expect(diagnostic.location?.module).toBe("profile.omega.yaml");
  }
});

test.each([
  ".nan",
  ".inf",
  "-.Inf",
  "1e999",
  "1e-999",
  "9007199254740992",
  "9007199254740993",
  "-9007199254740992",
  "0x20000000000001",
  "9007199254740992.0",
])("rejects_unsupported_number_%s", (lexeme) => {
  const result = parseOmegaYaml(`value: ${lexeme}\n`, "numbers.omega.yaml");
  expect(result.ok).toBe(false);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
    "OMEGA-PARSE-NUMBER",
  );
  expect(result.diagnostics[0]?.path).toBe("/value");
});

test("accepts_json_values_standard_tags_and_plain_string_lookalikes", () => {
  const result = parseOmegaYaml(fixture("json-model"), "values.omega.yaml");
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected compatible model");
  expect(result.value).toEqual({
    values: [
      true,
      false,
      null,
      12,
      -12,
      0.1,
      100,
      16,
      8,
      9007199254740991,
      -9007199254740991,
      "2026-10-09",
      "yes",
      "1:20",
      "1_000",
      "9007199254740993",
      ".nan",
    ],
    absent: null,
    empty: null,
    tagged: {
      string: "12",
      integer: 12,
      float: 0.1,
      boolean: true,
      nil: null,
      array: [1],
      object: { key: "value" },
    },
  });
  expect(result.value).not.toHaveProperty("missing");
});

test("accumulates_independent_errors_and_never_exposes_a_partial_ast", () => {
  const result = parseOmegaYaml(
    fixture("combined-errors"),
    "combined.omega.yaml",
  );
  expect(result.ok).toBe(false);
  const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
  expect(codes).toContain("OMEGA-PARSE-DUPLICATE-KEY");
  expect(codes).toContain("OMEGA-PARSE-YAML-PROFILE");
  expect(codes).toContain("OMEGA-PARSE-NUMBER");
  expect(codes).toContain("OMEGA-PARSE-UNICODE");
  expect(result).not.toHaveProperty("value");
  expect(result).not.toHaveProperty("sourceMap");
  const duplicate = result.diagnostics.find(
    (diagnostic) => diagnostic.code === "OMEGA-PARSE-DUPLICATE-KEY",
  );
  expect(duplicate?.path).toBe("/profile");
  expect(duplicate?.location?.line).toBe(2);
});

test("preserves_pointer_escaping_utf16_columns_exclusive_ranges_and_crlf", () => {
  for (const newline of ["\n", "\r\n"]) {
    const source =
      [
        '"a/b~c": ["😀", "س"]',
        "nested:",
        "  items:",
        "    - null",
        "    - {}",
        "    - []",
      ].join(newline) + newline;
    const result = parseOmegaYaml(source, "fragments/review.omega.yaml");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected source map fixture");
    expect(
      result.sourceMap.entries.find((entry) => entry.path === "/a~1b~0c/1")
        ?.location,
    ).toEqual({
      module: "fragments/review.omega.yaml",
      line: 1,
      column: 17,
      span: { endLine: 1, endColumn: 20 },
    });
    expect(result.sourceMap.entries.map((entry) => entry.path)).toEqual([
      "",
      "/a~1b~0c",
      "/a~1b~0c/0",
      "/a~1b~0c/1",
      "/nested",
      "/nested/items",
      "/nested/items/0",
      "/nested/items/1",
      "/nested/items/2",
    ]);
    const entry = result.sourceMap.entries.find(
      (entry) => entry.path === "/nested/items/0",
    );
    expect(entry?.location.line).toBe(4);
    expect(entry?.location.column).toBe(7);
    expect(entry?.location.span?.endColumn).toBe(11);
  }
});

test("strict_utf8_accepts_bytes_without_mutation_or_loss_of_bom_coordinates", () => {
  const source = new TextEncoder().encode("\uFEFFtitle: الحالة\n");
  const before = source.slice();
  const request: CompileRequest = {
    source: { text: source, module: "bytes.omega.yaml" },
    engineVersion: "3.0.0",
  };
  const result = parseOmegaYaml(request.source.text, request.source.module);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected UTF-8");
  expect(result.value).toEqual({ title: "الحالة" });
  expect(
    result.sourceMap.entries.find((entry) => entry.path === "")?.location
      .column,
  ).toBe(2);
  expect(source).toEqual(before);
});

test.each(
  [
    [0xff],
    [0xc0, 0xaf],
    [0xed, 0xa0, 0x80],
    [0xe2, 0x82],
    [0xff, 0xfe, 0x61, 0],
  ].map((bytes) => [bytes]),
)("rejects_non_utf8_bytes_%j", (bytes) => {
  const result = parseOmegaYaml(Uint8Array.from(bytes), "bytes.omega.yaml");
  expect(result.ok).toBe(false);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
    "OMEGA-PARSE-UTF8",
  ]);
});

test.each([
  "value: \uD800\n",
  'value: "\\uD800"\n',
  'value: "\\uDFFF"\n',
  "value: \uFDD0\n",
  'value: "\\uFFFF"\n',
])("rejects_invalid_unicode_%j", (source) => {
  const result = parseOmegaYaml(source, "unicode.omega.yaml");
  expect(result.ok).toBe(false);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
    "OMEGA-PARSE-UNICODE",
  );
});

test("preserves_protected_unicode_bidi_and_host_like_authored_strings", () => {
  const result = parseOmegaYaml(
    'value: "A\\u030A  /home/example exact \\u202BID.v3\\u202C 😀"\n',
    "exact.omega.yaml",
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected exact content");
  expect(result.value).toEqual({
    value: "A\u030A  /home/example exact \u202BID.v3\u202C 😀",
  });
});

test.each([
  "/home/example/source.yaml",
  "../source.yaml",
  "a/../source.yaml",
  "a/./source.yaml",
  "C:\\source.yaml",
  "https://example.test/source.yaml",
  "~/source.yaml",
  "a\u0000.yaml",
])("rejects_physical_or_escaping_module_%j", (module) => {
  const result = parseOmegaYaml("value: good\n", module);
  expect(result.ok).toBe(false);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
    "OMEGA-PARSE-MODULE",
  ]);
  expect(JSON.stringify(result)).not.toContain(module);
});

test("result_is_recursively_immutable_and_handles_special_object_keys", () => {
  const result = parseOmegaYaml(
    "__proto__: {polluted: true}\nconstructor: value\nitems: [one]\n",
    "immutable.omega.yaml",
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected valid string keys");
  expect(Object.hasOwn(result.value as object, "__proto__")).toBe(true);
  expect(JSON.parse(JSON.stringify(result.value))).toEqual({
    ["__proto__"]: { polluted: true },
    constructor: "value",
    items: ["one"],
  });
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.value)).toBe(true);
  expect(
    Object.isFrozen((result.value as { items: readonly string[] }).items),
  ).toBe(true);
  expect(Object.isFrozen(result.sourceMap.entries[0]?.location.span)).toBe(
    true,
  );
  expect(Object.isFrozen(result.diagnostics)).toBe(true);
  expectTypeOf<Extract<RawAstResult, { ok: false }>>().not.toHaveProperty(
    "value",
  );
  expectTypeOf<Extract<RawAstResult, { ok: false }>>().not.toHaveProperty(
    "sourceMap",
  );
});

test.each(["", "# comment\n", "null\n", "[]\n", "42\n", "plain string\n"])(
  "leaves_root_schema_validation_to_the_next_stage_%j",
  (source) => {
    expect(parseOmegaYaml(source, "root.omega.yaml").ok).toBe(true);
  },
);

const sourceErrors = JSON.parse(
  readFileSync(
    new URL(
      "../../../qa/fixtures/raw/yaml-profile/source-errors.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { nonprintables: { code: number; source: string }[]; unicode: string };

test.each(sourceErrors.nonprintables)(
  "rejects_raw_yaml_nonprintable_$code",
  ({ source }) => {
    const result = parseOmegaYaml(source, "controls.omega.yaml");
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "OMEGA-PARSE-UNICODE",
    );
  },
);

test("allows_escaped_json_controls_and_keeps_independent_source_errors", () => {
  const valid = parseOmegaYaml('value: "\\u0000\\t"\n', "controls.omega.yaml");
  expect(valid.ok).toBe(true);
  if (!valid.ok) throw new Error("Expected escaped JSON controls");
  expect(valid.value).toEqual({ value: "\u0000\t" });
  const invalid = parseOmegaYaml(sourceErrors.unicode, "unicode.omega.yaml");
  expect(invalid.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
    "OMEGA-PARSE-DUPLICATE-KEY",
  );
  expect(invalid.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
    "OMEGA-PARSE-UNICODE",
  );
});

test.each([
  "%YAML 1.1",
  "%YAML 1.3",
  "%TAG ! tag:example.test:",
  "%TAG !! tag:yaml.org,2002:",
  "%UNKNOWN value",
])("rejects_profile_altering_directive_%j", (directive) => {
  const result = parseOmegaYaml(
    `${directive}\n---\nvalue: text\n`,
    "directive.omega.yaml",
  );
  expect(result.ok).toBe(false);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
    "OMEGA-PARSE-YAML-PROFILE",
  );
});

// Package and root typechecks verify the gate and recursive readonly output.
function rejectInvalidAst(result: RawAstResult) {
  // @ts-expect-error parse diagnostics are readonly
  result.diagnostics.push();
  if (result.ok) {
    // @ts-expect-error sidecar entry array is readonly
    result.sourceMap.entries.push();
    // @ts-expect-error output cannot be reassigned
    result.value = null;
  } else {
    // @ts-expect-error failed stage cannot expose usable AST
    void result.value;
  }
}
void rejectInvalidAst;

test("turns_excessive_nesting_into_a_failed_parse_gate", () => {
  const source = `${"[".repeat(5000)}0${"]".repeat(5000)}`;
  const result = parseOmegaYaml(source, "nested.omega.yaml");
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty("value");
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
    "OMEGA-PARSE-SYNTAX",
  );
});
