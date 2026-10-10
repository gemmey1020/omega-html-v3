# OMEGA HTML v3

OMEGA HTML v3 is an experimental artifact platform for turning portable semantic specifications into standalone HTML artifacts and static sites. Its design separates source specifications, canonical contracts, semantic and evidence handling, presentation, rendering, packaging, and verification.

## Project status

This repository is an evolving prototype. The current branches preserve three development milestones: bootstrap and toolchain, the specification front end, and an initial engine skeleton. It is not a production release, and its behavior and platform support remain under development.

The `main` branch tracks the latest committed milestone. The milestone branches are:

- `codex/omega-html-v3-p00` — repository bootstrap and toolchain baseline
- `codex/omega-html-v3-p01-spec-frontend` — specification front end and contracts
- `codex/omega-html-v3-p02-engine-walking-skeleton` — initial engine and build flow

## Repository layout

- `packages/` — TypeScript contracts, specification front end, engine, CLI, composition, design system, and rendering packages
- `python/` — Python semantic core
- `apps/` — local studio and representation lab
- `qa/` — conformance, regression, and browser-oriented quality checks
- `docs/architecture/` — architecture and system boundaries

## Toolchain

The project pins Node.js 24.21.0, pnpm 12.10.1, Python 3.14.8, and uv 0.12.23. From the repository root, install the locked dependencies and run the repository verification command:

```bash
pnpm install --frozen-lockfile
uv sync --locked
pnpm verify
```

Other available commands include `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm python:lint`, `pnpm python:typecheck`, and `pnpm python:test`.

## License

No license has been selected for this repository yet.
