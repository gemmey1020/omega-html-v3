import {
  CANONICAL_CONTRACT_VERSION,
  type Diagnostic,
  type DraftCanonicalContract,
  type DraftCanonicalSection,
  type DraftProseBlock,
} from "@omega/contracts";
import {
  canonicalPointerToRaw,
  nearestSourceLocation,
} from "../sourcemap/build-source-map.js";
import { inspectJsonModel, modelDiagnostic } from "../validation/json-model.js";
import type {
  RawArtifactSpec,
  RawSection,
} from "../validation/validate-raw.js";
import { defaultSectionIntent, directionForLanguage } from "./defaults.js";
import { expandSectionBody } from "./shorthands.js";
import {
  type NormalizationContext,
  normalizeHumanText,
  normalizeRichText,
} from "./text.js";

export type NormalizationResult =
  | {
      readonly ok: true;
      readonly value: DraftCanonicalContract;
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/** Call after Raw validation succeeds. Pure; no IDs or representations chosen. */
export function normalizeRawSpec(
  raw: RawArtifactSpec,
  context: NormalizationContext = {},
): NormalizationResult {
  const inputIssue = inspectJsonModel(raw);
  if (inputIssue)
    return {
      ok: false,
      diagnostics: [
        modelDiagnostic(
          inputIssue,
          "normalize",
          "OMEGA-NORMALIZE",
          context.sourceMap,
        ),
      ],
    };
  const diagnostics: Diagnostic[] = [];
  function section(value: RawSection, path: string): DraftCanonicalSection {
    const intent = defaultSectionIntent(value);
    const content: DraftProseBlock[] = [];
    for (const expanded of expandSectionBody(value, path)) {
      const normalized = normalizeRichText(
        expanded.raw.text,
        expanded.path,
        context,
      );
      diagnostics.push(...normalized.diagnostics);
      if (normalized.ok)
        content.push({
          ...(expanded.raw.id !== undefined ? { id: expanded.raw.id } : {}),
          kind: "prose",
          text: normalized.value,
        });
    }
    return {
      ...(value.id !== undefined ? { id: value.id } : {}),
      title: value.title == null ? null : normalizeHumanText(value.title),
      ...(intent !== undefined ? { intent } : {}),
      content,
      sections: (value.sections ?? []).map((child, index) =>
        section(child, `${path}/sections/${index}`),
      ),
    };
  }
  const language = raw.spec.document.language ?? "und";
  const value: DraftCanonicalContract = {
    contractVersion: CANONICAL_CONTRACT_VERSION,
    kind: "artifact",
    metadata: raw.metadata?.id !== undefined ? { id: raw.metadata.id } : {},
    spec: {
      target: raw.spec.target ?? "standalone-html",
      presentation: { profile: raw.spec.presentation?.profile ?? "prime" },
      document: {
        title: normalizeHumanText(raw.spec.document.title),
        language,
        direction: directionForLanguage(language),
      },
      sections: raw.spec.sections.map((child, index) =>
        section(child, `/spec/sections/${index}`),
      ),
    },
  };
  if (diagnostics.length) return { ok: false, diagnostics };
  // One budget over the full emitted draft: sections, content, RichText and
  // their arrays all share ancestry. Generated descendants map to the scalar.
  const issue = inspectJsonModel(value);
  if (issue) {
    const path = canonicalPointerToRaw(issue.path, raw);
    const location = nearestSourceLocation(path, context.sourceMap);
    const diagnostic = modelDiagnostic(
      { ...issue, path },
      "normalize",
      "OMEGA-NORMALIZE",
    );
    return {
      ok: false,
      diagnostics: [{ ...diagnostic, ...(location ? { location } : {}) }],
    };
  }
  return { ok: true, value, diagnostics };
}
