import type { JsonValue } from "./canonical.js";

/** JSON Pointer (RFC 6901); empty string addresses the root. */
export type JsonPointer = string;
/** Portable logical module name, never an absolute host filesystem path. */
export type LogicalModuleId = string;

/** 1-based authoring line/UTF-16 column coordinates; span end is exclusive. */
export interface SourceLocation {
  readonly module: LogicalModuleId;
  readonly line: number;
  readonly column: number;
  readonly span?: {
    readonly endLine: number;
    readonly endColumn: number;
  };
}

export type CompilerStage =
  | "parse"
  | "raw-validation"
  | "resolution"
  | "normalize"
  | "ids"
  | "canonical-validation"
  | "serialize";

export type DiagnosticSeverity = "ERROR" | "WARNING" | "DEPRECATION" | "INFO";

export interface DiagnosticRelatedReference {
  readonly message: string;
  readonly path?: JsonPointer;
  readonly location?: SourceLocation;
}

export interface Diagnostic {
  /** Stable machine API; human message wording is not a code. */
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly stage: CompilerStage;
  readonly path?: JsonPointer;
  readonly location?: SourceLocation;
  readonly message: string;
  readonly context?: { readonly [key: string]: JsonValue };
  readonly suggestions?: readonly string[];
  readonly related?: readonly DiagnosticRelatedReference[];
}

export interface SourceMapEntry {
  readonly path: JsonPointer;
  readonly location: SourceLocation;
}

/** A sidecar only: never included in canonical semantic serialization/hash. */
export interface SourceMap {
  readonly entries: readonly SourceMapEntry[];
}
