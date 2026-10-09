import { createHash } from "node:crypto";
import type {
  CanonicalContract,
  CanonicalSection,
  DraftCanonicalContract,
  JsonValue,
  RichTextBlock,
  SourceMap,
} from "@omega/contracts";
import { expect, test } from "vitest";
import * as frontend from "../src/index.js";
import { normalizeRichText } from "../src/normalizer/text.js";

const location = { module: "depth.omega.yaml", line: 7, column: 9 };
const sourceMap: SourceMap = { entries: [{ path: "", location }] };
const bodyPath = "/spec/sections/0/body";
function raw(body = "text"): frontend.RawArtifactSpec {
  return {
    omega: { schema: "3.0" },
    kind: "artifact",
    spec: { document: { title: "Nesting probe" }, sections: [{ body }] },
  };
}
function compile(value: JsonValue | frontend.RawArtifactSpec) {
  return frontend.compileRawSpec({
    source: { module: location.module, text: JSON.stringify(value) },
    engineVersion: "3.0.0",
  });
}
function arrays(depth: number): JsonValue {
  let value: JsonValue = "text";
  for (let i = 0; i < depth; i++) value = [value];
  return value;
}
function sections(depth: number, body?: string): frontend.RawArtifactSpec {
  let value: frontend.RawSection = body === undefined ? {} : { body };
  for (let i = 1; i < depth; i++) value = { sections: [value] };
  return {
    ...raw(),
    spec: { document: { title: "Sections" }, sections: [value] },
  };
}
function canonicalQuotes(depth: number): CanonicalContract {
  // Construct directly: the normalizer must no longer produce the old probe.
  let block: RichTextBlock = {
    kind: "paragraph",
    children: [{ kind: "text", value: "text" }],
  };
  for (let i = 0; i < depth; i++)
    block = { kind: "blockquote", blocks: [block] };
  return {
    contractVersion: "1.0",
    kind: "artifact",
    metadata: { id: "artifact", idOrigin: "explicit" },
    spec: {
      target: "standalone-html",
      presentation: { profile: "prime" },
      document: { title: "Nesting probe", language: "und", direction: "ltr" },
      sections: [
        {
          id: "section",
          idOrigin: "explicit",
          title: null,
          sections: [],
          content: [
            {
              id: "prose",
              idOrigin: "explicit",
              kind: "prose",
              text: {
                dialect: "commonmark",
                dialectVersion: "0.31.2",
                blocks: [block],
              },
            },
          ],
        },
      ],
    },
  };
}
function failure(
  result: { ok: boolean; diagnostics: readonly unknown[] },
  code: string,
  stage: string,
) {
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code, stage, severity: "ERROR" }),
    ]),
  );
  for (const key of [
    "value",
    "canonical",
    "canonicalString",
    "canonicalBytes",
    "rawSourceHash",
    "normalizedHash",
  ])
    expect(result).not.toHaveProperty(key);
}

test.each([1024, 2000, 4096])(
  "public compiler diagnoses original %i-quote overflow before conversion",
  (depth) => {
    const value = raw(`${"> ".repeat(depth)}text`);
    const result = compile(value);
    failure(result, "OMEGA-NORMALIZE-MARKDOWN-DEPTH", "normalize");
    expect(result.diagnostics[0]).toMatchObject({
      path: bodyPath,
      location: { module: location.module, line: 1 },
      context: { maxDepth: 128, depth: 129 },
    });
    expect(Object.isFrozen(result)).toBe(true);
  },
);

test.each([129, 8192])(
  "generic JCS rejects %i JSON containers with its domain error",
  (depth) => {
    try {
      frontend.canonicalizeJson(arrays(depth));
      throw new Error("Expected depth rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(frontend.CanonicalizationError);
      expect(error).toMatchObject({ path: "/0".repeat(128), reason: "depth" });
    }
  },
);

test("generic JSON boundary128 serializes fully and canonical validator fails only schema", () => {
  const value = arrays(128);
  expect(frontend.canonicalizeJson(value)).toBe(
    `${"[".repeat(128)}"text"${"]".repeat(128)}`,
  );
  failure(
    frontend.validateCanonicalContract(value),
    "OMEGA-CANONICAL-TYPE",
    "canonical-validation",
  );
});

test.each([129, 8192])(
  "canonical validator returns a fatal depth result for generic depth%i",
  (depth) => {
    const result = frontend.validateCanonicalContract(arrays(depth), sourceMap);
    failure(result, "OMEGA-CANONICAL-DEPTH", "canonical-validation");
    expect(result.diagnostics[0]).toMatchObject({
      path: "/0".repeat(128),
      location,
    });
  },
);

test("canonical-shaped depth2000 is rejected by validator and JCS without incidental RangeError", () => {
  const value = canonicalQuotes(2000);
  const result = frontend.validateCanonicalContract(value, sourceMap);
  failure(result, "OMEGA-CANONICAL-DEPTH", "canonical-validation");
  expect(result.diagnostics[0]).toMatchObject({
    path: `/spec/sections/0/content/0/text/blocks/0${"/blocks/0".repeat(60)}`,
    location,
  });
  expect(() => frontend.canonicalizeJson(value)).toThrow(
    frontend.CanonicalizationError,
  );
});

test("Raw validator checks JSON depth before AJV, with nearest true source origin", () => {
  const value = sections(64);
  const result = frontend.validateRawSpec(
    value as unknown as JsonValue,
    sourceMap,
  );
  failure(result, "OMEGA-SCHEMA-DEPTH", "raw-validation");
  expect(result.diagnostics[0]).toMatchObject({
    path: `/spec/sections/0${"/sections/0".repeat(62)}/sections`,
    location,
  });
});

test("direct normalizer guards Raw recursion before reading or converting sections", () => {
  const result = frontend.normalizeRawSpec(sections(2000), { sourceMap });
  failure(result, "OMEGA-NORMALIZE-DEPTH", "normalize");
  expect(result.diagnostics[0]).toMatchObject({ location });
});

test("direct ID pass guards the composed draft before recursive section allocation", () => {
  const canonical = canonicalQuotes(2000);
  const value: DraftCanonicalContract = {
    ...canonical,
    metadata: {},
    spec: {
      ...canonical.spec,
      sections: canonical.spec.sections.map((section) => ({
        title: section.title,
        sections: [],
        content: section.content.map((block) => ({
          kind: block.kind,
          text: block.text,
        })),
      })),
    },
  };
  const result = frontend.assignCanonicalIds(value);
  failure(result, "OMEGA-ID-DEPTH", "ids");
  expect(result.diagnostics[0]?.path).toMatch(
    /^\/spec\/sections\/0\/content\/0\/text\/blocks\/0/,
  );
});

test.each([58, 59])(
  "compiler preserves admitted quotes and fails composed JSON depth at %i quotes",
  (depth) => {
    const result = compile(raw(`${"> ".repeat(depth)}text`));
    if (depth === 59) {
      failure(result, "OMEGA-NORMALIZE-DEPTH", "normalize");
      expect(result.diagnostics[0]).toMatchObject({
        path: bodyPath,
        location: { module: location.module, line: 1 },
      });
    } else {
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected admitted boundary control");
      expect(result.normalizedHash).toBe(
        createHash("sha256").update(result.canonicalString).digest("hex"),
      );
      expect(Object.isFrozen(result.canonical)).toBe(true);
      let block = result.canonical.spec.sections[0]?.content[0]?.text.blocks[0];
      let count = 0;
      while (block?.kind === "blockquote") {
        count++;
        block = block.blocks[0];
      }
      expect(count).toBe(58);
      expect(block).toEqual({
        kind: "paragraph",
        children: [{ kind: "text", value: "text" }],
      });
    }
  },
);

test("normalizer counts section ancestry with prose, rather than separate allowances", () => {
  const result = frontend.normalizeRawSpec(
    sections(50, `${"> ".repeat(12)}text`),
    { sourceMap },
  );
  failure(result, "OMEGA-NORMALIZE-DEPTH", "normalize");
  expect(result.diagnostics[0]).toMatchObject({
    path: `/spec/sections/0${"/sections/0".repeat(49)}/body`,
    location,
  });
});

test("deep section success remains owned and hash-coherent through final copy/freeze", () => {
  const input = sections(62);
  const before = JSON.stringify(input);
  const result = compile(input);
  expect(result.ok).toBe(true);
  expect(JSON.stringify(input)).toBe(before);
  expect(Object.isFrozen(input)).toBe(false);
  if (!result.ok) throw new Error("Expected depth127 canonical sections");
  expect(Object.isFrozen(result.sourceMap.entries)).toBe(true);
  expect(result.canonicalBytes).toEqual(
    Array.from(new TextEncoder().encode(result.canonicalString)),
  );
});

test("Canonical JSON exact boundary128 succeeds, boundary129 fails without partial value", () => {
  const value = canonicalQuotes(0);
  const first = value.spec.sections[0];
  if (!first) throw new Error("Missing fixture");
  let deepest: CanonicalSection = first;
  for (let i = 1; i < 61; i++) {
    const next: CanonicalSection = { ...deepest, content: [], sections: [] };
    (deepest as unknown as { sections: unknown[] }).sections = [next];
    deepest = next;
  }
  (deepest as unknown as { content: unknown[] }).content = [
    {
      ...value.spec.sections[0]?.content[0],
      text: { dialect: "commonmark", dialectVersion: "0.31.2", blocks: [] },
    },
  ];
  expect(frontend.validateCanonicalContract(value).ok).toBe(true);
  expect(frontend.canonicalizeJson(value)).toContain('"blocks":[]');
  const text = deepest.content[0]?.text;
  if (!text) throw new Error("Missing text fixture");
  (text as unknown as { blocks: unknown[] }).blocks = [
    { kind: "thematic-break" },
  ];
  failure(
    frontend.validateCanonicalContract(value),
    "OMEGA-CANONICAL-DEPTH",
    "canonical-validation",
  );
});

test.each([
  ["quotes", `${"> ".repeat(126)}text`],
  ["lists", `${"- ".repeat(63)}text`],
  ["inline", `${"*".repeat(252)}text${"*".repeat(252)}`],
])(
  "CommonMark AST preflight handles %s nesting before recursive conversion",
  (_name, text) => {
    const result = normalizeRichText(text, bodyPath, { sourceMap });
    failure(result, "OMEGA-NORMALIZE-MARKDOWN-DEPTH", "normalize");
    expect(result.diagnostics[0]).toMatchObject({
      path: bodyPath,
      location,
      context: { maxDepth: 128, depth: 129 },
    });
  },
);

test("AST boundary128 passes AST check then fails converted JSON depth with true scalar context", () => {
  const result = normalizeRichText(`${"> ".repeat(125)}text`, bodyPath, {
    sourceMap,
  });
  failure(result, "OMEGA-NORMALIZE-DEPTH", "normalize");
  expect(result.diagnostics[0]).toMatchObject({ path: bodyPath, location });
  expect(result.diagnostics).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "OMEGA-NORMALIZE-MARKDOWN-DEPTH" }),
    ]),
  );
});

test.each(["> > quoted", "- - item", "***inline***", "> - ***inline***"])(
  "ordinary supported nested prose preserves structure: %s",
  (body) => {
    const result = compile(raw(body));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ordinary prose");
    expect(frontend.validateCanonicalContract(result.canonical).ok).toBe(true);
  },
);

test("migration callback output depth is checked before serialization and has no generated source", () => {
  const registry = frontend.createMigrationRegistry([
    {
      id: "synthetic-depth-only",
      fromVersion: "2.0",
      toVersion: "3.0",
      migrate: () => arrays(8192),
    },
  ]);
  const result = frontend.migrateRawSpec(
    { module: location.module, text: 'omega: {schema: "2.0"}\n' },
    "3.0",
    registry,
  );
  failure(result, "OMEGA-MIGRATION-DEPTH", "migration");
  expect(result).not.toHaveProperty("source");
  expect(result.steps).toEqual([]);
  expect(result.diagnostics[0]).toMatchObject({
    path: "/0".repeat(128),
    context: { adapterId: "synthetic-depth-only" },
  });
});

test("Raw model preflight rejects accessors and cycles without invoking them", () => {
  let invoked = 0;
  const value = raw() as unknown as Record<string, unknown>;
  Object.defineProperty(value, "unexpected", {
    enumerable: true,
    get() {
      invoked++;
      return arrays(8192);
    },
  });
  failure(
    frontend.validateRawSpec(value as JsonValue, sourceMap),
    "OMEGA-SCHEMA-JSON-MODEL",
    "raw-validation",
  );
  expect(invoked).toBe(0);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  failure(
    frontend.validateRawSpec(cyclic as JsonValue, sourceMap),
    "OMEGA-SCHEMA-JSON-MODEL",
    "raw-validation",
  );
});

test("parser rejects JSON/YAML depth129 before recursive conversion and preserves boundary128", () => {
  expect(
    frontend.parseOmegaYaml(
      `${"[".repeat(128)}0${"]".repeat(128)}`,
      location.module,
    ).ok,
  ).toBe(true);
  const result = frontend.parseOmegaYaml(
    `${"[".repeat(129)}0${"]".repeat(129)}`,
    location.module,
  );
  failure(result, "OMEGA-PARSE-DEPTH", "parse");
  expect(result.diagnostics[0]).toMatchObject({
    path: "/0".repeat(128),
    location: { module: location.module, line: 1, column: 129 },
  });
});

test("astral noncharacter source span covers the point once and retains scalar diagnostics", () => {
  const result = frontend.parseOmegaYaml(
    "a: \u{1FFFE}\n",
    "unicode.omega.yaml",
  );
  expect(result.ok).toBe(false);
  const source = result.diagnostics.filter(
    (d) => d.message === "Source contains invalid Unicode text.",
  );
  expect(source).toHaveLength(1);
  expect(source[0]).toMatchObject({
    code: "OMEGA-PARSE-UNICODE",
    severity: "ERROR",
    stage: "parse",
    location: {
      module: "unicode.omega.yaml",
      line: 1,
      column: 4,
      span: { endLine: 1, endColumn: 6 },
    },
  });
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "OMEGA-PARSE-UNICODE",
        path: "/a",
        location: expect.objectContaining({ column: 4 }),
      }),
    ]),
  );
  expect(result.diagnostics.some((d) => d.location?.column === 5)).toBe(false);
});

test.each(["\uFFFE", "\uD800", "\uDC00"])(
  "BMP or lone-surrogate source retains one-unit span: %s",
  (point) => {
    const result = frontend.parseOmegaYaml(
      `a: ${point}\n`,
      "unicode.omega.yaml",
    );
    expect(result.ok).toBe(false);
    const diagnostic = result.diagnostics.find(
      (d) => d.message === "Source contains invalid Unicode text.",
    );
    expect(diagnostic?.location).toMatchObject({
      column: 4,
      span: { endColumn: 5 },
    });
  },
);

test("Unicode scan retains later independent noncharacters and structural failures", () => {
  const result = frontend.parseOmegaYaml(
    "a: \u{1FFFE}\nb: \uFFFE\na: duplicate\n",
    "unicode.omega.yaml",
  );
  expect(result.ok).toBe(false);
  expect(
    result.diagnostics
      .filter((d) => d.message === "Source contains invalid Unicode text.")
      .map((d) => d.location?.line),
  ).toEqual([1, 2]);
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "OMEGA-PARSE-DUPLICATE-KEY" }),
    ]),
  );
});

test.each(["&#xFFFE;", "&#x1FFFE;"])(
  "generated noncharacter remains a model diagnostic, not a depth failure: %s",
  (body) => {
    const result = normalizeRichText(body, bodyPath, { sourceMap });
    failure(result, "OMEGA-NORMALIZE-JSON-MODEL", "normalize");
    expect(result.diagnostics[0]).toMatchObject({ path: bodyPath, location });
    expect(result.diagnostics[0]).not.toHaveProperty("context.depth");
  },
);

test("compiler copies/freezes a representable exact JSON boundary128", () => {
  const result = compile(sections(61, ""));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected admitted depth128");
  expect(Object.isFrozen(result.canonical)).toBe(true);
  expect(result.normalizedHash).toBe(
    createHash("sha256").update(result.canonicalString).digest("hex"),
  );
});

test.each([
  ["list", 29, true],
  ["list", 30, false],
  ["inline", 58, true],
  ["inline", 59, false],
])(
  "composed JSON boundary for %s at %i retains meaning or returns fatal result",
  (kind, depth, admitted) => {
    const body =
      kind === "list"
        ? `${"- ".repeat(depth)}text`
        : `${"*".repeat(depth * 2)}text${"*".repeat(depth * 2)}`;
    const result = compile(raw(body));
    expect(result.ok).toBe(admitted);
    if (!admitted) failure(result, "OMEGA-NORMALIZE-DEPTH", "normalize");
    if (result.ok) {
      expect(result.canonicalString).toContain('"value":"text"');
      expect(
        result.canonicalString.match(
          new RegExp(
            `"kind":"${kind === "list" ? "bullet-list" : "strong"}"`,
            "g",
          ),
        ),
      ).toHaveLength(depth);
    }
  },
);

test("composed depth diagnostic uses explicit content scalar origin", () => {
  const value = sections(50);
  let section = value.spec.sections[0];
  while (section?.sections?.[0]) section = section.sections[0];
  if (!section) throw new Error("Expected innermost section");
  Object.assign(section, {
    content: [{ kind: "prose", text: `${"> ".repeat(12)}text` }],
  });
  const result = frontend.normalizeRawSpec(value, { sourceMap });
  failure(result, "OMEGA-NORMALIZE-DEPTH", "normalize");
  expect(result.diagnostics[0]).toMatchObject({
    path: `/spec/sections/0${"/sections/0".repeat(49)}/content/0/text`,
    location,
  });
});

test("plain-data preflights do not swallow arbitrary trusted Proxy errors", () => {
  const cause = new Error("trusted Proxy defect");
  const value = new Proxy(
    {},
    {
      ownKeys() {
        throw cause;
      },
    },
  );
  expect(() => frontend.canonicalizeJson(value)).toThrow(cause);
  expect(() => frontend.validateCanonicalContract(value)).toThrow(cause);
  const registry = frontend.createMigrationRegistry([
    {
      id: "synthetic-proxy-only",
      fromVersion: "2.0",
      toVersion: "3.0",
      migrate: () => value,
    },
  ]);
  expect(() =>
    frontend.migrateRawSpec(
      { module: location.module, text: 'omega: {schema: "2.0"}\n' },
      "3.0",
      registry,
    ),
  ).toThrow(cause);
});

test.each([
  [{ value: "text" }, "OMEGA-CANONICAL-REQUIRED", "kind"],
  [{ kind: "heading", value: "text" }, "OMEGA-CANONICAL-CONST", "kind"],
  [{ kind: 3, value: "text" }, "OMEGA-CANONICAL-CONST", "kind"],
  [
    { kind: "text", value: "text", unexpected: true },
    "OMEGA-CANONICAL-UNKNOWN-FIELD",
    "unexpected",
  ],
  [{ kind: "strong", children: "wrong" }, "OMEGA-CANONICAL-TYPE", "children"],
  [
    { kind: "strong", children: [{ kind: "text" }] },
    "OMEGA-CANONICAL-REQUIRED",
    "children/0/value",
  ],
])(
  "conditional recursive dispatch retains strict inline rejection: %j",
  (node, code, suffix) => {
    const value = canonicalQuotes(0);
    const block = value.spec.sections[0]?.content[0]?.text.blocks[0];
    Object.assign(block as object, { children: [node] });
    const result = frontend.validateCanonicalContract(value, sourceMap);
    failure(result, code, "canonical-validation");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code,
          path: `/spec/sections/0/content/0/text/blocks/0/children/0/${suffix}`,
          location,
        }),
      ]),
    );
  },
);

test("conditional list dispatch retains malformed nested matching-child errors", () => {
  const value = canonicalQuotes(0);
  const text = value.spec.sections[0]?.content[0]?.text;
  Object.assign(text as object, {
    blocks: [
      {
        kind: "bullet-list",
        tight: true,
        items: [
          {
            blocks: [
              { kind: "ordered-list", start: 1, tight: true, items: "wrong" },
            ],
          },
        ],
      },
    ],
  });
  const result = frontend.validateCanonicalContract(value, sourceMap);
  failure(result, "OMEGA-CANONICAL-TYPE", "canonical-validation");
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "OMEGA-CANONICAL-TYPE",
        path: "/spec/sections/0/content/0/text/blocks/0/items/0/blocks/0/items",
        location,
      }),
    ]),
  );
});

test("direct source-map builder rejects original Canonical depth2000 with its domain error before traversal", () => {
  try {
    frontend.buildSourceMap(raw(), canonicalQuotes(2000), sourceMap);
    throw new Error("Expected depth rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(frontend.CanonicalizationError);
    expect(error).toMatchObject({
      reason: "depth",
      path: `/spec/sections/0/content/0/text/blocks/0${"/blocks/0".repeat(60)}`,
    });
  }
});

test("direct source-map builder preserves exact Canonical boundary128 and true scalar ancestry", () => {
  const input = sections(61, "");
  const result = compile(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected admitted Canonical boundary128");
  const map = frontend.buildSourceMap(input, result.canonical, sourceMap);
  expect(map.entries).toEqual(
    expect.arrayContaining([
      {
        path: `/spec/sections/0${"/sections/0".repeat(60)}/content/0/text/blocks`,
        location,
      },
    ]),
  );
  expect(Object.isFrozen(input)).toBe(false);
});
