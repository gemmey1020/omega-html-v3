import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  buildStandaloneHtml,
  cleanupArtifactCandidate,
  packageStandaloneHtml,
  renderPrimeProse,
} from "../src/index.js";
import { standalonePlan } from "./standalone-fixture.js";

const roots: string[] = [];
async function root() {
  const directory = await mkdtemp(join(tmpdir(), "omega-t5-test-"));
  roots.push(directory);
  return directory;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

test("standalone_candidate_is_one_offline_no_js_document", async () => {
  const directory = await root();
  const rendered = await renderPrimeProse(standalonePlan());
  if (!rendered.ok) throw new Error("Render failed");
  const result = await packageStandaloneHtml({
    rendered: rendered.output,
    temporaryRoot: directory,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Package failed");
  const { candidate } = result;
  const bytes = await readFile(candidate.workspacePath);
  expect(bytes.toString("utf8")).toBe(rendered.output.html);
  expect(bytes.toString("utf8")).not.toContain(directory);
  expect(await readdir(candidate.workspaceDirectory)).toEqual([
    "artifact.html",
  ]);
  expect(candidate.artifactHash).toBe(
    createHash("sha256").update(bytes).digest("hex"),
  );
  expect(candidate.byteLength).toBe(bytes.length);
  expect(candidate.runtimeDependencies).toEqual([]);
  expect(candidate.resourceDependencies).toEqual([]);
  expect(candidate).not.toHaveProperty("finalArtifactPath");
  expect(Object.isFrozen(candidate)).toBe(true);
  await cleanupArtifactCandidate(candidate);
  expect(await readdir(directory)).toEqual([]);
  await cleanupArtifactCandidate(candidate);
});

test("real_builder_keeps_prior_output_and_produces_identical_bytes_across_workspaces", async () => {
  const directory = await root();
  await writeFile(join(directory, "accepted.html"), "prior accepted bytes");
  const first = await buildStandaloneHtml({
    plan: standalonePlan(),
    temporaryRoot: directory,
  });
  const second = await buildStandaloneHtml({
    plan: standalonePlan(),
    temporaryRoot: await root(),
  });
  if (!first.ok || !second.ok) throw new Error("Build failed");
  expect(first.candidate.workspacePath).not.toBe(
    second.candidate.workspacePath,
  );
  expect(first.candidate.artifactHash).toBe(second.candidate.artifactHash);
  expect(await readFile(first.candidate.workspacePath)).toEqual(
    await readFile(second.candidate.workspacePath),
  );
  expect(await readFile(join(directory, "accepted.html"), "utf8")).toBe(
    "prior accepted bytes",
  );
  await cleanupArtifactCandidate(first.candidate);
  await cleanupArtifactCandidate(second.candidate);
});

test("renderer_admission_failure_produces_no_candidate", async () => {
  const directory = await root();
  const result = await buildStandaloneHtml({
    plan: { ...standalonePlan(), profile: "gold" as "prime" },
    temporaryRoot: directory,
  });
  expect(result).toMatchObject({
    ok: false,
    diagnostics: [expect.objectContaining({ stage: "render" })],
  });
  expect(result).not.toHaveProperty("candidate");
  expect(await readdir(directory)).toEqual([]);
});

test("packaging_rejects_relative_roots_and_symlink_ancestors_without_writes", async () => {
  const rendered = await renderPrimeProse(standalonePlan());
  if (!rendered.ok) throw new Error("Render failed");
  const directory = await root();
  const alias = join(directory, "alias");
  await mkdir(join(directory, "child"));
  await symlink(directory, alias);
  for (const temporaryRoot of [
    "dist",
    alias,
    join(alias, "child"),
    join(directory, "missing"),
  ]) {
    expect(
      await packageStandaloneHtml({ rendered: rendered.output, temporaryRoot }),
    ).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          stage: "package",
          code: "OMEGA-PACKAGE-WORKSPACE-INVALID",
        }),
      ],
    });
  }
  expect(await readdir(directory)).toEqual(["alias", "child"]);
});

test("dependency_declarations_fail_before_any_candidate_write", async () => {
  const rendered = await renderPrimeProse(standalonePlan());
  if (!rendered.ok) throw new Error("Render failed");
  const directory = await root();
  expect(
    await packageStandaloneHtml({
      rendered: {
        ...rendered.output,
        runtimeDependencies: ["remote"] as unknown as readonly [],
      },
      temporaryRoot: directory,
    }),
  ).toMatchObject({ ok: false });
  expect(await readdir(directory)).toEqual([]);
});

test("cancellation_at_each_filesystem_boundary_cleans_only_owned_candidates", async () => {
  const rendered = await renderPrimeProse(standalonePlan());
  if (!rendered.ok) throw new Error("Render failed");
  for (const boundary of [1, 2, 3, 4, 5]) {
    const directory = await root();
    await writeFile(join(directory, "accepted.html"), "prior");
    let checks = 0;
    const abort = new AbortController();
    await expect(
      packageStandaloneHtml(
        { rendered: rendered.output, temporaryRoot: directory },
        {
          signal: abort.signal,
          checkCancellation: () => {
            if (++checks === boundary) abort.abort();
          },
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(await readdir(directory)).toEqual(["accepted.html"]);
    expect(await readFile(join(directory, "accepted.html"), "utf8")).toBe(
      "prior",
    );
  }
});

test("package_owns_input_before_await_and_ignores_runtime_metadata", async () => {
  const rendered = await renderPrimeProse(standalonePlan());
  if (!rendered.ok) throw new Error("Render failed");
  const directory = await root();
  const input = {
    rendered: { ...structuredClone(rendered.output) },
    temporaryRoot: directory,
    hostPath: "/private/host",
    correlationId: "ephemeral",
  };
  const pending = packageStandaloneHtml(input);
  input.rendered.html = "mutated caller HTML";
  input.temporaryRoot = "dist";
  const result = await pending;
  if (!result.ok) throw new Error("Package failed");
  expect(await readFile(result.candidate.workspacePath, "utf8")).toBe(
    rendered.output.html,
  );
  expect(JSON.stringify(result)).not.toContain("ephemeral");
  expect(JSON.stringify(result)).not.toContain("/private/host");
  expect(Object.isFrozen(input)).toBe(false);
  await cleanupArtifactCandidate(result.candidate);
});

test("cleanup_never_deletes_unknown_or_forged_paths", async () => {
  const directory = await root();
  const result = await buildStandaloneHtml({
    plan: standalonePlan(),
    temporaryRoot: directory,
  });
  if (!result.ok) throw new Error("Build failed");
  await writeFile(join(directory, "accepted.html"), "prior");
  await cleanupArtifactCandidate({
    ...result.candidate,
    workspaceDirectory: directory,
    workspacePath: join(directory, "accepted.html"),
  });
  await cleanupArtifactCandidate({
    ...result.candidate,
    workspacePath: join(directory, "accepted.html"),
  });
  expect(await readFile(join(directory, "accepted.html"), "utf8")).toBe(
    "prior",
  );
  expect(await readFile(result.candidate.workspacePath, "utf8")).toContain(
    "تقرير Prime",
  );
  await cleanupArtifactCandidate(result.candidate);
});
