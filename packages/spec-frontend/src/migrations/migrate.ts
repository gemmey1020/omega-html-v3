import {
  type CompilerSource,
  type Diagnostic,
  type JsonValue,
  RAW_SCHEMA_VERSION,
} from "@omega/contracts";
import {
  CanonicalizationError,
  canonicalizeJson,
} from "../canonical/canonicalize.js";
import { parseOmegaYaml } from "../parser/parse-omega-yaml.js";
import { validateRawSpec } from "../validation/validate-raw.js";
import {
  DEFAULT_MIGRATION_REGISTRY,
  type MigrationRegistry,
} from "./registry.js";

export interface MigrationStep {
  readonly adapterId: string;
  readonly fromVersion: string;
  readonly toVersion: string;
}

interface MigrationReport {
  readonly sourceVersion: string | null;
  readonly targetVersion: string;
  readonly steps: readonly MigrationStep[];
  readonly diagnostics: readonly Diagnostic[];
}

export type MigrationResult =
  | (MigrationReport & {
      readonly ok: true;
      readonly source: CompilerSource;
      readonly sourceVersion: string;
    })
  | (MigrationReport & { readonly ok: false });

function freezeOwned<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeOwned(child);
    Object.freeze(value);
  }
  return value;
}

function versionOf(value: JsonValue): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return null;
  const root = value as { readonly [key: string]: JsonValue };
  const omega = root.omega;
  if (omega === null || typeof omega !== "object" || Array.isArray(omega))
    return null;
  const version = (omega as { readonly [key: string]: JsonValue }).schema;
  return typeof version === "string" && version.length > 0 ? version : null;
}

/** No writes, normalization or implicit migration; only one exact direct route. */
export function migrateRawSpec(
  source: CompilerSource,
  targetVersion: string,
  registry: MigrationRegistry = DEFAULT_MIGRATION_REGISTRY,
): MigrationResult {
  const module = source.module;
  const input = source.text;
  const snapshot = typeof input === "string" ? input : new Uint8Array(input);
  let sourceVersion: string | null = null;
  function failure(diagnostics: readonly Diagnostic[]): MigrationResult {
    return freezeOwned(
      structuredClone({
        ok: false as const,
        sourceVersion,
        targetVersion,
        steps: [],
        diagnostics,
      }),
    );
  }
  function error(
    code: string,
    message: string,
    adapterId?: string,
  ): MigrationResult {
    return failure([
      {
        code,
        severity: "ERROR",
        stage: "migration",
        message,
        ...(adapterId === undefined ? {} : { context: { adapterId } }),
      },
    ]);
  }
  const parsed = parseOmegaYaml(snapshot, module);
  if (!parsed.ok) return failure(parsed.diagnostics);
  sourceVersion = versionOf(parsed.value);
  if (sourceVersion === null)
    return error(
      "OMEGA-MIGRATION-SOURCE-VERSION",
      "Migration requires an authored source schema version.",
    );
  if (targetVersion !== RAW_SCHEMA_VERSION)
    return error(
      "OMEGA-MIGRATION-UNSUPPORTED-TARGET",
      "Target Raw schema is not supported by this compiler.",
    );
  const adapter = registry.adapters.find(
    (candidate) =>
      candidate.fromVersion === sourceVersion &&
      candidate.toVersion === targetVersion,
  );
  if (!adapter)
    return error(
      "OMEGA-MIGRATION-UNSUPPORTED-ROUTE",
      "No explicit direct migration adapter is registered for these versions.",
    );
  let output: unknown;
  try {
    output = adapter.migrate(parsed.value);
  } catch {
    return error(
      "OMEGA-MIGRATION-ADAPTER-FAILED",
      "Migration adapter failed.",
      adapter.id,
    );
  }
  let text: string;
  try {
    // Descriptor-based serializer rejects accessors/toJSON without invoking them.
    text = `${canonicalizeJson(output)}\n`;
  } catch (cause) {
    if (!(cause instanceof CanonicalizationError)) throw cause;
    return failure([
      {
        code:
          cause.reason === "depth"
            ? "OMEGA-MIGRATION-DEPTH"
            : "OMEGA-MIGRATION-JSON-MODEL",
        severity: "ERROR",
        stage: "migration",
        message: "Migration adapter output must use the strict JSON model.",
        path: cause.path,
        context: { adapterId: adapter.id },
      },
    ]);
  }
  // JSON is an admitted YAML subset. Snapshot output before schema inspection;
  // generated coordinates belong to a distinct portable logical document.
  const migratedSource: CompilerSource = { module: `${module}.migrated`, text };
  const generated = parseOmegaYaml(text, migratedSource.module);
  const generatedDiagnostics = (diagnostics: readonly Diagnostic[]) =>
    diagnostics.map((diagnostic) => ({
      ...diagnostic,
      context: {
        ...diagnostic.context,
        sourceDocument: "generated-migration-output",
        adapterId: adapter.id,
      },
    }));
  if (!generated.ok)
    return failure(generatedDiagnostics(generated.diagnostics));
  const validated = validateRawSpec(generated.value, generated.sourceMap);
  if (!validated.ok)
    return failure(generatedDiagnostics(validated.diagnostics));
  // validateRawSpec admits only RAW_SCHEMA_VERSION, equal to checked targetVersion.
  return freezeOwned({
    ok: true,
    source: migratedSource,
    sourceVersion,
    targetVersion,
    steps: [
      {
        adapterId: adapter.id,
        fromVersion: sourceVersion,
        toVersion: targetVersion,
      },
    ],
    diagnostics: [],
  });
}
