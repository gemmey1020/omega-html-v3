import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("locked_toolchain_matches_adr", () => {
  const manifest = JSON.parse(read("package.json"));
  expect(typeof manifest.packageManager, "Missing packageManager pin").toBe(
    "string",
  );
  expect(manifest.packageManager, "Exact pnpm packageManager pin").toMatch(
    /^pnpm@\d+\.\d+\.\d+$/,
  );
  expect(read(".node-version").trim().split(".")[0]).toBe("24");
  expect(manifest.devDependencies.typescript, "TypeScript 7 pin").toMatch(
    /^7\.0\.\d+$/,
  );
  expect(read(".python-version").trim()).toBe("3.14.8");
  for (const lock of ["pnpm-lock.yaml", "uv.lock"]) {
    expect(
      existsSync(fileURLToPath(new URL(lock, root))),
      `Missing ${lock}`,
    ).toBe(true);
  }
  const adr = read("docs/decisions/ADR-0001-toolchain-baseline.md");
  expect(adr).toContain(`| Node.js | ${read(".node-version").trim()} |`);
  expect(adr).toContain(`| pnpm | ${manifest.packageManager.slice(5)} |`);
  expect(adr).toContain(`| Python | ${read(".python-version").trim()} |`);
  for (const [name, version] of Object.entries(manifest.devDependencies)) {
    expect(adr, `ADR version for ${name}`).toContain(
      `| ${name} | ${version} |`,
    );
  }
});

test("installed_toolchain_runs_locked_bootstrap_probes", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("scripts/verify-toolchain.mjs", root))],
    { cwd: fileURLToPath(root), encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
  const actual = JSON.parse(result.stdout);
  expect(actual.probes).toEqual(["Ajv2020 strict", "YAML Document/CST"]);
  const adr = read("docs/decisions/ADR-0001-toolchain-baseline.md");
  for (const name of ["uv", "pytest", "ruff", "mypy"]) {
    expect(adr, `ADR version for ${name}`).toContain(
      `| ${name} | ${actual[name]} |`,
    );
  }
});
