#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

pnpm lint
pnpm typecheck
pnpm test
pnpm python:lint
pnpm python:typecheck
pnpm python:test
