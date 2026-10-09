import {
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createProductionEngine } from "../src/api/production-engine.js";
import type {
  BuildRequest,
  BuildResult,
  ExecutionSettings,
} from "../src/api/types.js";
import type { BuildEvent } from "../src/events/events.js";
import { CancellationTokenSource } from "../src/lifecycle/cancellation.js";

const source = {
  module: "minimal.omega.yaml",
  text: "omega: {schema: '3.0'}\nkind: artifact\nspec:\n  document: {title: Review}\n  sections: [{id: intro, title: Introduction, body: 'Running with `é   ID`.'}]\n",
};
function accepted(result: BuildResult) {
  if (result.status !== "succeeded") throw new Error(JSON.stringify(result));
  return result.value;
}
async function run(settings: ExecutionSettings, text = source.text) {
  const events: BuildEvent[] = [];
  const result = await createProductionEngine().build(
    { operation: "build", source: { ...source, text }, settings },
    {
      buildId: "runtime-correlation",
      taskId: "runtime-task",
      onEvent: (event) => events.push(event),
    },
  );
  return { value: accepted(result), events };
}
const cacheEvents = (events: BuildEvent[]) =>
  events.flatMap((event) =>
    event.name === "cache.hit" || event.name === "cache.miss"
      ? [`${event.stage}:${event.name}`]
      : [],
  );

test("cache_on_and_off_produce_identical_artifact_bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-cache-t7-"));
  try {
    const out = join(root, "dist");
    const off = await run({ outputDirectory: out, cache: "off" });
    const use = await run({ outputDirectory: out, cache: "use" });
    expect(cacheEvents(use.events)).toEqual([
      "plan:cache.miss",
      "render:cache.miss",
    ]);
    const hit = await run({
      outputDirectory: out,
      cache: "use",
      diagnostics: "full",
    });
    expect(cacheEvents(hit.events)).toEqual([
      "plan:cache.hit",
      "render:cache.hit",
    ]);
    const refresh = await run({ outputDirectory: out, cache: "refresh" });
    expect(cacheEvents(refresh.events)).toEqual([
      "plan:cache.miss",
      "render:cache.miss",
    ]);
    const crossRoot = await run({
      outputDirectory: join(root, "other"),
      cacheDirectory: join(out, ".omega-cache"),
      cache: "use",
    });
    expect(cacheEvents(crossRoot.events)).toEqual([
      "plan:cache.hit",
      "render:cache.hit",
    ]);
    const bytes = await readFile(off.value.finalArtifactPath);
    for (const build of [use, hit, refresh, crossRoot]) {
      expect(await readFile(build.value.finalArtifactPath)).toEqual(bytes);
      expect(build.value.receipt).toEqual(off.value.receipt);
      expect(
        build.events.filter((event) => event.name === "qa.completed"),
      ).toHaveLength(4);
      expect(JSON.stringify(build.value.receipt)).not.toContain(root);
      expect(JSON.stringify(build.value.receipt)).not.toContain(
        "runtime-correlation",
      );
    }
    expect(cacheEvents(off.events)).toEqual([]);
    const directories = await readdir(join(out, ".omega-diagnostics"));
    expect(directories).toHaveLength(1);
    const diagnostics = join(
      out,
      ".omega-diagnostics",
      directories[0] ?? "missing",
    );
    expect(
      JSON.parse(await readFile(join(diagnostics, "canonical.json"), "utf8")),
    ).toEqual(hit.value.compiled.canonical);
    expect(
      JSON.parse(await readFile(join(diagnostics, "plan.json"), "utf8")),
    ).toEqual(hit.value.plan);
    expect(
      JSON.parse(await readFile(join(diagnostics, "source-map.json"), "utf8")),
    ).toEqual(hit.value.compiled.sourceMap);
    expect(
      JSON.parse(
        await readFile(join(diagnostics, "render-output.json"), "utf8"),
      ).html,
    ).toContain("é   ID");
    expect(
      (await readdir(out)).filter((name) =>
        name.startsWith(".omega-workspace"),
      ),
    ).toEqual([]);
    expect(await readFile(off.value.finalReceiptPath)).toEqual(
      await readFile(hit.value.finalReceiptPath),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("cancelled_render_action_never_publishes_its_cache_entry_or_replaces_accepted_pair", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-cache-cancel-t7-"));
  try {
    const out = join(root, "dist");
    const first = await run({ outputDirectory: out, cache: "off" });
    const before = await readlink(join(out, "current"));
    const cancellation = new CancellationTokenSource();
    let prepared = false;
    let actionKey = "";
    const request: BuildRequest = {
      operation: "build",
      source: { ...source, text: source.text.replace("Running", "Changed") },
      settings: { outputDirectory: out, cache: "use", diagnostics: "full" },
    };
    const result = await createProductionEngine().build(request, {
      cancellationToken: cancellation.token,
      onEvent: (event) => {
        if (event.name === "cache.miss" && event.stage === "render")
          actionKey = event.actionKey;
        if (
          event.name === "stage.progress" &&
          event.stage === "render" &&
          event.message === "Cache entry prepared."
        ) {
          prepared = true;
          cancellation.cancel();
        }
      },
    });
    expect(prepared).toBe(true);
    expect(result.status).toBe("cancelled");
    expect(await readlink(join(out, "current"))).toBe(before);
    expect(await readFile(first.value.finalArtifactPath)).toEqual(
      await readFile(join(out, "current/artifact.html")),
    );
    expect(await readFile(first.value.finalReceiptPath)).toEqual(
      await readFile(join(out, "current/build-receipt.json")),
    );
    expect(await readdir(join(out, ".omega-cache"))).not.toContain(
      `${actionKey}.json`,
    );
    expect(
      (await readdir(join(out, ".omega-cache"))).filter((name) =>
        name.startsWith(".omega-cache-write"),
      ),
    ).toEqual([]);
    expect(
      (await readdir(out)).filter((name) =>
        name.startsWith(".omega-workspace"),
      ),
    ).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("corrupt_stale_or_dependency_mismatched_cache_data_is_a_real_pipeline_miss", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-cache-corrupt-t7-"));
  try {
    const out = join(root, "dist");
    const first = await run({ outputDirectory: out, cache: "use" });
    const files = await readdir(join(out, ".omega-cache"));
    expect(files).toHaveLength(2);
    for (const change of [
      "truncated",
      "version",
      "dependency",
      "checksum",
      "shape",
    ]) {
      for (const file of files) {
        const path = join(out, ".omega-cache", file);
        const entry = JSON.parse(await readFile(path, "utf8"));
        if (change === "version") entry.version = "stale/0";
        if (change === "dependency")
          entry.action.inputs = { wrong: "dependencies" };
        if (change === "checksum") entry.outputHash = "0".repeat(64);
        if (change === "shape") entry.value = { html: "wrong" };
        await writeFile(
          path,
          change === "truncated" ? "{" : JSON.stringify(entry),
        );
      }
      const rebuilt = await run({ outputDirectory: out, cache: "use" });
      expect(cacheEvents(rebuilt.events)).toEqual([
        "plan:cache.miss",
        "render:cache.miss",
      ]);
      expect(await readFile(rebuilt.value.finalArtifactPath)).toEqual(
        await readFile(first.value.finalArtifactPath),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("normalized_plan_hits_keep_current_raw_hash_and_source_map_sidecars", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-cache-sidecars-t7-"));
  try {
    const out = join(root, "dist");
    const first = await run({ outputDirectory: out, cache: "use" });
    const next = await run(
      { outputDirectory: out, cache: "use", diagnostics: "full" },
      `# comment shifts source locations\n${source.text}`,
    );
    expect(cacheEvents(next.events)).toEqual([
      "plan:cache.hit",
      "render:cache.hit",
    ]);
    expect(next.value.compiled.normalizedHash).toBe(
      first.value.compiled.normalizedHash,
    );
    expect(next.value.compiled.rawSourceHash).not.toBe(
      first.value.compiled.rawSourceHash,
    );
    expect(next.value.compiled.sourceMap).not.toEqual(
      first.value.compiled.sourceMap,
    );
    expect(next.value.receipt.rawSourceHash).toBe(
      next.value.compiled.rawSourceHash,
    );
    expect(await readFile(next.value.finalArtifactPath)).toEqual(
      await readFile(first.value.finalArtifactPath),
    );
    const directory =
      (await readdir(join(out, ".omega-diagnostics")))[0] ?? "missing";
    expect(
      JSON.parse(
        await readFile(
          join(out, ".omega-diagnostics", directory, "source-map.json"),
          "utf8",
        ),
      ),
    ).toEqual(next.value.compiled.sourceMap);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("action_keys_own_source_content_toolchain_policy_and_declared_dependencies", async () => {
  const { createBuildAction, fingerprintSources } = await import(
    "../src/cache/action.js"
  );
  const root = await mkdtemp(join(tmpdir(), "omega-action-input-t7-"));
  try {
    await writeFile(join(root, "template.astro"), "<article>old</article>");
    await writeFile(join(root, "tokens.css"), ":root { color: red; }");
    const first = await fingerprintSources(root, [
      "template.astro",
      "tokens.css",
    ]);
    expect(
      await fingerprintSources(root, ["tokens.css", "template.astro"]),
    ).toEqual(first);
    await writeFile(join(root, "evidence-only.md"), "changed receipt/HEAD");
    expect(
      await fingerprintSources(root, ["template.astro", "tokens.css"]),
    ).toEqual(first);
    await writeFile(join(root, "tokens.css"), ":root { color: blue; }");
    const next = await fingerprintSources(root, [
      "template.astro",
      "tokens.css",
    ]);
    expect(next.digest).not.toBe(first.digest);
    const base = {
      stage: "render" as const,
      inputs: { planHash: "a".repeat(64) },
      implementation: first.digest,
      toolchain: "pinned-v1",
      policy: "p02-v1",
      capabilities: "cap-v1",
      resources: [] as const,
    };
    const key = createBuildAction(base).key;
    for (const change of [
      { implementation: next.digest },
      { toolchain: "pinned-v2" },
      { policy: "p02-v2" },
      { capabilities: "cap-v2" },
      { inputs: { planHash: "b".repeat(64) } },
    ])
      expect(createBuildAction({ ...base, ...change }).key).not.toBe(key);
    await expect(fingerprintSources(root, ["../escape"])).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("atomic_cache_checks_cancellation_after_preparation_and_validates_persisted_shape", async () => {
  const { createBuildAction } = await import("../src/cache/action.js");
  const { StageCacheStore } = await import("../src/cache/store.js");
  const root = await mkdtemp(join(tmpdir(), "omega-cache-store-t7-"));
  try {
    const cache = await StageCacheStore.open(join(root, "cache"));
    const action = createBuildAction({
      stage: "render",
      inputs: { planHash: "a".repeat(64) },
      implementation: "impl",
      toolchain: "tools",
      policy: "p02",
      capabilities: "cap",
      resources: [],
    });
    const isPayload = (value: unknown): value is { html: string } =>
      !!value &&
      typeof value === "object" &&
      typeof (value as Record<string, unknown>).html === "string";
    await expect(
      cache.write(action, { html: "fresh" }, isPayload, () => {
        throw new Error("cancelled before publication");
      }),
    ).rejects.toThrow("cancelled before publication");
    expect(await readdir(join(root, "cache"))).toEqual([]);
    await Promise.all([
      cache.write(action, { html: "fresh" }, isPayload, () => {}),
      cache.write(action, { html: "fresh" }, isPayload, () => {}),
    ]);
    expect(await cache.read(action, isPayload)).toEqual({ html: "fresh" });
    expect(await readdir(join(root, "cache"))).toEqual([`${action.key}.json`]);
    const path = join(root, "cache", `${action.key}.json`);
    const entry = JSON.parse(await readFile(path, "utf8"));
    entry.value = { bad: "shape" };
    const { canonicalizeJson, sha256 } = await import("@omega/spec-frontend");
    entry.outputHash = sha256(canonicalizeJson(entry.value));
    await writeFile(path, JSON.stringify(entry));
    expect(await cache.read(action, isPayload)).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("owned_attempt_workspaces_are_isolated_and_cleanup_cannot_follow_replacement_symlinks", async () => {
  const { BuildWorkspace } = await import(
    "../src/workspace/build-workspace.js"
  );
  const { symlink } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "omega-workspace-t7-"));
  try {
    const one = await BuildWorkspace.create(root);
    const two = await BuildWorkspace.create(root);
    expect(one.directory).not.toBe(two.directory);
    await writeFile(join(two.directory, "owned.txt"), "two");
    await one.cleanup();
    expect(await readFile(join(two.directory, "owned.txt"), "utf8")).toBe(
      "two",
    );
    await rm(one.directory, { recursive: true, force: true });
    await symlink(two.directory, one.directory);
    await expect(one.cleanup()).rejects.toThrow();
    expect(await readFile(join(two.directory, "owned.txt"), "utf8")).toBe(
      "two",
    );
    await two.cleanup();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cache_root_and_full_diagnostic_root_reject_symlinks_without_changing_accepted_pair", async () => {
  const { mkdir, symlink } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "omega-confinement-t7-"));
  try {
    const out = join(root, "dist");
    const first = await run({ outputDirectory: out, cache: "off" });
    const pointer = await readlink(join(out, "current"));
    const outside = join(root, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "preserved"), "outside");
    for (const name of [".omega-cache", ".omega-diagnostics"]) {
      await symlink(outside, join(out, name));
      const result = await createProductionEngine().build({
        operation: "build",
        source,
        settings: {
          outputDirectory: out,
          cache: name === ".omega-cache" ? "use" : "off",
          diagnostics: "full",
        },
      });
      expect(result).toMatchObject({
        status: "failed",
        stage: "preflight",
        failureClass: "execution",
      });
      expect(await readlink(join(out, "current"))).toBe(pointer);
      expect(await readFile(first.value.finalReceiptPath)).toEqual(
        await readFile(join(out, "current/build-receipt.json")),
      );
      expect(await readdir(outside)).toEqual(["preserved"]);
      await rm(join(out, name));
    }
    expect(
      (await readdir(out)).filter((name) =>
        name.startsWith(".omega-workspace"),
      ),
    ).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("historical_receipt_integrity_is_admitted_without_reusing_its_source_freshness_or_mutating_pair", async () => {
  const { canonicalizeJson, sha256 } = await import("@omega/spec-frontend");
  const root = await mkdtemp(join(tmpdir(), "omega-cache-historical-t7-"));
  try {
    const out = join(root, "dist");
    const first = await run({ outputDirectory: out, cache: "off" });
    const historical = JSON.parse(
      await readFile(first.value.finalReceiptPath, "utf8"),
    );
    delete historical.implementation;
    historical.buildFingerprint = sha256(
      canonicalizeJson({
        planHash: historical.planHash,
        rendererVersion: historical.rendererVersion,
        tokenVersion: historical.tokenVersion,
        policy: historical.acceptancePolicy,
      }),
    );
    delete historical.receiptId;
    historical.receiptId = sha256(canonicalizeJson(historical));
    await writeFile(
      first.value.finalReceiptPath,
      `${JSON.stringify(historical)}\n`,
    );
    const oldBytes = await readFile(first.value.finalArtifactPath);
    const oldReceipt = await readFile(first.value.finalReceiptPath);
    const next = await run({
      outputDirectory: out,
      cache: "use",
      diagnostics: "full",
    });
    expect(next.value.receipt.implementation?.sourceContentHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(next.value.receipt.buildFingerprint).not.toBe(
      historical.buildFingerprint,
    );
    expect(await readFile(first.value.finalArtifactPath)).toEqual(oldBytes);
    expect(await readFile(first.value.finalReceiptPath)).toEqual(oldReceipt);
    expect(await readFile(next.value.finalArtifactPath)).toEqual(oldBytes);
    expect(
      next.events.filter((event) => event.name === "qa.completed"),
    ).toHaveLength(4);
    expect(await readdir(join(out, ".omega-generations"))).toHaveLength(2);
    // A prior source generation is an integrity-bearing historical pair, never current QA.
    const prior = JSON.parse(
      await readFile(next.value.finalReceiptPath, "utf8"),
    );
    prior.implementation.sourceContentHash = "f".repeat(64);
    prior.buildFingerprint = sha256(
      canonicalizeJson({
        planHash: prior.planHash,
        rendererVersion: prior.rendererVersion,
        tokenVersion: prior.tokenVersion,
        policy: prior.acceptancePolicy,
        implementation: prior.implementation,
      }),
    );
    delete prior.receiptId;
    prior.receiptId = sha256(canonicalizeJson(prior));
    await writeFile(next.value.finalReceiptPath, `${JSON.stringify(prior)}\n`);
    const priorReceipt = await readFile(next.value.finalReceiptPath);
    const fresh = await run({ outputDirectory: out, cache: "use" });
    expect(fresh.value.receipt.implementation?.sourceContentHash).not.toBe(
      prior.implementation.sourceContentHash,
    );
    expect(await readFile(next.value.finalReceiptPath)).toEqual(priorReceipt);
    expect(await readdir(join(out, ".omega-generations"))).toHaveLength(3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("full_diagnostics_prepared_before_cancelled_publication_are_discarded_with_new_generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-diagnostics-cancel-t7-"));
  try {
    const out = join(root, "dist");
    const first = await run({
      outputDirectory: out,
      cache: "off",
      diagnostics: "full",
    });
    const oldDirectories = await readdir(join(out, ".omega-diagnostics"));
    const pointer = await readlink(join(out, "current"));
    const cancellation = new CancellationTokenSource();
    const result = await createProductionEngine().build(
      {
        operation: "build",
        source: {
          ...source,
          text: source.text.replace("Running", "Cancelled"),
        },
        settings: { outputDirectory: out, cache: "off", diagnostics: "full" },
      },
      {
        cancellationToken: cancellation.token,
        onEvent: (event) => {
          if (event.name === "stage.progress" && event.stage === "commit")
            cancellation.cancel();
        },
      },
    );
    expect(result.status).toBe("cancelled");
    expect(await readdir(join(out, ".omega-diagnostics"))).toEqual(
      oldDirectories,
    );
    expect(await readdir(join(out, ".omega-generations"))).toHaveLength(1);
    expect(await readlink(join(out, "current"))).toBe(pointer);
    expect(await readFile(first.value.finalReceiptPath)).toEqual(
      await readFile(join(out, "current/build-receipt.json")),
    );
    expect(
      (await readdir(out)).filter(
        (name) =>
          name.startsWith(".omega-workspace") ||
          name.startsWith(".omega-pointer"),
      ),
    ).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("self_consistent_tampered_render_cache_still_runs_fresh_actual_qa_and_cannot_promote", async () => {
  const { canonicalizeJson, sha256 } = await import("@omega/spec-frontend");
  const root = await mkdtemp(join(tmpdir(), "omega-cache-qa-t7-"));
  try {
    const out = join(root, "dist");
    const first = await run({ outputDirectory: out, cache: "use" });
    const pointer = await readlink(join(out, "current"));
    const files = await readdir(join(out, ".omega-cache"));
    for (const name of files) {
      const path = join(out, ".omega-cache", name);
      const entry = JSON.parse(await readFile(path, "utf8"));
      if (entry.action.stage !== "render") continue;
      entry.value.html = entry.value.html.replace(
        "</body>",
        '<img src="https://example.invalid/missing.png"></body>',
      );
      entry.outputHash = sha256(canonicalizeJson(entry.value));
      await writeFile(path, JSON.stringify(entry));
    }
    const events: BuildEvent[] = [];
    const result = await createProductionEngine().build(
      {
        operation: "build",
        source,
        settings: { outputDirectory: out, cache: "use" },
      },
      { onEvent: (event) => events.push(event) },
    );
    expect(cacheEvents(events)).toEqual(["plan:cache.hit", "render:cache.hit"]);
    expect(result).toMatchObject({
      status: "failed",
      stage: "verify",
      failureClass: "execution",
    });
    expect(
      events.filter((event) => event.name === "qa.completed"),
    ).toHaveLength(1);
    expect(await readlink(join(out, "current"))).toBe(pointer);
    expect(await readFile(first.value.finalArtifactPath)).toEqual(
      await readFile(join(out, "current/artifact.html")),
    );
    expect(await readFile(first.value.finalReceiptPath)).toEqual(
      await readFile(join(out, "current/build-receipt.json")),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("cache_envelope_does_not_reduce_the_producer_json_depth_budget", async () => {
  const { createBuildAction } = await import("../src/cache/action.js");
  const { StageCacheStore } = await import("../src/cache/store.js");
  const { canonicalizeJson } = await import("@omega/spec-frontend");
  const root = await mkdtemp(join(tmpdir(), "omega-cache-depth-t7-"));
  try {
    const store = await StageCacheStore.open(join(root, "cache"));
    const action = createBuildAction({
      stage: "plan",
      inputs: {},
      implementation: "impl",
      toolchain: "tools",
      policy: "p02",
      capabilities: "cap",
      resources: [],
    });
    let payload: object = { leaf: "depth128" };
    for (let i = 1; i < 128; i++) payload = { child: payload };
    expect(() => canonicalizeJson(payload)).not.toThrow();
    const isPayload = (value: unknown): value is object =>
      !!value && typeof value === "object";
    await store.write(action, payload, isPayload, () => {});
    expect(await store.read(action, isPayload)).toEqual(payload);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("configured_cache_cannot_write_into_an_immutable_accepted_generation", async () => {
  const { dirname } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "omega-cache-generation-t7-"));
  try {
    const out = join(root, "dist");
    const first = await run({ outputDirectory: out, cache: "off" });
    const generation = dirname(first.value.finalArtifactPath);
    const before = await readdir(generation);
    const pointer = await readlink(join(out, "current"));
    const result = await createProductionEngine().build({
      operation: "build",
      source,
      settings: {
        outputDirectory: out,
        cache: "use",
        cacheDirectory: generation,
      },
    });
    expect(result).toMatchObject({
      status: "failed",
      stage: "preflight",
      failureClass: "execution",
    });
    expect(await readdir(generation)).toEqual(before);
    expect(await readlink(join(out, "current"))).toBe(pointer);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);
