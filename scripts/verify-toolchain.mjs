import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parseAllDocuments, parseDocument } from "yaml";

const root = new URL("../", import.meta.url);
/** @param {string} path */
const read = (path) => readFileSync(new URL(path, root), "utf8");
const require = createRequire(import.meta.url);
const manifest = JSON.parse(read("package.json"));
const nodeVersion = read(".node-version").trim();
const pythonVersion = read(".python-version").trim();
assert.equal(
  process.versions.node,
  nodeVersion,
  "Activate the pinned Node runtime",
);
assert.match(manifest.packageManager, /^pnpm@\d+\.\d+\.\d+$/);
assert.equal(manifest.engines.node, nodeVersion);
assert.equal(manifest.engines.pnpm, manifest.packageManager.slice(5));
const uvVersion = read("pyproject.toml").match(
  /^required-version = "==(.+)"$/m,
)?.[1];
assert.ok(uvVersion, "Exact uv required-version pin");
for (const [command, version] of [
  ["pnpm", manifest.packageManager.slice(5)],
  ["uv", uvVersion],
]) {
  const result = spawnSync(command, ["--version"], {
    cwd: fileURLToPath(root),
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `Activate the pinned ${command}: ${result.stderr}`,
  );
  assert.match(
    result.stdout.trim(),
    new RegExp(`^(?:${command} )?${version.replaceAll(".", "\\.")}(?:$| )`),
    `Actual ${command} runtime`,
  );
}
const lockDocuments = parseAllDocuments(read("pnpm-lock.yaml"));
for (const document of lockDocuments) assert.equal(document.errors.length, 0);
const locks = lockDocuments.map((document) => document.toJSON());
const lock = locks.find(
  (document) => document.importers?.["."]?.devDependencies,
);
assert.ok(lock, "Dependency lock document");
assert.ok(
  locks.some(
    (document) =>
      document.importers?.["."]?.packageManagerDependencies?.pnpm?.specifier ===
      manifest.packageManager.slice(5),
  ),
  "Locked pnpm version",
);
for (const [name, version] of Object.entries(manifest.devDependencies)) {
  assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must have an exact pin`);
  assert.equal(
    require(`${name}/package.json`).version,
    version,
    `${name} installation`,
  );
  assert.equal(
    lock.importers["."].devDependencies[name].specifier,
    version,
    `${name} lock`,
  );
}
assert.match(
  read("uv.lock"),
  new RegExp(`requires-python = "==${pythonVersion.replaceAll(".", "\\.")}"`),
);
const python = spawnSync(
  fileURLToPath(new URL(".venv/bin/python", root)),
  [
    "-c",
    "import json,sys,importlib.metadata as m; print(json.dumps({'python': '.'.join(map(str,sys.version_info[:3])), **{n:m.version(n) for n in ['pytest','ruff','mypy']}}))",
  ],
  { cwd: fileURLToPath(root), encoding: "utf8" },
);
assert.equal(python.status, 0, python.stderr || "Run uv sync --locked first");
const pythonTools = JSON.parse(python.stdout);
assert.equal(pythonTools.python, pythonVersion, "Actual Python runtime");
for (const name of ["pytest", "ruff", "mypy"]) {
  assert.ok(
    read("pyproject.toml").includes(`${name}==${pythonTools[name]}`),
    `${name} installation`,
  );
  assert.ok(
    read("uv.lock").includes(
      `name = "${name}"\nversion = "${pythonTools[name]}"`,
    ),
    `${name} lock`,
  );
}

// Bootstrap probes use library APIs only; there is no product schema or parser.
const ajv = new Ajv2020({ strict: true });
const validate = ajv.compile({ type: "integer", minimum: 0 });
assert.equal(validate(1), true);
assert.equal(validate(-1), false);
assert.throws(
  () => ajv.compile({ type: "string", unknownBootstrapKeyword: true }),
  /strict mode/,
);
const document = parseDocument("# bootstrap\nname: toolchain\n", {
  keepSourceTokens: true,
});
assert.equal(document.errors.length, 0);
assert.ok(document.contents?.srcToken, "YAML CST source token");
assert.equal(document.get("name"), "toolchain");
assert.ok(parseDocument("name: first\nname: second\n").errors.length > 0);
console.log(
  JSON.stringify(
    {
      node: nodeVersion,
      packageManager: manifest.packageManager,
      uv: uvVersion,
      ...pythonTools,
      dependencies: manifest.devDependencies,
      probes: ["Ajv2020 strict", "YAML Document/CST"],
    },
    null,
    2,
  ),
);
