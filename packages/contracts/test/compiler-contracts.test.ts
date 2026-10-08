import {
  CANONICAL_CONTRACT_VERSION,
  type CanonicalContract,
  type CanonicalSection,
  COMMONMARK_VERSION,
  type CompileRequest,
  type CompileResult,
  type Diagnostic,
  type DraftCanonicalContract,
  type ProseBlock,
  RAW_SCHEMA_VERSION,
  type ResolutionManifest,
  type RichTextBlock,
  type RichTextInline,
  type SourceMap,
} from "@omega/contracts";
import { expect, expectTypeOf, test } from "vitest";

const contract: CanonicalContract = {
  contractVersion: "1.0",
  kind: "artifact",
  metadata: { id: "review" },
  spec: {
    document: { title: "Review", language: "ar", direction: "rtl" },
    sections: [
      {
        id: "status",
        title: "الحالة الحالية",
        content: [
          {
            id: "summary",
            kind: "prose",
            text: {
              dialect: "commonmark",
              dialectVersion: "0.31.2",
              blocks: [
                {
                  kind: "paragraph",
                  children: [
                    { kind: "text", value: "الإصدار " },
                    { kind: "inline-code", value: "A\u030A  v3\r\nID" },
                    {
                      kind: "link",
                      destination: "https://example.test/A\u030A?q=ID",
                      title: null,
                      children: [{ kind: "text", value: "المصدر" }],
                    },
                  ],
                },
              ],
            },
          },
        ],
        sections: [],
      },
    ],
  },
};

type Forbidden =
  | "imports"
  | "defs"
  | "body"
  | "ref"
  | "selectedRepresentation"
  | "renderSpec"
  | "buildTimestamp"
  | "resolvedPath"
  | "sourceLocation";

test("canonical_contract_excludes_generated_presentation_state", () => {
  expectTypeOf<
    Extract<keyof CanonicalContract, Forbidden>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Extract<keyof CanonicalContract["spec"], Forbidden>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Extract<keyof CanonicalSection, Forbidden>
  >().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof ProseBlock, Forbidden>>().toEqualTypeOf<never>();
  // No open index signature may bypass the public ABI's field exclusions.
  expectTypeOf<
    string extends keyof CanonicalContract ? true : false
  >().toEqualTypeOf<false>();
  expectTypeOf<
    string extends keyof CanonicalSection ? true : false
  >().toEqualTypeOf<false>();
  expect(contract.spec.sections[0]?.content[0]?.kind).toBe("prose");
  const serialized = JSON.stringify(contract);
  for (const field of [
    "imports",
    "defs",
    "body",
    "selectedRepresentation",
    "renderSpec",
    "buildTimestamp",
  ]) {
    expect(serialized).not.toContain(`"${field}":`);
  }
});

test("compiler_versions_are_independent_and_success_is_not_a_draft", () => {
  expect(RAW_SCHEMA_VERSION).toBe("3.0");
  expect(CANONICAL_CONTRACT_VERSION).toBe("1.0");
  expect(COMMONMARK_VERSION).toBe("0.31.2");
  expectTypeOf<CanonicalContract["contractVersion"]>().toEqualTypeOf<"1.0">();
  const request: CompileRequest = {
    source: { module: "review.omega.yaml", text: "omega:\n  schema: '3.0'\n" },
    engineVersion: "3.8.1",
  };
  const sourceMap: SourceMap = {
    entries: [
      {
        path: "/spec/sections/0/content/0",
        location: {
          module: request.source.module,
          line: 7,
          column: 3,
          span: { endLine: 10, endColumn: 12 },
        },
      },
    ],
  };
  const resolutionManifest: ResolutionManifest = {
    visibility: "internal",
    entries: [
      {
        logicalResourceId: "source.audit",
        originalLocator: "./audit.txt",
        resolvedLocator: "/workspace/audit.txt",
        module: request.source.module,
      },
    ],
  };
  const success: CompileResult = {
    ok: true,
    versions: {
      rawSchemaVersion: "3.0",
      canonicalContractVersion: "1.0",
      engineVersion: request.engineVersion,
    },
    canonical: contract,
    sourceMap,
    resolutionManifest,
    diagnostics: [],
  };
  expect(success.versions.engineVersion).toBe("3.8.1");
  expect(JSON.stringify(success.canonical)).not.toContain("/workspace/");
  expect(success.sourceMap.entries[0]?.location.module).toBe(
    "review.omega.yaml",
  );
  expectTypeOf<Extract<CompileResult, { ok: false }>>().not.toHaveProperty(
    "canonical",
  );
  expectTypeOf<
    Extract<CompileResult, { ok: true }>["canonical"]
  >().toEqualTypeOf<CanonicalContract>();
});

test("structured_prose_keeps_code_and_link_values_exact_and_has_no_html_or_heading_nodes", () => {
  const roundTrip = JSON.parse(JSON.stringify(contract)) as CanonicalContract;
  const paragraph = roundTrip.spec.sections[0]?.content[0]?.text.blocks[0];
  if (paragraph?.kind !== "paragraph")
    throw new Error("Expected paragraph fixture");
  expect(paragraph.children[1]).toEqual({
    kind: "inline-code",
    value: "A\u030A  v3\r\nID",
  });
  const link = paragraph.children[2];
  if (link?.kind !== "link") throw new Error("Expected link fixture");
  expect(link.destination).toBe("https://example.test/A\u030A?q=ID");
  expectTypeOf<
    Extract<RichTextBlock["kind"], "heading" | "html" | "image">
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Extract<RichTextInline["kind"], "html" | "image">
  >().toEqualTypeOf<never>();
});

test("drafts_allow_missing_ids_and_diagnostics_use_frozen_severities", () => {
  const prose = contract.spec.sections[0]?.content[0];
  if (!prose) throw new Error("Expected prose fixture");
  const draft: DraftCanonicalContract = {
    contractVersion: "1.0",
    kind: "artifact",
    metadata: {},
    spec: {
      document: contract.spec.document,
      sections: [
        {
          title: "Review",
          content: [
            {
              kind: "prose",
              text: prose.text,
            },
          ],
          sections: [],
        },
      ],
    },
  };
  const diagnostic: Diagnostic = {
    code: "OMEGA-SCHEMA-0042",
    severity: "ERROR",
    stage: "raw-validation",
    path: "/spec/presentation/profil",
    message: 'Unknown field "profil".',
    location: { module: "review.omega.yaml", line: 5, column: 3 },
    context: { value: "profil" },
    suggestions: ['Did you mean "profile"?'],
    related: [],
  };
  const failure: CompileResult = { ok: false, diagnostics: [diagnostic] };
  expect(failure.diagnostics[0]?.code).toBe("OMEGA-SCHEMA-0042");
  expect(draft.spec.sections[0]?.id).toBeUndefined();
  expectTypeOf<Diagnostic["severity"]>().toEqualTypeOf<
    "ERROR" | "WARNING" | "DEPRECATION" | "INFO"
  >();
  expectTypeOf<CanonicalSection["id"]>().toEqualTypeOf<string>();
  expectTypeOf<ProseBlock["id"]>().toEqualTypeOf<string>();
  expectTypeOf<DraftCanonicalContract>().not.toExtend<CanonicalContract>();
});

// Compiled by package and root typechecks; never executed. Any accidental
// mutable member or broadened field makes an expected-error assertion fail.
function rejectInvalidContracts(
  canonical: CanonicalContract,
  request: CompileRequest,
  diagnostic: Diagnostic,
) {
  // @ts-expect-error canonical nested arrays are readonly
  canonical.spec.sections.push();
  // @ts-expect-error canonical nested text is readonly
  canonical.spec.document.title = "Changed";
  const prose = canonical.spec.sections[0]?.content[0];
  if (prose) {
    // @ts-expect-error rich-text AST arrays are readonly
    prose.text.blocks.push();
    const paragraph = prose.text.blocks[0];
    if (paragraph?.kind === "paragraph") {
      // @ts-expect-error nested inline AST arrays are readonly
      paragraph.children.push();
      const inline = paragraph.children[0];
      if (inline?.kind === "inline-code") {
        // @ts-expect-error protected code tokens are readonly
        inline.value = "Changed";
      }
    }
  }
  // @ts-expect-error source text is readonly
  request.source.text = "Changed";
  if (diagnostic.context) {
    // @ts-expect-error diagnostic context is recursively readonly
    diagnostic.context.value = "Changed";
  }
  // @ts-expect-error generated renderer state is excluded
  canonical.selectedRepresentation = "card";
  // @ts-expect-error engine versions cannot replace the canonical version
  canonical.contractVersion = "3.8.1";
}
void rejectInvalidContracts;
