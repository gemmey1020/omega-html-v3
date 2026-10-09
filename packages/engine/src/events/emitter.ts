import { randomUUID } from "node:crypto";
import {
  BUILD_EVENT_VERSION,
  type BuildEvent,
  type BuildEventListener,
  type BuildEventPayload,
  type EventCorrelation,
  type ExecutionControl,
} from "./events.js";

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Attempt-local synchronous observer; observer failures cannot alter builds. */
export class BuildEventEmitter {
  readonly correlation: EventCorrelation;
  private sequence = 0;
  private terminal = false;
  private readonly listener: BuildEventListener | undefined;

  constructor(
    operation: EventCorrelation["operation"],
    control: ExecutionControl = {},
  ) {
    this.correlation = Object.freeze({
      operation,
      buildId: control.buildId ?? randomUUID(),
      taskId: control.taskId ?? randomUUID(),
    });
    this.listener = control.onEvent;
  }

  emit(payload: BuildEventPayload): BuildEvent | undefined {
    if (this.terminal) return undefined;
    const event = freeze(
      structuredClone({
        ...payload,
        ...this.correlation,
        version: BUILD_EVENT_VERSION,
        sequence: ++this.sequence,
      }),
    ) as BuildEvent;
    if (
      ["build.completed", "build.failed", "build.cancelled"].includes(
        event.name,
      )
    )
      this.terminal = true;
    try {
      this.listener?.(event);
    } catch {
      /* Telemetry is an observer, never an execution adapter. */
    }
    return event;
  }
}
