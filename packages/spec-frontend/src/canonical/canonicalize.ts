import { readFileSync } from "node:fs";
import type {
  CanonicalContract,
  Diagnostic,
  SourceMap,
} from "@omega/contracts";
import { Ajv2020 } from "ajv/dist/2020.js";
import { nearestSourceLocation } from "../sourcemap/build-source-map.js";
import { inspectJsonModel } from "../validation/json-model.js";

import { CanonicalizationError } from "./error.js";

export { CanonicalizationError } from "./error.js";

function child(path: string, key: string): string {
  return `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

/** RFC 8785: no NFC; ECMAScript primitives, explicit UTF-16 property order. */
export function canonicalizeJson(value: unknown): string {
  const issue = inspectJsonModel(value);
  if (issue)
    throw new CanonicalizationError(issue.path, issue.message, issue.reason);
  // Preflight has bounded and admitted the complete model. Descriptor reads
  // preserve the no-getter/toJSON policy during emission too.
  function serialize(value: unknown): string {
    if (value === null || typeof value !== "object")
      return JSON.stringify(value) as string;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      const elements: string[] = [];
      for (let i = 0; i < value.length; i++)
        elements.push(serialize(descriptors[String(i)]?.value));
      return `[${elements.join(",")}]`;
    }
    // Emit directly: rebuilding an object reorders integer-looking keys in JS.
    return `{${Object.keys(descriptors)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${serialize(descriptors[key]?.value)}`,
      )
      .join(",")}}`;
  }
  return serialize(value);
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
          code:
            error.reason === "depth"
              ? "OMEGA-CANONICAL-DEPTH"
              : "OMEGA-CANONICAL-JSON-MODEL",
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
