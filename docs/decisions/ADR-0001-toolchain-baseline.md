# ADR-0001: P00 toolchain baseline

Status: accepted for the isolated bootstrap lane, 2026-10-08.

## Decision

Use the exact versions below. This decision records locally executed compatibility evidence; it does not approve product behavior, release, deployment, or other operating systems.

| Tool | Exact version |
| --- | --- |
| Node.js | 24.21.0 |
| pnpm | 12.10.1 |
| Python | 3.14.8 |
| uv | 0.12.23 |
| typescript | 7.0.2 |
| astro | 7.3.8 |
| vitest | 5.0.3 |
| @biomejs/biome | 2.5.15 |
| @playwright/test | 1.64.0 |
| @types/node | 24.19.1 |
| ajv | 8.20.0 |
| yaml | 2.9.1 |
| pytest | 9.1.1 |
| ruff | 0.16.10 |
| mypy | 2.4.0 |

Root JavaScript development dependencies use exact manifest pins plus `pnpm-lock.yaml`. Python development dependencies use exact group pins plus `uv.lock`; `requires-python`, `.python-version`, and uv's required version constrain execution. TypeScript strict checking includes bootstrap TypeScript tests and JavaScript scripts. No package or application contains product implementation.

## Compatibility evidence and rulings

Observed on Linux x64 with the actual repo-local Node 24.21.0 and CPython 3.14.8 runtimes:

| Probe | Result |
| --- | --- |
| Node / pnpm / TypeScript native CLI | Node 24.21.0, pnpm 12.10.1 and TypeScript 7.0.2 execute; strict bootstrap typecheck passes |
| Astro 7.3.8 | CLI and static build of an ignored `.tools/astro-smoke` fixture pass |
| Vitest 5.0.3 | Bootstrap conformance tests execute under Node 24.21.0 |
| Biome 2.5.15 | Root JavaScript/TypeScript/config lint and format check passes |
| uv / Python | uv 0.12.23 acquires and executes CPython 3.14.8; locked sync succeeds |
| pytest / Ruff / mypy | Real Python bootstrap test, lint and strict type checks pass |
| Playwright 1.64.0 | Chromium headless shell installs under `.tools/playwright`, launches, and passes an in-memory title assertion; no system package installation |
| Ajv 8.20.0 | Ajv2020 strict compiles a bootstrap schema, rejects invalid data, and rejects an unknown schema keyword |
| YAML 2.9.1 | Document API preserves CST source tokens and rejects duplicate keys; multi-document pnpm lock parsing succeeds |

No planned runtime version changed. Vitest/YAML provisional Task 1 harness pins were replaced by the exact final tools above. Vitest, Biome, pytest, Ruff, mypy, uv, Playwright, Ajv and YAML were not numerically constrained by the plan; these are the stable versions selected and executed for this baseline. Host Node 22 and Python 3.14.4 are acquisition helpers only and are not compatibility evidence.

Observed integration failures and resolutions:

1. pnpm 12.10.1 rejects obsolete `packageManagerStrictVersion` and `managePackageManagerVersions` workspace keys. Replaced them with `pmOnFail: error`; `runtimeOnFail: error` also prevents implicit runtime acquisition. This follows the [pnpm CLI settings](https://pnpm.io/settings/cli). There is no silent downgrade or fallback.
2. pnpm 12 writes its package-manager lock document separately from its dependency lock document. A single-document YAML parser failed with `MULTIPLE_DOCS`. The verifier now uses `parseAllDocuments`, requires valid documents, checks the locked pnpm pin and the dependency importer. Lock generation remains pnpm-owned.
3. Biome 2.5.15 deprecated Task 1's `recommended` configuration field. Its migration changed the setting to `preset: recommended`; final checks contain no deprecation diagnostic.
4. TypeScript's strict NodeNext check rejected the Ajv CommonJS default import as non-constructable. The declared and runtime-proven named `Ajv2020` export resolves that import without relaxing strictness.
5. Initial dependency acquisition logged registry latency/download-speed warnings and automatically recorded release-age exceptions for the explicitly selected Astro and Playwright versions. Those exact exceptions are retained; `minimumReleaseAgeStrict: true` prevents further automatic manifest edits. Final verification contains no acquisition step or download warning.
6. An initial frozen offline installation could not find full Vite metadata needed by pnpm's supply-chain check, although package tarballs were cached. An explicit frozen installation with network access passed those policies, after which a cached offline frozen installation passed. Acquisition may still need network access for policy metadata; ordinary verification does not install or resolve dependencies.

The earlier Task 1 harness encountered pnpm's pre-script dependency installation and unresolved esbuild approval. Final policy sets `verifyDepsBeforeRun: false`, exact manager mismatch failure, and explicit build approval for `esbuild` and `sharp` only. All other dependency build scripts remain subject to pnpm's approval policy. Future installs use the frozen lock; verification never invokes installation. [pnpm build settings](https://pnpm.io/settings/build) document this policy surface.

These rulings preserve every frozen architecture boundary: no engine semantics, renderer, normalizer, compiler, Studio, plugin, site, V2 imports, or runtime product network behavior was introduced.

## Portable acquisition and activation

Prerequisites: Bash, a working bootstrap npm/Node and Python/pip, and network access for this explicit acquisition step. Run from the checkout root. All downloaded tools, caches and environments stay in `.tools`, `node_modules`, or `.venv`. Activation derives paths from the script location and changes only the current shell environment.

```bash
source scripts/activate-toolchain.sh
npm install --prefix "$PWD/.tools/runtime" --save-exact node@24.21.0 pnpm@12.10.1
python3 -m pip install --disable-pip-version-check --cache-dir "$PWD/.tools/pip-cache" --target "$PWD/.tools/uv" --upgrade uv==0.12.23
hash -r
node --version
pnpm --version
uv --version
UV_OFFLINE=false UV_NO_SYNC=false UV_FROZEN=false uv python install 3.14.8
pnpm install --frozen-lockfile
UV_OFFLINE=false UV_NO_SYNC=false UV_FROZEN=false uv sync --locked
```

The [uv Python version documentation](https://docs.astral.sh/uv/concepts/python-versions/) describes managed Python acquisition. `UV_PYTHON_INSTALL_BIN=false` avoids creating external Python command shims. Existing Python and package-manager mismatch checks fail rather than selecting an unpinned runtime.

Once acquired, activation defaults uv to offline, frozen, no-sync operation. The exact focused acceptance command can run from a clean Bash session:

```bash
bash --noprofile --norc -c 'source scripts/activate-toolchain.sh; pnpm lint && pnpm typecheck && pnpm test && uv run pytest -q'
```

Additional focused commands, also without dependency installation:

```bash
source scripts/activate-toolchain.sh
pnpm toolchain
pnpm python:lint
pnpm python:typecheck
pnpm python:test
pnpm vitest qa/conformance/bootstrap/toolchain.test.ts --run
```

The verifier confirms installed package versions, actual Node/pnpm/uv/Python execution, lock pins, strict Ajv2020 and YAML Document/CST support. Astro and browser smoke fixtures are temporary acquisition evidence and are not required by ordinary verification. To acquire the optional browser executable explicitly:

```bash
source scripts/activate-toolchain.sh
pnpm exec playwright install chromium --only-shell
```

Task 4 owns unified `pnpm verify` orchestration. Task 3 owns the frozen architecture copy. Neither is implemented here. Compatibility on platforms beyond this observed Linux x64 lane remains unverified.
