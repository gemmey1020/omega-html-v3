import { spawn } from "node:child_process";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";

const launcher = resolve(import.meta.dirname, "../src/launch.mjs");
const valid =
  "omega: {schema: '3.0'}\nkind: artifact\nspec:\n  document: {title: Review}\n  sections: [{id: intro, title: Introduction, body: Running.}]\n";
export function cli(
  args: string[],
  cancelStage?: string,
  env: NodeJS.ProcessEnv = {},
  nodeArgs: readonly string[] = [],
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (done) => {
      const child = spawn(process.execPath, [...nodeArgs, launcher, ...args], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...env },
      });
      let stdout = "";
      let stderr = "";
      let sent = false;
      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
        if (
          cancelStage &&
          !sent &&
          stdout.includes(`"stage":"${cancelStage}"`)
        ) {
          sent = true;
          child.kill("SIGINT");
        }
      });
      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
      child.on("close", (code) => done({ code, stdout, stderr }));
    },
  );
}
test("cli_build_promotes_only_after_success_and_emits_receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-cli-test-"));
  try {
    const source = join(root, "basic.omega.yaml");
    const out = join(root, "dist");
    await writeFile(source, valid);
    const result = await cli(["build", source, "--output", out, "--json"]);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    const machine = JSON.parse(result.stdout);
    const html = await readFile(machine.value.finalArtifactPath, "utf8");
    const receipt = JSON.parse(
      await readFile(machine.value.finalReceiptPath, "utf8"),
    );
    expect(html).toContain("Running.");
    expect(receipt.normalizedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.artifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.acceptancePolicy).toBe("qa.phase.p02.walking-skeleton.v1");
    await writeFile(source, "omega: [broken");
    const bad = await cli(["build", source, "--output", out, "--json"]);
    expect(bad.code).toBe(3);
    expect(await readFile(machine.value.finalArtifactPath, "utf8")).toBe(html);
    expect(
      JSON.parse(await readFile(machine.value.finalReceiptPath, "utf8")),
    ).toEqual(receipt);
    const rejectedOut = join(root, "invalid-dist");
    const freshInvalid = await cli([
      "build",
      source,
      "--output",
      rejectedOut,
      "--json",
    ]);
    expect(freshInvalid.code).toBe(3);
    expect(
      (await readdir(rejectedOut)).filter(
        (name) => name === "current" || name.startsWith(".omega-workspace"),
      ),
    ).toEqual([]);
    expect(await readdir(join(rejectedOut, ".omega-generations"))).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("seven_commands_have_real_machine_results_and_fixed_exit_codes", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-cli-commands-"));
  try {
    const source = join(root, "fixture.omega.yaml");
    await writeFile(source, valid);
    for (const command of [
      "validate",
      "plan",
      "inspect",
      "explain",
      "migrate",
      "capabilities",
    ]) {
      const result = await cli([
        command,
        ...(command === "capabilities" ? [] : [source]),
        "--json",
      ]);
      expect(result.stderr).toBe("");
      expect(result.code).toBe(command === "migrate" ? 3 : 0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        operation: command,
        status: command === "migrate" ? "failed" : "succeeded",
      });
      if (command === "migrate")
        expect(JSON.parse(result.stdout).diagnostics[0].code).toBe(
          "OMEGA-MIGRATION-UNSUPPORTED-ROUTE",
        );
    }
    for (const args of [
      [],
      ["unknown"],
      ["build"],
      ["validate", source, "--output", "out"],
      ["capabilities", source],
      ["build", source, "--output"],
      ["build", source, "--wat"],
      ["validate", source, "--events=jsonl"],
    ])
      expect((await cli(args)).code).toBe(2);
    const migration = await cli([
      "migrate",
      source,
      "--target",
      "2.0",
      "--json",
    ]);
    expect(migration.code).toBe(3);
    expect(JSON.parse(migration.stdout).failureClass).toBe("validation");
    const internal = await cli(
      ["build", source, "--output", join(root, "internal-dist"), "--json"],
      undefined,
      { PLAYWRIGHT_BROWSERS_PATH: join(root, "not-installed") },
    );
    expect(internal.code).toBe(4);
    expect(JSON.parse(internal.stdout).failureClass).toBe("internal");
    expect(internal.stderr).toBe("");
    expect(JSON.parse(internal.stdout).stage).toBe("verify");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("events_are_versioned_jsonl_and_real_SIGINT_preserves_the_accepted_pair", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-cli-cancel-"));
  try {
    const source = join(root, "fixture.omega.yaml");
    const out = join(root, "dist");
    await writeFile(source, valid);
    const first = await cli([
      "build",
      source,
      "--output",
      out,
      "--events=jsonl",
    ]);
    expect(first.code).toBe(0);
    expect(first.stderr).toBe("");
    const records = first.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records.at(-1).type).toBe("result");
    const events = records
      .filter((record) => record.type === "event")
      .map((record) => record.event);
    expect(events.map((event) => event.name)).toContain("qa.completed");
    expect(events.at(-1).name).toBe("build.completed");
    expect(events.every((event) => event.version === "omega-events/1.0")).toBe(
      true,
    );
    const accepted = records.at(-1).result.value;
    const html = await readFile(accepted.finalArtifactPath);
    const receipt = await readFile(accepted.finalReceiptPath);
    const cancelled = await cli(
      ["build", source, "--output", out, "--events=jsonl"],
      "verify",
    );
    expect(cancelled.code).toBe(130);
    expect(cancelled.stderr).toBe("");
    const terminal = cancelled.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(terminal.at(-1)).toMatchObject({
      type: "result",
      result: { status: "cancelled" },
    });
    expect(
      terminal.filter(
        (record) =>
          record.type === "event" && record.event.name === "build.cancelled",
      ),
    ).toHaveLength(1);
    expect(await readFile(join(out, "current/artifact.html"))).toEqual(html);
    expect(await readFile(join(out, "current/build-receipt.json"))).toEqual(
      receipt,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);

test("unexpected_source_read_error_stays_internal_after_controlled_cancellation_request", async () => {
  const root = await mkdtemp(join(tmpdir(), "omega-cli-unexpected-cancel-"));
  try {
    const source = join(root, "loop.omega.yaml");
    await symlink("loop.omega.yaml", source);
    const preload = join(root, "request-cli-cancellation.mjs");
    const marker = join(root, "delivered.txt");
    // Invoke only the named CLI listener; this is controlled boundary instrumentation, not an OS signal race.
    await writeFile(
      preload,
      `import { writeFileSync } from 'node:fs';
const original=process.on;
process.on=function(name,listener){
 const value=original.call(this,name,listener);
 if(name==='SIGINT' && listener.name==='onInterrupt'){
  listener();
  writeFileSync(process.env.OMEGA_CLI_TEST_CANCEL_MARKER,'onInterrupt\\n');
 }
 return value;
};
`,
    );
    for (const operation of ["validate", "build"]) {
      const events = operation === "build";
      for (const requested of [false, true]) {
        await rm(marker, { force: true });
        const result = await cli(
          [operation, source, events ? "--events=jsonl" : "--json"],
          undefined,
          { OMEGA_CLI_TEST_CANCEL_MARKER: marker },
          requested ? ["--import", preload] : [],
        );
        const delivered = requested ? await readFile(marker, "utf8") : null;
        if (process.env.OMEGA_CLI_FIX_EVIDENCE_DIRECTORY)
          await writeFile(
            join(
              process.env.OMEGA_CLI_FIX_EVIDENCE_DIRECTORY,
              `${operation}-${requested ? "requested" : "ordinary"}.json`,
            ),
            `${JSON.stringify({ ...result, delivered }, null, 2)}\n`,
          );
        if (requested) expect(delivered).toBe("onInterrupt\n");
        expect(result.code).toBe(4);
        expect(result.stderr).toBe("");
        const payload = {
          operation,
          status: "failed",
          failureClass: "internal",
          code: "OMEGA-CLI-INTERNAL",
        };
        expect(result.stdout).toBe(
          `${JSON.stringify(events ? { type: "result", result: payload } : payload)}\n`,
        );
        expect(result.stdout).not.toContain(root);
        expect(result.stdout).not.toContain("ELOOP");
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);
