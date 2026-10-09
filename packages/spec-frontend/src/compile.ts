import {
  CANONICAL_CONTRACT_VERSION,
  type CompileRequest,
  type CompileResult,
  type Diagnostic,
  RAW_SCHEMA_VERSION,
} from "@omega/contracts";
import {
  CanonicalizationError,
  canonicalizeJson,
  validateCanonicalContract,
} from "./canonical/canonicalize.js";
import { sha256 } from "./canonical/hash.js";
import { assignCanonicalIds } from "./normalizer/ids.js";
import { normalizeRawSpec } from "./normalizer/pipeline.js";
import { parseOmegaYaml } from "./parser/parse-omega-yaml.js";
import {
  buildSourceMap,
  mapIdDiagnosticsToRaw,
  nearestSourceLocation,
} from "./sourcemap/build-source-map.js";
import { validateRawSpec } from "./validation/validate-raw.js";

function freezeOwned<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeOwned(child);
    Object.freeze(value);
  }
  return value;
}

/** The one compiler: every dependent stage runs only after the prior success gate. */
export function compileRawSpec(request: CompileRequest): CompileResult {
  // Snapshot bytes once, ensuring parse and raw hash see exactly the same input.
  const input = request.source.text;
  const source = typeof input === "string" ? input : new Uint8Array(input);
  const diagnostics: Diagnostic[] = [];
  function failure(next: readonly Diagnostic[]): CompileResult {
    return freezeOwned(
      structuredClone({
        ok: false as const,
        diagnostics: [...diagnostics, ...next],
      }),
    );
  }
  const parsed = parseOmegaYaml(source, request.source.module);
  if (!parsed.ok) return failure(parsed.diagnostics);
  diagnostics.push(...parsed.diagnostics);
  const validated = validateRawSpec(parsed.value, parsed.sourceMap);
  if (!validated.ok) return failure(validated.diagnostics);
  diagnostics.push(...validated.diagnostics);
  const normalized = normalizeRawSpec(validated.value, {
    sourceMap: parsed.sourceMap,
  });
  if (!normalized.ok) return failure(normalized.diagnostics);
  diagnostics.push(...normalized.diagnostics);
  const identified = assignCanonicalIds(normalized.value);
  if (!identified.ok)
    return failure(
      mapIdDiagnosticsToRaw(
        identified.diagnostics,
        validated.value,
        parsed.sourceMap,
      ),
    );
  diagnostics.push(...identified.diagnostics);
  const sourceMap = buildSourceMap(
    validated.value,
    identified.value,
    parsed.sourceMap,
  );
  const canonical = validateCanonicalContract(identified.value, sourceMap);
  if (!canonical.ok) return failure(canonical.diagnostics);
  diagnostics.push(...canonical.diagnostics);
  let canonicalString: string;
  try {
    canonicalString = canonicalizeJson(canonical.value);
  } catch (error) {
    if (!(error instanceof CanonicalizationError)) throw error;
    const location = nearestSourceLocation(error.path, sourceMap);
    return failure([
      {
        code:
          error.reason === "depth"
            ? "OMEGA-SERIALIZE-DEPTH"
            : "OMEGA-SERIALIZE-JSON-MODEL",
        severity: "ERROR",
        stage: "serialize",
        path: error.path,
        message: error.message,
        ...(location ? { location } : {}),
      },
    ]);
  }
  const bytes = new TextEncoder().encode(canonicalString);
  // Canonical validation admitted at most128 containers; this owned result
  // adds one shallow envelope. Clone/freeze cannot see unchecked prose depth.
  // Clone before freezing: ID output shares protected rich-text/sidecar objects
  // with previous stages. Never freeze caller input or earlier-stage aliases.
  return freezeOwned(
    structuredClone({
      ok: true,
      versions: {
        rawSchemaVersion: RAW_SCHEMA_VERSION,
        canonicalContractVersion: CANONICAL_CONTRACT_VERSION,
        engineVersion: request.engineVersion,
      },
      canonical: canonical.value,
      canonicalString,
      canonicalBytes: Array.from(bytes),
      rawSourceHash: sha256(source),
      normalizedHash: sha256(bytes),
      sourceMap,
      resolutionManifest: { visibility: "internal", entries: [] },
      diagnostics,
    }),
  );
}
