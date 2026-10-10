import type { Readable, Writable } from "node:stream";
import type { OmegaEngine } from "../api/engine.js";
import { createProductionEngine } from "../api/production-engine.js";
import type { EngineRequest, EngineResult } from "../api/types.js";
import type { ExecutionControl } from "../events/events.js";
import { CancellationTokenSource } from "../lifecycle/cancellation.js";
import {
  engineRequest,
  OEP_LIMITS,
  OEP_METHODS,
  OEP_VERSION,
  OEP_VERSIONS,
  OepDecoder,
  OepError,
  type OepId,
  type OepMethod,
  OepWriter,
  record,
  validId,
} from "./oep-types.js";

function execute(
  engine: OmegaEngine,
  request: EngineRequest,
  control: ExecutionControl,
): Promise<EngineResult> {
  switch (request.operation) {
    case "validate":
      return engine.validate(request, control);
    case "plan":
      return engine.plan(request, control);
    case "build":
      return engine.build(request, control);
    case "inspect":
      return engine.inspect(request, control);
    case "explain":
      return engine.explain(request, control);
    case "migrate":
      return engine.migrate(request, control);
    case "capabilities":
      return engine.capabilities(request, control);
  }
}
/** One local session; the production factory owns every attempt's real resources. */
export function serveOep(
  input: Readable,
  output: Writable,
  log: Writable,
): Promise<number> {
  const engine = createProductionEngine();
  const seen = new Set<OepId>();
  const completed = new Set<OepId>();
  const active = new Map<
    OepId,
    {
      cancellation: CancellationTokenSource;
      settled: Promise<void>;
      terminal: boolean;
    }
  >();
  let initialized = false;
  let closing = false;
  let stopped = false;
  let code = 0;
  let done!: (value: number) => void;
  const finished = new Promise<number>((resolve) => {
    done = resolve;
  });
  const writer = new OepWriter(output, () => {
    code = 4;
    log.write("OEP transport output failed.\n");
    void shutdown();
  });
  function error(id: OepId | null, value: OepError) {
    writer.send({
      jsonrpc: "2.0",
      id,
      error: { code: value.code, message: value.message },
    });
  }
  function result(id: OepId, value: unknown) {
    writer.send({ jsonrpc: "2.0", id, result: value });
  }
  async function shutdown(id?: OepId): Promise<void> {
    if (closing) return;
    closing = true;
    for (const entry of active.values()) entry.cancellation.cancel();
    await Promise.all([...active.values()].map((entry) => entry.settled));
    if (id !== undefined) result(id, { status: "shutdown" });
    if (!(await writer.drain())) {
      code = 4;
      log.write(
        "OEP output could not be drained within the transport limit.\n",
      );
      output.destroy();
    }
    stopped = true;
    input.off("data", onData);
    input.off("end", onEnd);
    input.off("close", onEnd);
    input.off("error", onInputError);
    input.pause();
    output.off("error", onOutputError);
    output.off("close", onOutputError);
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onInterrupt);
    done(code);
  }
  function accept(value: unknown): void {
    let id: OepId | null = null;
    try {
      if (
        !record(value) ||
        value.jsonrpc !== "2.0" ||
        !validId(value.id) ||
        typeof value.method !== "string" ||
        !Object.keys(value).every((key) =>
          ["jsonrpc", "id", "method", "params"].includes(key),
        )
      )
        throw new OepError(
          -32600,
          "Invalid JSON-RPC request; IDs are required and batches are unsupported.",
        );
      id = value.id;
      if (closing)
        throw new OepError(-32002, "Engine session is shutting down.");
      if (seen.has(id))
        throw new OepError(
          -32004,
          "Request ID was already used in this session.",
        );
      // Reserve one ID for shutdown so every full session retains an orderly exit.
      if (
        seen.size >= OEP_LIMITS.sessionRequests - 1 &&
        value.method !== "omega.shutdown"
      )
        throw new OepError(
          -32005,
          "Session request limit reached; shut down and initialize a new session.",
        );
      seen.add(id);
      if (!(OEP_METHODS as readonly string[]).includes(value.method))
        throw new OepError(-32601, "Unknown OEP method.");
      const method = value.method as OepMethod;
      const params = Object.hasOwn(value, "params") ? value.params : {};
      if (!record(params))
        throw new OepError(-32602, "Invalid method parameters.");
      if (method === "omega.initialize") {
        if (initialized)
          throw new OepError(-32004, "Engine session is already initialized.");
        if (
          Object.keys(params).join(",") !== "oepVersion" ||
          typeof params.oepVersion !== "string"
        )
          throw new OepError(-32602, "Invalid initialization parameters.");
        if (params.oepVersion !== OEP_VERSION)
          throw new OepError(-32003, "Unsupported OEP version.");
        initialized = true;
        result(id, { ...OEP_VERSIONS, limits: OEP_LIMITS });
        return;
      }
      if (!initialized)
        throw new OepError(-32001, "Initialize the Engine session first.");
      if (method === "omega.shutdown") {
        if (Object.keys(params).length)
          throw new OepError(-32602, "Shutdown takes no parameters.");
        void shutdown(id);
        return;
      }
      if (method === "omega.cancel") {
        if (
          Object.keys(params).join(",") !== "requestId" ||
          !validId(params.requestId)
        )
          throw new OepError(-32602, "Invalid cancellation target.");
        const entry = active.get(params.requestId);
        if (!entry || entry.terminal)
          result(id, {
            status:
              completed.has(params.requestId) || entry?.terminal
                ? "completed"
                : "unknown",
          });
        else {
          const requested = entry.cancellation.token.signal.aborted;
          entry.cancellation.cancel();
          result(id, { status: requested ? "already-requested" : "requested" });
        }
        return;
      }
      const mapped = engineRequest(method, params);
      if (active.size >= OEP_LIMITS.activeRequests)
        throw new OepError(-32005, "Active Engine request limit reached.");
      const entry = {
        cancellation: new CancellationTokenSource(),
        terminal: false,
        settled: Promise.resolve(),
      };
      active.set(id, entry);
      const requestId = id;
      // Defer execution once so the complete ownership record exists before events/awaits.
      entry.settled = Promise.resolve().then(async () => {
        try {
          const outcome = await execute(engine, mapped.request, {
            ...mapped.control,
            cancellationToken: entry.cancellation.token,
            onEvent: (event) => {
              if (
                ["build.completed", "build.failed", "build.cancelled"].includes(
                  event.name,
                )
              )
                entry.terminal = true;
              writer.send({
                jsonrpc: "2.0",
                method: "omega.event",
                params: { requestId, event },
              });
            },
          });
          result(requestId, outcome);
        } catch {
          error(
            requestId,
            new OepError(-32603, "Unexpected protocol execution error."),
          );
        } finally {
          completed.add(requestId);
          active.delete(requestId);
        }
      });
    } catch (failure) {
      error(
        id,
        failure instanceof OepError
          ? failure
          : new OepError(-32603, "Unexpected protocol error."),
      );
    }
  }
  const decoder = new OepDecoder(
    OEP_LIMITS.requestFrameBytes,
    accept,
    (failure) => error(null, failure),
  );
  function onData(chunk: Buffer) {
    if (!stopped) decoder.push(chunk);
  }
  function onEnd() {
    decoder.end();
    void shutdown();
  }
  function onInputError() {
    code = 4;
    log.write("OEP transport input failed.\n");
    void shutdown();
  }
  function onOutputError() {
    if (stopped) return;
    code = 4;
    void shutdown();
  }
  function onInterrupt() {
    void shutdown();
  }
  input.on("data", onData);
  input.on("end", onEnd);
  input.on("close", onEnd);
  input.on("error", onInputError);
  output.on("error", onOutputError);
  output.on("close", onOutputError);
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onInterrupt);
  return finished;
}
