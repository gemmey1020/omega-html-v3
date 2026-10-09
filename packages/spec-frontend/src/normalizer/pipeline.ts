import {
  CANONICAL_CONTRACT_VERSION,
  type Diagnostic,
  type DraftCanonicalContract,
  type DraftCanonicalSection,
  type DraftProseBlock,
} from "@omega/contracts";
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
  return diagnostics.length
    ? { ok: false, diagnostics }
    : { ok: true, value, diagnostics };
}
