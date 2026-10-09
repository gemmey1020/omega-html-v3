import type { CompilerStage, Diagnostic, SourceMap } from "@omega/contracts";
import { invalidUnicodeOffset } from "../parser/yaml-profile.js";
import { nearestSourceLocation } from "../sourcemap/source-location.js";

/** Containers only: root object/array = 1; primitives do not add depth. */
export const MAX_STRUCTURAL_DEPTH = 128;

export interface JsonModelIssue {
  readonly path: string;
  readonly reason: "model" | "depth";
  readonly message: string;
}

export function pointerChild(path: string, key: string): string {
  return `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

/**
 * Iterative, descriptor-only JSON preflight before any recursive consumer.
 * No getters/toJSON invoked, no caller mutation. Shared aliases are allowed;
 * only active ancestry is cyclic. Proxy traps remain trusted caller code.
 */
export function inspectJsonModel(value: unknown): JsonModelIssue | undefined {
  type Frame = {
    value: unknown;
    path: string;
    depth: number;
    leaving?: boolean;
  };
  const stack: Frame[] = [{ value, path: "", depth: 0 }];
  const ancestors = new Set<object>();
  function issue(path: string, message: string): JsonModelIssue {
    return { path, reason: "model", message };
  }
  while (stack.length) {
    const frame = stack.pop();
    if (!frame) break;
    const { value, path, depth } = frame;
    if (frame.leaving) {
      ancestors.delete(value as object);
      continue;
    }
    if (value === null || typeof value === "boolean") continue;
    if (typeof value === "string") {
      const invalid = invalidUnicodeOffset(value);
      if (invalid !== undefined) {
        const point = value.codePointAt(invalid) ?? 0;
        return issue(
          path,
          point >= 0xd800 && point <= 0xdfff
            ? "JSON strings must not contain lone surrogates."
            : "I-JSON strings must not contain Unicode noncharacters.",
        );
      }
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value))
        return issue(path, "JSON numbers must be finite.");
      continue;
    }
    if (typeof value !== "object")
      return issue(path, "Value is outside the JSON model.");
    if (ancestors.has(value)) return issue(path, "Cyclic values are not JSON.");
    const nextDepth = depth + 1;
    if (nextDepth > MAX_STRUCTURAL_DEPTH)
      return {
        path,
        reason: "depth",
        message: `JSON container depth exceeds ${MAX_STRUCTURAL_DEPTH}.`,
      };
    const array = Array.isArray(value);
    const prototype: unknown = Object.getPrototypeOf(value);
    if (
      array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      return issue(path, "Only plain JSON objects and arrays are supported.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === "length") continue;
      if (typeof key !== "string")
        return issue(path, "Symbol properties are not JSON.");
      const descriptor = descriptors[key];
      if (!descriptor?.enumerable || !("value" in descriptor))
        return issue(
          pointerChild(path, key),
          "JSON properties must be enumerable data values.",
        );
      if (
        array &&
        (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)
      )
        return issue(
          pointerChild(path, key),
          "Array properties must be element indices.",
        );
      // Property names are I-JSON strings too, checked without recursion.
      const invalid = invalidUnicodeOffset(key);
      if (invalid !== undefined)
        return issue(
          pointerChild(path, key),
          "JSON property names must use valid I-JSON Unicode.",
        );
    }
    const children: Frame[] = [];
    if (array) {
      for (let i = 0; i < value.length; i++) {
        const descriptor = descriptors[String(i)];
        if (!descriptor)
          return issue(
            pointerChild(path, String(i)),
            "Sparse arrays are not JSON.",
          );
        children.push({
          value: descriptor.value,
          path: pointerChild(path, String(i)),
          depth: nextDepth,
        });
      }
    } else {
      for (const key of Object.keys(descriptors).sort())
        children.push({
          value: descriptors[key]?.value,
          path: pointerChild(path, key),
          depth: nextDepth,
        });
    }
    ancestors.add(value);
    stack.push({ value, path, depth, leaving: true });
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child) stack.push(child);
    }
  }
  return undefined;
}

export function modelDiagnostic(
  issue: JsonModelIssue,
  stage: CompilerStage,
  codePrefix: string,
  sourceMap?: SourceMap,
): Diagnostic {
  const location = nearestSourceLocation(issue.path, sourceMap);
  return {
    code: `${codePrefix}-${issue.reason === "depth" ? "DEPTH" : "JSON-MODEL"}`,
    severity: "ERROR",
    stage,
    path: issue.path,
    message: issue.message,
    ...(issue.reason === "depth"
      ? {
          context: {
            maxDepth: MAX_STRUCTURAL_DEPTH,
            depth: MAX_STRUCTURAL_DEPTH + 1,
          },
        }
      : {}),
    ...(location ? { location } : {}),
  };
}
