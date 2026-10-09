import type {
  EngineDiagnostic,
  EngineOperation,
  EngineStage,
  FailureClass,
} from "../api/types.js";
import type { CancellationToken } from "../lifecycle/cancellation.js";

export const BUILD_EVENT_VERSION = "omega-events/1.0";
export const BUILD_EVENT_NAMES = Object.freeze([
  "engine.ready",
  "build.started",
  "stage.started",
  "stage.progress",
  "stage.completed",
  "diagnostic.emitted",
  "cache.hit",
  "cache.miss",
  "artifact.produced",
  "qa.completed",
  "build.completed",
  "build.failed",
  "build.cancelled",
] as const);
export type BuildEventName = (typeof BUILD_EVENT_NAMES)[number];

/** Adapter telemetry carries no terminal authority or correlation fields. */
export type StageEventPayload =
  | {
      readonly name: "stage.progress";
      readonly completed: number;
      readonly total?: number;
      readonly message?: string;
    }
  | { readonly name: "cache.hit" | "cache.miss"; readonly actionKey: string };

export type BuildEventPayload =
  | { readonly name: "engine.ready" | "build.started" }
  | { readonly name: "stage.started"; readonly stage: EngineStage }
  | {
      readonly name: "stage.completed";
      readonly stage: EngineStage;
      readonly status: "succeeded" | "failed" | "cancelled";
    }
  | (StageEventPayload & { readonly stage: EngineStage })
  | {
      readonly name: "diagnostic.emitted";
      readonly stage: EngineStage;
      readonly diagnostic: EngineDiagnostic;
    }
  | {
      readonly name: "artifact.produced";
      readonly stage: "package";
      readonly state: "candidate";
    }
  | {
      readonly name: "qa.completed";
      readonly stage: "verify" | "quality" | "regression" | "acceptance";
      readonly status: "succeeded" | "failed";
      readonly policy: string;
    }
  | { readonly name: "build.completed"; readonly status: "succeeded" }
  | {
      readonly name: "build.failed";
      readonly status: "failed";
      readonly stage: EngineStage;
      readonly failureClass: FailureClass;
      readonly publication?: "committed";
    }
  | {
      readonly name: "build.cancelled";
      readonly status: "cancelled";
      readonly stage: EngineStage;
    };

export interface EventCorrelation {
  readonly buildId: string;
  readonly taskId: string;
  readonly operation: EngineOperation;
}
export type BuildEvent = BuildEventPayload &
  EventCorrelation & {
    readonly version: typeof BUILD_EVENT_VERSION;
    readonly sequence: number;
  };
export type BuildEventListener = (event: BuildEvent) => void;

/** Runtime controls stay separate from portable JSON requests and stage data. */
export interface ExecutionControl {
  readonly buildId?: string;
  readonly taskId?: string;
  readonly cancellationToken?: CancellationToken;
  readonly onEvent?: BuildEventListener;
}
