import type { JsonValue, SourceMap } from "@omega/contracts";
import * as frontend from "@omega/spec-frontend";
import {
  type NormalizationResult,
  normalizeRawSpec,
} from "@omega/spec-frontend";
import { expect, test } from "vitest";

type Result = NormalizationResult;

function normalize(
  sections: JsonValue[],
  document: JsonValue = { title: "Review" },
  extra: Record<string, JsonValue> = {},
  sourceMap: SourceMap = { entries: [] },
) {
  const raw = frontend.validateRawSpec(
    {
      omega: { schema: "3.0" },
      kind: "artifact",
      spec: { document, sections, ...extra },
    },
    sourceMap,
  );
  if (!raw.ok) throw new Error(JSON.stringify(raw.diagnostics));
  return normalizeRawSpec(raw.value, { sourceMap });
}

function draft(result: Result) {
  expect(result.ok).toBe(true);
  expect(result.diagnostics).toEqual([]);
  if (!result.ok) throw new Error("Expected valid normalized draft");
  return result.value;
}

test("body_shorthand_normalizes_without_inventing_meaning", () => {
  const value = draft(normalize([{ title: "Status", body: "Running." }]));
  expect(value.spec).toMatchObject({
    target: "standalone-html",
    presentation: { profile: "prime" },
    document: { title: "Review", language: "und", direction: "ltr" },
  });
  expect(value.spec.sections).toEqual([
    {
      title: "Status",
      intent: "narrative",
      content: [
        {
          kind: "prose",
          text: {
            dialect: "commonmark",
            dialectVersion: "0.31.2",
            blocks: [
              {
                kind: "paragraph",
                children: [{ kind: "text", value: "Running." }],
              },
            ],
          },
        },
      ],
      sections: [],
    },
  ]);
  expect(value.metadata).toEqual({});
  expect(JSON.stringify(value)).not.toMatch(/representation|"body"|"id"/);
});

test("body_then_content_preserves_ids_intents_nested_sequence_and_untitled_sections", () => {
  const value = draft(
    normalize(
      [
        {
          id: "state",
          intent: "verdict",
          title: null,
          body: "first",
          content: [
            { kind: "prose", text: "second" },
            { id: "last", kind: "prose", text: "third" },
          ],
          sections: [{ body: "child" }],
        },
        { content: [{ kind: "prose", text: "explicit" }] },
        { body: "empty containers", content: [], sections: [] },
        { body: "parent", sections: [{ body: "nested" }] },
        {},
      ],
      { title: "Review", language: "en" },
      { target: "standalone-html", presentation: { profile: "cyan" } },
    ),
  );
  expect(value.spec).toMatchObject({
    target: "standalone-html",
    presentation: { profile: "cyan" },
  });
  const sections = value.spec.sections;
  expect(sections[0]).toMatchObject({
    id: "state",
    title: null,
    intent: "verdict",
  });
  expect(sections[0]?.content.map((b) => b.text.blocks)).toEqual(
    ["first", "second", "third"].map((value) => [
      { kind: "paragraph", children: [{ kind: "text", value }] },
    ]),
  );
  expect(sections[0]?.content[2]?.id).toBe("last");
  expect(sections[0]?.sections[0]).toMatchObject({
    title: null,
    intent: "narrative",
  });
  expect(sections[1]).not.toHaveProperty("intent");
  expect(sections[2]?.intent).toBe("narrative");
  expect(sections[3]).not.toHaveProperty("intent");
  expect(sections[4]).toEqual({ title: null, content: [], sections: [] });
});

test.each(["prime", "silver", "gold", "cyan"])(
  "preserves_profile_%s",
  (profile) => {
    expect(
      draft(normalize([], undefined, { presentation: { profile } })).spec,
    ).toMatchObject({ presentation: { profile } });
  },
);

test.each([
  ["ar", "rtl"],
  ["ar-EG", "rtl"],
  ["AR-eg", "rtl"],
  ["fa", "rtl"],
  ["he-IL", "rtl"],
  ["ur-PK", "rtl"],
  ["en-Arab", "rtl"],
  ["und-Hebr", "rtl"],
  ["ar-Latn", "ltr"],
  ["en", "ltr"],
  ["und", "ltr"],
  ["unrecognized", "ltr"],
])("derives_direction_from_declared_language_%s", (language, direction) => {
  expect(
    draft(
      normalize([{ body: "English plus عربي" }], { title: "الحالة", language }),
    ).spec.document,
  ).toEqual({ title: "الحالة", language, direction });
});

test("does_not_detect_language_from_arabic_prose", () => {
  expect(
    draft(normalize([{ body: "العربية" }], { title: "مراجعة" })).spec.document,
  ).toEqual({ title: "مراجعة", language: "und", direction: "ltr" });
});

test("parses_before_NFC_and_preserves_CommonMark_code_link_title_and_info_output", () => {
  const source =
    'Cafe\u0301 ا\u0654 **Cafe\u0301** *test* ` A\u030A  ID `\n[link](https://example.test/A\u030A "A\u030A &amp; title")  \nnext\n\n``` A\u030A &amp;\nA\u030A  ID\n```';
  const value = draft(
    normalize([{ title: "Cafe\u0301", body: source }], {
      title: "Cafe\u0301",
      language: "ar",
    }),
  );
  expect(value.spec.document.title).toBe("Café");
  expect(value.spec.sections[0]?.title).toBe("Café");
  expect(value.spec.sections[0]?.content[0]?.text.blocks).toEqual([
    {
      kind: "paragraph",
      children: [
        { kind: "text", value: "Café أ " },
        { kind: "strong", children: [{ kind: "text", value: "Café" }] },
        { kind: "text", value: " " },
        { kind: "emphasis", children: [{ kind: "text", value: "test" }] },
        { kind: "text", value: " " },
        { kind: "inline-code", value: "A\u030A  ID" },
        { kind: "soft-break" },
        {
          kind: "link",
          destination: "https://example.test/A%CC%8A",
          title: "A\u030A & title",
          children: [{ kind: "text", value: "link" }],
        },
        { kind: "text", value: "" },
        { kind: "hard-break" },
        { kind: "text", value: "next" },
      ],
    },
    { kind: "code-block", value: "A\u030A  ID\n", info: "A\u030A &" },
  ]);
});

test("maps_CommonMark_quote_lists_code_and_thematic_break_without_renderer_choices", () => {
  const text = draft(
    normalize([
      {
        body: "> quoted\n\n- one\n- two\n\n3. first\n\n4. second\n\n---\n\n    exact  code\n",
      },
    ]),
  ).spec.sections[0]?.content[0]?.text;
  const p = (value: string) => ({
    kind: "paragraph",
    children: [{ kind: "text", value }],
  });
  expect(text?.blocks).toEqual([
    { kind: "blockquote", blocks: [p("quoted")] },
    {
      kind: "bullet-list",
      tight: true,
      items: [{ blocks: [p("one")] }, { blocks: [p("two")] }],
    },
    {
      kind: "ordered-list",
      start: 3,
      tight: false,
      items: [{ blocks: [p("first")] }, { blocks: [p("second")] }],
    },
    { kind: "thematic-break" },
    { kind: "code-block", value: "exact  code\n", info: null },
  ]);
});

test.each([
  "# heading",
  "heading\n===",
  "<div>html</div>",
  "text <em>html</em>",
  "![image](./x.png)",
  "> - # nested",
])("rejects_unsupported_prose_%s_without_partial_draft", (body) => {
  const result = normalize([{ body }]);
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty("value");
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "OMEGA-NORMALIZE-UNSUPPORTED-NODE",
        severity: "ERROR",
        stage: "normalize",
        path: "/spec/sections/0/body",
      }),
    ]),
  );
});

test.each([
  "javascript:alert(1)",
  "data:text/plain,hi",
  "vbscript:go",
  "file:///host",
  "JaVaScRiPt:x",
])("rejects_unapproved_scheme_%s", (destination) => {
  const result = normalize([{ body: `[label](<${destination}>)` }]);
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty("value");
  expect(result.diagnostics[0]).toMatchObject({
    code: "OMEGA-NORMALIZE-UNSAFE-LINK",
    path: "/spec/sections/0/body",
  });
});

test.each([
  "https://example.test",
  "HTTP://example.test",
  "mailto:jemy@example.test",
  "../relative",
  "#section",
  "//example.test",
  "",
])("preserves_allowed_destination_%s", (destination) => {
  const block = draft(normalize([{ body: `[label](<${destination}>)` }])).spec
    .sections[0]?.content[0]?.text.blocks[0];
  expect(block).toMatchObject({ children: [{ kind: "link", destination }] });
});

test("accumulates_stable_diagnostics_with_source_context_in_content_order", () => {
  const sourceMap: SourceMap = {
    entries: [
      {
        path: "/spec/sections/0/body",
        location: { module: "review.omega.yaml", line: 8, column: 7 },
      },
    ],
  };
  const result = normalize(
    [
      {
        body: "# bad\n\n![image](x)",
        content: [{ kind: "prose", text: "<div>bad</div>" }],
      },
      { body: "[link](javascript:x)" },
    ],
    undefined,
    {},
    sourceMap,
  );
  expect(result.diagnostics.map((d) => [d.code, d.path])).toEqual([
    ["OMEGA-NORMALIZE-UNSUPPORTED-NODE", "/spec/sections/0/body"],
    ["OMEGA-NORMALIZE-UNSUPPORTED-NODE", "/spec/sections/0/body"],
    ["OMEGA-NORMALIZE-UNSUPPORTED-NODE", "/spec/sections/0/content/0/text"],
    ["OMEGA-NORMALIZE-UNSAFE-LINK", "/spec/sections/1/body"],
  ]);
  expect(result.diagnostics[0]).toMatchObject({
    location: sourceMap.entries[0]?.location,
    context: { nodeType: "heading", markdownLine: 1, markdownColumn: 1 },
  });
});

test("normalization_is_deterministic_and_never_mutates_deep_frozen_raw_or_context", () => {
  const raw = frontend.validateRawSpec(
    {
      omega: { schema: "3.0" },
      kind: "artifact",
      metadata: { id: "Review.ID_1" },
      spec: {
        document: { title: "Cafe\u0301", language: "ar" },
        sections: [{ title: null, body: "`A\u030A`" }],
      },
    },
    { entries: [] },
  );
  if (!raw.ok) throw new Error("Invalid fixture");
  function freeze(value: unknown) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  }
  const context = { sourceMap: { entries: [] } };
  const before = JSON.stringify(raw.value);
  freeze(raw.value);
  freeze(context);
  const first = draft(normalizeRawSpec(raw.value, context));
  expect(first).toEqual(draft(normalizeRawSpec(raw.value, context)));
  expect(first.metadata).toEqual({ id: "Review.ID_1" });
  expect(first.metadata).not.toBe(raw.value.metadata);
  expect(first.spec.document).not.toBe(raw.value.spec.document);
  expect(JSON.stringify(raw.value)).toBe(before);
  expect(context).toEqual({ sourceMap: { entries: [] } });
});
