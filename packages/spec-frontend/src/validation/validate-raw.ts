import { readFileSync } from "node:fs";
import type {
  Diagnostic,
  JsonValue,
  SourceLocation,
  SourceMap,
} from "@omega/contracts";
import { RAW_SCHEMA_VERSION } from "@omega/contracts";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import { inspectJsonModel, modelDiagnostic } from "./json-model.js";

export interface RawProseBlock {
  readonly id?: string;
  readonly kind: "prose";
  readonly text: string;
}

export interface RawSection {
  readonly id?: string;
  readonly intent?: string;
  /** Missing and explicit null both mean intentionally untitled in normalization. */
  readonly title?: string | null;
  readonly body?: string;
  readonly content?: readonly RawProseBlock[];
  readonly sections?: readonly RawSection[];
}

/** Validated authoring slice; no defaults or normalized semantics yet. */
export interface RawArtifactSpec {
  readonly omega: { readonly schema: typeof RAW_SCHEMA_VERSION };
  readonly kind: "artifact";
  readonly metadata?: { readonly id?: string };
  readonly spec: {
    readonly document: { readonly title: string; readonly language?: string };
    readonly sections: readonly RawSection[];
    readonly target?: "standalone-html";
    readonly presentation?: {
      readonly profile: "prime" | "silver" | "gold" | "cyan";
    };
  };
}

export type ValidationResult =
  | {
      readonly ok: true;
      readonly value: RawArtifactSpec;
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  verbose: true,
  coerceTypes: false,
  removeAdditional: false,
  useDefaults: false,
  ownProperties: true,
});
// Static, local schema acquisition only: no user resources or network resolving.
for (const name of [
  "common/id",
  "common/document",
  "common/prose",
  "common/section",
  "raw/artifact",
  "raw/root",
]) {
  const schema: object = JSON.parse(
    readFileSync(
      new URL(`../schemas/${name}.schema.json`, import.meta.url),
      "utf8",
    ),
  );
  ajv.addSchema(schema);
}
const validate = ajv.getSchema<RawArtifactSpec>(
  "https://omega.invalid/schemas/raw/root.schema.json",
);
if (!validate || "$async" in validate)
  throw new Error("Raw Spec schema must be registered and synchronous.");
const validateSchema = validate;

function pointerChild(path: string, field: string): string {
  return `${path}/${field.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

function locationFor(path: string, locations: Map<string, SourceLocation>) {
  let current = path;
  while (true) {
    const location = locations.get(current);
    if (location) return location;
    if (current === "") return undefined;
    current = current.slice(0, current.lastIndexOf("/"));
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) {
      next.push(
        Math.min(
          (next[j] ?? 0) + 1,
          (previous[j + 1] ?? 0) + 1,
          (previous[j] ?? 0) + (a[i] === b[j] ? 0 : 1),
        ),
      );
    }
    previous = next;
  }
  return previous[b.length] ?? 0;
}

function suggestionsFor(error: ErrorObject, field: string): readonly string[] {
  const properties = error.parentSchema?.properties ?? {};
  const candidates = Object.keys(properties)
    .map((name) => ({ name, distance: editDistance(field, name) }))
    .filter((candidate) => candidate.distance <= 2)
    .sort((a, b) => a.distance - b.distance || compare(a.name, b.name));
  const nearest = candidates[0]?.distance;
  return candidates
    .filter((candidate) => candidate.distance === nearest)
    .map((candidate) => `Did you mean ${JSON.stringify(candidate.name)}?`);
}

function diagnosticFor(
  error: ErrorObject,
  locations: Map<string, SourceLocation>,
): Diagnostic {
  let path = error.instancePath;
  let code = `OMEGA-SCHEMA-${error.keyword.toUpperCase()}`;
  let message = `Raw field ${error.message ?? "is invalid"}.`;
  let suggestions: readonly string[] = [];
  if (error.keyword === "additionalProperties") {
    const field: string = error.params.additionalProperty;
    path = pointerChild(path, field);
    code = "OMEGA-SCHEMA-UNKNOWN-FIELD";
    message = `Unknown field ${JSON.stringify(field)}.`;
    suggestions = suggestionsFor(error, field);
  } else if (error.keyword === "required") {
    const field: string = error.params.missingProperty;
    path = pointerChild(path, field);
    message = `Missing required field ${JSON.stringify(field)}.`;
  }
  const location = locationFor(path, locations);
  return {
    code,
    severity: "ERROR",
    stage: "raw-validation",
    path,
    message,
    ...(location ? { location } : {}),
    ...(suggestions.length ? { suggestions } : {}),
  };
}

function object(
  value: JsonValue,
): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Call only after the parser's success gate. Inputs are never mutated. */
export function validateRawSpec(
  value: JsonValue,
  sourceMap: SourceMap,
): ValidationResult {
  const issue = inspectJsonModel(value);
  if (issue)
    return {
      ok: false,
      diagnostics: [
        modelDiagnostic(issue, "raw-validation", "OMEGA-SCHEMA", sourceMap),
      ],
    };
  const locations = new Map(
    sourceMap.entries.map((entry) => [entry.path, entry.location]),
  );
  // Only authored version strings select schemas. Missing/null/numeric versions
  // are structural failures, never silent migrations or default versions.
  if (object(value) && Object.hasOwn(value, "omega")) {
    const omega = value.omega;
    if (omega && object(omega) && Object.hasOwn(omega, "schema")) {
      const version = omega.schema;
      if (typeof version === "string" && version !== RAW_SCHEMA_VERSION) {
        const location = locationFor("/omega/schema", locations);
        return {
          ok: false,
          diagnostics: [
            {
              code: "UNSUPPORTED_RAW_SCHEMA",
              severity: "ERROR",
              stage: "raw-validation",
              path: "/omega/schema",
              message: `Unsupported Raw Spec schema ${JSON.stringify(version)}.`,
              context: { supported: RAW_SCHEMA_VERSION },
              ...(location ? { location } : {}),
            },
          ],
        };
      }
    }
  }
  const candidate: unknown = value;
  if (validateSchema(candidate))
    return { ok: true, value: candidate, diagnostics: [] };
  const diagnostics = (validateSchema.errors ?? []).map((error) =>
    diagnosticFor(error, locations),
  );
  diagnostics.sort(
    (a, b) =>
      compare(a.path ?? "", b.path ?? "") ||
      compare(a.code, b.code) ||
      compare(a.message, b.message),
  );
  return { ok: false, diagnostics };
}
