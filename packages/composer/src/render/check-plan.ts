import { NARRATIVE_REPRESENTATION_ID } from "@omega/capability-registry";
import type { RichTextBlock, RichTextInline } from "@omega/contracts";
import type {
  MinimalRenderPlan,
  PlannedSection,
} from "@omega/presentation-engine";
import type { RenderDiagnostic } from "./types.js";

/** Validate renderer-specific admission only; no Raw/Markdown parser or normalization. */
export function checkRenderPlan(
  plan: MinimalRenderPlan,
): readonly RenderDiagnostic[] {
  const diagnostics: RenderDiagnostic[] = [];
  function fail(code: string, path: string, message: string) {
    diagnostics.push(
      Object.freeze({
        code,
        severity: "ERROR",
        stage: "render",
        path,
        message,
      }),
    );
  }
  if (
    plan.profile !== "prime" ||
    plan.profileVersion !== "1" ||
    plan.target !== "standalone-html" ||
    plan.representation !== NARRATIVE_REPRESENTATION_ID
  )
    fail(
      "OMEGA-RENDER-REPRESENTATION-UNSUPPORTED",
      "/representation",
      "Only the phase P02 Prime prose representation is available.",
    );
  function inlines(nodes: readonly RichTextInline[], path: string) {
    nodes.forEach((node, index) => {
      const at = `${path}/${index}`;
      switch (node.kind) {
        case "link": {
          const destination = node.destination;
          const scheme = /^([a-z][a-z0-9+.-]*):/i
            .exec(destination)?.[1]
            ?.toLowerCase();
          // Browser scheme parsing strips controls/whitespace; reject rather than rewrite protected lexemes.
          if (
            Array.from(destination).some(
              (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
            ) ||
            destination.includes("\\") ||
            destination.startsWith("//") ||
            (scheme !== undefined &&
              !["https", "http", "mailto", "tel"].includes(scheme))
          )
            fail(
              "OMEGA-RENDER-LINK-UNSAFE",
              `${at}/destination`,
              "Link destination is outside the static prose URI policy.",
            );
          inlines(node.children, `${at}/children`);
          break;
        }
        case "emphasis":
        case "strong":
          inlines(node.children, `${at}/children`);
          break;
        case "text":
        case "inline-code":
        case "soft-break":
        case "hard-break":
          break;
        default:
          fail(
            "OMEGA-RENDER-RICH-TEXT-UNSUPPORTED",
            at,
            "Unsupported Canonical inline node.",
          );
      }
    });
  }
  function blocks(nodes: readonly RichTextBlock[], path: string) {
    nodes.forEach((node, index) => {
      const at = `${path}/${index}`;
      switch (node.kind) {
        case "paragraph":
          inlines(node.children, `${at}/children`);
          break;
        case "blockquote":
          blocks(node.blocks, `${at}/blocks`);
          break;
        case "bullet-list":
        case "ordered-list":
          node.items.forEach((item, i) => {
            blocks(item.blocks, `${at}/items/${i}/blocks`);
          });
          break;
        case "code-block":
        case "thematic-break":
          break;
        default:
          fail(
            "OMEGA-RENDER-RICH-TEXT-UNSUPPORTED",
            at,
            "Unsupported Canonical block node.",
          );
      }
    });
  }
  function sections(nodes: readonly PlannedSection[], path: string) {
    nodes.forEach((section, index) => {
      const at = `${path}/${index}`;
      if (
        section.representation !== undefined &&
        section.representation !== NARRATIVE_REPRESENTATION_ID
      )
        fail(
          "OMEGA-RENDER-REPRESENTATION-UNSUPPORTED",
          `${at}/representation`,
          "Unsupported section representation.",
        );
      section.content.forEach((block, i) => {
        blocks(block.text.blocks, `${at}/content/${i}/text/blocks`);
      });
      sections(section.sections, `${at}/sections`);
    });
  }
  sections(plan.sections, "/sections");
  return Object.freeze(diagnostics);
}
