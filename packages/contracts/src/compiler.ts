import type {
  CanonicalContract,
  CanonicalContractVersion,
  RawSchemaVersion,
} from "./canonical.js";
import type { Diagnostic, LogicalModuleId, SourceMap } from "./diagnostics.js";

export interface CompilerSource {
  readonly module: LogicalModuleId;
  readonly text: string;
}

/** Raw schema is read from source's omega.schema, never silently migrated. */
export interface CompileRequest {
  readonly source: CompilerSource;
  readonly engineVersion: string;
}

export interface CompilerVersions {
  readonly rawSchemaVersion: RawSchemaVersion;
  readonly canonicalContractVersion: CanonicalContractVersion;
  readonly engineVersion: string;
}

export interface ResolutionEntry {
  readonly logicalResourceId: string;
  readonly originalLocator: string;
  /** Host path/URI permitted only in this explicitly internal sidecar. */
  readonly resolvedLocator: string;
  readonly digest?: { readonly algorithm: "sha256"; readonly value: string };
  readonly mediaType?: string;
  readonly module: LogicalModuleId;
}

export interface ResolutionManifest {
  readonly visibility: "internal";
  readonly entries: readonly ResolutionEntry[];
}

/** No hashes are invented here; each identity is produced by its later stage. */
export interface CompileSuccess {
  readonly ok: true;
  readonly versions: CompilerVersions;
  readonly canonical: CanonicalContract;
  readonly sourceMap: SourceMap;
  readonly resolutionManifest: ResolutionManifest;
  readonly diagnostics: readonly Diagnostic[];
}

/** Failed dependent stages cannot expose a usable partial canonical contract. */
export interface CompileFailure {
  readonly ok: false;
  readonly diagnostics: readonly Diagnostic[];
}

export type CompileResult = CompileSuccess | CompileFailure;
