import type { Readable, Writable } from "node:stream";
import { BUILD_EVENT_NAMES, BUILD_EVENT_VERSION } from "../events/events.js";
import {
  OEP_LIMITS,
  OepDecoder,
  OepError,
  type OepEvent,
  type OepMethod,
  type OepParams,
  type OepResults,
  OepWriter,
  record,
  validId,
} from "./oep-types.js";

/** Structured OEP peer; never parses human CLI prose or owns/kills a child. */
export class OepClient {
  private next = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();
  private readonly writer: OepWriter;
  private readonly decoder: OepDecoder;
  private closed = false;
  constructor(
    private readonly input: Readable,
    output: Writable,
    private readonly onEvent?: (notification: OepEvent) => void,
  ) {
    this.writer = new OepWriter(output, () =>
      this.fail(new Error("OEP transport output failed.")),
    );
    this.decoder = new OepDecoder(
      OEP_LIMITS.responseFrameBytes,
      (value) => this.receive(value),
      (error) => this.fail(error),
    );
    input.on("data", this.onData);
    input.on("end", this.onEnd);
    input.on("close", this.onEnd);
    input.on("error", this.onError);
    output.on("error", this.onError);
    output.on("close", this.onError);
    this.output = output;
  }
  private readonly output: Writable;
  private readonly onData = (chunk: Buffer) => this.decoder.push(chunk);
  private readonly onEnd = () => {
    this.decoder.end();
    this.fail(new Error("OEP transport closed."));
  };
  private readonly onError = () =>
    this.fail(new Error("OEP transport failed."));
  private receive(value: unknown): void {
    if (!record(value) || value.jsonrpc !== "2.0") {
      this.fail(new Error("Invalid OEP response."));
      return;
    }
    if (value.method === "omega.event") {
      if (
        !record(value.params) ||
        !validId(value.params.requestId) ||
        !record(value.params.event) ||
        value.params.event.version !== BUILD_EVENT_VERSION ||
        !(BUILD_EVENT_NAMES as readonly unknown[]).includes(
          value.params.event.name,
        ) ||
        !Number.isSafeInteger(value.params.event.sequence)
      ) {
        this.fail(new Error("Invalid OEP event."));
        return;
      }
      try {
        this.onEvent?.(value.params as unknown as OepEvent);
      } catch {
        /* Client observers have no execution authority. */
      }
      return;
    }
    if (typeof value.id !== "number" || !this.pending.has(value.id)) {
      this.fail(new Error("Unexpected OEP response ID."));
      return;
    }
    const entry = this.pending.get(value.id);
    if (!entry) return;
    if (
      Object.hasOwn(value, "error") &&
      !Object.hasOwn(value, "result") &&
      record(value.error) &&
      Number.isInteger(value.error.code) &&
      typeof value.error.message === "string"
    ) {
      this.pending.delete(value.id);
      entry.reject(
        new OepError(value.error.code as number, value.error.message),
      );
    } else if (
      Object.hasOwn(value, "result") &&
      !Object.hasOwn(value, "error")
    ) {
      this.pending.delete(value.id);
      entry.resolve(value.result);
    } else this.fail(new Error("Invalid OEP response payload."));
  }
  request<M extends OepMethod>(
    method: M,
    params: OepParams[M],
  ): Promise<OepResults[M]> {
    if (this.closed) return Promise.reject(new Error("OEP client is closed."));
    // Keep one pending slot and the final session ID for orderly shutdown.
    if (
      (this.pending.size >= OEP_LIMITS.activeRequests &&
        method !== "omega.cancel" &&
        method !== "omega.shutdown") ||
      this.pending.size >= OEP_LIMITS.activeRequests + 2 ||
      (this.next >= OEP_LIMITS.sessionRequests - 1 &&
        method !== "omega.shutdown")
    )
      return Promise.reject(new Error("OEP client request limit reached."));
    const id = ++this.next;
    return new Promise<OepResults[M]>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as OepResults[M]),
        reject,
      });
      const frame = { jsonrpc: "2.0", id, method, params };
      if (
        Buffer.byteLength(JSON.stringify(frame)) > OEP_LIMITS.requestFrameBytes
      ) {
        this.pending.delete(id);
        reject(new Error("OEP request frame exceeds the byte limit."));
        return;
      }
      this.writer.send(frame);
    });
  }
  private fail(error: Error) {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
    this.detach();
  }
  private detach() {
    this.input.off("data", this.onData);
    this.input.off("end", this.onEnd);
    this.input.off("close", this.onEnd);
    this.input.off("error", this.onError);
    this.output.off("error", this.onError);
    this.output.off("close", this.onError);
  }
  dispose(): void {
    this.fail(new Error("OEP client disposed."));
  }
}
