import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256 } from "@omega/spec-frontend";
import { expect, test } from "vitest";
import { exitCode } from "../../cli/src/main.js";
import { createProductionEngine } from "../src/api/production-engine.js";
import {
  admitOutput,
  preparePublication,
} from "../src/lifecycle/atomic-commit.js";
import {
  CancellationTokenSource,
  throwIfCancellationRequested,
} from "../src/lifecycle/cancellation.js";
import { evidence, verifyArtifact } from "../src/qa/artifact-gates.js";

const source = {
  module: "fixture.omega.yaml",
  text: "omega: {schema: '3.0'}\nkind: artifact\nspec:\n  document: {title: Review}\n  sections: [{id: intro, title: Introduction, body: Running.}]\n",
};
test("real_production_evidence_binds_exact_bytes_and_prior_pair_survives_rejection_internal_cancellation", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-engine-t6-"));
  try {
    const out = join(root, "dist");
    const request = {
      operation: "build" as const,
      source,
      settings: { outputDirectory: out },
    };
    const real = await createProductionEngine().build(request);
    expect(real.status).toBe("succeeded");
    if (real.status !== "succeeded") throw new Error(JSON.stringify(real));
    const html = await readFile(real.value.finalArtifactPath);
    const receipt = await readFile(real.value.finalReceiptPath);
    expect(real.value.receipt.artifactHash).toBe(sha256(html));
    expect(real.value.receipt.normalizedHash).toBe(
      real.value.compiled.normalizedHash,
    );
    expect(
      real.value.receipt.gates.verify.checks.find(
        (check) => check.rule === "offline-zero-attempted-requests",
      )?.outcome,
    ).toBe("PASS");
    expect(real.value.receipt.gates.regression.checks[0]?.outcome).toBe(
      "NOT_APPLICABLE",
    );
    const token = new CancellationTokenSource();
    const cases = [
      createProductionEngine({
        stages: {
          verify: (input) => ({
            status: "succeeded",
            value: evidence("verify", input.candidate.artifactHash, [
              { rule: "forced-fail", outcome: "FAIL" },
            ]),
          }),
        },
      }),
      createProductionEngine({
        stages: {
          verify: (_input) => ({
            status: "succeeded",
            value: evidence("verify", "stale-other-hash", [
              { rule: "forced-stale", outcome: "PASS" },
            ]),
          }),
        },
      }),
      createProductionEngine({
        stages: {
          verify: () => {
            throw new Error("private internal error");
          },
        },
      }),
      createProductionEngine({
        stages: {
          verify: (input) => {
            token.cancel();
            return {
              status: "succeeded",
              value: evidence("verify", input.candidate.artifactHash, [
                { rule: "test-only-cancel", outcome: "PASS" },
              ]),
            };
          },
        },
      }),
    ];
    const expected = ["failed", "failed", "failed", "cancelled"];
    for (const [index, engine] of cases.entries()) {
      const result = await engine.build(
        request,
        index === 3 ? { cancellationToken: token.token } : {},
      );
      expect(result.status).toBe(expected[index]);
      if (index === 2)
        expect(result).toMatchObject({ failureClass: "internal" });
      expect(await readFile(join(out, "current/artifact.html"))).toEqual(html);
      expect(await readFile(join(out, "current/build-receipt.json"))).toEqual(
        receipt,
      );
      expect(
        (await readdir(out)).filter(
          (name) =>
            name.startsWith(".omega-workspace") ||
            name.startsWith(".omega-pointer"),
        ),
      ).toEqual([]);
      expect(await readdir(join(out, ".omega-generations"))).toHaveLength(1);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("real_verify_filesystem_error_after_abort_stays_internal_and_preserves_prior_pair", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-engine-failure-class-"));
  try {
    const out = join(root, "dist");
    const request = {
      operation: "build" as const,
      source,
      settings: { outputDirectory: out, cache: "off" as const },
    };
    const prior = await createProductionEngine().build(request);
    expect(prior.status).toBe("succeeded");
    if (prior.status !== "succeeded") throw new Error(JSON.stringify(prior));
    const html = await readFile(join(out, "current/artifact.html"));
    const receipt = await readFile(join(out, "current/build-receipt.json"));

    for (const mode of [
      "filesystem",
      "filesystem-after-abort",
      "cancellation",
    ] as const) {
      const cancellation = new CancellationTokenSource();
      const events: string[] = [];
      let reachedVerify = false;
      let filesystemCode: string | undefined;
      const result = await createProductionEngine({
        stages: {
          verify: async (_input, context) => {
            reachedVerify = true;
            if (mode === "cancellation") {
              cancellation.cancel();
              throwIfCancellationRequested(context.cancellationToken);
            }
            try {
              await readFile(join(root, "absent-private-input"));
            } catch (error) {
              filesystemCode = (error as NodeJS.ErrnoException).code;
              if (mode === "filesystem-after-abort") cancellation.cancel();
              throw error;
            }
            throw new Error("Expected a missing filesystem input");
          },
        },
      }).build(request, {
        cancellationToken: cancellation.token,
        onEvent: (event) => events.push(event.name),
      });
      expect(reachedVerify).toBe(true);
      expect(filesystemCode).toBe(
        mode === "cancellation" ? undefined : "ENOENT",
      );
      expect(result.stages.at(-1)).toEqual({
        stage: "verify",
        status: mode === "cancellation" ? "cancelled" : "failed",
      });
      expect(
        events.filter(
          (name) => name.startsWith("build.") && name !== "build.started",
        ),
      ).toEqual([mode === "cancellation" ? "build.cancelled" : "build.failed"]);
      if (mode === "cancellation") {
        expect(result.status).toBe("cancelled");
        expect(exitCode(result)).toBe(130);
      } else {
        expect(result).toMatchObject({
          status: "failed",
          failureClass: "internal",
          stage: "verify",
          diagnostics: [
            expect.objectContaining({ code: "OMEGA-ENGINE-INTERNAL" }),
          ],
        });
        expect(exitCode(result)).toBe(4);
      }
      expect(JSON.stringify(result)).not.toContain("absent-private-input");
      expect(await readFile(join(out, "current/artifact.html"))).toEqual(html);
      expect(await readFile(join(out, "current/build-receipt.json"))).toEqual(
        receipt,
      );
      expect(await readdir(join(out, ".omega-generations"))).toHaveLength(1);
      expect(
        (await readdir(out)).filter(
          (name) =>
            name.startsWith(".omega-workspace") ||
            name.startsWith(".omega-pointer"),
        ),
      ).toEqual([]);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("output_confinement_rejects_traversal_ancestor_and_unowned_current_symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-confinement-t6-"));
  try {
    const outside = join(root, "outside");
    await mkdir(outside);
    const link = join(root, "link");
    await symlink(outside, link);
    const cases = [
      join(link, "dist"),
      `${root}/safe/../outside`,
      join(root, "pointer"),
    ];
    await mkdir(cases[2] as string);
    await symlink(outside, join(cases[2] as string, "current"));
    for (const outputDirectory of cases) {
      const result = await createProductionEngine().build({
        operation: "build",
        source,
        settings: { outputDirectory },
      });
      expect(result).toMatchObject({
        status: "failed",
        failureClass: "execution",
        stage: "preflight",
      });
    }
    expect(await readdir(outside)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication_has_one_observable_pointer_and_returned_paths_remain_immutable", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-atomic-t6-"));
  try {
    const out = join(root, "dist");
    const first = await createProductionEngine().build({
      operation: "build",
      source,
      settings: { outputDirectory: out },
    });
    if (first.status !== "succeeded") throw new Error(JSON.stringify(first));
    const scratch = join(root, "candidate");
    await mkdir(scratch);
    const bytes = await readFile(first.value.finalArtifactPath);
    await writeFile(join(scratch, "artifact.html"), bytes);
    const candidate = {
      kind: "standalone-html-candidate" as const,
      workspacePath: join(scratch, "artifact.html"),
      workspaceDirectory: scratch,
      artifactHash: sha256(bytes),
      byteLength: bytes.length,
      renderer: "astro-static/1" as const,
      rendererVersion: "omega-prime-prose/1" as const,
      tokenVersion: "omega-prime-tokens/1" as const,
      runtimeDependencies: [] as const,
      resourceDependencies: [] as const,
    };
    const pointerBefore = await readlink(join(out, "current"));
    const prepared = await preparePublication(
      await admitOutput(out),
      candidate,
      first.value.receipt,
    );
    expect(await readlink(join(out, "current"))).toBe(pointerBefore);
    expect(await readFile(join(out, "current/artifact.html"))).toEqual(
      await readFile(first.value.finalArtifactPath),
    );
    const published = prepared.publish();
    expect(await readFile(join(out, "current/artifact.html"))).toEqual(bytes);
    expect(
      JSON.parse(
        await readFile(join(out, "current/build-receipt.json"), "utf8"),
      ).artifactHash,
    ).toBe(sha256(bytes));
    expect(await readFile(first.value.finalArtifactPath, "utf8")).toContain(
      "Running.",
    );
    expect(published.finalArtifactPath).not.toBe(
      join(out, "current/artifact.html"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("real_artifact_browser_failure_blocks_commit_and_cleans_owned_candidate", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-browser-fail-t6-"));
  try {
    const result = await createProductionEngine({
      stages: {
        verify: async (input, context) => {
          // Trusted fault injection alters the actual candidate file; the actual browser blocks the attempted image request.
          const bytes = (
            await readFile(input.candidate.workspacePath, "utf8")
          ).replace(
            "</body>",
            '<img src="https://blocked.invalid/image.png"></body>',
          );
          await writeFile(input.candidate.workspacePath, bytes);
          const checked = await verifyArtifact(input, context);
          expect(
            checked.checks.find(
              (check) => check.rule === "offline-zero-attempted-requests",
            )?.outcome,
          ).toBe("FAIL");
          expect(
            checked.checks.find(
              (check) => check.rule === "exact-artifact-bytes",
            )?.outcome,
          ).toBe("FAIL");
          return { status: "succeeded", value: checked };
        },
      },
    }).build({
      operation: "build",
      source,
      settings: { outputDirectory: join(root, "dist") },
    });
    expect(result).toMatchObject({
      status: "failed",
      stage: "quality",
      failureClass: "execution",
    });
    expect(
      (await readdir(join(root, "dist"))).filter(
        (name) => name.startsWith(".omega-workspace") || name === "current",
      ),
    ).toEqual([]);
    expect(await readdir(join(root, "dist", ".omega-generations"))).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("incomplete_managed_generation_is_rejected_before_replacing_existing_pointer", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-incomplete-t6-"));
  try {
    const out = join(root, "dist");
    await mkdir(out);
    await mkdir(join(out, ".omega-generations"));
    await mkdir(join(out, ".omega-generations/omega-accepted-broken"));
    await symlink(
      ".omega-generations/omega-accepted-broken",
      join(out, "current"),
    );
    const result = await createProductionEngine().build({
      operation: "build",
      source,
      settings: { outputDirectory: out },
    });
    expect(result).toMatchObject({
      status: "failed",
      stage: "preflight",
      failureClass: "execution",
    });
    expect(await readlink(join(out, "current"))).toBe(
      ".omega-generations/omega-accepted-broken",
    );
    expect(await readdir(join(out, ".omega-generations"))).toEqual([
      "omega-accepted-broken",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("cancellation_after_preparation_before_pointer_swap_preserves_pair_and_discards_generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-prepublication-cancel-t6-"));
  try {
    const out = join(root, "dist");
    const request = {
      operation: "build" as const,
      source,
      settings: { outputDirectory: out },
    };
    const first = await createProductionEngine().build(request);
    if (first.status !== "succeeded") throw new Error(JSON.stringify(first));
    const before = await readlink(join(out, "current"));
    const html = await readFile(first.value.finalArtifactPath);
    const receipt = await readFile(first.value.finalReceiptPath);
    const cancellation = new CancellationTokenSource();
    let prepared = false;
    const terminals: string[] = [];
    const result = await createProductionEngine().build(
      {
        ...request,
        source: {
          ...source,
          text: source.text.replace("Running.", "Changed content."),
        },
      },
      {
        cancellationToken: cancellation.token,
        onEvent: (event) => {
          if (event.name === "stage.progress" && event.stage === "commit") {
            prepared = true;
            cancellation.cancel();
          }
          if (
            ["build.completed", "build.cancelled", "build.failed"].includes(
              event.name,
            )
          )
            terminals.push(event.name);
        },
      },
    );
    expect(prepared).toBe(true);
    expect(result.status).toBe("cancelled");
    expect(terminals).toEqual(["build.cancelled"]);
    expect(await readlink(join(out, "current"))).toBe(before);
    expect(await readFile(join(out, "current/artifact.html"))).toEqual(html);
    expect(await readFile(join(out, "current/build-receipt.json"))).toEqual(
      receipt,
    );
    expect(
      (await readdir(out)).filter(
        (name) =>
          name.startsWith(".omega-workspace") ||
          name.startsWith(".omega-pointer"),
      ),
    ).toEqual([]);
    expect(await readdir(join(out, ".omega-generations"))).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("uncached_real_build_identity_is_independent_of_runtime_paths_and_correlation", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-identity-t6-"));
  try {
    const first = await createProductionEngine().build(
      {
        operation: "build",
        source,
        settings: { outputDirectory: join(root, "first"), cache: "off" },
      },
      { buildId: "one", taskId: "runtime-one" },
    );
    const second = await createProductionEngine().build(
      {
        operation: "build",
        source,
        settings: { outputDirectory: join(root, "second"), cache: "use" },
      },
      { buildId: "two", taskId: "runtime-two" },
    );
    if (first.status !== "succeeded" || second.status !== "succeeded")
      throw new Error(JSON.stringify([first, second]));
    expect(await readFile(first.value.finalArtifactPath)).toEqual(
      await readFile(second.value.finalArtifactPath),
    );
    expect(first.value.plan.planHash).toBe(second.value.plan.planHash);
    expect(first.value.receipt).toEqual(second.value.receipt);
    expect(JSON.stringify(first.value.receipt)).not.toContain(root);
    expect(JSON.stringify(first.value.receipt)).not.toContain("runtime-one");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("tampered_receipt_identity_cannot_admit_a_managed_current_generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-receipt-admission-t6-"));
  try {
    const out = join(root, "dist");
    const first = await createProductionEngine().build({
      operation: "build",
      source,
      settings: { outputDirectory: out },
    });
    if (first.status !== "succeeded") throw new Error(JSON.stringify(first));
    const before = await readlink(join(out, "current"));
    const changed = { ...first.value.receipt, normalizedHash: "f".repeat(64) };
    await writeFile(first.value.finalReceiptPath, JSON.stringify(changed));
    const result = await createProductionEngine().build({
      operation: "build",
      source,
      settings: { outputDirectory: out },
    });
    expect(result).toMatchObject({
      status: "failed",
      stage: "preflight",
      failureClass: "execution",
    });
    expect(await readlink(join(out, "current"))).toBe(before);
    expect(
      JSON.parse(await readFile(first.value.finalReceiptPath, "utf8")),
    ).toEqual(changed);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("artifact_qa_preserves_protected_code_while_accepting_collapsed_prose_and_link_tooltips", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-text-contract-t6-"));
  try {
    const result = await createProductionEngine().build({
      operation: "build",
      source: {
        module: "text-contract.omega.yaml",
        text: "omega: {schema: '3.0'}\nkind: artifact\nspec:\n  document: {title: Review}\n  sections:\n    - id: intro\n      title: Introduction\n      body: |\n        [Reference](https://example.test/reference \"Tooltip is metadata\") and ordinary   spaced prose with non\u00a0breaking and em\u2003space.\n\n        Protected `e\u0301   ID` token.\n\n        ```text\n        e\u0301   exact\n        ```\n",
      },
      settings: { outputDirectory: join(root, "dist") },
    });
    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") throw new Error(JSON.stringify(result));
    expect(
      result.value.receipt.gates.verify.checks.find(
        (check) => check.rule === "essential-no-js-content",
      )?.outcome,
    ).toBe("PASS");
    const html = await readFile(result.value.finalArtifactPath, "utf8");
    expect(html).toContain('title="Tooltip is metadata"');
    expect(html).toContain("non\u00a0breaking and em\u2003space");
    expect(html).toContain("e\u0301   exact");
    expect(html).toContain("e\u0301   ID");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);
