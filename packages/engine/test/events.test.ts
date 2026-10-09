import { expect, test } from "vitest";
import { OmegaEngine } from "../src/api/engine.js";
import type { EngineRequest } from "../src/api/types.js";
import type { BuildEvent } from "../src/events/events.js";
import {
  BuildEventEmitter,
  CancellationTokenSource,
  throwIfCancellationRequested,
} from "../src/index.js";
import type {
  EngineAdapters,
  StageContext,
  StageResult,
} from "../src/lifecycle/stages.js";
import { LIFECYCLE_STAGES } from "../src/lifecycle/stages.js";
import { planFixture } from "./plan-fixture.js";

const source = {
  module: "events.omega.yaml",
  text: "omega: {schema: '3.0'}\nkind: artifact\nspec:\n  document: {title: Events}\n  sections: [{body: Running.}]\n",
};

function succeeded<T>(value: T): StageResult<T> {
  return { status: "succeeded", value };
}

/** Authorized shell doubles; these do not prove filesystem/cache publication. */
function shell(calls: string[]): EngineAdapters {
  return {
    semantic: () => succeeded({ eligible: true }),
    plan: (input) => succeeded(planFixture(input.compiled.canonical)),
    render: () => succeeded({ html: "<article>Running.</article>" }),
    package: () => {
      calls.push("package");
      return succeeded({ candidate: "test-only" });
    },
    verify: () => succeeded({ verified: true }),
    quality: () => succeeded({ quality: true }),
    regression: () => succeeded({ regression: true }),
    acceptance: () => succeeded({ accepted: true }),
    commit: () => {
      calls.push("commit");
      return succeeded({ finalArtifactPath: "test-only.html" });
    },
  };
}

test("cancelled_build_never_commits_candidate", async () => {
  const controller = new AbortController();
  const events: { name: string }[] = [];
  const calls: string[] = [];
  let entered!: () => void;
  const rendering = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const adapters = shell(calls);
  const engine = new OmegaEngine({
    ...adapters,
    render: async () => {
      entered();
      // A controllable long-running shell renderer, released only by cancel.
      await new Promise<void>((resolve) =>
        controller.signal.addEventListener("abort", () => resolve(), {
          once: true,
        }),
      );
      return succeeded({ html: "uncommitted" });
    },
  });
  const pending = engine.build(
    { operation: "build", source },
    {
      cancellationToken: { signal: controller.signal },
      onEvent: (event: { name: string }) => events.push(event),
    },
  );
  await rendering;
  controller.abort();
  controller.abort();
  const result = await pending;
  expect(result.status).toBe("cancelled");
  expect(
    events.filter((event) => event.name === "build.cancelled"),
  ).toHaveLength(1);
  expect(calls).toEqual([]);
  expect(result).not.toHaveProperty("value");
});

test("commit_adapter_cannot_report_a_different_published_path", async () => {
  const result = await new OmegaEngine({
    ...shell([]),
    commit: (_input, context) => {
      context.publishCommit(() => ({ finalArtifactPath: "actual.html" }));
      return succeeded({ finalArtifactPath: "unpublished.html" });
    },
  }).build({ operation: "build", source });
  expect(result).toMatchObject({
    status: "failed",
    failureClass: "internal",
    publication: "committed",
  });
});

test("settled_commit_context_cannot_publish_from_completion_observer", async () => {
  let retained!: StageContext;
  const calls: string[] = [];
  const events: BuildEvent[] = [];
  let rejected = false;
  const result = await new OmegaEngine({
    ...shell([]),
    commit: (_input, context) => {
      retained = context;
      return succeeded({ finalArtifactPath: "test-only.html" });
    },
  }).build(
    { operation: "build", source },
    {
      onEvent: (event) => {
        events.push(event);
        if (event.name === "stage.completed" && event.stage === "commit") {
          try {
            retained.publishCommit(() => {
              calls.push("late publication");
              return { finalArtifactPath: "late.html" };
            });
          } catch {
            rejected = true;
          }
        }
      },
    },
  );
  expect(result.status).toBe("succeeded");
  expect(rejected).toBe(true);
  expect(calls).toEqual([]);
  const count = events.length;
  retained.emit({ name: "stage.progress", completed: 9 });
  expect(events).toHaveLength(count);
});

test.each([
  { mode: "throw", cancelled: false },
  { mode: "reject", cancelled: false },
  { mode: "throw", cancelled: true },
  { mode: "reject", cancelled: true },
])(
  "rejected_commit_context_is_closed_before_completion ($mode, cancelled=$cancelled)",
  async ({ mode, cancelled }) => {
    const cancellation = new CancellationTokenSource();
    let retained!: StageContext;
    const calls: string[] = [];
    const events: BuildEvent[] = [];
    let publicationRejected = false;
    let telemetryIgnored = false;
    const result = await new OmegaEngine({
      ...shell([]),
      commit: (_input, context) => {
        retained = context;
        if (cancelled) cancellation.cancel();
        if (mode === "throw") throw new Error("rejected commit fixture");
        return Promise.reject(new Error("rejected commit fixture"));
      },
    }).build(
      { operation: "build", source },
      {
        cancellationToken: cancellation.token,
        onEvent: (event) => {
          events.push(event);
          if (event.name === "stage.completed" && event.stage === "commit") {
            try {
              retained.publishCommit(() => {
                calls.push("late publication");
                return { finalArtifactPath: "late.html" };
              });
            } catch {
              publicationRejected = true;
            }
            try {
              retained.emit({ name: "stage.progress", completed: 9 });
              telemetryIgnored = true;
            } catch {
              telemetryIgnored = false;
            }
          }
        },
      },
    );
    expect(publicationRejected).toBe(true);
    expect(telemetryIgnored).toBe(true);
    expect(calls).toEqual([]);
    expect(result).toMatchObject({
      status: cancelled ? "cancelled" : "failed",
      stage: "commit",
    });
    if (!cancelled) expect(result).toHaveProperty("failureClass", "internal");
    expect(result).not.toHaveProperty("publication");
    expect(events.filter((event) => event.name === "stage.progress")).toEqual(
      [],
    );
    expect(events.at(-1)?.name).toBe(
      cancelled ? "build.cancelled" : "build.failed",
    );
    expect(events.at(-1)).not.toHaveProperty("publication");
  },
);

test("successful_event_stream_is_versioned_correlated_and_ordered", async () => {
  const events: BuildEvent[] = [];
  const result = await new OmegaEngine(shell([])).build(
    { operation: "build", source },
    {
      buildId: "attempt-1",
      taskId: "task-7",
      onEvent: (event) => events.push(event),
    },
  );
  expect(result.status).toBe("succeeded");
  expect(events[0]).toMatchObject({
    version: "omega-events/1.0",
    name: "build.started",
    buildId: "attempt-1",
    taskId: "task-7",
    operation: "build",
    sequence: 1,
  });
  expect(events.at(-1)).toMatchObject({
    name: "build.completed",
    status: "succeeded",
  });
  expect(
    events
      .filter((event) => event.name === "stage.started")
      .map((event) => event.stage),
  ).toEqual([
    "preflight",
    "compile",
    "semantic",
    "plan",
    "render",
    "package",
    "verify",
    "quality",
    "regression",
    "acceptance",
    "commit",
  ]);
  expect(
    events.filter((event) => event.name === "stage.completed"),
  ).toHaveLength(11);
  expect(
    events
      .filter((event) => event.name === "qa.completed")
      .map((event) => event.stage),
  ).toEqual(["verify", "quality", "regression", "acceptance"]);
  expect(
    events.filter((event) => event.name === "artifact.produced"),
  ).toHaveLength(1);
  events.forEach((event, index) => {
    expect(event.sequence).toBe(index + 1);
    expect(event.version).toBe("omega-events/1.0");
    expect(event.buildId).toBe("attempt-1");
    expect(event.taskId).toBe("task-7");
    expect(Object.isFrozen(event)).toBe(true);
  });
});

test("pre_cancelled_build_schedules_no_capability_provider_or_stage", async () => {
  const abort = new AbortController();
  abort.abort();
  const calls: string[] = [];
  const events: BuildEvent[] = [];
  const result = await new OmegaEngine({
    ...shell(calls),
    capabilities: () => {
      calls.push("capabilities");
      throw new Error("must not run");
    },
  }).build(
    { operation: "build", source },
    {
      cancellationToken: { signal: abort.signal },
      onEvent: (event) => events.push(event),
    },
  );
  expect(result.status).toBe("cancelled");
  expect(calls).toEqual([]);
  expect(events.map((event) => event.name)).toEqual([
    "build.started",
    "build.cancelled",
  ]);
  expect(result.diagnostics).toEqual([]);
  expect(result.stages).toEqual([]);
});

test.each(LIFECYCLE_STAGES)(
  "cancellation_at_%s_start_stops_dependent_scheduling",
  async (stage) => {
    const abort = new AbortController();
    const events: BuildEvent[] = [];
    const result = await new OmegaEngine(shell([])).build(
      { operation: "build", source },
      {
        cancellationToken: { signal: abort.signal },
        onEvent: (event) => {
          events.push(event);
          if (event.name === "stage.started" && event.stage === stage)
            abort.abort();
        },
      },
    );
    expect(result).toMatchObject({ status: "cancelled", stage });
    expect(result.stages.at(-1)).toEqual({ stage, status: "cancelled" });
    expect(events.at(-1)?.name).toBe("build.cancelled");
    expect(
      events.filter((event) => event.name === "build.cancelled"),
    ).toHaveLength(1);
    const started = events.filter((event) => event.name === "stage.started");
    expect(started.at(-1)).toMatchObject({ stage });
    expect(started).toHaveLength(LIFECYCLE_STAGES.indexOf(stage) + 1);
  },
);

test("active_renderer_receives_signal_and_abort_exception_is_cancelled", async () => {
  const abort = new AbortController();
  const events: BuildEvent[] = [];
  let entered!: () => void;
  const rendering = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let signal: AbortSignal | undefined;
  const pending = new OmegaEngine({
    ...shell([]),
    render: async (_input, context) => {
      signal = context.cancellationToken.signal;
      entered();
      await new Promise<never>((_resolve, reject) =>
        context.cancellationToken.signal.addEventListener(
          "abort",
          () => reject(new Error("child aborted /private/path")),
          { once: true },
        ),
      );
      return succeeded({ html: "unreachable" });
    },
  }).build(
    { operation: "build", source },
    {
      cancellationToken: { signal: abort.signal },
      onEvent: (event) => events.push(event),
    },
  );
  await rendering;
  abort.abort();
  const result = await pending;
  expect(signal).toBe(abort.signal);
  expect(result).toMatchObject({ status: "cancelled", stage: "render" });
  expect(result.diagnostics).toEqual([]);
  expect(JSON.stringify(events)).not.toContain("/private/path");
});

test("capability_provider_is_cooperatively_cancellable_preflight_work", async () => {
  const abort = new AbortController();
  const calls: string[] = [];
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = new OmegaEngine({
    ...shell(calls),
    capabilities: async (context) => {
      entered();
      await new Promise<void>((resolve) =>
        context.cancellationToken.signal.addEventListener(
          "abort",
          () => resolve(),
          { once: true },
        ),
      );
      throw new Error("cancelled lookup");
    },
    preflight: () => {
      calls.push("preflight");
      return succeeded(null);
    },
  }).build(
    { operation: "build", source },
    { cancellationToken: { signal: abort.signal } },
  );
  await ready;
  abort.abort();
  expect(await pending).toMatchObject({
    status: "cancelled",
    stage: "preflight",
  });
  expect(calls).toEqual([]);
});

test.each(["domain", "internal"])(
  "%s_failure_emits_diagnostics_and_exactly_one_terminal_event",
  async (kind) => {
    const events: BuildEvent[] = [];
    const result = await new OmegaEngine({
      ...shell([]),
      render: () => {
        if (kind === "internal") throw new Error("bug /private/path");
        return {
          status: "failed",
          failureClass: "execution",
          diagnostics: [
            {
              code: "FIXTURE-RENDER-FAIL",
              severity: "ERROR",
              stage: "render",
              message: "Intentional fixture diagnostic.",
            },
          ],
        };
      },
    }).build(
      { operation: "build", source },
      { onEvent: (event) => events.push(event) },
    );
    expect(result).toMatchObject({
      status: "failed",
      failureClass: kind === "domain" ? "execution" : "internal",
    });
    expect(
      events.filter((event) => event.name === "diagnostic.emitted"),
    ).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({
      name: "build.failed",
      stage: "render",
    });
    expect(
      events.filter((event) =>
        ["build.completed", "build.failed", "build.cancelled"].includes(
          event.name,
        ),
      ),
    ).toHaveLength(1);
    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "stage.started", stage: "commit" }),
      ]),
    );
    expect(JSON.stringify(events)).not.toContain("/private/path");
  },
);

test("correlation_never_enters_stage_data_or_deterministic_result", async () => {
  const events: BuildEvent[] = [];
  const inputs: unknown[] = [];
  const engine = new OmegaEngine({
    ...shell([]),
    plan: (input) => {
      inputs.push(input);
      return succeeded(planFixture(input.compiled.canonical));
    },
  });
  const first = await engine.build(
    { operation: "build", source },
    {
      buildId: "ephemeral-one",
      taskId: "task-one",
      onEvent: (event) => events.push(event),
    },
  );
  const second = await engine.build(
    { operation: "build", source },
    { buildId: "ephemeral-two", taskId: "task-two" },
  );
  expect(first).toEqual(second);
  expect(inputs[0]).toEqual(inputs[1]);
  expect(JSON.stringify(inputs)).not.toContain("ephemeral");
  expect(JSON.stringify(first)).not.toContain("ephemeral");
  expect(events[0]).toHaveProperty("buildId", "ephemeral-one");
});

test("adapter_events_inherit_stage_correlation_and_cannot_emit_a_terminal", async () => {
  const events: BuildEvent[] = [];
  const engine = new OmegaEngine({
    ...shell([]),
    render: (_input, context) => {
      context.emit({ name: "stage.progress", completed: 1, total: 2 });
      context.emit({ name: "cache.miss", actionKey: "stable-action" });
      context.emit({ name: "cache.hit", actionKey: "stable-action" });
      return succeeded({ html: "rendered" });
    },
  });
  expect(
    (
      await engine.build(
        { operation: "build", source },
        { onEvent: (event) => events.push(event) },
      )
    ).status,
  ).toBe("succeeded");
  expect(
    events.filter((event) =>
      ["stage.progress", "cache.hit", "cache.miss"].includes(event.name),
    ),
  ).toEqual([
    expect.objectContaining({
      name: "stage.progress",
      stage: "render",
      completed: 1,
      total: 2,
    }),
    expect.objectContaining({
      name: "cache.miss",
      stage: "render",
      actionKey: "stable-action",
    }),
    expect.objectContaining({
      name: "cache.hit",
      stage: "render",
      actionKey: "stable-action",
    }),
  ]);
});

test("cancellation_before_commit_publication_prevents_publication", async () => {
  const abort = new AbortController();
  const calls: string[] = [];
  const result = await new OmegaEngine({
    ...shell([]),
    commit: (_input, context) => {
      abort.abort();
      const value = context.publishCommit(() => {
        calls.push("publish");
        return { finalArtifactPath: "test-only.html" };
      });
      return succeeded(value);
    },
  }).build(
    { operation: "build", source },
    { cancellationToken: { signal: abort.signal } },
  );
  expect(result.status).toBe("cancelled");
  expect(calls).toEqual([]);
});

test("cancellation_after_publication_before_adapter_settles_preserves_success", async () => {
  const abort = new AbortController();
  const events: BuildEvent[] = [];
  const result = await new OmegaEngine({
    ...shell([]),
    commit: async (_input, context) => {
      const value = context.publishCommit(() => ({
        finalArtifactPath: "test-only.html",
      }));
      abort.abort();
      await Promise.resolve();
      return succeeded(value);
    },
  }).build(
    { operation: "build", source },
    {
      cancellationToken: { signal: abort.signal },
      onEvent: (event) => events.push(event),
    },
  );
  expect(result).toMatchObject({
    status: "succeeded",
    value: { finalArtifactPath: "test-only.html" },
  });
  expect(events.at(-1)?.name).toBe("build.completed");
  expect(events.filter((event) => event.name === "build.cancelled")).toEqual(
    [],
  );
});

test("non_commit_stage_cannot_publish_or_seal_cancellation", async () => {
  const calls: string[] = [];
  const result = await new OmegaEngine({
    ...shell([]),
    render: (_input, context) => {
      context.publishCommit(() => {
        calls.push("publish");
        return { finalArtifactPath: "test-only.html" };
      });
      return succeeded({ html: "must not render" });
    },
  }).build({ operation: "build", source });
  expect(result).toMatchObject({
    status: "failed",
    failureClass: "internal",
    stage: "render",
  });
  expect(calls).toEqual([]);
});

test("throwing_publication_does_not_seal_cancellation", async () => {
  const abort = new AbortController();
  const result = await new OmegaEngine({
    ...shell([]),
    commit: (_input, context) => {
      context.publishCommit(() => {
        abort.abort();
        throw new Error("publication failed");
      });
      return succeeded({ finalArtifactPath: "unreachable" });
    },
  }).build(
    { operation: "build", source },
    { cancellationToken: { signal: abort.signal } },
  );
  expect(result).toMatchObject({ status: "cancelled", stage: "commit" });
});

test("observer_exceptions_do_not_change_execution", async () => {
  const result = await new OmegaEngine(shell([])).build(
    { operation: "build", source },
    {
      onEvent: () => {
        throw new Error("telemetry unavailable");
      },
    },
  );
  expect(result.status).toBe("succeeded");
});

test.each(["throw", "failed-result"])(
  "post_publication_%s_is_internal_and_marks_committed_state",
  async (mode) => {
    const abort = new AbortController();
    const events: BuildEvent[] = [];
    const result = await new OmegaEngine({
      ...shell([]),
      commit: (_input, context) => {
        context.publishCommit(() => ({ finalArtifactPath: "test-only.html" }));
        abort.abort();
        if (mode === "throw") throw new Error("bug /private/host/path");
        return { status: "failed", failureClass: "execution", diagnostics: [] };
      },
    }).build(
      { operation: "build", source },
      {
        cancellationToken: { signal: abort.signal },
        onEvent: (event) => events.push(event),
      },
    );
    expect(result).toMatchObject({
      status: "failed",
      failureClass: "internal",
      stage: "commit",
      publication: "committed",
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "OMEGA-ENGINE-POST-PUBLICATION-INTERNAL",
          stage: "commit",
        }),
      ]),
    );
    expect(events.at(-1)).toMatchObject({
      name: "build.failed",
      publication: "committed",
    });
    expect(JSON.stringify(result)).not.toContain("/private/host/path");
    expect(result).not.toHaveProperty("value");
  },
);

test("explicit_cancellation_check_after_publication_returns_captured_success", async () => {
  const cancellation = new CancellationTokenSource();
  const events: BuildEvent[] = [];
  const result = await new OmegaEngine({
    ...shell([]),
    commit: (_input, context) => {
      context.publishCommit(() => ({ finalArtifactPath: "actual.html" }));
      cancellation.cancel();
      cancellation.cancel();
      throwIfCancellationRequested(context.cancellationToken);
      return succeeded({ finalArtifactPath: "unreachable" });
    },
  }).build(
    { operation: "build", source },
    {
      cancellationToken: cancellation.token,
      onEvent: (event) => events.push(event),
    },
  );
  expect(result).toMatchObject({
    status: "succeeded",
    value: { finalArtifactPath: "actual.html" },
  });
  expect(events.at(-1)?.name).toBe("build.completed");
  expect(
    events.filter((event) => event.name === "build.cancelled"),
  ).toHaveLength(0);
});

const requests: EngineRequest[] = [
  { operation: "validate", source },
  { operation: "inspect", source },
  { operation: "plan", source },
  { operation: "build", source },
  { operation: "explain", plan: planFixture() },
  { operation: "migrate", source, targetVersion: "3.0" },
  { operation: "capabilities" },
];

test.each(requests)(
  "pre_cancelled_$operation_has_an_independent_cancelled_terminal",
  async (request) => {
    const cancellation = new CancellationTokenSource();
    cancellation.cancel();
    const events: BuildEvent[] = [];
    const engine = new OmegaEngine(shell([]));
    const result = await engine[request.operation](request as never, {
      cancellationToken: cancellation.token,
      onEvent: (event) => events.push(event),
    });
    expect(result).toMatchObject({
      operation: request.operation,
      status: "cancelled",
      stages: [],
    });
    expect(events.map((event) => event.name)).toEqual([
      "build.started",
      "build.cancelled",
    ]);
    expect(events.every((event) => event.operation === request.operation)).toBe(
      true,
    );
  },
);

test("concurrent_attempts_have_distinct_correlation_and_independent_cancellation", async () => {
  const cancellation = new CancellationTokenSource();
  const cancelledEvents: BuildEvent[] = [];
  const successfulEvents: BuildEvent[] = [];
  const engine = new OmegaEngine({
    ...shell([]),
    render: async (_input, context) => {
      if (context.taskId === "cancel-task") {
        cancellation.cancel();
        throwIfCancellationRequested(context.cancellationToken);
      }
      return succeeded({ html: "static" });
    },
  });
  const [cancelled, successful] = await Promise.all([
    engine.build(
      { operation: "build", source },
      {
        taskId: "cancel-task",
        cancellationToken: cancellation.token,
        onEvent: (event) => cancelledEvents.push(event),
      },
    ),
    engine.build(
      { operation: "build", source },
      { onEvent: (event) => successfulEvents.push(event) },
    ),
  ]);
  expect(cancelled.status).toBe("cancelled");
  expect(successful.status).toBe("succeeded");
  expect(cancelledEvents[0]).toMatchObject({
    buildId: expect.any(String),
    taskId: "cancel-task",
  });
  expect(successfulEvents[0]).toMatchObject({
    buildId: expect.any(String),
    taskId: expect.any(String),
  });
  expect(cancelledEvents[0]?.buildId).not.toBe(successfulEvents[0]?.buildId);
  expect(successfulEvents[0]?.taskId).not.toBe("cancel-task");
  expect(cancelledEvents.at(-1)?.name).toBe("build.cancelled");
  expect(successfulEvents.at(-1)?.name).toBe("build.completed");
  for (const events of [cancelledEvents, successfulEvents]) {
    expect(new Set(events.map((event) => event.buildId)).size).toBe(1);
    expect(events.map((event) => event.sequence)).toEqual(
      events.map((_event, index) => index + 1),
    );
  }
});

test("emitter_terminal_is_sealed_and_diagnostic_snapshot_owned", () => {
  const events: BuildEvent[] = [];
  const emitter = new BuildEventEmitter("build", {
    onEvent: (event) => events.push(event),
  });
  const diagnostic = {
    code: "FIXTURE",
    severity: "WARNING" as const,
    stage: "render" as const,
    message: "Intentional fixture warning.",
  };
  emitter.emit({ name: "engine.ready" });
  emitter.emit({ name: "diagnostic.emitted", stage: "render", diagnostic });
  diagnostic.message = "caller mutation";
  emitter.emit({
    name: "build.cancelled",
    status: "cancelled",
    stage: "render",
  });
  expect(
    emitter.emit({ name: "build.completed", status: "succeeded" }),
  ).toBeUndefined();
  expect(
    emitter.emit({ name: "stage.started", stage: "commit" }),
  ).toBeUndefined();
  expect(events).toHaveLength(3);
  expect(events[1]).toMatchObject({
    diagnostic: { message: "Intentional fixture warning." },
  });
  expect(
    Object.isFrozen(
      (events[1] as Extract<BuildEvent, { name: "diagnostic.emitted" }>)
        .diagnostic,
    ),
  ).toBe(true);
  expect(Object.isFrozen(diagnostic)).toBe(false);
});

test("adapter_cannot_forge_lifecycle_terminal_events", async () => {
  const events: BuildEvent[] = [];
  const result = await new OmegaEngine({
    ...shell([]),
    render: (_input, context) => {
      // Simulate an untyped trusted adapter passing an unsupported payload.
      context.emit({ name: "build.completed", status: "succeeded" } as never);
      return succeeded({ html: "unreachable" });
    },
  }).build(
    { operation: "build", source },
    { onEvent: (event) => events.push(event) },
  );
  expect(result).toMatchObject({
    status: "failed",
    failureClass: "internal",
    stage: "render",
  });
  expect(
    events.filter((event) => event.name === "build.completed"),
  ).toHaveLength(0);
  expect(events.at(-1)?.name).toBe("build.failed");
});
