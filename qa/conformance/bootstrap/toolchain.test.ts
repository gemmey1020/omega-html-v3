import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { parseAllDocuments } from "yaml";
import { verifyImporterPins } from "../../../scripts/verify-lock.mjs";

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

const manifest = JSON.parse(read("package.json"));
function locksWithEntry(name: string, value: string, field = "version") {
  const locks = parseAllDocuments(read("pnpm-lock.yaml")).map((document) =>
    document.toJSON(),
  );
  const kind =
    name === "pnpm" ? "packageManagerDependencies" : "devDependencies";
  const importer = locks.find((lock) => lock.importers?.["."]?.[kind]);
  if (!importer) throw new Error(`Missing ${kind} lock importer`);
  importer.importers["."][kind][name][field] = value;
  return locks;
}

const directNames = Object.keys(manifest.devDependencies);
test.each(["pnpm", ...directNames])(
  "toolchain_rejects_resolved_lock_drift_for_%s",
  (name) => {
    expect(() =>
      verifyImporterPins(locksWithEntry(name, "0.0.0"), manifest),
    ).toThrow(`${name} resolved lock version`);
  },
);

test.each(["pnpm", ...directNames])(
  "toolchain_rejects_lock_specifier_drift_for_%s",
  (name) => {
    expect(() =>
      verifyImporterPins(locksWithEntry(name, "0.0.0", "specifier"), manifest),
    ).toThrow(/lock/i);
  },
);

test.each([
  "()",
  "(garbage)",
  "(peer@latest)",
  "(@types/node@24.19.1",
  "(@types/node@24.19.1))",
  "(@types/node@24.19.1)trailing",
])("toolchain_rejects_malformed_peer_suffix_%s", (suffix) => {
  expect(() =>
    verifyImporterPins(
      locksWithEntry("vitest", `${manifest.devDependencies.vitest}${suffix}`),
      manifest,
    ),
  ).toThrow("vitest resolved lock version");
});

test("toolchain_accepts_valid_nested_peer_suffixes", () => {
  expect(() =>
    verifyImporterPins(
      locksWithEntry(
        "vitest",
        `${manifest.devDependencies.vitest}(@types/node@24.19.1)(vite@8.3.3(@types/node@24.19.1)(yaml@2.9.1))`,
      ),
      manifest,
    ),
  ).not.toThrow();
});

test.each(["pnpm", "vitest"])(
  "verifier_rejects_%s_lock_drift_before_runtime_commands",
  (name) => {
    const tools = fileURLToPath(new URL(".tools/", root));
    mkdirSync(tools, { recursive: true });
    const fixture = mkdtempSync(join(tools, "toolchain-lock-"));
    try {
      mkdirSync(join(fixture, "scripts"));
      for (const path of [
        "package.json",
        ".node-version",
        ".python-version",
        "scripts/verify-toolchain.mjs",
        "scripts/verify-lock.mjs",
      ]) {
        copyFileSync(new URL(path, root), join(fixture, path));
      }
      const lock = locksWithEntry(name, "0.0.0")
        .map((document) => `---\n${JSON.stringify(document)}\n`)
        .join("");
      writeFileSync(join(fixture, "pnpm-lock.yaml"), lock);
      const result = spawnSync(
        process.execPath,
        [join(fixture, "scripts/verify-toolchain.mjs")],
        { cwd: fixture, encoding: "utf8", timeout: 10_000 },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain(`${name} resolved lock version`);
      expect(readFileSync(join(fixture, "pnpm-lock.yaml"), "utf8")).toBe(lock);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  },
);
