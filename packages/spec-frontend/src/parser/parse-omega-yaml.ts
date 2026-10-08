import type {
  CompilerSource,
  Diagnostic,
  JsonPointer,
  JsonValue,
  LogicalModuleId,
  SourceLocation,
  SourceMap,
  SourceMapEntry,
} from "@omega/contracts";
import {
  Composer,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  type ParsedNode,
  Parser,
} from "yaml";
import {
  invalidUnicodeOffset,
  isJsonModelTag,
  isLogicalModuleId,
  OMEGA_YAML_OPTIONS,
} from "./yaml-profile.js";

export type RawAstResult =
  | {
      readonly ok: true;
      readonly value: JsonValue;
      readonly sourceMap: SourceMap;
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** No I/O, alias expansion, defaults or schema validation occur at this gate. */
export function parseOmegaYaml(
  source: CompilerSource["text"],
  moduleId: LogicalModuleId,
): RawAstResult {
  const diagnostics: Diagnostic[] = [];
  if (!isLogicalModuleId(moduleId)) {
    return freeze({
      ok: false,
      diagnostics: [
        {
          code: "OMEGA-PARSE-MODULE",
          severity: "ERROR",
          stage: "parse",
          message: "Source module must be a portable logical identifier.",
        },
      ],
    });
  }
  let text: string;
  if (typeof source === "string") text = source;
  else {
    try {
      // Keep a UTF-8 BOM in the decoded authoring text so offsets remain exact.
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        source,
      );
    } catch {
      return freeze({
        ok: false,
        diagnostics: [
          {
            code: "OMEGA-PARSE-UTF8",
            severity: "ERROR",
            stage: "parse",
            message: "Source bytes must be valid UTF-8.",
          },
        ],
      });
    }
  }
  const lines = new LineCounter();
  lines.addNewLine(0);
  for (let offset = 0; offset < text.length; offset++) {
    if (text[offset] === "\n") lines.addNewLine(offset + 1);
  }
  function location(start: number, end: number): SourceLocation {
    const first = lines.linePos(start);
    const last = lines.linePos(end);
    return {
      module: moduleId,
      line: first.line,
      column: first.col,
      span: { endLine: last.line, endColumn: last.col },
    };
  }
  function error(
    code: string,
    message: string,
    start: number,
    end: number,
    path?: JsonPointer,
  ) {
    diagnostics.push({
      code,
      severity: "ERROR",
      stage: "parse",
      message,
      location: location(start, end),
      ...(path === undefined ? {} : { path }),
    });
  }
  // YAML's CST can still be inspected safely after invalid source code units;
  // retain independent structural diagnostics rather than losing them here.
  let invalid = invalidUnicodeOffset(text);
  while (invalid !== undefined) {
    error(
      "OMEGA-PARSE-UNICODE",
      "Source contains invalid Unicode text.",
      invalid,
      invalid + 1,
    );
    invalid = invalidUnicodeOffset(text, invalid + 1);
  }
  for (let offset = 0; offset < text.length; offset++) {
    const code = text.charCodeAt(offset);
    if (
      (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
      (code >= 0x7f && code <= 0x9f && code !== 0x85)
    ) {
      error(
        "OMEGA-PARSE-UNICODE",
        "Raw YAML contains a nonprintable character; use an escaped string.",
        offset,
        offset + 1,
      );
    }
  }
  const tokens = [...new Parser().parse(text)];
  for (const token of tokens) {
    if (
      token.type === "directive" &&
      !/^%YAML[ \t]+1\.2[ \t]*(?:#.*)?$/.test(token.source)
    ) {
      error(
        "OMEGA-PARSE-YAML-PROFILE",
        "Directives cannot change the fixed YAML 1.2 profile.",
        token.offset,
        token.offset + token.source.length,
      );
    }
  }
  const documents = [
    ...new Composer(OMEGA_YAML_OPTIONS).compose(tokens, true, text.length),
  ];
  if (documents.length > 1) {
    for (const document of documents.slice(1)) {
      const range = document.range ?? [0, text.length, text.length];
      error(
        "OMEGA-PARSE-YAML-PROFILE",
        "Exactly one YAML document is allowed.",
        range[0],
        range[1],
      );
    }
  }
  const entries: SourceMapEntry[] = [];
  const ranges: { start: number; end: number; path: JsonPointer }[] = [];
  function record(node: ParsedNode, path: JsonPointer, includeEntry: boolean) {
    ranges.push({ start: node.range[0], end: node.range[1], path });
    if (includeEntry)
      entries.push({ path, location: location(node.range[0], node.range[1]) });
  }
  function convert(
    node: ParsedNode | null,
    path: JsonPointer,
    includeEntry = true,
  ): JsonValue {
    if (node === null) return null;
    record(node, path, includeEntry);
    const [start, end] = node.range;
    if (node.tag && !isJsonModelTag(node.tag)) {
      error(
        "OMEGA-PARSE-YAML-PROFILE",
        "Only standard JSON-model YAML tags are allowed.",
        start,
        end,
        path,
      );
    }
    if (isAlias(node)) {
      error(
        "OMEGA-PARSE-YAML-PROFILE",
        "YAML aliases are not allowed.",
        start,
        end,
        path,
      );
      return null;
    }
    if (node.anchor !== undefined)
      error(
        "OMEGA-PARSE-YAML-PROFILE",
        "YAML anchors are not allowed.",
        start,
        end,
        path,
      );
    if (isScalar(node)) {
      const value: unknown = node.value;
      if (typeof value === "string") {
        if (invalidUnicodeOffset(value) !== undefined)
          error(
            "OMEGA-PARSE-UNICODE",
            "Scalar contains invalid Unicode text.",
            start,
            end,
            path,
          );
        return value;
      }
      if (typeof value === "bigint") {
        if (
          value > BigInt(Number.MAX_SAFE_INTEGER) ||
          value < BigInt(Number.MIN_SAFE_INTEGER)
        ) {
          error(
            "OMEGA-PARSE-NUMBER",
            "Integer requires an exact typed representation.",
            start,
            end,
            path,
          );
          return null;
        }
        return Number(value);
      }
      if (typeof value === "number") {
        const nonzeroUnderflow =
          value === 0 &&
          /[1-9]/.test((node.source ?? "").split(/[eE]/)[0] ?? "");
        if (
          !Number.isFinite(value) ||
          (Number.isInteger(value) && !Number.isSafeInteger(value)) ||
          nonzeroUnderflow
        ) {
          error(
            "OMEGA-PARSE-NUMBER",
            "Number must be finite and safely representable as a JSON number.",
            start,
            end,
            path,
          );
          return null;
        }
        return value;
      }
      if (value === null || typeof value === "boolean") return value;
      error(
        "OMEGA-PARSE-YAML-PROFILE",
        "Scalar must use the JSON-compatible value model.",
        start,
        end,
        path,
      );
      return null;
    }
    if (isSeq(node))
      return node.items.map((item, index) => convert(item, `${path}/${index}`));
    if (isMap(node)) {
      const object: { [key: string]: JsonValue } = {};
      for (const pair of node.items) {
        const key = pair.key;
        const keyValue =
          isScalar(key) && typeof key.value === "string"
            ? key.value
            : undefined;
        const keyIsString = keyValue !== undefined;
        const childPath = keyIsString
          ? `${path}/${keyValue.replaceAll("~", "~0").replaceAll("/", "~1")}`
          : path;
        convert(key, childPath, false);
        if (!keyIsString)
          error(
            "OMEGA-PARSE-YAML-PROFILE",
            "Mapping keys must be strings.",
            key.range[0],
            key.range[1],
            path,
          );
        if (keyIsString && keyValue === "<<")
          error(
            "OMEGA-PARSE-YAML-PROFILE",
            "YAML merge keys are not allowed.",
            key.range[0],
            key.range[1],
            childPath,
          );
        const value = convert(pair.value, childPath, keyIsString);
        if (keyIsString)
          Object.defineProperty(object, keyValue, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
          });
      }
      return object;
    }
    error(
      "OMEGA-PARSE-YAML-PROFILE",
      "Unsupported YAML node.",
      start,
      end,
      path,
    );
    return null;
  }
  const values = documents.map((document) => convert(document.contents, ""));
  // Document diagnostics are retained alongside independent profile violations.
  for (const document of documents) {
    for (const issue of [...document.errors, ...document.warnings]) {
      const [start, end] = issue.pos;
      const candidates = ranges.filter(
        (range) => start >= range.start && start < range.end,
      );
      candidates.sort((a, b) => a.end - a.start - (b.end - b.start));
      error(
        issue.code === "DUPLICATE_KEY"
          ? "OMEGA-PARSE-DUPLICATE-KEY"
          : issue.code === "TAG_RESOLVE_FAILED" ||
              issue.code === "BAD_DIRECTIVE"
            ? "OMEGA-PARSE-YAML-PROFILE"
            : "OMEGA-PARSE-SYNTAX",
        issue.message,
        start,
        end,
        candidates[0]?.path,
      );
    }
  }
  diagnostics.sort(
    (a, b) =>
      (a.location?.line ?? 0) - (b.location?.line ?? 0) ||
      (a.location?.column ?? 0) - (b.location?.column ?? 0) ||
      a.code.localeCompare(b.code, "en"),
  );
  if (diagnostics.length > 0) return freeze({ ok: false, diagnostics });
  // Empty/comment-only documents are null, leaving root-shape checks to schema.
  if (entries.length === 0)
    entries.push({ path: "", location: location(0, text.length) });
  return freeze({
    ok: true,
    value: values[0] ?? null,
    sourceMap: { entries },
    diagnostics,
  });
}
