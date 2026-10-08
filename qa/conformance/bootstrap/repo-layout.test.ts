import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { parse } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const requiredDirectories = [
  "docs/architecture", "docs/decisions", "docs/superpowers/plans",
  "packages/contracts", "packages/spec-frontend", "packages/capability-registry",
  "packages/presentation-engine", "packages/design-system", "packages/visual-engines",
  "packages/composer", "packages/engine", "packages/cli", "packages/plugin-sdk",
  "python/semantic-core", "apps/representation-lab", "apps/studio",
  "qa/fixtures", "qa/conformance", "qa/regression", "qa/golden", "qa/playwright",
];
const requiredFiles = [
  "package.json", "pnpm-workspace.yaml", "tsconfig.base.json", "biome.json",
  ".node-version", ".python-version", "pyproject.toml",
];

function isConfined(path: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

function assertConfinedPaths(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    // Dependency/tool caches and Git metadata are outside the product layout contract.
    if ([".git", ".tools", ".superpowers", "node_modules", ".venv"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    expect(isConfined(realpathSync(path)), `Path escapes V3 workspace: ${relative(root, path)}`).toBe(true);
    if (lstatSync(path).isSymbolicLink()) continue;
    if (entry.isDirectory()) assertConfinedPaths(path);
    if (entry.isFile() && entry.name === "package.json") {
      const manifest = JSON.parse(readFileSync(path, "utf8"));
      for (const group of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
        for (const reference of Object.values(manifest[group] ?? {}) as string[]) {
          expect(reference, "V2 dependency reference").not.toMatch(/omega-html-v2/i);
          if (/^(file|link|portal):/.test(reference)) {
            expect(isConfined(resolve(directory, reference.replace(/^[^:]+:/, ""))), `External dependency: ${reference}`).toBe(true);
          }
        }
      }
    }
  }
}

test("repo_layout_contains_only_v3_boundaries", () => {
  for (const directory of requiredDirectories) {
    expect(existsSync(resolve(root, directory)), `Missing workspace directory: ${directory}`).toBe(true);
    expect(lstatSync(resolve(root, directory)).isDirectory(), `Not a directory: ${directory}`).toBe(true);
  }
  for (const file of requiredFiles) {
    expect(existsSync(resolve(root, file)), `Missing workspace manifest: ${file}`).toBe(true);
  }
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  expect(manifest.private, "Root workspace must be private").toBe(true);
  const workspace = parse(readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8"));
  expect(workspace.packages).toEqual(["packages/*", "apps/*"]);
  assertConfinedPaths(root);
});
