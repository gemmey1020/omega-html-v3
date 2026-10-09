import { readFileSync } from "node:fs";
import type {
  CanonicalContract,
  Diagnostic,
  SourceMap,
} from "@omega/contracts";
import { Ajv2020 } from "ajv/dist/2020.js";
import { nearestSourceLocation } from "../sourcemap/build-source-map.js";

export class CanonicalizationError extends TypeError {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "CanonicalizationError";
  }
}

function child(path: string, key: string): string {
  return `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

/** RFC 8785: no NFC; ECMAScript primitives, explicit UTF-16 property order. */
export function canonicalizeJson(value: unknown): string {
  const ancestors = new Set<object>();
  function fail(path: string, message: string): never {
    throw new CanonicalizationError(path, message);
  }
  function string(value: string, path: string): string {
    for (let i = 0; i < value.length; i++) {
      const point = value.codePointAt(i) ?? 0;
      if ((point >= 0xfdd0 && point <= 0xfdef) || (point & 0xffff) >= 0xfffe)
        fail(path, "I-JSON strings must not contain Unicode noncharacters.");
      const unit = value.charCodeAt(i);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const low = value.charCodeAt(++i);
        if (!(low >= 0xdc00 && low <= 0xdfff))
          fail(path, "JSON strings must not contain lone surrogates.");
      } else if (unit >= 0xdc00 && unit <= 0xdfff)
        fail(path, "JSON strings must not contain lone surrogates.");
    }
    return JSON.stringify(value);
  }
  function serialize(value: unknown, path: string): string {
    if (value === null) return "null";
    if (typeof value === "string") return string(value, path);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail(path, "JSON numbers must be finite.");
      // Includes finite integral IEEE doubles beyond Raw authoring's safe range.
      return JSON.stringify(value);
    }
    if (typeof value !== "object")
      fail(path, "Value is outside the JSON model.");
    if (ancestors.has(value)) fail(path, "Cyclic values are not JSON.");
    const array = Array.isArray(value);
    const prototype: unknown = Object.getPrototypeOf(value);
    if (
      array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      fail(path, "Only plain JSON objects and arrays are supported.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === "length") continue;
      if (typeof key !== "string")
        fail(path, "Symbol properties are not JSON.");
      const descriptor = descriptors[key];
      if (!descriptor?.enumerable || !("value" in descriptor))
        fail(
          child(path, key),
          "JSON properties must be enumerable data values.",
        );
      if (
        array &&
        (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)
      )
        fail(child(path, key), "Array properties must be element indices.");
    }
    ancestors.add(value);
    try {
      if (array) {
        const elements: string[] = [];
        for (let i = 0; i < value.length; i++) {
          const descriptor = descriptors[String(i)];
          if (!descriptor)
            fail(child(path, String(i)), "Sparse arrays are not JSON.");
          elements.push(serialize(descriptor.value, child(path, String(i))));
        }
        return `[${elements.join(",")}]`;
      }
      // Emit directly: rebuilding an object reorders integer-looking keys in JS.
      return `{${Object.keys(descriptors)
        .sort()
        .map(
          (key) =>
            `${string(key, child(path, key))}:${serialize(descriptors[key]?.value, child(path, key))}`,
        )
        .join(",")}}`;
    } finally {
      ancestors.delete(value);
    }
  }
  return serialize(value, "");
}

const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  coerceTypes: false,
  removeAdditional: false,
  useDefaults: false,
  ownProperties: true,
});
const schema: object = JSON.parse(
  readFileSync(
    new URL("../schemas/canonical/contract.schema.json", import.meta.url),
    "utf8",
  ),
);
const validate = ajv.compile<CanonicalContract>(schema);

export type CanonicalValidationResult =
  | {
      readonly ok: true;
      readonly value: CanonicalContract;
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/** Strict ABI revalidation; never coerces, removes fields, defaults or mutates. */
export function validateCanonicalContract(
  value: unknown,
  sourceMap?: SourceMap,
): CanonicalValidationResult {
  try {
    // Check the JSON model before AJV can inspect getters or exotic instances.
    canonicalizeJson(value);
  } catch (error) {
    if (!(error instanceof CanonicalizationError)) throw error;
    const location = nearestSourceLocation(error.path, sourceMap);
    return {
      ok: false,
      diagnostics: [
        {
          code: "OMEGA-CANONICAL-JSON-MODEL",
          severity: "ERROR",
          stage: "canonical-validation",
          path: error.path,
          message: error.message,
          ...(location ? { location } : {}),
        },
      ],
    };
  }
  if (validate(value)) return { ok: true, value, diagnostics: [] };
  const diagnostics: Diagnostic[] = (validate.errors ?? []).map((error) => {
    const path =
      error.keyword === "additionalProperties"
        ? child(error.instancePath, error.params.additionalProperty)
        : error.keyword === "required"
          ? child(error.instancePath, error.params.missingProperty)
          : error.instancePath;
    const location = nearestSourceLocation(path, sourceMap);
    return {
      code:
        error.keyword === "additionalProperties"
          ? "OMEGA-CANONICAL-UNKNOWN-FIELD"
          : `OMEGA-CANONICAL-${error.keyword.toUpperCase()}`,
      severity: "ERROR",
      stage: "canonical-validation",
      path,
      message: `Canonical field ${error.message ?? "is invalid"}.`,
      ...(location ? { location } : {}),
    };
  });
  diagnostics.sort((a, b) => {
    const left = `${a.path}\0${a.code}\0${a.message}`;
    const right = `${b.path}\0${b.code}\0${b.message}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return { ok: false, diagnostics };
}
