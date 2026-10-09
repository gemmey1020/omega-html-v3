import {
  COMMONMARK_VERSION,
  type Diagnostic,
  type RichText,
  type RichTextBlock,
  type RichTextInline,
  type SourceMap,
} from "@omega/contracts";
import { type Node, Parser } from "commonmark";
import {
  inspectJsonModel,
  MAX_STRUCTURAL_DEPTH,
  modelDiagnostic,
} from "../validation/json-model.js";

export interface NormalizationContext {
  readonly sourceMap?: SourceMap;
}

export type TextNormalizationResult =
  | {
      readonly ok: true;
      readonly value: RichText;
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export function normalizeHumanText(value: string): string {
  return value.normalize("NFC");
}

function children(node: Node): Node[] {
  const values: Node[] = [];
  for (let child = node.firstChild; child; child = child.next)
    values.push(child);
  return values;
}

function locationFor(path: string, sourceMap?: SourceMap) {
  let current = path;
  while (true) {
    const location = sourceMap?.entries.find(
      (entry) => entry.path === current,
    )?.location;
    if (location) return location;
    if (!current) return undefined;
    current = current.slice(0, current.lastIndexOf("/"));
  }
}

/**
 * Parse raw Markdown before NFC. Protected code/destination/title/info values
 * are copied from commonmark@0.31.2 verbatim (including its mandated unescaping,
 * code-span whitespace and URL encoding); human text alone receives NFC.
 * No HTML renderer is used. Unsupported AST nodes fail the entire text stage.
 */
export function normalizeRichText(
  source: string,
  path: string,
  context: NormalizationContext = {},
): TextNormalizationResult {
  const ast = new Parser({ smart: false, time: false }).parse(source);
  const diagnostics: Diagnostic[] = [];
  function depthFailure(
    code: string,
    message: string,
    node?: Node,
  ): TextNormalizationResult {
    const location = locationFor(path, context.sourceMap);
    let positioned: Node | null = node ?? null;
    while (positioned && !positioned.sourcepos) positioned = positioned.parent;
    const start = positioned?.sourcepos?.[0];
    return {
      ok: false,
      diagnostics: [
        {
          code,
          severity: "ERROR",
          stage: "normalize",
          path,
          message,
          context: {
            maxDepth: MAX_STRUCTURAL_DEPTH,
            depth: MAX_STRUCTURAL_DEPTH + 1,
            ...(node ? { nodeType: node.type } : {}),
            ...(start
              ? { markdownLine: start[0], markdownColumn: start[1] }
              : {}),
          },
          ...(location ? { location } : {}),
        },
      ],
    };
  }
  // CommonMark's pinned parser uses iterative block/inline walks. Inspect the
  // complete parsed AST (document=1, every child adds1) before our conversion.
  const stack = [{ node: ast, depth: 1 }];
  while (stack.length) {
    const entry = stack.pop();
    if (!entry) break;
    if (entry.depth > MAX_STRUCTURAL_DEPTH)
      return depthFailure(
        "OMEGA-NORMALIZE-MARKDOWN-DEPTH",
        `CommonMark AST node depth exceeds ${MAX_STRUCTURAL_DEPTH}.`,
        entry.node,
      );
    for (let child = entry.node.lastChild; child; child = child.prev)
      stack.push({ node: child, depth: entry.depth + 1 });
  }
  function reject(node: Node, code = "OMEGA-NORMALIZE-UNSUPPORTED-NODE") {
    // Inline nodes have no sourcepos; report containing block position only.
    let positioned: Node | null = node;
    while (positioned && !positioned.sourcepos) positioned = positioned.parent;
    const start = positioned?.sourcepos?.[0];
    const location = locationFor(path, context.sourceMap);
    diagnostics.push({
      code,
      severity: "ERROR",
      stage: "normalize",
      path,
      message:
        code === "OMEGA-NORMALIZE-UNSAFE-LINK"
          ? "Link scheme is not allowed by the P01 prose policy."
          : `CommonMark node ${JSON.stringify(node.type)} is unsupported in prose.`,
      context: {
        nodeType: node.type,
        ...(start ? { markdownLine: start[0], markdownColumn: start[1] } : {}),
      },
      ...(location ? { location } : {}),
    });
  }
  function inline(node: Node): RichTextInline[] {
    switch (node.type) {
      case "text":
        return [
          { kind: "text", value: normalizeHumanText(node.literal ?? "") },
        ];
      case "code":
        return [{ kind: "inline-code", value: node.literal ?? "" }];
      case "softbreak":
        return [{ kind: "soft-break" }];
      case "linebreak":
        return [{ kind: "hard-break" }];
      case "emph":
        return [{ kind: "emphasis", children: children(node).flatMap(inline) }];
      case "strong":
        return [{ kind: "strong", children: children(node).flatMap(inline) }];
      case "link": {
        const destination = node.destination ?? "";
        // Conservative explicit-scheme allowlist. Relative, fragment and
        // network-path references remain opaque; no resolution/fetch occurs.
        const scheme = /^([a-z][a-z0-9+.-]*):/i
          .exec(destination)?.[1]
          ?.toLowerCase();
        if (scheme && !["http", "https", "mailto"].includes(scheme))
          reject(node, "OMEGA-NORMALIZE-UNSAFE-LINK");
        return [
          {
            kind: "link",
            destination,
            title: node.title,
            children: children(node).flatMap(inline),
          },
        ];
      }
      default:
        reject(node);
        return [];
    }
  }
  function block(node: Node): RichTextBlock[] {
    switch (node.type) {
      case "paragraph":
        return [
          { kind: "paragraph", children: children(node).flatMap(inline) },
        ];
      case "block_quote":
        return [{ kind: "blockquote", blocks: children(node).flatMap(block) }];
      case "code_block":
        return [
          { kind: "code-block", value: node.literal ?? "", info: node.info },
        ];
      case "thematic_break":
        return [{ kind: "thematic-break" }];
      case "list": {
        const items = children(node).map((item) => ({
          blocks: children(item).flatMap(block),
        }));
        return node.listType === "ordered"
          ? [
              {
                kind: "ordered-list",
                start: node.listStart,
                tight: node.listTight,
                items,
              },
            ]
          : [{ kind: "bullet-list", tight: node.listTight, items }];
      }
      default:
        reject(node);
        return [];
    }
  }
  const blocks = children(ast).flatMap(block);
  if (diagnostics.length) return { ok: false, diagnostics };
  const value: RichText = {
    dialect: "commonmark",
    dialectVersion: COMMONMARK_VERSION,
    blocks,
  };
  // AST nodes become JSON object/array containers. A standalone RichText tree
  // has its own JSON root; the pipeline separately checks composed ancestry.
  const issue = inspectJsonModel(value);
  if (issue)
    return {
      ok: false,
      diagnostics: [
        modelDiagnostic(
          { ...issue, path },
          "normalize",
          "OMEGA-NORMALIZE",
          context.sourceMap,
        ),
      ],
    };
  return { ok: true, value, diagnostics };
}
