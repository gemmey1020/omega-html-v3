import type { Writable } from "node:stream";
import { createMinimalCapabilityRegistry } from "@omega/capability-registry";
import {
  CANONICAL_CONTRACT_VERSION,
  type CompilerSource,
  RAW_SCHEMA_VERSION,
} from "@omega/contracts";
import { createMinimalPlan } from "@omega/presentation-engine";
import { canonicalizeJson } from "@omega/spec-frontend";
import type {
  BuildResult,
  CapabilitiesResult,
  EngineRequest,
  ExecutionSettings,
  ExplainResult,
  InspectResult,
  MigrateResult,
  PlanResult,
  RenderPlan,
  ValidateResult,
} from "../api/types.js";
import { ENGINE_VERSION } from "../api/types.js";
import type { BuildEvent } from "../events/events.js";
import { BUILD_EVENT_VERSION } from "../events/events.js";

/** OEP 1.0: one UTF-8 JSON-RPC 2.0 object per LF (CRLF accepted); no batches.
 * Requests require unique string/safe-integer IDs; notifications are server-only.
 * Runtime signals/listeners are created locally, never accepted from JSON.
 */
export const OEP_VERSION = "1.0";
export const OEP_LIMITS = Object.freeze({
  requestFrameBytes: 1024 * 1024,
  responseFrameBytes: 16 * 1024 * 1024,
  queuedOutputBytes: 16 * 1024 * 1024,
  activeRequests: 8,
  sessionRequests: 4096,
  outputDrainMs: 3000,
});
export const OEP_METHODS = Object.freeze([
  "omega.initialize",
  "omega.validate",
  "omega.plan",
  "omega.build",
  "omega.inspect",
  "omega.explain",
  "omega.capabilities",
  "omega.migrate",
  "omega.cancel",
  "omega.shutdown",
] as const);
export type OepMethod = (typeof OEP_METHODS)[number];
export type OepId = string | number;
export type WireSource =
  | { readonly module: string; readonly text: string; readonly bytes?: never }
  | {
      readonly module: string;
      readonly bytes: readonly number[];
      readonly text?: never;
    };
export interface WireControl {
  readonly buildId?: string;
  readonly taskId?: string;
}
export interface WireSourceParams {
  readonly source: WireSource;
  readonly settings?: ExecutionSettings;
  readonly control?: WireControl;
}
export interface OepParams {
  "omega.initialize": { readonly oepVersion: typeof OEP_VERSION };
  "omega.validate": WireSourceParams;
  "omega.plan": WireSourceParams;
  "omega.build": WireSourceParams;
  "omega.inspect": WireSourceParams;
  "omega.explain": {
    readonly plan: RenderPlan;
    readonly control?: WireControl;
  };
  "omega.capabilities": { readonly control?: WireControl };
  "omega.migrate": {
    readonly source: WireSource;
    readonly targetVersion: string;
    readonly control?: WireControl;
  };
  "omega.cancel": { readonly requestId: OepId };
  "omega.shutdown": Record<string, never>;
}
export const OEP_VERSIONS = Object.freeze({
  oepVersion: OEP_VERSION,
  engineVersion: ENGINE_VERSION,
  rawSchemaVersion: RAW_SCHEMA_VERSION,
  canonicalContractVersion: CANONICAL_CONTRACT_VERSION,
  eventVersion: BUILD_EVENT_VERSION,
});
export interface OepResults {
  "omega.initialize": typeof OEP_VERSIONS & {
    readonly limits: typeof OEP_LIMITS;
  };
  "omega.validate": ValidateResult;
  "omega.plan": PlanResult;
  "omega.build": BuildResult;
  "omega.inspect": InspectResult;
  "omega.explain": ExplainResult;
  "omega.capabilities": CapabilitiesResult;
  "omega.migrate": MigrateResult;
  "omega.cancel": {
    readonly status:
      | "requested"
      | "already-requested"
      | "completed"
      | "unknown";
  };
  "omega.shutdown": { readonly status: "shutdown" };
}
export type OepEvent = {
  readonly requestId: OepId;
  readonly event: BuildEvent;
};
export type OepFrame =
  | {
      readonly jsonrpc: "2.0";
      readonly id: OepId | null;
      readonly result: unknown;
    }
  | {
      readonly jsonrpc: "2.0";
      readonly id: OepId | null;
      readonly error: { readonly code: number; readonly message: string };
    }
  | {
      readonly jsonrpc: "2.0";
      readonly method: "omega.event";
      readonly params: OepEvent;
    };
export class OepError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "OepError";
  }
}
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function validId(value: unknown): value is OepId {
  return typeof value === "string"
    ? value.length > 0 && value.length <= 128
    : typeof value === "number" && Number.isSafeInteger(value);
}
function only(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}
function invalid(): never {
  throw new OepError(-32602, "Invalid method parameters.");
}
function string(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4096;
}
function wireSource(value: unknown): CompilerSource {
  if (
    !record(value) ||
    !only(value, ["module", "text", "bytes"]) ||
    !string(value.module)
  )
    return invalid();
  if (typeof value.text === "string" && !Object.hasOwn(value, "bytes"))
    return { module: value.module, text: value.text };
  if (
    !Object.hasOwn(value, "text") &&
    Array.isArray(value.bytes) &&
    value.bytes.every(
      (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255,
    )
  )
    return { module: value.module, text: Uint8Array.from(value.bytes) };
  return invalid();
}
function settings(value: unknown): ExecutionSettings | undefined {
  if (value === undefined) return undefined;
  if (
    !record(value) ||
    !only(value, [
      "quality",
      "diagnostics",
      "cache",
      "outputDirectory",
      "cacheDirectory",
    ])
  )
    return invalid();
  for (const [key, choices] of [
    ["quality", ["fast", "release"]],
    ["diagnostics", ["normal", "full"]],
    ["cache", ["use", "refresh", "off"]],
  ] as const)
    if (value[key] !== undefined && !choices.includes(value[key] as never))
      return invalid();
  for (const key of ["outputDirectory", "cacheDirectory"])
    if (value[key] !== undefined && !string(value[key])) return invalid();
  return value as ExecutionSettings;
}
export function wireControl(value: unknown): WireControl {
  if (value === undefined) return {};
  if (!record(value) || !only(value, ["buildId", "taskId"])) return invalid();
  for (const key of ["buildId", "taskId"])
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" ||
        !/^[A-Za-z0-9._-]{1,128}$/.test(value[key] as string))
    )
      return invalid();
  return value as WireControl;
}
function wirePlan(value: unknown): RenderPlan {
  if (!record(value) || !Array.isArray(value.sections)) return invalid();
  // Admission of a generated plan reuses its producer and Canonical validation.
  // This removes only the producer-owned representation decoration; no Raw parsing.
  function sections(items: unknown[], depth = 0): unknown[] {
    if (depth > 128) return invalid();
    return items.map((item) => {
      if (!record(item) || !Array.isArray(item.sections)) return invalid();
      const {
        representation: _representation,
        sections: nested,
        ...canonical
      } = item;
      return {
        ...canonical,
        sections: sections(nested, depth + 1),
      };
    });
  }
  const canonical = {
    contractVersion: value.canonicalContractVersion,
    kind: "artifact",
    metadata: value.metadata,
    spec: {
      target: value.target,
      presentation: { profile: value.profile },
      document: value.document,
      sections: sections(value.sections),
    },
  };
  // createMinimalPlan accepts typed Canonical input but validates it at runtime.
  const produced = createMinimalPlan({
    canonical: canonical as Parameters<
      typeof createMinimalPlan
    >[0]["canonical"],
    capabilities: createMinimalCapabilityRegistry(),
    engineVersion: ENGINE_VERSION,
  });
  if (
    !produced.ok ||
    canonicalizeJson(produced.plan) !== canonicalizeJson(value)
  )
    return invalid();
  return produced.plan;
}
/** Validate only the wire DTO, then let the Engine's sole compiler interpret source. */
export function engineRequest(
  method: OepMethod,
  value: unknown,
): { request: EngineRequest; control: WireControl } {
  if (!record(value)) return invalid();
  const control = wireControl(value.control);
  switch (method) {
    case "omega.validate":
    case "omega.plan":
    case "omega.build":
    case "omega.inspect": {
      if (!only(value, ["source", "settings", "control"])) return invalid();
      const source = wireSource(value.source);
      const configured = settings(value.settings);
      const operation = method.slice(6) as
        | "validate"
        | "plan"
        | "build"
        | "inspect";
      return {
        request: {
          operation,
          source,
          ...(configured ? { settings: configured } : {}),
        },
        control,
      };
    }
    case "omega.migrate":
      if (
        !only(value, ["source", "targetVersion", "control"]) ||
        !string(value.targetVersion)
      )
        return invalid();
      return {
        request: {
          operation: "migrate",
          source: wireSource(value.source),
          targetVersion: value.targetVersion,
        },
        control,
      };
    case "omega.explain":
      if (!only(value, ["plan", "control"])) return invalid();
      return {
        request: { operation: "explain", plan: wirePlan(value.plan) },
        control,
      };
    case "omega.capabilities":
      if (!only(value, ["control"])) return invalid();
      return { request: { operation: "capabilities" }, control };
    default:
      return invalid();
  }
}

/** Byte-bounded UTF-8 decoder; chunk boundaries may bisect multibyte characters.
 * Oversized frames discard through LF and recover without retaining their bytes.
 */
export class OepDecoder {
  private readonly buffer: Buffer;
  private size = 0;
  private discarding = false;
  constructor(
    private readonly limit: number,
    private readonly receive: (value: unknown) => void,
    private readonly fail: (error: OepError) => void,
  ) {
    this.buffer = Buffer.allocUnsafe(limit);
  }
  push(chunk: Buffer): void {
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf(10, start);
      const end = newline < 0 ? chunk.length : newline;
      const length = end - start;
      if (!this.discarding) {
        if (this.size + length > this.limit) {
          this.size = 0;
          this.discarding = true;
          this.fail(
            new OepError(-32005, "Protocol frame exceeds the byte limit."),
          );
        } else {
          chunk.copy(this.buffer, this.size, start, end);
          this.size += length;
        }
      }
      if (newline < 0) return;
      if (!this.discarding) {
        const bytes = this.buffer.subarray(0, this.size);
        this.size = 0;
        let value: unknown;
        try {
          value = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          );
        } catch {
          this.fail(new OepError(-32700, "Invalid UTF-8 JSON protocol frame."));
          start = newline + 1;
          continue;
        }
        this.receive(value);
      }
      this.discarding = false;
      start = newline + 1;
    }
  }
  end(): void {
    if (this.size || this.discarding)
      this.fail(new OepError(-32700, "Unterminated protocol frame."));
    this.size = 0;
    this.discarding = false;
  }
}
/** Writable callbacks bound bytes in Node's queue; slow peers cannot grow it forever. */
export class OepWriter {
  private queued = 0;
  private pending = new Set<Promise<void>>();
  private failed = false;
  constructor(
    private readonly output: Writable,
    private readonly onFailure: () => void,
  ) {}
  send(frame: object): void {
    if (this.failed) return;
    const bytes = Buffer.from(`${JSON.stringify(frame)}\n`);
    if (
      bytes.length > OEP_LIMITS.responseFrameBytes ||
      this.queued + bytes.length > OEP_LIMITS.queuedOutputBytes
    ) {
      this.failed = true;
      this.onFailure();
      return;
    }
    this.queued += bytes.length;
    let done!: () => void;
    const completion = new Promise<void>((resolve) => {
      done = resolve;
    });
    this.pending.add(completion);
    const finish = (error?: Error | null) => {
      this.queued -= bytes.length;
      this.pending.delete(completion);
      done();
      if (error && !this.failed) {
        this.failed = true;
        this.onFailure();
      }
    };
    try {
      this.output.write(bytes, finish);
    } catch {
      finish(new Error("Protocol write failed."));
    }
  }
  async drain(timeoutMs: number = OEP_LIMITS.outputDrainMs): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        this.failed = true;
        resolve(false);
      }, timeoutMs);
    });
    const drained = await Promise.race([
      Promise.all(this.pending).then(() => !this.failed),
      timeout,
    ]);
    clearTimeout(timer);
    return drained;
  }
}
