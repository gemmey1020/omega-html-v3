import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import type { BuildEvent, EngineResult, PlanResult } from "../src/index.js";

const launcher = resolve(import.meta.dirname, "../../cli/src/launch.mjs");
const text =
  "omega: {schema: '3.0'}\nkind: artifact\nspec:\n  document: {title: Protocol}\n  sections: [{id: intro, title: Introduction, body: 'Running. مرحباً'}]\n";
const source = { module: "protocol.omega.yaml", text };
type Frame = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { requestId: string | number; event: BuildEvent };
  result?: unknown;
  error?: { code: number; message: string };
};
function childSession(
  env: NodeJS.ProcessEnv = {},
  nodeArgs: readonly string[] = [],
  args: readonly string[] = ["engine", "--stdio"],
) {
  const child = spawn(process.execPath, [...nodeArgs, launcher, ...args], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  let stdin = "";
  let stdout = "";
  let stderr = "";
  let buffer = "";
  const frames: Frame[] = [];
  const waiters = new Set<() => void>();
  const closed = new Promise<number | null>((done) => child.on("close", done));
  let ended = false;
  child.on("close", () => {
    ended = true;
    for (const wake of waiters) wake();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
    buffer += chunk.toString();
    let end = buffer.indexOf("\n");
    while (end >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      frames.push(JSON.parse(line) as Frame);
      end = buffer.indexOf("\n");
    }
    for (const wake of waiters) wake();
  });
  async function wait(
    predicate: (frame: Frame) => boolean,
    after = 0,
  ): Promise<Frame> {
    const existing = frames.slice(after).find(predicate);
    if (existing) return existing;
    return new Promise((done, reject) => {
      const timeout = setTimeout(() => {
        waiters.delete(wake);
        reject(new Error("Protocol response timed out"));
      }, 30000);
      const wake = () => {
        const found = frames.slice(after).find(predicate);
        if (found || ended) {
          clearTimeout(timeout);
          waiters.delete(wake);
          done(found ?? frames[0] ?? {});
        }
      };
      waiters.add(wake);
      wake();
    });
  }
  function send(id: string | number, method: string, params: unknown = {}) {
    const after = frames.length;
    const frame = `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`;
    stdin += frame;
    child.stdin.write(frame);
    return wait((frame) => frame.id === id, after);
  }
  return {
    child,
    closed,
    frames,
    send,
    wait,
    write: (bytes: string | Buffer) => child.stdin.write(bytes),
    output: () => ({ stdin, stdout, stderr }),
    dispose: () => {
      if (!ended) child.kill("SIGKILL");
    },
  };
}
async function initialize(session: ReturnType<typeof childSession>) {
  const frame = await session.send("init", "omega.initialize", {
    oepVersion: "1.0",
  });
  expect(frame.result).toMatchObject({
    engineVersion: "0.0.0",
    oepVersion: "1.0",
    rawSchemaVersion: "3.0",
    canonicalContractVersion: "1.0",
    eventVersion: "omega-events/1.0",
  });
}
async function stop(session: ReturnType<typeof childSession>) {
  expect((await session.send("shutdown", "omega.shutdown")).result).toEqual({
    status: "shutdown",
  });
  expect(await session.closed).toBe(0);
  expect(session.output().stderr).toBe("");
  expect(session.frames.every((frame) => frame.jsonrpc === "2.0")).toBe(true);
  expect(session.output().stdout).not.toContain("\u001b");
}

test("oep_client_never_parses_human_cli_output", async () => {
  const session = childSession();
  try {
    await initialize(session);
    const result = (
      await session.send("validate", "omega.validate", { source })
    ).result as EngineResult;
    expect(result).toMatchObject({
      operation: "validate",
      status: "succeeded",
    });
    await stop(session);
  } finally {
    session.dispose();
  }
}, 40000);

test("all_engine_methods_are_real_structured_results_with_text_and_bytes", async () => {
  const session = childSession();
  try {
    await initialize(session);
    const result = (await session.send("plan", "omega.plan", { source }))
      .result as PlanResult;
    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") throw new Error("Plan failed");
    expect(
      (
        await session.send("explain", "omega.explain", {
          plan: result.value.plan,
        })
      ).result,
    ).toMatchObject({
      operation: "explain",
      status: "succeeded",
      value: { planHash: result.value.plan.planHash },
    });
    expect(
      (
        await session.send("inspect", "omega.inspect", {
          source: { module: source.module, bytes: [...Buffer.from(text)] },
        })
      ).result,
    ).toMatchObject({
      operation: "inspect",
      status: "succeeded",
      value: {
        compiled: { normalizedHash: result.value.compiled.normalizedHash },
      },
    });
    expect(
      (await session.send("capabilities", "omega.capabilities")).result,
    ).toMatchObject({ operation: "capabilities", status: "succeeded" });
    const migration = (
      await session.send("migrate", "omega.migrate", {
        source,
        targetVersion: "3.0",
      })
    ).result as EngineResult;
    expect(migration).toMatchObject({
      operation: "migrate",
      status: "failed",
      failureClass: "validation",
    });
    expect(migration.diagnostics[0]?.code).toBe(
      "OMEGA-MIGRATION-UNSUPPORTED-ROUTE",
    );
    expect(
      (
        await session.send("invalid", "omega.validate", {
          source: { ...source, text: "omega: [broken" },
        })
      ).result,
    ).toMatchObject({ status: "failed", failureClass: "validation" });
    expect(
      (
        await session.send("byte-gate", "omega.validate", {
          source: { module: "bad.omega.yaml", bytes: [255] },
        })
      ).result,
    ).toMatchObject({ status: "failed", failureClass: "validation" });
    await stop(session);
  } finally {
    session.dispose();
  }
}, 40000);

test("real_build_stream_final_identity_and_concurrent_cancel_preserve_accepted_pair", async () => {
  const session = childSession();
  const root = await mkdtemp(join(tmpdir(), "omega-oep-"));
  try {
    await initialize(session);
    const params = {
      source,
      control: { buildId: "wire-build", taskId: "wire-task" },
      settings: { outputDirectory: join(root, "dist"), cache: "off" },
    };
    expect(
      (await session.send("validation", "omega.validate", { source })).result,
    ).toMatchObject({ status: "succeeded" });
    const built = (await session.send("accepted", "omega.build", params))
      .result as EngineResult;
    expect(built.status).toBe("succeeded");
    if (built.status !== "succeeded" || built.operation !== "build")
      throw new Error("Build failed");
    const html = await readFile(built.value.finalArtifactPath);
    const receipt = await readFile(built.value.finalReceiptPath);
    expect(built.value.finalArtifactPath).toContain(".omega-generations/");
    const events = session.frames
      .filter((frame) => frame.params?.requestId === "accepted")
      .map((frame) => frame.params?.event);
    expect(events.at(-1)?.name).toBe("build.completed");
    expect(
      events.every(
        (event) =>
          event?.buildId === "wire-build" && event.taskId === "wire-task",
      ),
    ).toBe(true);
    expect(
      events.filter((event) => event?.name === "qa.completed"),
    ).toHaveLength(4);
    expect(events.every((event) => event?.version === "omega-events/1.0")).toBe(
      true,
    );
    expect(
      (await session.send("late", "omega.cancel", { requestId: "accepted" }))
        .result,
    ).toEqual({ status: "completed" });
    const pending = session.send("cancelled", "omega.build", params);
    await session.wait(
      (frame) =>
        frame.params?.requestId === "cancelled" &&
        frame.params.event.name === "stage.started" &&
        frame.params.event.stage === "render",
    );
    expect(
      (await session.send("cancel", "omega.cancel", { requestId: "cancelled" }))
        .result,
    ).toEqual({ status: "requested" });
    expect(
      (await session.send("again", "omega.cancel", { requestId: "cancelled" }))
        .result,
    ).toMatchObject({
      status: expect.stringMatching(/already-requested|completed/),
    });
    expect((await pending).result).toMatchObject({
      operation: "build",
      status: "cancelled",
    });
    expect(await readFile(join(root, "dist/current/artifact.html"))).toEqual(
      html,
    );
    expect(
      await readFile(join(root, "dist/current/build-receipt.json")),
    ).toEqual(receipt);
    expect(
      (await readdir(join(root, "dist"))).filter((name) =>
        name.startsWith(".omega-workspace"),
      ),
    ).toEqual([]);
    expect(
      session.frames.filter(
        (frame) =>
          frame.params?.requestId === "cancelled" &&
          frame.params.event.name === "build.cancelled",
      ),
    ).toHaveLength(1);
    expect(
      (await session.send("unknown", "omega.cancel", { requestId: "absent" }))
        .result,
    ).toEqual({ status: "unknown" });
    await stop(session);
    if (process.env.OMEGA_OEP_EVIDENCE_DIRECTORY) {
      const evidence = process.env.OMEGA_OEP_EVIDENCE_DIRECTORY;
      const captured = session.output();
      await writeFile(join(evidence, "child-stdin.jsonl"), captured.stdin);
      await writeFile(join(evidence, "child-stdout.jsonl"), captured.stdout);
      await writeFile(join(evidence, "child-stderr.log"), captured.stderr);
      await writeFile(
        join(evidence, "child-exit-receipt.json"),
        `${JSON.stringify({ launcher, args: ["engine", "--stdio"], exitCode: await session.closed, frameCount: session.frames.length, stdoutProtocolOnly: session.frames.every((frame) => frame.jsonrpc === "2.0"), stderrBytes: Buffer.byteLength(captured.stderr), acceptedArtifactPath: built.value.finalArtifactPath, artifactHash: built.value.receipt.artifactHash, implementation: built.value.receipt.implementation }, null, 2)}\n`,
      );
    }
  } finally {
    session.dispose();
    await session.closed;
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("shutdown_cancels_drains_real_browser_attempt_and_closes_admission", async () => {
  const session = childSession();
  const root = await mkdtemp(join(tmpdir(), "omega-oep-shutdown-"));
  try {
    await initialize(session);
    const pending = session.send("active", "omega.build", {
      source,
      settings: { outputDirectory: join(root, "dist"), cache: "off" },
    });
    await session.wait(
      (frame) =>
        frame.params?.requestId === "active" &&
        frame.params.event.name === "stage.started" &&
        frame.params.event.stage === "verify",
    );
    const shutdown = session.send("shutdown", "omega.shutdown");
    const refused = session.send("refused", "omega.capabilities");
    expect((await refused).error?.code).toBe(-32002);
    expect((await pending).result).toMatchObject({ status: "cancelled" });
    expect((await shutdown).result).toEqual({ status: "shutdown" });
    expect(await session.closed).toBe(0);
    expect(await readdir(join(root, "dist/.omega-generations"))).toEqual([]);
    expect(
      (await readdir(join(root, "dist"))).filter((name) =>
        name.startsWith(".omega-workspace"),
      ),
    ).toEqual([]);
    expect(session.output().stderr).toBe("");
  } finally {
    session.dispose();
    await session.closed;
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("framing_chunking_order_errors_versions_and_duplicate_ids_are_deliberate", async () => {
  const session = childSession();
  try {
    expect(
      (await session.send("before", "omega.capabilities")).error?.code,
    ).toBe(-32001);
    expect(
      (await session.send("version", "omega.initialize", { oepVersion: "2.0" }))
        .error?.code,
    ).toBe(-32003);
    await initialize(session);
    expect(
      (
        await session.send("init-again", "omega.initialize", {
          oepVersion: "1.0",
        })
      ).error?.code,
    ).toBe(-32004);
    expect((await session.send("no-method", "omega.nope")).error?.code).toBe(
      -32601,
    );
    for (const [id, method, params] of [
      ["bad-source", "omega.validate", { source: { ...source, bytes: [0] } }],
      ["bad-byte", "omega.validate", { source: { module: "x", bytes: [256] } }],
      [
        "bad-setting",
        "omega.build",
        { source, settings: { cache: "invalid" } },
      ],
      ["raw-control", "omega.validate", { source, cancellationToken: {} }],
      ["bad-plan", "omega.explain", { plan: {} }],
      ["bad-target", "omega.cancel", { requestId: {} }],
    ] as const)
      expect((await session.send(id, method, params)).error?.code).toBe(-32602);
    const wire = `${JSON.stringify({ jsonrpc: "2.0", id: "chunked", method: "omega.validate", params: { source } })}\r\n`;
    const bytes = Buffer.from(wire);
    const split = bytes.indexOf(Buffer.from("مرح")) + 1;
    session.write(bytes.subarray(0, split));
    session.write(bytes.subarray(split));
    expect(
      (await session.wait((frame) => frame.id === "chunked")).result,
    ).toMatchObject({ status: "succeeded" });
    expect(
      (await session.send("chunked", "omega.capabilities")).error?.code,
    ).toBe(-32004);
    session.write('{"broken":\n[]\n');
    expect(
      (await session.wait((frame) => frame.error?.code === -32700)).id,
    ).toBeNull();
    expect(
      (await session.wait((frame) => frame.error?.code === -32600)).id,
    ).toBeNull();
    await stop(session);
  } finally {
    session.dispose();
  }
}, 40000);

test("oversized_frames_are_discarded_with_bounded_recovery", async () => {
  const session = childSession();
  try {
    await initialize(session);
    session.write(`${" ".repeat(1024 * 1024 + 1)}\n`);
    expect(
      (await session.wait((frame) => frame.error?.code === -32005)).id,
    ).toBeNull();
    expect(
      (await session.send("recovered", "omega.capabilities")).result,
    ).toMatchObject({ status: "succeeded" });
    await stop(session);
  } finally {
    session.dispose();
  }
}, 40000);

test("typed_oep_client_uses_protocol_only_and_rejects_closed_pending_requests", async () => {
  const { OepClient } = await import("../src/protocol/oep-client.js");
  const session = childSession();
  const client = new OepClient(session.child.stdout, session.child.stdin);
  try {
    expect(
      await client.request("omega.initialize", { oepVersion: "1.0" }),
    ).toMatchObject({ oepVersion: "1.0" });
    expect(await client.request("omega.validate", { source })).toMatchObject({
      operation: "validate",
      status: "succeeded",
    });
    await expect(
      client.request("omega.initialize", { oepVersion: "1.0" }),
    ).rejects.toMatchObject({ code: -32004 });
    expect(await client.request("omega.shutdown", {})).toEqual({
      status: "shutdown",
    });
    expect(await session.closed).toBe(0);
    await expect(client.request("omega.capabilities", {})).rejects.toThrow();
    expect(session.output().stderr).toBe("");
  } finally {
    client.dispose();
    session.dispose();
  }
}, 40000);

test("eof_cancels_and_drains_without_publication_and_unterminated_frame_is_rejected", async () => {
  const session = childSession();
  const root = await mkdtemp(join(tmpdir(), "omega-oep-eof-"));
  try {
    await initialize(session);
    const pending = session.send("active", "omega.build", {
      source,
      settings: { outputDirectory: join(root, "dist"), cache: "off" },
    });
    await session.wait(
      (frame) =>
        frame.params?.requestId === "active" &&
        frame.params.event.name === "stage.started" &&
        frame.params.event.stage === "render",
    );
    session.child.stdin.end('{"jsonrpc":"2.0"');
    expect((await pending).result).toMatchObject({ status: "cancelled" });
    expect(await session.closed).toBe(0);
    expect(session.frames.some((frame) => frame.error?.code === -32700)).toBe(
      true,
    );
    expect(await readdir(join(root, "dist/.omega-generations"))).toEqual([]);
    expect(session.output().stderr).toBe("");
  } finally {
    session.dispose();
    await session.closed;
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("client_rejects_pending_on_abrupt_close_without_end_and_removes_listeners", async () => {
  const { OepClient } = await import("../src/protocol/oep-client.js");
  for (const side of ["input", "output"]) {
    const input = new PassThrough();
    const output = new PassThrough();
    const client = new OepClient(input, output);
    const outcome = client.request("omega.capabilities", {}).then(
      () => "resolved",
      () => "rejected",
    );
    if (side === "input") input.destroy();
    else output.destroy();
    expect(
      await Promise.race([
        outcome,
        new Promise((resolve) =>
          setTimeout(() => resolve("still pending"), 100),
        ),
      ]),
    ).toBe("rejected");
    expect(input.listenerCount("data")).toBe(0);
    expect(input.listenerCount("end")).toBe(0);
    client.dispose();
    input.destroy();
    output.destroy();
  }
});

test("client_rejects_human_output_bad_event_and_oversized_request", async () => {
  const { OepClient } = await import("../src/protocol/oep-client.js");
  for (const payload of [
    "validate: succeeded\n",
    `${JSON.stringify({
      jsonrpc: "2.0",
      method: "omega.event",
      params: {
        requestId: 1,
        event: { version: "wrong", name: "build.started", sequence: 1 },
      },
    })}\n`,
  ]) {
    const input = new PassThrough();
    const output = new PassThrough();
    const client = new OepClient(input, output);
    const pending = client.request("omega.capabilities", {});
    const rejected = expect(pending).rejects.toThrow();
    input.write(payload);
    await rejected;
    client.dispose();
    input.destroy();
    output.destroy();
  }
  const input = new PassThrough();
  const output = new PassThrough();
  const client = new OepClient(input, output);
  await expect(
    client.request("omega.validate", {
      source: { module: "x", text: "x".repeat(1024 * 1024) },
    }),
  ).rejects.toThrow("byte limit");
  expect(output.readableLength).toBe(0);
  client.dispose();
  input.destroy();
  output.destroy();
});

test("output_queue_is_byte_bounded_and_stalled_drain_is_bounded", async () => {
  const { OepWriter, OEP_LIMITS } = await import(
    "../src/protocol/oep-types.js"
  );
  const output = new Writable({
    write(_chunk, _encoding, _callback) {
      /* deliberately non-reading peer */
    },
  });
  let failures = 0;
  const writer = new OepWriter(output, () => {
    failures++;
  });
  writer.send({ result: "x".repeat(OEP_LIMITS.queuedOutputBytes / 2) });
  writer.send({ result: "x".repeat(OEP_LIMITS.queuedOutputBytes / 2) });
  expect(failures).toBe(1);
  expect(output.writableLength).toBeLessThanOrEqual(
    OEP_LIMITS.queuedOutputBytes,
  );
  expect(await writer.drain(20)).toBe(false);
  output.destroy();
});

test("capacity_keeps_cancel_and_shutdown_available_while_sessions_remain_bounded", async () => {
  const session = childSession();
  try {
    await initialize(session);
    const requests = Array.from({ length: 9 }, (_, index) => ({
      jsonrpc: "2.0",
      id: `capacity-${index}`,
      method: "omega.build",
      params: { source, settings: { cache: "off" } },
    }));
    requests.push({
      jsonrpc: "2.0",
      id: "control",
      method: "omega.cancel",
      params: { requestId: "capacity-0" },
    } as unknown as (typeof requests)[number]);
    requests.push({
      jsonrpc: "2.0",
      id: "shutdown",
      method: "omega.shutdown",
      params: {},
    } as unknown as (typeof requests)[number]);
    session.write(
      `${requests.map((frame) => JSON.stringify(frame)).join("\n")}\n`,
    );
    expect(
      (await session.wait((frame) => frame.id === "capacity-8")).error?.code,
    ).toBe(-32005);
    expect(
      (await session.wait((frame) => frame.id === "control")).result,
    ).toEqual({ status: "requested" });
    for (let index = 0; index < 8; index++)
      expect(
        (await session.wait((frame) => frame.id === `capacity-${index}`))
          .result,
      ).toMatchObject({ status: "cancelled" });
    expect(
      (await session.wait((frame) => frame.id === "shutdown")).result,
    ).toEqual({ status: "shutdown" });
    expect(await session.closed).toBe(0);
  } finally {
    session.dispose();
  }
  const limited = childSession();
  try {
    await initialize(limited);
    limited.write(
      `${Array.from({ length: 4094 }, (_, index) =>
        JSON.stringify({ jsonrpc: "2.0", id: index, method: "omega.unknown" }),
      ).join("\n")}\n`,
    );
    expect((await limited.wait((frame) => frame.id === 4093)).error?.code).toBe(
      -32601,
    );
    expect(
      (await limited.send("exhausted", "omega.capabilities")).error?.code,
    ).toBe(-32005);
    await stop(limited);
  } finally {
    limited.dispose();
  }
}, 40000);

test("typed_client_receives_real_build_events_and_can_cancel_the_event_request_id", async () => {
  const { OepClient } = await import("../src/protocol/oep-client.js");
  const session = childSession();
  const root = await mkdtemp(join(tmpdir(), "omega-oep-client-build-"));
  const events: BuildEvent[] = [];
  let cancellation: Promise<{ readonly status: string }> | undefined;
  const client = new OepClient(
    session.child.stdout,
    session.child.stdin,
    ({ requestId, event }) => {
      events.push(event);
      if (
        !cancellation &&
        event.name === "stage.started" &&
        event.stage === "render"
      )
        cancellation = client.request("omega.cancel", { requestId });
    },
  );
  try {
    await client.request("omega.initialize", { oepVersion: "1.0" });
    const result = await client.request("omega.build", {
      source,
      settings: { outputDirectory: join(root, "dist"), cache: "off" },
    });
    expect(result).toMatchObject({ status: "cancelled" });
    expect(await cancellation).toEqual({ status: "requested" });
    expect(events.at(-1)?.name).toBe("build.cancelled");
    expect(
      events.every(
        (event, index) =>
          event.version === "omega-events/1.0" && event.sequence === index + 1,
      ),
    ).toBe(true);
    await client.request("omega.shutdown", {});
    expect(await session.closed).toBe(0);
    expect(session.output().stderr).toBe("");
    expect(await readdir(join(root, "dist/.omega-generations"))).toEqual([]);
  } finally {
    client.dispose();
    session.dispose();
    await session.closed;
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("internal_browser_infrastructure_failure_remains_redacted_engine_result_over_protocol", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-oep-internal-"));
  const session = childSession({
    PLAYWRIGHT_BROWSERS_PATH: join(root, "uninstalled"),
  });
  try {
    await initialize(session);
    const outcome = (
      await session.send("failed", "omega.build", {
        source,
        settings: { outputDirectory: join(root, "dist"), cache: "off" },
      })
    ).result;
    expect(outcome).toMatchObject({
      operation: "build",
      status: "failed",
      failureClass: "internal",
      stage: "verify",
    });
    expect(JSON.stringify(outcome)).not.toContain(root);
    expect(
      session.frames.filter(
        (frame) =>
          frame.params?.requestId === "failed" &&
          frame.params.event.name === "build.failed",
      ),
    ).toHaveLength(1);
    expect(await readdir(join(root, "dist/.omega-generations"))).toEqual([]);
    await stop(session);
  } finally {
    session.dispose();
    await session.closed;
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("stdio_launcher_startup_failure_uses_only_redacted_stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-oep-startup-"));
  const preload = join(root, "fail-startup.mjs");
  await writeFile(
    preload,
    `import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, next) {
 if (specifier === "./main.ts" && context.parentURL?.endsWith("/launch.mjs")) throw new Error("private startup failure");
 return next(specifier, context);
} });\n`,
  );
  const session = childSession({}, ["--import", preload]);
  try {
    expect(await session.closed).toBe(4);
    expect(session.output().stdout).toBe("");
    expect(JSON.parse(session.output().stderr)).toEqual({
      status: "failed",
      failureClass: "internal",
      code: "OMEGA-CLI-STARTUP-INTERNAL",
    });
    expect(session.output().stderr).not.toContain(root);
    expect(session.output().stderr).not.toContain("private startup failure");
    for (const args of [
      ["validate", "ignored", "--json"],
      ["build", "ignored", "--events=jsonl"],
    ]) {
      const ordinary = childSession({}, ["--import", preload], args);
      expect(await ordinary.closed).toBe(4);
      expect(ordinary.output().stderr).toBe("");
      const result = {
        status: "failed",
        failureClass: "internal",
        code: "OMEGA-CLI-STARTUP-INTERNAL",
      };
      expect(JSON.parse(ordinary.output().stdout)).toEqual(
        args.includes("--events=jsonl") ? { type: "result", result } : result,
      );
    }
  } finally {
    session.dispose();
    await rm(root, { recursive: true, force: true });
  }
}, 40000);

test("broken_stdout_peer_cancels_real_attempt_drains_owned_resources_and_exits_internal", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-oep-broken-peer-"));
  const session = childSession();
  try {
    await initialize(session);
    void session.send("active", "omega.build", {
      source,
      settings: { outputDirectory: join(root, "dist"), cache: "off" },
    });
    await session.wait(
      (frame) =>
        frame.params?.requestId === "active" &&
        frame.params.event.name === "stage.started" &&
        frame.params.event.stage === "verify",
    );
    session.child.stdout.destroy();
    expect(await session.closed).toBe(4);
    expect(session.output().stderr).toContain("OEP transport output failed.");
    expect(session.output().stderr).not.toContain(root);
    expect(await readdir(join(root, "dist/.omega-generations"))).toEqual([]);
    expect(
      (await readdir(join(root, "dist"))).filter((name) =>
        name.startsWith(".omega-workspace"),
      ),
    ).toEqual([]);
  } finally {
    session.dispose();
    await session.closed;
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test.each([
  "callback-sync",
  "callback-async",
  "callback-no-autodestroy",
  "dispose-before-failed-callback",
  "dispose-before-success-callback",
  "dispose-stalled-callback",
  "explicit-output-error",
  "explicit-input-error",
])(
  "client_write_error_lifecycle_does_not_crash_subprocess_%s",
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), "omega-oep-write-lifecycle-"));
    try {
      // Reuse the exact acquired launcher hooks, without executing its CLI main.
      const launch = await readFile(launcher, "utf8");
      const loader = launch
        .slice(0, launch.indexOf("\ntry {\n  const { main }"))
        .replace(/^#![^\n]*\n/, "")
        .replace(
          'from "rolldown/utils";',
          `from ${JSON.stringify(pathToFileURL(createRequire(launcher).resolve("rolldown/utils")).href)};`,
        )
        .replace(
          'new URL("../../../packages/", import.meta.url).href',
          JSON.stringify(
            `${pathToFileURL(resolve(import.meta.dirname, "../../")).href}/`,
          ),
        );
      const probe = join(root, "write-lifecycle.mjs");
      await writeFile(
        probe,
        `${loader}
import { PassThrough, Writable } from "node:stream";
const { OepClient } = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../src/protocol/oep-client.ts")).href)});
const mode = ${JSON.stringify(mode)};
const input = new PassThrough();
let callbackFinished = false;
const output = new Writable({
 autoDestroy: mode !== "callback-no-autodestroy",
 write(chunk, encoding, callback) {
  const finish = () => {
   callbackFinished = true;
   callback(mode.includes("success") || mode.startsWith("explicit-") ? undefined : new Error("specific failed write"));
  };
  if (mode === "dispose-stalled-callback") return;
  if (mode === "callback-sync" || mode === "callback-no-autodestroy") finish();
  else setTimeout(finish, 10);
 },
});
const client = new OepClient(input, output);
const beforeErrorListeners = output.listenerCount("error");
let rejected = false;
let rejectionMessage;
const settled = client.request("omega.capabilities", {}).then(
 () => { throw new Error("Unexpected successful request"); },
 error => { rejected = true; rejectionMessage = error.message; },
);
if (mode.startsWith("dispose-")) client.dispose();
if (mode === "explicit-output-error") output.destroy(new Error("specific output error"));
if (mode === "explicit-input-error") input.destroy(new Error("specific input error"));
await settled;
const rejectedBeforeCallback = rejected && !callbackFinished;
await new Promise(resolve => setTimeout(resolve, 30));
const listenerCounts = {
 inputData: input.listenerCount("data"), inputEnd: input.listenerCount("end"),
 inputError: input.listenerCount("error"), inputClose: input.listenerCount("close"),
 outputError: output.listenerCount("error"), outputClose: output.listenerCount("close"),
};
const callerOwnership = {
 inputDestroyed: input.destroyed, outputDestroyed: output.destroyed,
 outputWritableEnded: output.writableEnded,
};
console.log(JSON.stringify({ mode, beforeErrorListeners, rejected, rejectedBeforeCallback, rejectionMessage, listenerCounts, callerOwnership }));
input.destroy(); output.destroy();
`,
      );
      const observed = await new Promise<{
        code: number | null;
        stdout: string;
        stderr: string;
      }>((done) => {
        const child = spawn(process.execPath, [probe], {
          cwd: resolve(import.meta.dirname, "../../.."),
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (bytes: Buffer) => {
          stdout += bytes.toString();
        });
        child.stderr.on("data", (bytes: Buffer) => {
          stderr += bytes.toString();
        });
        child.on("close", (code) => done({ code, stdout, stderr }));
      });
      if (process.env.OMEGA_OEP_FIX_EVIDENCE_DIRECTORY)
        await writeFile(
          join(process.env.OMEGA_OEP_FIX_EVIDENCE_DIRECTORY, `${mode}.json`),
          `${JSON.stringify(observed, null, 2)}\n`,
        );
      expect(observed.code, observed.stderr).toBe(0);
      expect(observed.stderr).toBe("");
      const result = JSON.parse(observed.stdout);
      expect(result).toMatchObject({
        mode,
        beforeErrorListeners: 1,
        rejected: true,
        listenerCounts: {
          inputData: 0,
          inputEnd: 0,
          inputError: 0,
          inputClose: 0,
          outputError: 0,
          outputClose: 0,
        },
      });
      if (mode.startsWith("dispose-"))
        expect(result.rejectedBeforeCallback).toBe(true);
      if (
        mode === "dispose-before-success-callback" ||
        mode === "dispose-stalled-callback"
      )
        expect(result.callerOwnership).toEqual({
          inputDestroyed: false,
          outputDestroyed: false,
          outputWritableEnded: false,
        });
      expect(result.rejectionMessage).not.toContain("specific");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  40000,
);
