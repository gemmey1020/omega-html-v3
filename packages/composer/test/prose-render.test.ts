import { createMinimalCapabilityRegistry } from "@omega/capability-registry";
import type { CanonicalContract, RichTextBlock } from "@omega/contracts";
import {
  createMinimalPlan,
  type MinimalRenderPlan,
  type PlannedSection,
} from "@omega/presentation-engine";
import { compileRawSpec } from "@omega/spec-frontend";
import { describe, expect, test } from "vitest";
import { renderPrimeProse } from "../src/index.js";

function fixture(blocks?: readonly RichTextBlock[]): MinimalRenderPlan {
  const compiled = compileRawSpec({
    source: {
      module: "fixture.omega.yaml",
      text: `omega: {schema: '3.0'}
kind: artifact
metadata: {id: report}
spec:
  document: {title: 'تقرير Prime', language: ar}
  sections:
    - id: intro
      title: المقدمة
      body: Hello **reader**.
      sections:
        - id: nested
          title: التفاصيل
          body: Child
    - id: empty
`,
    },
    engineVersion: "0.0.0",
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  const canonical = structuredClone(compiled.canonical);
  if (blocks) {
    const section = canonical.spec.sections[0];
    if (!section) throw new Error("Missing fixture section");
    (section.content as unknown[])[0] = {
      id: "body",
      idOrigin: "explicit",
      kind: "prose",
      text: { dialect: "commonmark", dialectVersion: "0.31.2", blocks },
    };
  }
  return admit(canonical);
}
function admit(canonical: CanonicalContract) {
  const result = createMinimalPlan({
    canonical,
    capabilities: createMinimalCapabilityRegistry(),
    engineVersion: "0.0.0",
  });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.plan;
}
async function rendered(plan = fixture()) {
  const result = await renderPrimeProse(plan);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.output;
}

const literalTokens = {
  bg: "#0f151d",
  "bg-deep": "#0b1118",
  surface: "#151d27",
  "surface-2": "#1b222b",
  "surface-3": "#212f3f",
  line: "#283a48",
  "line-soft": "#223543",
  text: "#eef6fb",
  muted: "#8da7b5",
  dim: "#64818d",
  cyan: "#29e3e8",
  blue: "#66a6ff",
  sand: "#cab28a",
  green: "#45caa0",
  warn: "#d9bd74",
  danger: "#d97868",
  "r-xl": "28px",
  "r-lg": "22px",
  "r-md": "16px",
  "r-sm": "12px",
};

test("prime_prose_render_has_no_illegal_sand_status_or_client_js", async () => {
  const { html } = await rendered();
  expect(html).toMatch(/<!doctype html>/i);
  expect(html).toContain('<html lang="ar" dir="rtl"');
  expect(html).toContain("<article");
  expect(html.match(/<section\b/g)).toHaveLength(3);
  expect(html).toContain('<h1 id="omega-document-title">تقرير Prime</h1>');
  expect(html).toMatch(/<h2[^>]*>المقدمة<\/h2>/);
  expect(html).toMatch(/<h3[^>]*>التفاصيل<\/h3>/);
  expect(html).not.toMatch(
    /<script\b|astro-island|client:|react|Georgia|SignatureParticleHero/i,
  );
  const css = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? "";
  for (const [name, value] of Object.entries(literalTokens))
    expect(css).toContain(`--${name}:${value};`);
  expect(css).toContain(
    "--brand:linear-gradient(135deg,#29e3e8 0%,#66a6ff 56%,#cab28a 100%);",
  );
  expect(css).toContain(
    "--brand-soft:linear-gradient(135deg,rgba(41,227,232,.13),rgba(102,166,255,.08) 56%,rgba(202,178,138,.15));",
  );
  expect(css).toContain(
    "--brand-field:radial-gradient(80% 120% at 0% 0%,rgba(41,227,232,.13),transparent 55%),radial-gradient(75% 120% at 100% 0%,rgba(202,178,138,.11),transparent 60%);",
  );
  expect(css).toContain(
    '--sans:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI","Noto Sans Arabic",Arial,sans-serif;',
  );
  expect(css).toContain(
    "--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;",
  );
  const declarations = css
    .split(/[{};]/)
    .filter((s) => /#cab28a|rgba\(202,178,138|var\(--sand/.test(s));
  expect(
    declarations.every((s) =>
      /^\s*--(?:sand|brand|brand-soft|brand-field):/.test(s),
    ),
  ).toBe(true);
});

test("canonical_rich_text_structure_and_protected_values_are_rendered_directly", async () => {
  const code = 'e\u0301 <tag> & "quote"\n  $HOME /tmp/file\n';
  const { html } = await rendered(
    fixture([
      {
        kind: "paragraph",
        children: [
          { kind: "text", value: "النص <script>alert(1)</script> " },
          {
            kind: "emphasis",
            children: [
              {
                kind: "strong",
                children: [{ kind: "text", value: "meaning" }],
              },
            ],
          },
          { kind: "soft-break" },
          { kind: "inline-code", value: "e\u0301 $HOME" },
          { kind: "hard-break" },
          {
            kind: "link",
            destination: "https://example.test/a?x=1&v=e\u0301#part",
            title: 'title e\u0301 "quoted"',
            children: [{ kind: "text", value: "الرابط" }],
          },
        ],
      },
      {
        kind: "blockquote",
        blocks: [
          { kind: "paragraph", children: [{ kind: "text", value: "Quote" }] },
        ],
      },
      {
        kind: "bullet-list",
        tight: true,
        items: [
          {
            blocks: [
              { kind: "paragraph", children: [{ kind: "text", value: "One" }] },
            ],
          },
        ],
      },
      {
        kind: "ordered-list",
        start: 7,
        tight: false,
        items: [
          {
            blocks: [
              {
                kind: "paragraph",
                children: [{ kind: "text", value: "Seven" }],
              },
            ],
          },
        ],
      },
      { kind: "code-block", value: code, info: 'html e\u0301 "info"' },
      { kind: "thematic-break" },
    ]),
  );
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(html).toContain("<em><strong>meaning</strong></em>");
  expect(html).toContain('<code dir="ltr">e\u0301 $HOME</code>');
  expect(html).toMatch(/<br\s*\/?\s*>/);
  expect(html).toContain(
    'href="https://example.test/a?x=1&amp;v=e\u0301#part"',
  );
  expect(html).toContain('title="title e\u0301 &quot;quoted&quot;"');
  expect(html).toContain("<blockquote><p>Quote</p></blockquote>");
  expect(html).toContain("<ul><li>One</li></ul>");
  expect(html).toContain('<ol start="7"><li><p>Seven</p></li></ol>');
  expect(html).toContain(
    '<pre dir="ltr"><code data-info="html e\u0301 &quot;info&quot;">e\u0301 &lt;tag&gt; &amp; &quot;quote&quot;\n  $HOME /tmp/file\n</code></pre>',
  );
  expect(html).toMatch(/<hr\s*\/?\s*>/);
  expect(html).not.toContain("é");
  expect(html).not.toMatch(/<script\b|onclick=|onerror=/i);
});

test.each([
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "java\nscript:alert(1)",
  " data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
  "blob:https://example.test/id",
  "https:\\evil.test",
  "//remote.test/x",
])(
  "unsafe_URI_%j_fails_structurally_without_partial_HTML",
  async (destination) => {
    const plan = fixture([
      {
        kind: "paragraph",
        children: [
          {
            kind: "link",
            destination,
            title: null,
            children: [{ kind: "text", value: "unsafe" }],
          },
        ],
      },
    ]);
    const result = await renderPrimeProse(plan);
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "OMEGA-RENDER-LINK-UNSAFE",
          stage: "render",
          path: "/sections/0/content/0/text/blocks/0/children/0/destination",
        }),
      ],
    });
    expect(result).not.toHaveProperty("output");
  },
);

test("safe_link_destinations_titles_and_relative_anchors_remain_exact", async () => {
  const destinations = [
    "https://example.test",
    "http://example.test",
    "mailto:a@example.test",
    "tel:+2012345",
    "#part",
    "../reference?x=1&y=2",
    "/guide",
    "guide",
  ];
  const plan = fixture([
    {
      kind: "paragraph",
      children: destinations.map((destination) => ({
        kind: "link" as const,
        destination,
        title: null,
        children: [{ kind: "text" as const, value: destination }],
      })),
    },
  ]);
  const { html } = await rendered(plan);
  for (const destination of destinations)
    expect(html).toContain(`href="${destination.replaceAll("&", "&amp;")}"`);
});

test("sibling_local_ids_emit_unique_scoped_global_anchors_and_preserve_order", async () => {
  const original = fixture();
  const repeated = original.sections[0]?.sections[0];
  if (!repeated) throw new Error("Missing section");
  const first = original.sections[0];
  if (!first) throw new Error("Missing section");
  const plan = {
    ...original,
    sections: [
      {
        ...first,
        id: "a-b",
        content: [],
        sections: [{ ...repeated, id: "c", title: "First" }],
      },
      {
        ...first,
        id: "a",
        content: [],
        sections: [{ ...repeated, id: "b-c", title: "Second" }],
      },
    ],
  };
  const { html } = await rendered(plan);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  expect(new Set(ids).size).toBe(ids.length);
  for (const label of [...html.matchAll(/aria-labelledby="([^"]+)"/g)])
    expect(ids).toContain(label[1]);
  expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
  expect(html.match(/data-canonical-id="c"/g)).toHaveLength(1);
  expect(html.match(/data-canonical-id="b-c"/g)).toHaveLength(1);
});

test("empty_wrappers_and_deep_heading_levels_preserve_semantic_hierarchy", async () => {
  const original = fixture();
  const leaf = original.sections[0]?.sections[0];
  if (!leaf) throw new Error("Missing leaf");
  let section: PlannedSection = {
    ...leaf,
    id: "depth-7",
    title: "Level seven",
    sections: [],
  };
  for (let level = 6; level >= 2; level--)
    section = {
      ...leaf,
      id: `depth-${level}`,
      title: `Level ${level}`,
      content: [],
      sections: [section],
    };
  const { html } = await rendered({
    ...original,
    sections: [
      section,
      original.sections[1] as MinimalRenderPlan["sections"][number],
    ],
  });
  expect(html.match(/<section\b/g)).toHaveLength(7);
  expect(html).toMatch(
    /<div[^>]*role="heading"[^>]*aria-level="7"[^>]*>Level seven<\/div>/,
  );
  expect(html).not.toMatch(/<h7\b/);
});

test("render_output_declares_no_dependencies_and_excludes_ephemeral_metadata", async () => {
  const plan = fixture();
  const first = await rendered(plan);
  const second = await rendered({
    ...plan,
    correlationId: "secret-correlation",
    hostPath: "/host/private",
    time: 42,
  } as MinimalRenderPlan);
  expect(second).toEqual(first);
  expect(first).toMatchObject({
    renderer: "astro-static/1",
    rendererVersion: "omega-prime-prose/1",
    tokenVersion: "omega-prime-tokens/1",
    runtimeDependencies: [],
    assetDependencies: [],
    implementedFallbacks: [
      "no-js",
      "reflow",
      "print",
      "forced-colors",
      "reduced-motion",
    ],
  });
  expect(JSON.stringify(first)).not.toMatch(
    /secret-correlation|\/host\/private|AbortSignal|\.astro/,
  );
  expect(first.html).not.toMatch(/<link\b|@import|url\(/i);
});

test("fallback_CSS_keeps_essential_content_visible_with_bounded_reflow", async () => {
  const { html } = await rendered();
  expect(html).toContain("@media print");
  expect(html).toContain("@media (forced-colors: active)");
  expect(html).toContain("overflow-wrap: anywhere");
  expect(html).toContain("white-space: pre-wrap");
  expect(html).toContain("unicode-bidi: isolate");
  expect(html).not.toMatch(
    /display:\s*none|visibility:\s*hidden|animation:|transition:/,
  );
});

test("cancelled_render_schedules_no_work_and_has_no_output", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    renderPrimeProse(fixture(), { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
});

test("in_flight_cancellation_closes_renderer_and_later_render_is_unaffected", async () => {
  const controller = new AbortController();
  const pending = renderPrimeProse(fixture(), { signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect((await rendered()).html).toContain("Hello");
});

describe("renderer boundary", () => {
  test("unknown_representation_is_a_structured_domain_failure", async () => {
    const result = await renderPrimeProse({
      ...fixture(),
      representation: "unavailable",
    } as unknown as MinimalRenderPlan);
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "OMEGA-RENDER-REPRESENTATION-UNSUPPORTED",
        }),
      ],
    });
  });
  test("caller_AST_is_owned_and_never_mutated", async () => {
    const plan = structuredClone(fixture());
    const before = structuredClone(plan);
    await rendered(plan);
    expect(plan).toEqual(before);
    expect(Object.isFrozen(plan)).toBe(false);
  });
});

test.each([3, 4, 6, 7])(
  "cancellation_at_real_boundary_%i_never_returns_partial_output",
  async (boundary) => {
    const controller = new AbortController();
    let visited = 0;
    const pending = renderPrimeProse(fixture(), {
      signal: controller.signal,
      checkCancellation: () => {
        visited++;
        if (visited === boundary) controller.abort();
      },
    });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(visited).toBe(boundary);
    expect((await rendered()).html).toContain("Hello");
  },
);

test("caller_mutation_while_Astro_compiles_cannot_change_admitted_content", async () => {
  const plan = structuredClone(fixture());
  const original = structuredClone(plan);
  const pending = renderPrimeProse(plan);
  const paragraph = plan.sections[0]?.content[0]?.text.blocks[0];
  if (paragraph?.kind !== "paragraph") throw new Error("Missing paragraph");
  (paragraph.children as unknown[])[0] = {
    kind: "text",
    value: "injected later",
  };
  (plan.sections as unknown[]).push({ ...plan.sections[1], id: "injected" });
  const result = await pending;
  if (!result.ok) throw new Error("Expected render");
  expect(result.output.html).toContain("Hello");
  expect(result.output.html).not.toContain("injected later");
  expect(result.output.html.match(/<section\b/g)).toHaveLength(
    original.sections.length + 1,
  );
});
