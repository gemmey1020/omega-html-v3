import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const checks = [
  "lint",
  "typecheck",
  "test",
  "python:lint",
  "python:typecheck",
  "python:test",
];

function runVerify(failingCheck = "", fromOtherDirectory = false) {
  const pnpm = process.env.npm_execpath;
  if (!pnpm) throw new Error("Run this conformance test through pnpm.");
  const tools = join(root, ".tools");
  mkdirSync(tools, { recursive: true });
  const fixture = mkdtempSync(join(tools, "verify-command-"));
  const log = join(fixture, "children.log");
  try {
    // Only the wrapper's child commands are replaced; the root pnpm is real.
    writeFileSync(
      join(fixture, "pnpm"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "[[ $# -eq 1 ]] || exit 99",
        'printf "%s\\t%s\\n" "$1" "$PWD" >> "$VERIFY_TEST_LOG"',
        'if [[ "$1" == "$VERIFY_TEST_FAIL" ]]; then exit 23; fi',
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    const result = spawnSync(
      fromOtherDirectory ? "bash" : pnpm,
      fromOtherDirectory
        ? ["--noprofile", "--norc", join(root, "scripts/verify.sh")]
        : ["verify"],
      {
        cwd: fromOtherDirectory ? fixture : root,
        encoding: "utf8",
        timeout: 10_000,
        env: {
          ...process.env,
          PATH: `${fixture}${delimiter}${process.env.PATH ?? ""}`,
          VERIFY_TEST_LOG: log,
          VERIFY_TEST_FAIL: failingCheck,
        },
      },
    );
    const children = existsSync(log)
      ? readFileSync(log, "utf8")
          .trimEnd()
          .split("\n")
          .map((line) => line.split("\t"))
      : [];
    return { result, children };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test("pnpm_verify_covers_both_language_lanes", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  expect(manifest.scripts.verify, "Missing root verify script").toBe(
    "bash scripts/verify.sh",
  );
  const { result, children } = runVerify();
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(children).toEqual(checks.map((check) => [check, root]));
});

test.each(checks)(
  "pnpm_verify_stops_and_fails_when_%s_fails",
  (failingCheck) => {
    const { result, children } = runVerify(failingCheck);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(23);
    expect(children).toEqual(
      checks
        .slice(0, checks.indexOf(failingCheck) + 1)
        .map((check) => [check, root]),
    );
  },
);

test("verify_wrapper_runs_checks_from_repository_root", () => {
  const { result, children } = runVerify("", true);
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(children).toEqual(checks.map((check) => [check, root]));
});
