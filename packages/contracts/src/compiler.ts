import type {
  CanonicalContract,
  CanonicalContractVersion,
  RawSchemaVersion,
} from "./canonical.js";
import type { Diagnostic, LogicalModuleId, SourceMap } from "./diagnostics.js";

export interface CompilerSource {
  readonly module: LogicalModuleId;
  /** Bytes are decoded strictly as UTF-8 by the parse stage. */
  readonly text: string | Uint8Array;
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

/** Completed semantic snapshot; provenance and locations remain sidecars. */
export interface CompileSuccess {
  readonly ok: true;
  readonly versions: CompilerVersions;
  readonly canonical: CanonicalContract;
  readonly canonicalString: string;
  /** Frozen UTF-8 byte array; unlike Uint8Array, its elements can be frozen. */
  readonly canonicalBytes: readonly number[];
  /** SHA-256 of the original source bytes, before newline/text normalization. */
  readonly rawSourceHash: string;
  /** SHA-256 of the RFC 8785 canonical UTF-8 bytes only. */
  readonly normalizedHash: string;
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
